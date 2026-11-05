// decideRefresh by the numbers of section 6.6; refreshWeather on the real store, with a stub fetch counting every request.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen } from '../../../src/core/screen/screen.ts';
import type { ModelRun, ScreenInputs, StoredForecast, Trip, ZoneSpan } from '../../../src/core/types.ts';
import { W } from '../../../src/core/wording/en.ts';
import { forecastDaysFor } from '../../../src/data/openmeteo.ts';
import { decideRefresh, keepFreshOffered, refreshWeather } from '../../../src/data/refresh.ts';
import type { RefreshDeps } from '../../../src/data/refresh.ts';
import { WEATHER_MODE } from '../../../src/data/weather-mode.ts';
import { openDb } from '../../../src/store/db.ts';
import { ROUTE_END_META, ZONES_META } from '../../../src/store/inputs.ts';
import { replaceRoute, saveTrip } from '../../../src/store/trip.ts';
import { markPrepared, PREPARED_META, readWeatherState, reserveWeatherFetch, saveForecast, WEATHER_ATTEMPT_META, weatherStore } from '../../../src/store/weather.ts';
import { at, flatRoute, testTrip, zonesOf } from '../../fixtures/build.ts';
import { forecastBody, json, metaBody, stubFetch } from '../../fixtures/openmeteo.ts';
import { freshStore } from '../store/helpers.ts';
import { forecastOf } from '../core/engines/weather-helpers.ts';
import { inputsOf } from '../core/screen/screen-helpers.ts';

const BER = 'Europe/Berlin';
const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = at('2026-10-17 12:00');
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
const run = (model: string, runText: string, availableAgo: number, intervalS = 10800): ModelRun => ({ model, run: at(runText), availableAt: ago(availableAgo), intervalS });
const ICON = 'ICON-D2';
const AROME = 'AROME France HD';

const decide = (over: Partial<Parameters<typeof decideRefresh>[0]> = {}) => decideRefresh({
  mode: 'auto', trigger: 'open', runs: null, held: [], lastFetchAt: ago(10 * HOUR), lastAttemptAt: null, now: NOW, keepFresh: true, signal: true, timeZone: BER, ...over,
});

describe('tap only', () => {
  test.each(['open', 'foreground'] as const)('[WXR-TAP-NO-AUTO] %s fetches nothing, whatever the runs and however old the forecast', (trigger) => {
    expect(decide({ mode: 'tap', trigger, runs: [run(ICON, '2026-10-17 09:00', HOUR)], held: [run(ICON, '2026-10-16 09:00', 26 * HOUR)], lastFetchAt: ago(30 * HOUR) })).toEqual({ fetch: false, say: null });
  });

  test('[WXR-TAP-NO-AUTO] the tap build offers no "Keep trip data fresh" setting', () => {
    expect(keepFreshOffered('tap')).toBe(false);
  });

  test('[WXR-MODE-ONE-LINE] the mode alone decides whether "Keep trip data fresh when online" is offered', () => {
    expect(keepFreshOffered('tap')).toBe(false);
    expect(keepFreshOffered('auto')).toBe(true);
    expect(W.weatherKeepFresh).toBe('Keep trip data fresh when online');
  });
});

describe('automatic', () => {
  const held = [run(ICON, '2026-10-17 03:00', 6 * HOUR)];

  test('[WXR-AUTO-RULES] a run 3 h newer, available for 10 min: fetch', () => {
    expect(decide({ runs: [run(ICON, '2026-10-17 06:00', 10 * MIN)], held }).fetch).toBe(true);
    expect(decide({ trigger: 'foreground', runs: [run(ICON, '2026-10-17 06:00', 10 * MIN)], held }).fetch).toBe(true);
  });
  test('[WXR-AUTO-RULES] available for only 9 min: no', () => {
    expect(decide({ runs: [run(ICON, '2026-10-17 06:00', 9 * MIN)], held }).fetch).toBe(false);
  });
  test('[WXR-AUTO-RULES] only 2 h 59 min newer: no', () => {
    expect(decide({ runs: [run(ICON, '2026-10-17 05:59', HOUR)], held }).fetch).toBe(false);
  });
  test('[WXR-AUTO-RULES] automatic fetches are 3 h apart, however many models', () => {
    const runs = [run(ICON, '2026-10-17 06:00', HOUR), run(AROME, '2026-10-17 06:00', HOUR)];
    expect(decide({ runs, held, lastFetchAt: ago(3 * HOUR - 1) }).fetch).toBe(false);
    expect(decide({ runs, held, lastFetchAt: ago(3 * HOUR) }).fetch).toBe(true);
  });
  test('[WXR-AUTO-RULES] a refused request counts for the 3 h too', () => {
    expect(decide({ runs: [run(ICON, '2026-10-17 06:00', HOUR)], held, lastAttemptAt: ago(HOUR) }).fetch).toBe(false);
    expect(decide({ runs: null, lastAttemptAt: ago(HOUR) }).fetch).toBe(false);
  });
  test('[WXR-AUTO-RULES] a failed check fetches when the forecast is over 3 h old', () => {
    expect(decide({ runs: null, lastFetchAt: ago(3 * HOUR + 1) }).fetch).toBe(true);
    expect(decide({ runs: null, lastFetchAt: ago(3 * HOUR) }).fetch).toBe(false);
  });
  test('[WXR-AUTO-RULES] no check to go by (no model matters here) counts as a failed check', () => {
    expect(decide({ runs: [], lastFetchAt: ago(3 * HOUR + 1) }).fetch).toBe(true);
    expect(decide({ runs: [], lastFetchAt: ago(HOUR) }).fetch).toBe(false);
  });
  test('[WXR-AUTO-RULES] keepFresh off, or no signal: nothing, and nothing said', () => {
    expect(decide({ keepFresh: false, runs: [run(ICON, '2026-10-17 06:00', HOUR)], held })).toEqual({ fetch: false, say: null });
    expect(decide({ signal: false, runs: [run(ICON, '2026-10-17 06:00', HOUR)], held })).toEqual({ fetch: false, say: null });
  });
  test('[WXR-AUTO-RULES] a model held no run of counts as newer; nothing to compare is no reason to wait', () => {
    expect(decide({ runs: [run(ICON, '2026-10-17 06:00', HOUR)], held: [] }).fetch).toBe(true);
  });
});

