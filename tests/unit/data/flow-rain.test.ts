// Criterion 9 on the fixtures (plan Task 23, FLOW-RAIN): the 165 km Heidelberg → Strasbourg and 800 km fixtures, each prepared by
// the real Get ready offline with a rainy forecast in an hourly and in a 15-minute version, read back through the store; at moments
// along the ride, every rain plan's covers are reached 15-60 min of riding before m (or are the latest that counts) and are open,
// and no thunderstorm plan lists a roof (the simulator's INV-06 and INV-07, on these screens). Then two refreshes on one day at
// different kilometres send byte-identical requests.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildScreen } from '../../../src/core/screen/screen.ts';
import type { Position, ScreenInputs } from '../../../src/core/types.ts';
import { fetchForecast } from '../../../src/data/openmeteo.ts';
import { prepareTrip } from '../../../src/data/prepare.ts';
import type { PrepareDeps } from '../../../src/data/prepare.ts';
import { refreshWeather } from '../../../src/data/refresh.ts';
import { readInputs } from '../../../src/store/inputs.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';
import { weatherStore } from '../../../src/store/weather.ts';
import { at } from '../../fixtures/build.ts';
import { forecastBody, json, stubFetch } from '../../fixtures/openmeteo.ts';
import type { HourOverride } from '../../fixtures/openmeteo.ts';
import { CHECKS } from '../../sim/checks.ts';
import { freshStore } from '../store/helpers.ts';
import { fixtureBuild, fixtureTrip, PackServer } from './pack-server.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.setConfig({ testTimeout: 120_000 });
beforeEach(freshStore);

const boundaryText = readFileSync(fileURLToPath(new URL('../../../public/data/boundaries.v1.json', import.meta.url)), 'utf8');
const ZONE = 'Europe/Berlin';
const DAY1 = '2026-10-17';
const NOW = at(`${DAY1} 07:00`);
const SECS = (d: Date): number => Math.round(d.getTime() / 1000);
const hourOf = (stamp: number): number => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: ZONE }).format(new Date(stamp * 1000)));

/** Every day: rain from 11 to 13, a thunderstorm from 15 to 16, dry otherwise; the same at every point of the route. */
const RAIN = new Set([11, 12]);
const STORM = new Set([15]);
const hourly = (_location: number, stamp: number): HourOverride | undefined => {
  const h = hourOf(stamp);
  if (RAIN.has(h)) return { precipitation_probability: 85, precipitation: 2.2, weather_code: 63 };
  if (STORM.has(h)) return { precipitation_probability: 75, precipitation: 3.5, weather_code: 95, wind_gusts_10m: 18 };
  return undefined;
};
/** The 15-minute version of the same rain, for the first two days, as the service gives it (192 steps). */
const rain15 = (from: number) => () => {
  const time = Array.from({ length: 192 }, (_, n) => from + n * 900);
  return { time, precipitation: time.map((t) => (RAIN.has(hourOf(t)) ? 0.6 : STORM.has(hourOf(t)) ? 0.9 : 0)) };
};

/** Open-Meteo as a stub: a forecast for as many points as were asked for; nothing else answers. */
function weatherService(with15: boolean) {
  return stubFetch((url) => {
    if (!url.includes('/v1/forecast')) return json({}, 500);
    const q = new URL(url).searchParams;
    const count = q.get('latitude')!.split(',').length;
    const days = Number(q.get('forecast_days'));
    const from = SECS(at(`${DAY1} 00:00`));
    return json(forecastBody(count, { from, hours: days * 24, at: hourly, ...(with15 ? { rain15: rain15(SECS(NOW)) } : {}) }));
  });
}

function prepareDeps(server: PackServer, weather: ReturnType<typeof stubFetch>, with15: boolean): PrepareDeps {
  const site: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === '/') return new Response(null, { status: 200 });
    if (url === '/data/boundaries.v1.json') return new Response(boundaryText);
    return server.fetch(input, init);
  };
  return {
    fetch: site, now: () => NOW, sleep: async () => undefined, nav: {}, with15,
    fetchForecast: (grid, o) => fetchForecast(grid, { ...o, with15, fetch: weather }),
    fetchBaseline: async () => ({ years: '2021–2025', points: [] }),
    fetchElevation: async (points) => points.map(() => 200),
  };
}

