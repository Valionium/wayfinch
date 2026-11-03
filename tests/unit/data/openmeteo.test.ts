// With a stub fetch and built answers, whose shape is held to the real answers recorded in tests/fixtures/openmeteo/.
import { describe, expect, test } from 'vitest';
import { modelsForRoute } from '../../../src/core/engines/weather-classes.ts';
import { screen } from '../../../src/core/screen/screen.ts';
import type { Route } from '../../../src/core/types.ts';
import { baselinePoints, fetchBaseline, fetchElevation, fetchForecast, fetchModelRuns, forecastDaysFor, gridPoints, MODEL_PATHS, WeatherServiceError } from '../../../src/data/openmeteo.ts';
import type { GridPoint } from '../../../src/data/openmeteo.ts';
import { at, flatRoute, testTrip } from '../../fixtures/build.ts';
import { forecastBody, HOURLY, json, metaBody, recorded, stubFetch } from '../../fixtures/openmeteo.ts';
import { inputsOf } from '../core/screen/screen-helpers.ts';

const NOW = at('2026-10-17 07:10');
const nowFn = (): Date => NOW;
const SECS = (text: string): number => at(text).getTime() / 1000;
const FROM = SECS('2026-10-17 00:00');
const points = (n: number): GridPoint[] => Array.from({ length: n }, (_, i) => ({ km: i * 10, lat: 49 + i / 10, lon: 8.4, ele: 100 + i }));
const params = (url: string): URLSearchParams => new URL(url).searchParams;
const answering = (count: number, hours = 48) => stubFetch(() => json(forecastBody(count, { from: FROM, hours })));