describe('Update weather', () => {
  const tap = (over: Partial<Parameters<typeof decideRefresh>[0]> = {}) => decide({ trigger: 'tap', keepFresh: false, ...over });
  const held = [run(ICON, '2026-10-17 10:00', HOUR)];

  test.each(['tap', 'auto'] as const)('[WXR-UPDATE-TAP] %s: any newer run available for 10 min fetches', (mode) => {
    expect(tap({ mode, runs: [run(ICON, '2026-10-17 10:01', 10 * MIN)], held }).fetch).toBe(true);
    expect(tap({ mode, runs: [run(ICON, '2026-10-17 10:01', 9 * MIN)], held }).fetch).toBe(false);
  });

  test.each(['tap', 'auto'] as const)('[WXR-UPDATE-TAP] %s: nothing newer says so, with the earliest next run among the models', (mode) => {
    const runs = [
      { ...run(ICON, '2026-10-17 10:00', 0), availableAt: at('2026-10-17 11:30'), intervalS: 3 * 3600 },
      { ...run(AROME, '2026-10-17 10:00', 0), availableAt: at('2026-10-17 11:30'), intervalS: 6 * 3600 },
    ];
    expect(tap({ mode, runs, held: [...held, run(AROME, '2026-10-17 10:00', HOUR)] })).toEqual({ fetch: false, say: 'You have the newest forecast (model run 10:00). Next run expected about 14:30.' });
  });

  test('[WXR-UPDATE-TAP] the run named is the oldest latest run held', () => {
    const r = [run(ICON, '2026-10-17 10:00', HOUR), run(AROME, '2026-10-17 07:00', HOUR)];
    expect(tap({ runs: r, held: [...r, run(ICON, '2026-10-17 04:00', 8 * HOUR)] }).say).toContain('model run 07:00');
  });

  test('[WXR-UPDATE-TAP] a next run already overdue is not promised for a time gone by', () => {
    const r = [{ ...run(ICON, '2026-10-17 06:00', 0), availableAt: at('2026-10-17 07:30'), intervalS: 3 * 3600 }];
    expect(tap({ runs: r, held: [run(ICON, '2026-10-17 06:00', HOUR)] }).say).toBe('You have the newest forecast (model run 06:00).');
  });

  test('[WXR-UPDATE-TAP] a new run within its 10 minutes: the next run is that one, and the time says when it can be asked for', () => {
    const r = [{ ...run(ICON, '2026-10-17 12:00', 0), availableAt: ago(MIN), intervalS: 3 * 3600 }];
    expect(tap({ runs: r, held }).say).toBe('You have the newest forecast (model run 10:00). Next run expected about 12:09.');
  });

  test('[WXR-UPDATE-TAP] a failed check fetches when the last fetch is 30 min old', () => {
    expect(tap({ runs: null, lastFetchAt: ago(30 * MIN) }).fetch).toBe(true);
    expect(tap({ runs: [], lastFetchAt: ago(30 * MIN) }).fetch).toBe(true); // nothing matters here: no "you have the newest"
  });

  test('[WXR-UPDATE-TAP] no signal says so, with the fetch time', () => {
    expect(tap({ signal: false, lastFetchAt: at('2026-10-17 07:10') })).toEqual({ fetch: false, say: 'No signal. Forecast fetched 07:10.' });
    expect(tap({ signal: false, lastFetchAt: null })).toEqual({ fetch: false, say: 'No signal. No forecast saved.' });
  });

  test('[WXR-UPDATE-TAP] yesterday\'s fetch names its day, and can never read as this morning', () => {
    expect(tap({ signal: false, lastFetchAt: at('2026-10-16 07:10') }).say).toBe('No signal. Forecast fetched Fri 16 Oct, 07:10.');
  });

  test('[WXR-UPDATE-TAP] nothing stored: a tap fetches, also when a run is under 10 min old', () => {
    expect(tap({ lastFetchAt: null, runs: [run(ICON, '2026-10-17 12:00', MIN)], held: [] }).fetch).toBe(true);
    expect(tap({ lastFetchAt: null, runs: null }).fetch).toBe(true);
  });
});