/** A rider on the route at `km` at the local time `hm` of `date`, with a good fix. */
function riderAt(i: ScreenInputs, date: string, hm: string, km: number): ScreenInputs {
  const point = i.trip.route.points.reduce((best, p) => (Math.abs(p.km - km) < Math.abs(best.km - km) ? p : best));
  const when = at(`${date} ${hm}`);
  const p: Position = { lat: point.lat, lon: point.lon, accuracyM: 12, at: when, km: point.km, offRouteM: 0, source: 'gps', approximate: false };
  return { ...i, now: when, positions: [p] };
}

const INV06 = CHECKS.find((c) => c.id === 'INV-06')!;
const INV07 = CHECKS.find((c) => c.id === 'INV-07')!;

describe('criterion 9 on the fixtures', () => {
  for (const id of ['heidelberg-strasbourg', 'multi-day-800'] as const) {
    for (const with15 of [false, true]) {
      test(`[FLOW-RAIN] ${id}, ${with15 ? '15-minute' : 'hourly'} rain: covers 15-60 min before m and open, no roof in a thunderstorm plan`, async () => {
        await readTrip();
        await saveTrip({ ...(await fixtureTrip(id)), departureDate: DAY1 });
        const weather = weatherService(with15);
        const reports = await prepareTrip(prepareDeps(new PackServer(fixtureBuild(id)), weather, with15), () => undefined);
        expect(reports.find((r) => r.step === 'weather')).toMatchObject({ ok: true });
        const base = (await readInputs(NOW))!;
        expect(base.forecast!.has15).toBe(with15);
        // Moments through each day's ride: before, inside and after the rain, before the storm.
        const stages = base.trip.route.stages.slice(0, 2);
        let covered = 0;
        let storms = 0;
        let moments = 0;
        stages.forEach((stage, n) => {
          const date = n === 0 ? DAY1 : '2026-10-18';
          for (const [hm, share] of [['08:40', 0.02], ['09:30', 0.12], ['10:00', 0.2], ['10:30', 0.27], ['13:20', 0.5], ['14:00', 0.6], ['14:20', 0.65]] as const) {
            const km = stage.startKm + (stage.endKm - stage.startKm) * share;
            const i = riderAt(base, date, hm, km);
            const built = buildScreen(i);
            expect(built.faults, `${hm} km ${km.toFixed(1)}`).toEqual([]);
            const again = (x: ScreenInputs) => buildScreen(x).screen;
            moments += 1;
            if (INV06.appliesTo(i, built.screen)) {
              INV06.check(i, built.screen, again);
              if (built.parts.plans.some((p) => p.covers.length > 0)) covered += 1;
            }
            if (INV07.appliesTo(i, built.screen)) {
              INV07.check(i, built.screen, again);
              storms += 1;
            }
          }
        });
        // Not vacuous: plans with covers, and thunderstorms on the ride, were really checked.
        process.stderr.write(`
`);
        expect(moments).toBeGreaterThanOrEqual(7);
        expect(covered, 'moments with a rain plan and covers').toBeGreaterThan(0);
        expect(storms, 'moments with a thunderstorm on the ride').toBeGreaterThan(0);
      });
    }

    test(`[FLOW-RAIN] ${id}: two refreshes on one day at different kilometres send byte-identical requests`, async () => {
      await readTrip();
      await saveTrip({ ...(await fixtureTrip(id)), departureDate: DAY1 });
      const weather = weatherService(true);
      await prepareTrip(prepareDeps(new PackServer(fixtureBuild(id)), weather, true), () => undefined);
      const length = (await readTrip())!.route.lengthKm;
      for (const [km, hm] of [[10, '09:00'], [Math.round(length * 0.6), '21:30']] as const) {
        const out = await refreshWeather({ mode: 'auto', fetch: weather, now: () => at(`${DAY1} ${hm}`), signal: true, keepFresh: true, store: weatherStore, atKm: km }, 'tap');
        expect(out.fetched, `at km ${km}`).toBe(true);
      }
      const asked = weather.urls.filter((u) => u.includes('/v1/forecast'));
      expect(asked).toHaveLength(3); // Get ready's, then the two refreshes
      expect(asked[2]).toBe(asked[1]);
    });
  }
});
