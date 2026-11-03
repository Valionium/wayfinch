// Shared steps for the app's browser tests (plan Task 2). Nothing here prints a page.
// `preparedTrip` holds the trip and route, and with `places` runs the real Get ready offline on the fixture pack; Task 17 adds weather.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { buildDist } from '../../tools/build.mjs';
import { buildRoute } from '../../src/core/route/profile.ts';
import { sampleGrid } from '../../src/core/route/grid.ts';
import { planStages } from '../../src/core/route/stages.ts';
import type { Trip } from '../../src/core/types.ts';
import { forecastBody } from '../fixtures/openmeteo.ts';
import { loadFixtureRoute } from '../fixtures/packs/index.ts';
import type { FixtureRouteId } from '../fixtures/packs/index.ts';
import type { StoreInPage } from './fixtures/store-page.ts';
import { startCfLike } from './server/cf-like.mjs';
import type { CfLike } from './server/cf-like.mjs';

const built = new Map<string, Promise<string>>();
const roots: string[] = [];

/** A real build in a fresh folder, once per worker, switch position and test hook (`window.__wf`, Task 17). */
function siteFor(launch: boolean, testHooks = false): Promise<string> {
  const key = `${launch}:${testHooks}`;
  if (!built.has(key)) {
    const root = mkdtempSync(join(tmpdir(), 'wf-app-e2e-'));
    roots.push(root);
    const dir = join(root, 'site');
    built.set(key, buildDist({ out: dir, launch, testHooks }).then(() => dir));
  }
  return built.get(key)!;
}

export function removeBuilds(): void {
  built.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 3 });
}

/** The phone stand-in slows the processor to a quarter (§4.5); projects ask for it in their metadata. */
export async function throttleIfPhone(page: Page): Promise<void> {
  if (test.info().project.metadata.cpuThrottle !== 4) return;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

export interface LoadedApp {
  server: CfLike;
  origin: string;
  close: () => Promise<void>;
}

/** Serves a build like the host does, blocks every outside address, and opens the app. */
export async function loadApp(page: Page, options: { launch: boolean; path?: string; testHooks?: boolean } = { launch: true }): Promise<LoadedApp> {
  const server = await startCfLike({ dir: await siteFor(options.launch, options.testHooks ?? false) });
  await page.context().route(/^https:\/\//, (route) => route.abort());
  await throttleIfPhone(page);
  await page.goto(`${server.origin}${options.path ?? '/'}`, { waitUntil: 'domcontentloaded' });
  return { server, origin: server.origin, close: () => server.close() };
}

/** Flight mode: the network is gone for this window. */
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
}

/** A fixed time for the page: `page.clock` stops it moving on its own. Call before loading. */
export async function fixedClock(page: Page, iso: string): Promise<void> {
  await page.clock.install({ time: new Date(iso) });
}

/** Today at 09:30 in Berlin, the fixture routes' zone, as an instant: a morning with the day's ride ahead. */
export function thisMorning(): Date {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  const guess = new Date(`${day}T09:30:00Z`);
  const offsetH = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }).format(guess)) - 9;
  return new Date(guess.getTime() - offsetH * 3_600_000);
}

declare const __store: StoreInPage;

let storeBundle: Promise<string> | null = null;

/** Puts the real store into this page, on the real site's origin. Only tests have this: no build contains it. */
export async function withStore(page: Page): Promise<void> {
  storeBundle ??= build({
    entryPoints: [fileURLToPath(new URL('./fixtures/store-page.ts', import.meta.url))],
    bundle: true, write: false, format: 'iife', target: 'es2022', platform: 'browser',
  }).then((out) => out.outputFiles[0]!.text);
  await page.evaluate(await storeBundle);
}

const DATA_ORIGIN = (JSON.parse(readFileSync(fileURLToPath(new URL('../../build.config.json', import.meta.url)), 'utf8')) as { dataOrigin: string }).dataOrigin;

export type PackServing = { requests: string[]; manifest: { buildId: string; tiles: { z: number; x: number; y: number; places: number }[] } };

/**
 * Serves a fixture pack as the data project does, and records what's asked of it. `hold` may answer a request itself: 'abort'
 * cuts it off, a Promise keeps it waiting.
 */