describe('spacing', () => {
  const justUnder = 30 * MIN - 1000; // 29 min 59 s
  const newer = [run(ICON, '2026-10-17 11:00', HOUR)];
  const held = [run(ICON, '2026-10-17 06:00', HOUR)];

  test.each([
    ['tap, tap mode', { mode: 'tap', trigger: 'tap' }], ['tap, automatic', { mode: 'auto', trigger: 'tap' }],
    ['open, automatic', { mode: 'auto', trigger: 'open' }], ['foreground, automatic', { mode: 'auto', trigger: 'foreground' }],
  ] as const)('[WXR-SPACING] %s: 29 min 59 s after a fetch, no fetch', (_, o) => {
    expect(decide({ ...o, runs: newer, held, lastFetchAt: ago(justUnder) }).fetch).toBe(false);
    expect(decide({ ...o, runs: null, lastFetchAt: ago(justUnder) }).fetch).toBe(false);
  });

  test('[WXR-SPACING] 30 min after, a tap can fetch; a refused request 29 min 59 s ago holds it back too', () => {
    expect(decide({ trigger: 'tap', runs: newer, held, lastFetchAt: ago(30 * MIN) }).fetch).toBe(true);
    expect(decide({ trigger: 'tap', runs: newer, held, lastAttemptAt: ago(justUnder) }).fetch).toBe(false);
  });

  test('[WXR-SPACING] a tap held back says when it can try again', () => {
    expect(decide({ trigger: 'tap', runs: null, lastFetchAt: at('2026-10-17 11:40') }).say).toBe('Forecast fetched 11:40. It can update again at 12:10.');
    expect(decide({ trigger: 'tap', runs: null, lastFetchAt: null, lastAttemptAt: at('2026-10-17 11:40') }).say).toBe('No forecast saved. It can try again at 12:10.');
  });

  test('[WXR-SPACING] a fetch stamped ahead of now (the clock moved back) holds nothing up for days', () => {
    expect(decide({ trigger: 'tap', runs: null, lastFetchAt: new Date(NOW.getTime() + 48 * HOUR) }).fetch).toBe(true);
  });

  test('[WXR-SPACING] without a clock nothing is fetched', () => {
    expect(decide({ trigger: 'tap', runs: null, now: new Date(Number.NaN) }).fetch).toBe(false);
  });
});

