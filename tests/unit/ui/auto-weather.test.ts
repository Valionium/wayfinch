// Automatic weather at open and at return to the foreground (spec section 6.6, ruling A): the wiring that starts refresh.ts's rules.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import type { StoredForecast, ZoneSpan } from '../../../src/core/types.ts';
import { openDb } from '../../../src/store/db.ts';
import { ZONES_META } from '../../../src/store/inputs.ts';
import { saveTrip } from '../../../src/store/trip.ts';
import { markPrepared, saveForecast, weatherStore } from '../../../src/store/weather.ts';
import { autoRefresh, startAutoWeather } from '../../../src/ui/auto-weather.ts';
import type { AutoDeps } from '../../../src/ui/auto-weather.ts';
import { at, testTrip, zonesOf } from '../../fixtures/build.ts';
import { forecastBody, json, metaBody, stubFetch } from '../../fixtures/openmeteo.ts';
import { freshStore } from '../store/helpers.ts';

beforeEach(freshStore);
const NOW = at('2026-10-17 12:00');
const HOUR = 3_600_000;
const trip = testTrip();

async function prepared(zones: ZoneSpan[] = zonesOf(300)): Promise<void> {
  await saveTrip(trip);
  await (await openDb()).put('meta', zones, ZONES_META);
  await markPrepared(trip.route.id);
}
const OLD = (agoMs: number): StoredForecast => ({ fetchedAt: new Date(NOW.getTime() - agoMs), runs: [], grid: [{ km: 0, lat: 49, lon: 8.4, hours: [], rain15: undefined as never }], has15: false });

const service = (clock: () => number = () => NOW.getTime()) => stubFetch((u) => {
  if (u === '/') return new Response('', { status: 200 });
  if (u.includes('/static/meta.json')) return json(metaBody({ run: (clock() - 3 * HOUR) / 1000, available: (clock() - 1.5 * HOUR) / 1000 }));
  return json(forecastBody(trip.route.sampleGrid.length, { from: at('2026-10-17 00:00').getTime() / 1000, hours: 96 }));
});
const deps = (f: ReturnType<typeof service>, over: Partial<AutoDeps> = {}): AutoDeps => ({
  mode: 'auto', now: () => NOW, online: () => true, fetch: f as unknown as typeof fetch, keepFresh: () => true, store: weatherStore, ...over,
});
const outside = (f: { urls: string[] }): string[] => f.urls.filter((u) => u !== '/');

describe('open and foreground', () => {
  test('[WXR-AUTO-WIRED] opening with a prepared trip and the setting on checks the five models first, then asks once; the same open again within 3 h asks nothing, not even the app\'s own address', async () => {
    await prepared();
    await saveForecast(trip.route.id, OLD(5 * HOUR));
    const f = service();
    const result = await autoRefresh('open', deps(f));
    expect(result?.fetched).toBe(true);
    const calls = outside(f);
    expect(calls.slice(0, 5).every((u) => u.includes('/static/meta.json'))).toBe(true);
    expect(calls.filter((u) => u.includes('/v1/forecast'))).toHaveLength(1);
    expect(calls.findIndex((u) => u.includes('/v1/forecast'))).toBe(5);
    const again = service();
    expect(await autoRefresh('open', deps(again, { now: () => new Date(NOW.getTime() + 2 * HOUR) }))).toBeNull();
    expect(again.urls).toEqual([]);
  });

  test('[WXR-AUTO-WIRED] the return to the foreground is the other trigger: visibilitychange to visible asks, to hidden does not, and nothing is left running afterwards', async () => {
    await prepared();
    await saveForecast(trip.route.id, OLD(5 * HOUR));
    const listeners: (() => void)[] = [];
    const doc = { visibilityState: 'hidden' as DocumentVisibilityState, addEventListener: (_: string, l: () => void) => { listeners.push(l); }, removeEventListener: () => undefined };
    let clock = NOW.getTime();
    const f = service(() => clock);
    const stop = startAutoWeather(deps(f, { now: () => new Date(clock) }), doc as never);
    await new Promise((r) => setTimeout(r, 150));
    const forecasts = (): number => f.urls.filter((u) => u.includes('/v1/forecast')).length;
    expect(forecasts()).toBe(1); // the open
    // Hidden again, even long after: nothing. Visible, past the 3 hours: one more ask. Visible within them: none.
    clock += 4 * HOUR;
    for (const l of listeners) l();
    await new Promise((r) => setTimeout(r, 100));
    expect(forecasts()).toBe(1);
    doc.visibilityState = 'visible';
    for (const l of listeners) l();
    await new Promise((r) => setTimeout(r, 200));
    expect(forecasts()).toBe(2);
    clock += HOUR;
    for (const l of listeners) l();
    await new Promise((r) => setTimeout(r, 100));
    expect(forecasts()).toBe(2);
    stop();
  });

  test('[WXR-AUTO-WIRED] the setting off, the tap build, no prepared trip and no signal each ask nothing', async () => {
    const f = service();
    expect(await autoRefresh('open', deps(f))).toBeNull(); // no trip at all
    await prepared();
    expect(await autoRefresh('open', deps(f, { keepFresh: () => false }))).toBeNull();
    expect(await autoRefresh('open', deps(f, { mode: 'tap' }))).toBeNull();
    expect(f.urls).toEqual([]);
    const offline = service();
    await autoRefresh('open', deps(offline, { online: () => false }));
    expect(outside(offline)).toEqual([]);
  });

  test('[WXR-AUTO-WIRED] a refused request keeps the stored forecast, and the refusal still counts for the 3 hours', async () => {
    await prepared();
    await saveForecast(trip.route.id, OLD(5 * HOUR));
    const refused = stubFetch((u) => (u === '/' ? new Response('', { status: 200 }) : u.includes('/static/meta.json') ? json(metaBody({ run: (NOW.getTime() - 3 * HOUR) / 1000, available: (NOW.getTime() - 1.5 * HOUR) / 1000 })) : json({}, 429)));
    const result = await autoRefresh('open', deps(refused));
    expect(result?.fetched).toBe(false);
    expect((await weatherStore.read())!.forecast!.fetchedAt.getTime()).toBe(NOW.getTime() - 5 * HOUR);
    const again = service();
    expect(await autoRefresh('open', deps(again, { now: () => new Date(NOW.getTime() + HOUR) }))).toBeNull();
    expect(again.urls).toEqual([]);
  });
});