export async function servePack(page: Page, id: string, hold: (url: string) => 'abort' | Promise<void> | void = () => undefined): Promise<PackServing> {
  const dir = new URL(`../fixtures/packs/${id}/`, import.meta.url);
  const manifestText = readFileSync(new URL('manifest.json', dir), 'utf8');
  const manifest = JSON.parse(manifestText) as PackServing['manifest'] & { builtAt: string };
  const requests: string[] = [];
  const cors = { 'access-control-allow-origin': '*' };
  await page.context().route(`${DATA_ORIGIN}/packs/**`, async (route) => {
    const url = route.request().url();
    const path = url.slice(DATA_ORIGIN.length);
    requests.push(path);
    const answer = hold(path);
    if (answer === 'abort') return route.abort();
    if (answer) await answer;
    if (path === '/packs/current.json') {
      return route.fulfill({ headers: cors, json: { v: 1, buildId: manifest.buildId, builtAt: manifest.builtAt, manifest: `/packs/${manifest.buildId}/manifest.json` } });
    }
    const prefix = `/packs/${manifest.buildId}/`;
    if (!path.startsWith(prefix)) return route.fulfill({ status: 404, headers: cors, body: 'gone' });
    if (path === `${prefix}manifest.json`) return route.fulfill({ headers: cors, body: manifestText });
    return route.fulfill({ headers: cors, body: readFileSync(new URL(path.slice(prefix.length), dir)) });
  });
  return { requests, manifest };
}

/** A trip on a fixture route, saved through the store. With `places`, also Get ready offline's places and hours, on the fixture pack. */
export async function preparedTrip(page: Page, id: string, opts: { departureDate?: string | null; places?: boolean; weather?: boolean; atMs?: number } = {}): Promise<Trip> {
  await withStore(page);
  const fixture = await loadFixtureRoute(id as FixtureRouteId);
  const built = await buildRoute(fixture.points, fixture.name, 'gpx');
  const stages = [...planStages(built, { flatKph: 25, pace: 'sporting', nights: 0 })];
  const withStages = { ...built, stages };
  const trip: Trip = {
    route: { ...withStages, sampleGrid: sampleGrid(withStages, withStages.climbs, stages) },
    departureDate: opts.departureDate ?? null, startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2, pace: 'sporting',
  };
  await page.evaluate(async (t) => {
    await __store.readTrip();
    await __store.saveTrip(t);
  }, trip);
  if (!opts.places) return trip;
  await servePack(page, id);
  await page.evaluate(([weather, atMs]) => __store.prepare({ weather, atMs }), [opts.weather ?? false, opts.atMs] as const);
  return page.evaluate(async () => (await __store.readTrip())!);
}

/**
 * Open-Meteo's forecast for this page, rainy as of `base` (now by default): rain from one to two hours on, a thunderstorm from
 * three to four, at every point asked for; hourly, and in 15 minutes when asked. Every request's address is kept.
 */
export async function serveRainyWeather(page: Page, base: number = Date.now()): Promise<string[]> {
  const asked: string[] = [];
  const cors = { 'access-control-allow-origin': '*' };
  await page.context().route('https://api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url());
    asked.push(url.toString());
    if (!url.pathname.startsWith('/v1/forecast')) return route.fulfill({ status: 500, headers: cors, body: '{}' });
    const count = url.searchParams.get('latitude')!.split(',').length;
    const days = Number(url.searchParams.get('forecast_days'));
    const hour = 3600;
    const now = Math.floor(base / 1000 / hour) * hour;
    const from = now - 12 * hour;
    const rainy = (t: number) => t >= now + hour && t < now + 2 * hour;
    const stormy = (t: number) => t >= now + 3 * hour && t < now + 4 * hour;
    const with15 = url.searchParams.has('minutely_15');
    const body = forecastBody(count, {
      from, hours: days * 24 + 12,
      at: (_l, t) => (rainy(t) ? { precipitation_probability: 85, precipitation: 2.2, weather_code: 63 } : stormy(t) ? { precipitation_probability: 75, precipitation: 3.5, weather_code: 95 } : undefined),
      ...(with15 ? { rain15: () => { const time = Array.from({ length: 192 }, (_, n) => now + n * 900); return { time, precipitation: time.map((t) => (rainy(t) ? 0.6 : stormy(t) ? 0.9 : 0)) }; } } : {}),
    });
    return route.fulfill({ headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
  return asked;
}

/** An accepted position at a route kilometre, through the store. */
export async function atPosition(page: Page, km: number, opts: { accuracyM?: number; ageMin?: number } = {}): Promise<void> {
  await page.evaluate(async ({ km: at, accuracyM, ageMin }) => {
    const trip = (await __store.readTrip())!;
    const point = trip.route.points.reduce((best, p) => (Math.abs(p.km - at) < Math.abs(best.km - at) ? p : best));
    const now = new Date();
    await __store.addPosition({
      lat: point.lat, lon: point.lon, accuracyM, at: new Date(now.getTime() - ageMin * 60_000), km: at, offRouteM: 0,
      source: 'gps', approximate: accuracyM > 500,
    }, now, trip.route.id);
  }, { km, accuracyM: opts.accuracyM ?? 10, ageMin: opts.ageMin ?? 0 });
}
