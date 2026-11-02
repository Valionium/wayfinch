// Shared steps for the app's browser tests (plan Task 2). Nothing here prints a page.
// `preparedTrip` holds the trip and route the store can hold today; Tasks 9 and 17 add its places, hours and weather.
import { mkdtempSync, rmSync } from 'node:fs';
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
import { loadFixtureRoute } from '../fixtures/packs/index.ts';
import type { FixtureRouteId } from '../fixtures/packs/index.ts';
import type { StoreInPage } from './fixtures/store-page.ts';
import { startCfLike } from './server/cf-like.mjs';
import type { CfLike } from './server/cf-like.mjs';

const built = new Map<string, Promise<string>>();
const roots: string[] = [];

/** A real build in a fresh folder, once per worker and switch position. */
function siteFor(launch: boolean): Promise<string> {
  const key = String(launch);
  if (!built.has(key)) {
    const root = mkdtempSync(join(tmpdir(), 'wf-app-e2e-'));
    roots.push(root);
    const dir = join(root, 'site');
    built.set(key, buildDist({ out: dir, launch }).then(() => dir));
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
export async function loadApp(page: Page, options: { launch: boolean; path?: string } = { launch: true }): Promise<LoadedApp> {
  const server = await startCfLike({ dir: await siteFor(options.launch) });
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

/** A trip on a fixture route, saved through the store. */
export async function preparedTrip(page: Page, id: string, opts: { departureDate?: string | null } = {}): Promise<Trip> {
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
  return trip;
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
    }, now);
  }, { km, accuracyM: opts.accuracyM ?? 10, ageMin: opts.ageMin ?? 0 });
}