describe('the forecast request', () => {
  test("[WXR-GRID] nine hourly variables, m/s, unixtime, zone auto, days, and coordinates at 0.01 degrees with each point's elevation", async () => {
    const f = answering(3);
    const grid: GridPoint[] = [{ km: 0, lat: 49.123456, lon: 8.456789, ele: 112.4 }, { km: 10, lat: 49.2, lon: 8.4, ele: 130 }, { km: 20, lat: 49.3, lon: 8.399, ele: 90.6 }];
    await fetchForecast(grid, { days: 9, with15: false, fetch: f, now: nowFn });
    expect(f.urls).toHaveLength(1); // one request, always for the whole grid
    const q = params(f.urls[0]!);
    expect(q.get('hourly')!.split(',').sort()).toEqual([...HOURLY].sort());
    expect(q.get('hourly')!.split(',')).toHaveLength(9);
    expect(q.get('wind_speed_unit')).toBe('ms');
    expect(q.get('timeformat')).toBe('unixtime');
    expect(q.get('timezone')).toBe('auto');
    expect(q.get('forecast_days')).toBe('9');
    expect(q.get('latitude')).toBe('49.12,49.20,49.30');
    expect(q.get('longitude')).toBe('8.46,8.40,8.40');
    expect(q.get('elevation')).toBe('112,130,91');
  });

  test("[WXR-GRID] a grid without heights sends no elevation: `nan` would turn the service's height correction off", async () => {
    const f = answering(2);
    await fetchForecast([{ km: 0, lat: 49, lon: 8, ele: null }, { km: 1, lat: 49.1, lon: 8, ele: 100 }], { days: 2, with15: false, fetch: f, now: nowFn });
    expect(params(f.urls[0]!).has('elevation')).toBe(false);
  });

  test('[WXR-GRID] forecast days are min(16, days to the planned end + 1), at least 1, and come from the plan alone', () => {
    const trip = testTrip(); // four stages from Sat 17 Oct: planned end Tue 20 Oct
    expect(forecastDaysFor(trip.route, trip.departureDate, '2026-10-17')).toBe(4);
    expect(forecastDaysFor(trip.route, trip.departureDate, '2026-10-20')).toBe(1);
    expect(forecastDaysFor(trip.route, trip.departureDate, '2026-10-25')).toBe(1); // past the end
    expect(forecastDaysFor(trip.route, trip.departureDate, '2026-09-01')).toBe(16);
    expect(forecastDaysFor(trip.route, null, '2026-10-17')).toBe(16); // no date: no end to stop at
  });

  test("[WXR-GRID] the grid comes from the route's fixed kilometres, rounded to 0.01 degrees, with the height at that kilometre", () => {
    const route = flatRoute(40, { stageEnds: [20] });
    const grid = gridPoints({ ...route, points: route.points.map((p) => ({ ...p, ele: p.km * 10 })) });
    expect(grid.map((g) => g.km)).toEqual(route.sampleGrid);
    for (const g of grid) {
      expect(g.lat).toBe(Math.round(g.lat * 100) / 100);
      expect(g.lon).toBe(Math.round(g.lon * 100) / 100);
    }
    expect(grid.find((g) => g.km === 20)!.ele).toBe(200);
    expect(gridPoints(flatRoute(20, { ele: null })).every((g) => g.ele === null)).toBe(true);
  });

  test('[WXR-SAME] the same grid sends byte-identical addresses, asks for no cached copy and sends no credentials', async () => {
    const f = answering(3);
    const grid = points(3);
    await fetchForecast(grid, { days: 4, with15: false, fetch: f, now: nowFn });
    await fetchForecast(grid, { days: 4, with15: false, fetch: f, now: () => new Date(NOW.getTime() + 3_600_000) });
    expect(f.urls[0]).toBe(f.urls[1]);
    expect(f.inits[0]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
  });

  test('[WXR-HOURLY-ONLY] without 15-minute rain nothing asks for it, and the stored forecast says so', async () => {
    const f = answering(2);
    const stored = await fetchForecast(points(2), { days: 2, with15: false, fetch: f, now: nowFn });
    expect(f.urls[0]).not.toContain('minutely_15');
    expect(stored.has15).toBe(false);
    expect(stored.grid.every((g) => g.rain15 === undefined)).toBe(true);
  });

  test('[WXR-HOURLY-ONLY] with 15-minute rain the request adds 192 steps, and a step with no value is left out, never read as dry', async () => {
    const t0 = SECS('2026-10-17 07:00');
    const f = stubFetch(() => json(forecastBody(2, { from: FROM, hours: 48, rain15: (i) => (i === 0 ? { time: [t0, t0 + 900, t0 + 1800], precipitation: [0, null, 0.4] } : { time: [t0], precipitation: [null] }) })));
    const stored = await fetchForecast(points(2), { days: 2, with15: true, fetch: f, now: nowFn });
    const q = params(f.urls[0]!);
    expect(q.get('minutely_15')).toBe('precipitation');
    expect(q.get('forecast_minutely_15')).toBe('192');
    expect(stored.has15).toBe(true);
    expect(stored.grid[0]!.rain15).toEqual([{ at: new Date(t0 * 1000), mm: 0 }, { at: new Date((t0 + 1800) * 1000), mm: 0.4 }]);
    expect(stored.grid[1]!.rain15).toBeUndefined(); // hour boundaries there
  });

  test('[WXR-HOURLY-ONLY] asked for 15-minute rain and none comes: has15 stays false', async () => {
    const stored = await fetchForecast(points(2), { days: 2, with15: true, fetch: answering(2), now: nowFn });
    expect(stored.has15).toBe(false);
  });
});

describe('reading the answer', () => {
  test('[WXR-STAMPS] the recorded answers parse: two points as a list, one point as a bare object, with 15-minute rain', async () => {
    const two = recorded('forecast-two-points') as { hourly: { time: number[]; temperature_2m: number[] } }[];
    const first = two[0]!.hourly;
    const now = new Date(first.time[3]! * 1000);
    const stored = await fetchForecast(points(2), { days: 1, with15: false, fetch: stubFetch(() => json(two)), now: () => now });
    expect(stored.grid).toHaveLength(2);
    expect(stored.grid[0]!.hours).toHaveLength(first.time.length);
    expect(stored.grid[0]!.hours[3]!.at).toEqual(now);
    expect(stored.grid[0]!.hours[3]!.t).toBe(first.temperature_2m[3]);
    const one = recorded('forecast-one-point-15min') as { hourly: { time: number[] }; minutely_15: { time: number[] } };
    const now1 = new Date(one.hourly.time[3]! * 1000);
    const single = await fetchForecast(points(1), { days: 1, with15: true, fetch: stubFetch(() => json(one)), now: () => now1 });
    expect(single.grid).toHaveLength(1);
    expect(single.has15).toBe(true);
    expect(single.grid[0]!.rain15).toHaveLength(one.minutely_15.time.length);
  });

  test("[WXR-STAMPS] the built answers have the recorded answers' fields", () => {
    const real = (recorded('forecast-two-points') as Record<string, unknown>[])[1]!;
    const built = (forecastBody(2, { from: FROM, hours: 2 }) as Record<string, unknown>[])[1]!;
    expect(Object.keys(built).sort()).toEqual(Object.keys(real).sort());
    expect(Object.keys(built['hourly'] as object).sort()).toEqual(Object.keys(real['hourly'] as object).sort());
    expect(Object.keys(metaBody({ run: 1, available: 2 }) as object).sort()).toEqual(Object.keys(recorded('meta-icon-d2') as object).sort());
  });

  test('[WXR-STAMPS] 3.0 mm at 80% stamped 15:00 reads "from about 14:00" through screen()', async () => {
    const trip = testTrip();
    const now = at('2026-10-17 13:30');
    const f = stubFetch(() => json(forecastBody(trip.route.sampleGrid.length, {
      from: SECS('2026-10-17 00:00'), hours: 96,
      at: (_, t) => (t === SECS('2026-10-17 15:00') ? { precipitation_probability: 80, precipitation: 3 } : undefined),
    })));
    const stored = await fetchForecast(gridPoints(trip.route), { days: 4, with15: false, fetch: f, now: () => now });
    const hour = stored.grid[0]!.hours.find((h) => h.at.getTime() === at('2026-10-17 15:00').getTime())!;
    expect(hour).toMatchObject({ pp: 80, mm: 3, t: 12, rh: 60, ghi: 100, code: 0, windMs: 2, windFrom: 180, gustMs: 5 });
    const shown = screen(inputsOf({ trip, forecast: stored, now: '2026-10-17 13:30', positions: [{ lat: 49.36, lon: 8.4, accuracyM: 10, at: now, km: 40, offRouteM: 0, source: 'gps', approximate: false }] }));
    expect(JSON.stringify(shown)).toContain('from about 14:00');
  });

  test('[WXR-STAMPS] a value the service leaves empty stays unknown, and never reads as no rain', async () => {
    const f = stubFetch(() => json(forecastBody(2, { from: FROM, hours: 12, at: (_, t) => (t === FROM + 3600 ? { precipitation_probability: null, precipitation: null, weather_code: null } : undefined) })));
    const stored = await fetchForecast(points(2), { days: 1, with15: false, fetch: f, now: () => new Date((FROM + 7200) * 1000) });
    const h = stored.grid[0]!.hours[1]!;
    expect(h.pp).toBeNull();
    expect(h.mm).toBeNaN();
    expect(h.code).toBeNaN();
  });

  test.each<[string, () => unknown]>([
    ['fewer locations than asked', () => forecastBody(2, { from: FROM, hours: 48 })],
    ['more locations than asked', () => forecastBody(4, { from: FROM, hours: 48 })],
    ['one location for three', () => forecastBody(1, { from: FROM, hours: 48 })],
    ['an error object', () => ({ error: true, reason: 'x' })],
    ['a location with no hours', () => { const b = forecastBody(3, { from: FROM, hours: 48 }) as { hourly: { time: number[] } }[]; b[1]!.hourly.time = []; return b; }],
    ['a variable missing at one location', () => { const b = forecastBody(3, { from: FROM, hours: 48 }) as { hourly: Record<string, unknown> }[]; delete b[2]!.hourly['precipitation']; return b; }],
    ['a variable shorter than the hours', () => { const b = forecastBody(3, { from: FROM, hours: 48 }) as { hourly: Record<string, unknown[]> }[]; b[1]!.hourly['temperature_2m']!.pop(); return b; }],
    ['a location with no temperature at all', () => forecastBody(3, { from: FROM, hours: 48, at: (i) => (i === 1 ? { temperature_2m: null } : undefined) })],
    ['locations out of order', () => { const b = forecastBody(3, { from: FROM, hours: 48 }) as unknown[]; return [b[0], b[2], b[1]]; }],
    ['an old answer, ending before now', () => forecastBody(3, { from: FROM - 5 * 86400, hours: 48 })],
    ['an answer starting after tomorrow', () => forecastBody(3, { from: FROM + 5 * 86400, hours: 48 })],
  ])('[WXR-REFUSED] %s is no forecast at all: nothing partial is handed on', async (_, body) => {
    await expect(fetchForecast(points(3), { days: 2, with15: false, fetch: stubFetch(() => json(body())), now: nowFn })).rejects.toBeInstanceOf(WeatherServiceError);
  });

  test.each([429, 500, 400])('[WXR-REFUSED] HTTP %i throws', async (status) => {
    await expect(fetchForecast(points(1), { days: 2, with15: false, fetch: stubFetch(() => json({ error: true, reason: 'x' }, status)), now: nowFn })).rejects.toBeInstanceOf(WeatherServiceError);
  });

  test('[WXR-REFUSED] a body that is not JSON, and a lost connection, throw the same', async () => {
    await expect(fetchForecast(points(1), { days: 2, with15: false, fetch: stubFetch(() => new Response('<html>')), now: nowFn })).rejects.toBeInstanceOf(WeatherServiceError);
    await expect(fetchForecast(points(1), { days: 2, with15: false, fetch: stubFetch(() => { throw new TypeError('failed'); }), now: nowFn })).rejects.toBeInstanceOf(WeatherServiceError);
  });

  test('[WXR-STAMPS] the fetch time is when the request set out, never later', async () => {
    let t = NOW.getTime();
    const stored = await fetchForecast(points(1), { days: 2, with15: false, fetch: stubFetch(() => { t += 60_000; return json(forecastBody(1, { from: FROM, hours: 48 })); }), now: () => new Date(t) });
    expect(stored.fetchedAt).toEqual(NOW);
  });
});

describe('the model runs', () => {
  test('[WXR-GRID] the same five models for every trip, no coordinates, and every model of the table has an address', async () => {
    const f = stubFetch(() => json(metaBody({ run: 1_793_653_200, available: 1_793_658_318 })));
    const runs = await fetchModelRuns(f);
    expect(f.urls).toHaveLength(5);
    for (const u of f.urls) expect(u).toMatch(/^https:\/\/api\.open-meteo\.com\/data\/[a-z0-9_]+\/static\/meta\.json$/);
    expect(runs).toHaveLength(5);
    expect(runs[0]).toEqual({ model: 'ICON-D2', run: new Date(1_793_653_200_000), availableAt: new Date(1_793_658_318_000), intervalS: 10800 });
    const everywhere = ['DE', 'FR', 'NL', 'DK', 'PL'];
    const named = new Set(everywhere.flatMap((c) => [10, 25].flatMap((lon) => modelsForRoute([{ lat: 50, lon }], () => c))));
    expect([...named].sort()).toEqual(Object.keys(MODEL_PATHS).sort());
  });

  test('[WXR-REFUSED] a model that fails or answers nonsense is left out, the others stay', async () => {
    const f = stubFetch((u) => (u.includes('dwd_icon_d2') ? json({}, 500) : u.includes('metno') ? json({ last_run_initialisation_time: 'x' }) : json(metaBody({ run: 100, available: 200 }))));
    const runs = await fetchModelRuns(f);
    expect(runs.map((r) => r.model).sort()).toEqual(['AROME France HD', 'DMI HARMONIE-AROME', 'KNMI HARMONIE-AROME']);
  });

  test('[WXR-REFUSED] the recorded metadata parses', async () => {
    const real = recorded('meta-icon-d2') as { last_run_initialisation_time: number; update_interval_seconds: number };
    const runs = await fetchModelRuns(stubFetch(() => json(real)));
    expect(runs[0]!.run).toEqual(new Date(real.last_run_initialisation_time * 1000));
    expect(runs[0]!.intervalS).toBe(real.update_interval_seconds);
  });
});

describe('the seasonal baseline', () => {
  const route = (): Route => {
    const r = flatRoute(100, { stageEnds: [40, 70] });
    return { ...r, points: r.points.map((p) => ({ ...p, ele: p.km === 55 ? 900 : 100 })) };
  };

  test('[WXR-BASELINE] the points are the stage ends and the high point, rounded to 0.01 degrees', () => {
    const list = baselinePoints(route());
    expect(list.map((p) => p.km)).toEqual([40, 55, 70, 100]);
    for (const p of list) expect(p.lat).toBe(Math.round(p.lat * 100) / 100);
    expect(list[1]!.ele).toBe(900);
  });

  test('[WXR-BASELINE] without heights there is no high point', () => {
    expect(baselinePoints(flatRoute(100, { stageEnds: [40], ele: null })).map((p) => p.km)).toEqual([40, 100]);
  });

  const daily = (lows: number[], highs: number[], rain: number[]): unknown => ({ daily: { time: lows.map((_, i) => `d${i}`), temperature_2m_min: lows, temperature_2m_max: highs, precipitation_sum: rain } });
  const month = (start: number, rainy: number): unknown => daily(
    Array.from({ length: 30 }, (_, i) => start + i), Array.from({ length: 30 }, (_, i) => start + 10 + i), Array.from({ length: 30 }, (_, i) => (i < rainy ? 2 : 0)),
  );

  test("[WXR-BASELINE] five years before this one, the fields of types.ts, by Load Check's method", async () => {
    const pts: GridPoint[] = [{ km: 40, lat: 49.36, lon: 8.4, ele: 100 }, { km: 100, lat: 49.9, lon: 8.4, ele: null }];
    const f = stubFetch(() => json([month(0, 6), month(10, 3)]));
    const b = await fetchBaseline(pts, [7], f, at('2026-10-17 07:10'));
    expect(f.urls).toHaveLength(5);
    expect(f.urls.map((u) => params(u).get('start_date'))).toEqual(['2025-07-01', '2024-07-01', '2023-07-01', '2022-07-01', '2021-07-01']);
    expect(params(f.urls[0]!).get('end_date')).toBe('2025-07-31');
    expect(params(f.urls[0]!).get('latitude')).toBe('49.36,49.90');
    expect(params(f.urls[0]!).get('daily')).toBe('temperature_2m_min,temperature_2m_max,precipitation_sum');
    expect(params(f.urls[0]!).get('timezone')).toBe('auto');
    expect(new URL(f.urls[0]!).origin).toBe('https://archive-api.open-meteo.com');
    expect(b.years).toBe('2021–2025');
    // Lows 0..29, five times over: mean 14.5; tenth percentile at floor(0.1 * 149) = 14 of the sorted list, which is 2.
    // Highs 10..39: mean 24.5; ninetieth at floor(0.9 * 149) = 134, which is 36.
    expect(b.points[0]).toEqual({ km: 40, eleM: 100, month: 7, meanLowC: 15, p10LowC: 2, meanHighC: 25, p90HighC: 36, rainDays: 6 });
    expect(b.points[1]).toMatchObject({ km: 100, eleM: null, month: 7, rainDays: 3 });
  });

  test('[WXR-BASELINE] February ends on its own last day', async () => {
    const f = stubFetch(() => json(month(0, 0)));
    await fetchBaseline(points(1), [2], f, at('2026-10-17 07:10'));
    expect(f.urls.map((u) => params(u).get('end_date'))).toEqual(['2025-02-28', '2024-02-29', '2023-02-28', '2022-02-28', '2021-02-28']);
  });

  test('[WXR-BASELINE] the recorded answer parses', async () => {
    const b = await fetchBaseline(points(2), [7], stubFetch(() => json(recorded('archive-two-points'))), NOW);
    expect(b.points).toHaveLength(2);
    expect(Number.isFinite(b.points[0]!.meanHighC)).toBe(true);
  });

  test('[WXR-BASELINE] a failed year shrinks the years named', async () => {
    const f = stubFetch((u) => (params(u).get('start_date')!.startsWith('2025') ? json({}, 500) : json([month(0, 1), month(5, 1)])));
    const b = await fetchBaseline(points(2), [7], f, NOW);
    expect(b.years).toBe('2021–2024');
    expect(b.points).toHaveLength(2);
  });

  test('[WXR-BASELINE] under 20 days at a point is no baseline for that point, as in Load Check', async () => {
    const b = await fetchBaseline(points(2), [7], stubFetch(() => json([month(0, 1), daily([1], [3], [0])])), NOW);
    expect(b.points.map((p) => p.km)).toEqual([0]); // five years of one day: 5 days at the second
  });

  test('[WXR-REFUSED] nothing at all from the archive throws, and no invented figures', async () => {
    await expect(fetchBaseline(points(2), [7], stubFetch(() => json({}, 429)), NOW)).rejects.toBeInstanceOf(WeatherServiceError);
  });
});

describe('heights', () => {
  const pts = (n: number): { lat: number; lon: number }[] => Array.from({ length: n }, (_, i) => ({ lat: 49.123456 + i / 1000, lon: 8.987654 }));
  const heights = (u: string): Response => json({ elevation: params(u).get('latitude')!.split(',').map((_, i) => 100 + i) });

  test('[WXR-ELEVATION] 3 decimals, at most 100 per request, in order', async () => {
    const f = stubFetch(heights);
    const out = await fetchElevation(pts(250), f);
    expect(f.urls).toHaveLength(3);
    expect(f.urls.map((u) => params(u).get('latitude')!.split(',').length)).toEqual([100, 100, 50]);
    expect(params(f.urls[0]!).get('latitude')!.split(',')[0]).toBe('49.123');
    expect(params(f.urls[0]!).get('longitude')!.split(',')[0]).toBe('8.988');
    expect(out).toHaveLength(250);
    expect(out[100]).toBe(100);
    expect(out[249]).toBe(149);
  });

  test('[WXR-ELEVATION] a failed batch leaves nulls, never zeros, and the others stay', async () => {
    let n = 0;
    const f = stubFetch((u) => (++n === 2 ? json({}, 500) : heights(u)));
    const out = await fetchElevation(pts(250), f);
    expect(out[99]).toBe(199);
    expect(out.slice(100, 200).every((h) => h === null)).toBe(true);
    expect(out[200]).toBe(100);
  });

  test('[WXR-ELEVATION] a wrong count or a non-number in the answer leaves nulls', async () => {
    expect(await fetchElevation(pts(2), stubFetch(() => json({ elevation: [1] })))).toEqual([null, null]);
    expect(await fetchElevation(pts(2), stubFetch(() => json({ elevation: [1, 'x'] })))).toEqual([1, null]);
  });

  test('[WXR-ELEVATION] the recorded answer parses', async () => {
    const real = (recorded('elevation-two-points') as { elevation: number[] }).elevation;
    expect(await fetchElevation(pts(2), stubFetch(() => json({ elevation: real })))).toEqual(real);
  });
});