describe('the whole refresh, on the real store', () => {
  beforeEach(freshStore);

  const SECS = (d: Date): number => d.getTime() / 1000;
  const trip = (): Trip => testTrip();
  const prepared = async (zones: ZoneSpan[] = zonesOf(300)): Promise<void> => {
    await saveTrip(trip());
    await (await openDb()).put('meta', zones, ZONES_META);
    await markPrepared(trip().route.id);
  };
  const OLD: StoredForecast = { fetchedAt: at('2026-10-17 07:10'), runs: [run(ICON, '2026-10-17 03:00', 6 * HOUR)], grid: [{ km: 0, lat: 49, lon: 8.4, hours: [], rain15: undefined as never }], has15: false };
  const service = (o: { forecast?: () => Response; meta?: (u: string) => Response } = {}) => {
    const count = trip().route.sampleGrid.length;
    return stubFetch((u) => (u.includes('/static/meta.json')
      ? (o.meta ?? (() => json(metaBody({ run: SECS(at('2026-10-17 09:00')), available: SECS(at('2026-10-17 10:30')) }))))(u)
      : (o.forecast ?? (() => json(forecastBody(count, { from: SECS(at('2026-10-17 00:00')), hours: 96 }))))()));
  };
  const deps = (f: ReturnType<typeof stubFetch>, over: Partial<RefreshDeps> = {}): RefreshDeps => ({ mode: 'tap', fetch: f, now: () => NOW, signal: true, keepFresh: true, store: weatherStore, ...over });
  const forecasts = (f: { urls: string[] }): string[] => f.urls.filter((u) => u.includes('/v1/forecast'));
  const metas = (f: { urls: string[] }): string[] => f.urls.filter((u) => u.includes('/static/meta.json'));

  test.each(['open', 'foreground'] as const)('[WXR-TAP-NO-AUTO] tap mode, %s: no metadata request and no forecast request, counted', async (trigger) => {
    await prepared();
    const f = service();
    expect(await refreshWeather(deps(f), trigger)).toEqual({ fetched: false, say: null });
    expect(f.urls).toEqual([]);
  });

  test('[WXR-TAP-NO-AUTO] nothing is contacted with no trip, or with a trip not prepared, even on a tap and in automatic mode', async () => {
    const f = service();
    expect(await refreshWeather(deps(f), 'tap')).toEqual({ fetched: false, say: null });
    await saveTrip(trip());
    for (const mode of ['tap', 'auto'] as const) for (const trigger of ['open', 'foreground', 'tap'] as const) await refreshWeather(deps(f, { mode }), trigger);
    expect(f.urls).toEqual([]);
  });

  test('[WXR-AUTO-RULES] automatic, setting off: not even the metadata is read', async () => {
    await prepared();
    const f = service();
    await refreshWeather(deps(f, { mode: 'auto', keepFresh: false }), 'open');
    expect(f.urls).toEqual([]);
  });

  test('[WXR-AUTO-RULES] automatic, within the 3 h: not even the metadata is read', async () => {
    await prepared();
    await saveForecast(trip().route.id, { ...OLD, fetchedAt: ago(HOUR) });
    const f = service();
    await refreshWeather(deps(f, { mode: 'auto' }), 'foreground');
    expect(f.urls).toEqual([]);
  });

  test('[WXR-AUTO-RULES] automatic: reads the five models, then fetches the whole grid once, with 15-minute rain', async () => {
    await prepared();
    await saveForecast(trip().route.id, OLD);
    const f = service();
    expect((await refreshWeather(deps(f, { mode: 'auto' }), 'open')).fetched).toBe(true);
    expect(metas(f)).toHaveLength(5);
    expect(forecasts(f)).toHaveLength(1);
    expect(forecasts(f)[0]).toContain('minutely_15');
  });

  test('[WXR-ONE-CALL] automatic: the model-run check comes first, all five models before the forecast request', async () => {
    await prepared();
    await saveForecast(trip().route.id, OLD);
    const f = service();
    await refreshWeather(deps(f, { mode: 'auto' }), 'open');
    const firstForecast = f.urls.findIndex((u) => u.includes('/v1/forecast'));
    expect(firstForecast).toBe(5);
    expect(f.urls.slice(0, 5).every((u) => u.includes('/static/meta.json'))).toBe(true);
  });

  test('[WXR-AUTO-RULES] only while the app is open: the only automatic triggers are opening and returning to the app, and nothing in the source runs in the background', () => {
    const src = (path: string): string => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8');
    for (const path of ['src/data/refresh.ts', 'src/ui/shell-actions.ts', 'src/data/openmeteo.ts', 'src/ui/main.tsx']) {
      expect(src(path), path).not.toMatch(/periodicSync|PeriodicSync|\bsync\.register|setInterval\(/);
    }
    expect(src('src/data/refresh.ts')).toMatch(/'open' \| 'foreground' \| 'tap'/);
    expect(src('tools/build.mjs') + src('src/ui/register.ts')).not.toMatch(/periodicsync|backgroundfetch/i);
    // Ahead's minute clock only calls back while the page is in front: it reaches no network, no store and no weather.
    const clock = src('src/ui/screen-clock.ts');
    expect(clock).not.toMatch(/fetch|import |indexedDB|localStorage|refresh/);
    expect(clock).toMatch(/visibilityState/);
  });

  test('[WXR-ONE-CALL] one request for the whole route, whatever the length: 10 variables with the 15-minute rain, no more than 16 days', async () => {
    await prepared();
    await saveForecast(trip().route.id, OLD);
    const f = service();
    await refreshWeather(deps(f, { mode: 'auto' }), 'open');
    expect(forecasts(f)).toHaveLength(1);
    const q = new URL(forecasts(f)[0]!).searchParams;
    const variables = [...q.get('hourly')!.split(','), ...q.get('minutely_15')!.split(',')];
    expect(variables).toHaveLength(10);
    expect(Number(q.get('forecast_days'))).toBeLessThanOrEqual(16);
    expect(q.get('forecast_minutely_15')).toBe('192');
    // A trip of a month still asks for 16 days at most.
    const long = { ...trip().route, stages: Array.from({ length: 30 }, (_, i) => ({ ...trip().route.stages[0]!, day: i + 1 })) };
    expect(forecastDaysFor(long, '2026-10-17', '2026-10-17')).toBe(16);
    expect(forecastDaysFor(long, null, '2026-10-17')).toBe(16);
  });

  test('[WXR-HOURLY-ONLY] the tap mode passes with15 false', async () => {
    await prepared();
    const f = service();
    expect((await refreshWeather(deps(f), 'tap')).fetched).toBe(true);
    expect(forecasts(f)[0]).not.toContain('minutely_15');
    expect((await readWeatherState())!.forecast!.has15).toBe(false);
  });

  test('[WXR-SAME] two fetches on a day, the rider elsewhere and in another zone, send byte-identical addresses, with every grid point', async () => {
    const zones: ZoneSpan[] = [{ fromKm: 0, toKm: 100, timeZone: BER, holidayZone: null, country: 'DE' }, { fromKm: 100, toKm: 300, timeZone: 'Europe/Athens', holidayZone: null, country: 'DE' }];
    await prepared(zones);
    const f = service({ meta: () => json({}, 500) }); // a failed check: fetches whenever spacing allows
    await refreshWeather(deps(f, { atKm: 10, now: () => at('2026-10-17 12:00') }), 'tap');
    await refreshWeather(deps(f, { atKm: 200, now: () => at('2026-10-17 23:30') }), 'tap'); // already tomorrow in the rider's zone
    const [a, b] = forecasts(f);
    expect(a).toBeDefined();
    expect(b).toBe(a);
    expect(new URL(a!).searchParams.get('latitude')!.split(',')).toHaveLength(trip().route.sampleGrid.length);
    expect(new URL(a!).searchParams.get('forecast_days')).toBe('4');
  });

  test('[WXR-REFUSED] 429, 500 and a bad body: the stored forecast is kept whole, its age shown', async () => {
    const answers: (() => Response)[] = [() => json({ error: true, reason: 'x' }, 429), () => json({}, 500), () => new Response('<html>'), () => json(trip().route.sampleGrid.map(() => ({ hourly: {} })))];
    for (const forecast of answers) {
      freshStore();
      await prepared();
      await saveForecast(trip().route.id, OLD);
      const before = (await readWeatherState())!.forecast;
      const out = await refreshWeather(deps(service({ forecast, meta: () => json({}, 500) })), 'tap');
      expect(out).toEqual({ fetched: false, say: "The weather service didn't answer. Forecast fetched 07:10." });
      expect((await readWeatherState())!.forecast).toEqual(before);
    }
  });

  test('[WXR-REFUSED] an answer short of one point changes nothing: no half-written forecast', async () => {
    await prepared();
    await saveForecast(trip().route.id, OLD);
    const f = service({ forecast: () => json(forecastBody(2, { from: SECS(at('2026-10-17 00:00')), hours: 96 })), meta: () => json({}, 500) });
    expect((await refreshWeather(deps(f), 'tap')).fetched).toBe(false);
    expect((await readWeatherState())!.forecast!.fetchedAt).toEqual(OLD.fetchedAt);
  });

  test('[WXR-REFUSED] with nothing stored it says that, and invents no time', async () => {
    await prepared();
    const out = await refreshWeather(deps(service({ forecast: () => json({}, 500) })), 'tap');
    expect(out.say).toBe("The weather service didn't answer. No forecast saved.");
    expect((await readWeatherState())!.forecast).toBeNull();
  });

  test('[WXR-REFUSED] a refused request is not asked again at the next tap: no request at all for 30 minutes', async () => {
    await prepared();
    await saveForecast(trip().route.id, OLD);
    const f = service({ forecast: () => json({}, 429), meta: () => json({}, 500) });
    await refreshWeather(deps(f), 'tap');
    const asked = f.urls.length;
    const again = await refreshWeather(deps(f, { now: () => new Date(NOW.getTime() + 29 * MIN) }), 'tap');
    expect(again.fetched).toBe(false);
    expect(again.say).toBe('Forecast fetched 07:10. It can update again at 12:30.');
    expect(f.urls).toHaveLength(asked);
  });

  test('[WXR-SPACING] a second window tapping in the same instant does not send a second request', async () => {
    await prepared();
    const f = service({ meta: () => json({}, 500) });
    const both = await Promise.all([refreshWeather(deps(f), 'tap'), refreshWeather(deps(f), 'tap')]);
    expect(forecasts(f)).toHaveLength(1);
    expect(both.filter((o) => o.fetched)).toHaveLength(1);
  });

  test('[WXR-SPACING] the turn to ask expires, ignores a clock moved back, and goes with the route', async () => {
    await prepared();
    const id = trip().route.id;
    expect(await reserveWeatherFetch(id, NOW, 30 * MIN)).toBe(true);
    expect(await reserveWeatherFetch(id, new Date(NOW.getTime() + 29 * MIN), 30 * MIN)).toBe(false);
    expect(await reserveWeatherFetch(id, new Date(NOW.getTime() + 30 * MIN), 30 * MIN)).toBe(true);
    expect(await reserveWeatherFetch(id, new Date(NOW.getTime() - 48 * HOUR), 30 * MIN)).toBe(true);
    expect(await reserveWeatherFetch('another-route', NOW, 30 * MIN)).toBe(false);
    await replaceRoute({ ...flatRoute(50), id: 'second' });
    expect(await (await openDb()).get('meta', WEATHER_ATTEMPT_META)).toBeUndefined();
  });

  test('[WXR-REFUSED] storage refusing the new forecast keeps the old one, says so, and is not reported as updated', async () => {
    await prepared();
    await saveForecast(trip().route.id, OLD);
    const store = { ...weatherStore, save: vi.fn(() => Promise.reject(new DOMException('full', 'QuotaExceededError'))) };
    const out = await refreshWeather(deps(service({ meta: () => json({}, 500) }), { store }), 'tap');
    expect(store.save).toHaveBeenCalled();
    expect(out).toEqual({ fetched: false, say: "This phone didn't keep the new forecast. Check the phone's free storage. Forecast fetched 07:10." });
    expect((await readWeatherState())!.forecast!.fetchedAt).toEqual(OLD.fetchedAt);
  });

  test('[WXR-REFUSED] a value the browser cannot store aborts the whole write: the old forecast stays', async () => {
    await prepared();
    await saveForecast(trip().route.id, OLD);
    const bad = { ...OLD, fetchedAt: NOW, runs: [{ model: 'x', run: () => 1 }] } as unknown as StoredForecast;
    await expect(saveForecast(trip().route.id, bad)).rejects.toThrow();
    expect((await readWeatherState())!.forecast).toMatchObject({ fetchedAt: OLD.fetchedAt });
  });

  test('[WXR-REFUSED] storage refusing the turn to ask sends nothing: an answer could not be kept, and the spacing not recorded', async () => {
    await prepared();
    const f = service({ meta: () => json({}, 500) });
    const store = { ...weatherStore, reserve: () => Promise.reject(new DOMException('full', 'QuotaExceededError')) };
    const out = await refreshWeather(deps(f, { store }), 'tap');
    expect(out.fetched).toBe(false);
    expect(forecasts(f)).toEqual([]);
    expect(out.say).toContain("This phone didn't keep");
  });

  test('[WXR-REFUSED] a route replaced while the request is under way: the answer is dropped, nothing of the old route mixes in', async () => {
    await prepared();
    const count = trip().route.sampleGrid.length;
    const f = stubFetch(async (u) => {
      if (u.includes('/static/meta.json')) return json({}, 500);
      await replaceRoute({ ...flatRoute(50), id: 'second' });
      return json(forecastBody(count, { from: SECS(at('2026-10-17 00:00')), hours: 96 }));
    });
    const out = await refreshWeather(deps(f), 'tap');
    expect(out).toEqual({ fetched: false, say: W.weatherRouteChanged });
    expect(await (await openDb()).get('forecast', 'current')).toBeUndefined();
  });

  test('[WXR-SPACING] a forecast older than the stored one never overwrites it, also when it is hours older', async () => {
    await prepared();
    const id = trip().route.id;
    await saveForecast(id, { ...OLD, fetchedAt: at('2026-10-17 10:00') }, at('2026-10-17 10:05'));
    expect(await saveForecast(id, { ...OLD, fetchedAt: at('2026-10-17 08:30') }, at('2026-10-17 10:05'))).toBe('older');
    expect((await readWeatherState())!.forecast!.fetchedAt).toEqual(at('2026-10-17 10:00'));
  });

  test('[WXR-SPACING] a slower window never writes its older forecast over a newer one', async () => {
    await prepared();
    const id = trip().route.id;
    await saveForecast(id, { ...OLD, fetchedAt: at('2026-10-17 11:00') });
    expect(await saveForecast(id, { ...OLD, fetchedAt: at('2026-10-17 10:00') })).toBe('older');
    expect((await readWeatherState())!.forecast!.fetchedAt).toEqual(at('2026-10-17 11:00'));
  });

  test('[WXR-BASIS] a good fetch stores the runs read, of the models that matter only, and the basis line names the oldest of their latest runs, in the place\'s zone', async () => {
    const zones: ZoneSpan[] = [{ fromKm: 0, toKm: 300, timeZone: 'Europe/London', holidayZone: null, country: 'FR' }]; // a zone an hour off Berlin, to see the zone is used
    await prepared(zones);
    const meta = (u: string): Response => {
      if (u.includes('dwd_icon_d2')) return json(metaBody({ run: SECS(at('2026-10-17 10:00')), available: SECS(at('2026-10-17 11:00')) }));
      if (u.includes('arome_france')) return json(metaBody({ run: SECS(at('2026-10-17 07:00')), available: SECS(at('2026-10-17 09:00')) }));
      return json(metaBody({ run: SECS(at('2026-10-16 01:00')), available: SECS(at('2026-10-16 03:00')) })); // older, and matters not here
    };
    const nowT = at('2026-10-17 11:20');
    const out = await refreshWeather(deps(service({ meta }), { now: () => nowT }), 'tap');
    expect(out.fetched).toBe(true);
    const stored = (await readWeatherState())!.forecast!;
    expect(stored.fetchedAt).toEqual(nowT);
    expect(stored.runs.map((r) => r.model).sort()).toEqual([AROME, ICON]);
    const s = screen({ ...inputsOf({ trip: trip(), now: '2026-10-17 11:40', forecast: stored, zones }) });
    expect(JSON.stringify(s)).toContain('Open-Meteo forecast fetched 10:20 · model run 06:00');
  });

  test('[WXR-BASIS] the models that matter follow the route: its countries, kilometre by kilometre', async () => {
    const zones: ZoneSpan[] = [{ fromKm: 0, toKm: 100, timeZone: BER, holidayZone: null, country: 'DE' }, { fromKm: 100, toKm: 300, timeZone: BER, holidayZone: null, country: 'NL' }];
    await prepared(zones);
    expect((await refreshWeather(deps(service()), 'tap')).fetched).toBe(true);
    expect((await readWeatherState())!.forecast!.runs.map((r) => r.model).sort()).toEqual([ICON, 'KNMI HARMONIE-AROME'].sort());
  });

  test('[WXR-BASIS] a check that failed in part holds no run: no model run is named that the fetch did not read, and the next tap can fetch', async () => {
    const zones: ZoneSpan[] = [{ fromKm: 0, toKm: 300, timeZone: BER, holidayZone: null, country: 'FR' }];
    await prepared(zones);
    const meta = (u: string): Response => (u.includes('arome_france') ? json({}, 500) : json(metaBody({ run: SECS(at('2026-10-17 10:00')), available: SECS(at('2026-10-17 11:00')) })));
    const out = await refreshWeather(deps(service({ meta })), 'tap');
    expect(out.fetched).toBe(true);
    const stored = (await readWeatherState())!.forecast!;
    expect(stored.runs).toEqual([]);
    const s = screen(inputsOf({ trip: trip(), now: '2026-10-17 12:10', forecast: stored, zones }));
    const text = JSON.stringify(s);
    expect(text).toContain('Open-Meteo forecast fetched 12:00');
    expect(text).not.toContain('model run');
  });

  test('[WXR-BASIS] a forecast kept after a refusal reads stale once it is over 12 hours old, and names its day', async () => {
    await prepared();
    await saveForecast(trip().route.id, forecastOf(trip().route, [], { fetchedAt: '2026-10-17 07:10', from: '2026-10-17 01:00', days: 8 }));
    await refreshWeather(deps(service({ forecast: () => json({}, 500), meta: () => json({}, 500) })), 'tap');
    const kept = (await readWeatherState())!.forecast!;
    const text = JSON.stringify(screen(inputsOf({ trip: trip(), now: '2026-10-18 09:00', forecast: kept })));
    expect(text).toContain('fetched Sat 17 Oct, 07:10');
    expect(text).toContain(W.weatherStale);
  });

  test('[WXR-BASIS] a forecast stamped hours ahead of the clock (the clock was wrong when it came) never reads as current', () => {
    const OK = forecastOf(trip().route, [], { fetchedAt: '2026-10-17 07:10', from: '2026-10-17 01:00', days: 8 });
    const ahead = { ...OK, fetchedAt: at('2026-10-20 09:00') };
    expect(JSON.stringify(screen(inputsOf({ trip: trip(), now: '2026-10-17 12:00', forecast: ahead })))).toContain(W.weatherStale);
    const moments = { ...OK, fetchedAt: at('2026-10-17 12:04') }; // minutes ahead is an ordinary clock
    expect(JSON.stringify(screen(inputsOf({ trip: trip(), now: '2026-10-17 12:00', forecast: moments })))).not.toContain(W.weatherStale);
  });

  test('[WXR-UPDATE-TAP] nothing newer: no forecast request, only the check, and the stored forecast stays', async () => {
    await prepared();
    const held = run(ICON, '2026-10-17 09:00', HOUR);
    await saveForecast(trip().route.id, { ...OLD, runs: [held] });
    const f = service({ meta: () => json(metaBody({ run: SECS(at('2026-10-17 09:00')), available: SECS(at('2026-10-17 10:30')) })) });
    const out = await refreshWeather(deps(f), 'tap');
    expect(out.fetched).toBe(false);
    expect(out.say).toBe('You have the newest forecast (model run 09:00). Next run expected about 13:30.');
    expect(forecasts(f)).toEqual([]);
    expect(metas(f)).toHaveLength(5);
  });

  test('[WXR-UPDATE-TAP] no signal: no request of any kind', async () => {
    await prepared();
    await saveForecast(trip().route.id, OLD);
    const f = service();
    expect(await refreshWeather(deps(f, { signal: false }), 'tap')).toEqual({ fetched: false, say: 'No signal. Forecast fetched 07:10.' });
    expect(f.urls).toEqual([]);
  });

  test('[WXR-STAMPS] a forecast with empty values never prints as a figure on any card', async () => {
    await prepared();
    const f = service({
      meta: () => json({}, 500),
      forecast: () => json(forecastBody(trip().route.sampleGrid.length, { from: SECS(at('2026-10-17 00:00')), hours: 96, at: () => ({ temperature_2m: null, relative_humidity_2m: null, shortwave_radiation: null, precipitation_probability: null, precipitation: null, weather_code: null, wind_speed_10m: null, wind_direction_10m: null, wind_gusts_10m: null }) })),
    });
    // A whole answer of empty values has no temperature at all: refused.
    expect((await refreshWeather(deps(f), 'tap')).fetched).toBe(false);
    const stored = (await readWeatherState())!.forecast;
    expect(stored).toBeNull();
    // Such answers are refused now (incomplete); a stored forecast with gaps, as an older build could keep, still prints no NaN.
    const partial = forecastOf(trip().route, [], { fetchedAt: '2026-10-17 12:00', from: '2026-10-17 01:00', days: 4 });
    for (const g of partial.grid) g.hours.forEach((h, n) => { if (n % 2 === 1) Object.assign(h, { rh: Number.NaN, ghi: Number.NaN, pp: null, mm: Number.NaN, code: Number.NaN, windMs: Number.NaN, windFrom: Number.NaN, gustMs: Number.NaN }); });
    const inputs: ScreenInputs = inputsOf({ trip: trip(), now: '2026-10-17 12:40', forecast: partial, positions: [{ lat: 49.36, lon: 8.4, accuracyM: 10, at: at('2026-10-17 12:40'), km: 40, offRouteM: 0, source: 'gps', approximate: false }] });
    expect(JSON.stringify(screen(inputs))).not.toMatch(/NaN|null ?°|undefined/);
  });
  test('[WXR-REFUSED] an incomplete answer never replaces a good forecast, and says so', async () => {
    await prepared();
    const good = forecastOf(trip().route, [], { fetchedAt: '2026-10-17 07:10', from: '2026-10-17 01:00', days: 8 });
    await saveForecast(trip().route.id, good);
    const count = trip().route.sampleGrid.length;
    const f = service({ meta: () => json({}, 500), forecast: () => json(forecastBody(count, { from: SECS(at('2026-10-17 00:00')), hours: 14 })) });
    const out = await refreshWeather(deps(f), 'tap');
    expect(out).toEqual({ fetched: false, say: "The weather service's answer was incomplete. Forecast fetched 07:10." });
    expect((await readWeatherState())!.forecast!.grid[0]!.hours).toHaveLength(good.grid[0]!.hours.length);
  });

  test('[WXR-BASIS] the basis line claims no more detail than the stored hours hold', () => {
    const short = forecastOf(trip().route, [], { fetchedAt: '2026-10-17 07:10', from: '2026-10-17 01:00', until: '2026-10-17 23:00' });
    const text = JSON.stringify(screen(inputsOf({ trip: trip(), now: '2026-10-17 12:00', forecast: short })));
    expect(text).toContain(W.weatherDetailRange(W.timeWeekdayAt('Saturday', '23:00'), 'Saturday'));
    expect(text).not.toContain('Mon 07:10');
  });

  test('[WXR-SPACING] a stored forecast stamped two days ahead (the clock was wrong) is replaced by the next good answer', async () => {
    await prepared();
    await saveForecast(trip().route.id, { ...OLD, fetchedAt: at('2026-10-19 07:00') });
    const out = await refreshWeather(deps(service({ meta: () => json({}, 500) })), 'tap');
    expect(out.fetched).toBe(true);
    expect((await readWeatherState())!.forecast!.fetchedAt).toEqual(NOW);
  });

  test('[WXR-UPDATE-TAP] no tap ends without a sentence', async () => {
    await saveTrip(trip());
    expect((await refreshWeather(deps(service()), 'tap')).say).toBe(W.weatherNotPrepared);
    await markPrepared(trip().route.id);
    const busy = { ...weatherStore, reserve: () => Promise.resolve(false) };
    expect((await refreshWeather(deps(service({ meta: () => json({}, 500) }), { store: busy }), 'tap')).say).toBe(W.weatherOtherWindow);
    const gone = { ...weatherStore, save: () => Promise.resolve('gone' as const) };
    expect((await refreshWeather(deps(service({ meta: () => json({}, 500) }), { store: gone, now: () => new Date(NOW.getTime() + HOUR) }), 'tap')).say).toBe(W.weatherRouteChanged);
    const older = { ...weatherStore, save: () => Promise.resolve('older' as const) };
    expect((await refreshWeather(deps(service({ meta: () => json({}, 500) }), { store: older, now: () => new Date(NOW.getTime() + 2 * HOUR) }), 'tap')).say).toBe(W.weatherNewerSaved);
  });

  test('[WXR-GRID] a rider behind the plan asks for today and tomorrow on and after the planned last day, and reaching the route end changes no request of the day', async () => {
    await prepared();
    const f = service({ meta: () => json({}, 500), forecast: () => json(forecastBody(trip().route.sampleGrid.length, { from: SECS(at('2026-10-20 00:00')), hours: 72 })) });
    await refreshWeather(deps(f, { now: () => at('2026-10-20 19:00') }), 'tap');
    expect(new URL(forecasts(f)[0]!).searchParams.get('forecast_days')).toBe('2');
    await (await openDb()).put('meta', '2026-10-20', ROUTE_END_META);
    await refreshWeather(deps(f, { now: () => at('2026-10-20 20:00') }), 'tap');
    expect(forecasts(f)[1]).toBe(forecasts(f)[0]);
  });

  test('[WXR-TAP-NO-AUTO] a trip marked prepared for a route since replaced is not prepared: nothing is contacted', async () => {
    await saveTrip(trip());
    const old = trip().route.id;
    await replaceRoute({ ...flatRoute(50), id: 'second' });
    await markPrepared(old);
    const f = service();
    await refreshWeather(deps(f), 'tap');
    expect(f.urls).toEqual([]);
    expect((await readWeatherState())!.prepared).toBe(false);
    expect(await markPrepared(old)).toBe(false); // refused outright
    await (await openDb()).put('meta', old, PREPARED_META); // and a mark of the old route, however it got there, prepares nothing
    expect((await readWeatherState())!.prepared).toBe(false);
    expect(await markPrepared('second')).toBe(true);
    expect((await readWeatherState())!.prepared).toBe(true);
  });

});

describe('the mode is one line', () => {
  const REPO = fileURLToPath(new URL('../../../', import.meta.url));

  test('[WXR-MODE-ONE-LINE] the shipped build is automatic with 15-minute rain (ruling A of 3 November, after Open-Meteo written answer)', () => {
    const config = JSON.parse(readFileSync(join(REPO, 'build.config.json'), 'utf8')) as { weatherMode: string };
    expect(config.weatherMode).toBe('auto');
    expect(WEATHER_MODE).toBe('auto');
    expect(keepFreshOffered(WEATHER_MODE)).toBe(true);
  });

  /** Builds the app's constant from a copy of the repository's own file with only `weatherMode` changed. */
  async function bundled(mode: string): Promise<unknown> {
    const dir = mkdtempSync(join(tmpdir(), 'wf-mode-'));
    try {
      mkdirSync(join(dir, 'src', 'data'), { recursive: true });
      writeFileSync(join(dir, 'src', 'data', 'weather-mode.ts'), readFileSync(join(REPO, 'src', 'data', 'weather-mode.ts')));
      const config = readFileSync(join(REPO, 'build.config.json'), 'utf8');
      const changed = config.replace(/"weatherMode":\s*"[a-z]+"/, `"weatherMode": "${mode}"`);
      expect(changed.split('\n').filter((line, i) => line !== config.split('\n')[i]).length).toBeLessThanOrEqual(1); // one line
      writeFileSync(join(dir, 'build.config.json'), changed);
      const out = join(dir, 'out.mjs');
      await esbuild({ entryPoints: [join(dir, 'src', 'data', 'weather-mode.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
      return ((await import(/* @vite-ignore */ pathToFileURL(out).href)) as { WEATHER_MODE: unknown }).WEATHER_MODE;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test('[WXR-MODE-ONE-LINE] changing only weatherMode turns automatic on; the tap mode stays tap, and anything else reads tap', async () => {
    expect(await bundled('tap')).toBe('tap');
    expect(await bundled('auto')).toBe('auto');
    expect(await bundled('sometimes')).toBe('tap');
    // Three real esbuild runs: under a full parallel suite on a busy machine they outlast the default 5 s, as the build tests'
    // runs do (tests/unit/tools/app-build.test.ts gives those 60 s). The check itself is unchanged.
  }, 30_000);
});
