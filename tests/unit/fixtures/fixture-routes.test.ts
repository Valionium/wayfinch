// The six fixture routes with their packs, through the real matching and the real hours preparation: the leave-by properties
// on the day before departure and on each trip day, and the stop plans on rainy forecasts, hourly and with 15-minute rain.
import { beforeAll, describe, expect, test } from 'vitest';
import { addDaysIso, instantAt } from '../../../src/core/answers/time.ts';
import { sunFromSuncalc } from '../../../src/core/engines/daylight.ts';
import { buildSegmentIndex } from '../../../src/core/geo/index.ts';
import { pointAtRouteKm } from '../../../src/core/geo/project.ts';
import { placeSpans } from '../../../src/core/hours/spans.ts';
import { buildRoute } from '../../../src/core/route/profile.ts';
import { matchPlaces, matchRescuePoints } from '../../../src/core/route/matches.ts';
import { buildScreen } from '../../../src/core/screen/screen.ts';
import type { GridHour, PlaceHours, Position, Route, ScreenInputs, StoredForecast, Trip, ZoneSpan } from '../../../src/core/types.ts';
import { FIXTURE_IDS, loadFixturePack, loadFixtureRoute, type FixtureRouteId } from '../../fixtures/packs/index.ts';
import { ruleOf } from '../../gen/scenario.ts';
import { withStages, stagesOf } from '../../gen/stages.ts';
import { CHECKS } from '../../sim/checks.ts';
import { must, world } from '../../sim/world.ts';

const TZ = 'Europe/Berlin';
const DEPARTURE = '2026-10-17'; // a Saturday, so the first ride ends before a Sunday
const HOUR = 3_600_000;

type Fixture = { route: Route; trip: Trip; base: Omit<ScreenInputs, 'positions' | 'now' | 'forecast'> };

const built = new Map<FixtureRouteId, Promise<Fixture>>();
const fixture = (id: FixtureRouteId): Promise<Fixture> => {
  let f = built.get(id);
  if (!f) {
    f = makeFixture(id);
    built.set(id, f);
  }
  return f;
};

async function makeFixture(id: FixtureRouteId): Promise<Fixture> {
  const raw = await loadFixtureRoute(id);
  const pack = await loadFixturePack(id);
  const whole = await buildRoute(raw.points, raw.name, 'gpx');
  const route = withStages(whole, stagesOf(whole, { pace: 'sporting', flatKph: 25, nights: 'suggested' }));
  const trip: Trip = { route, departureDate: DEPARTURE, startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2, pace: 'sporting' };
  const matches = matchPlaces(pack.places, route, buildSegmentIndex(route));
  const from = instantAt(addDaysIso(DEPARTURE, -2), '00:00', TZ);
  const to = instantAt(addDaysIso(DEPARTURE, route.stages.length + 3), '00:00', TZ);
  const matched = new Set(matches.map((m) => m.placeId));
  const hours: PlaceHours[] = pack.places.filter((p) => matched.has(p.id)).map((p) => ({ placeId: p.id, windowStart: from, windowEnd: to, spans: placeSpans(p.openingHours, p, ruleOf(p), from, to, {}) }));
  const zones: ZoneSpan[] = [{ fromKm: 0, toKm: route.lengthKm, timeZone: TZ, holidayZone: pack.places[0]?.holidayZone ?? 'DE-BW', country: 'DE' }];
  return {
    route, trip,
    base: {
      trip, matches, places: pack.places, roofs: pack.roofs, hours, rescuePoints: matchRescuePoints(pack.rescuePoints, route), savedKm: [{ fromKm: 0, toKm: route.lengthKm }], baseline: null,
      dayStarts: [], routeEndDate: null, planTomorrow: null,
      profile: { weightKg: null, thirst: 'average', ebike: false, capacityL: 3, k: 1, sumW: 0, kDrink: 1, weighedRides: 0 }, loadSummary: null, waterLeft: null,
      settings: { campWaterL: 2, keepFresh: false }, sun: sunFromSuncalc, routeZones: zones, holidays: {}, demo: null,
    },
  };
}

function positionAt(route: Route, km: number, at: Date): Position {
  const p = pointAtRouteKm(route, km);
  return { lat: p.lat, lon: p.lon, accuracyM: 12, at, km, offRouteM: 0, source: 'gps', approximate: false };
}

/** Every grid point the same, with a spell of rain or storm over these hours after `from`. */
function forecastOn(route: Route, now: Date, code: number, startH: number, hours: number, has15: boolean): StoredForecast {
  const first = Math.floor(now.getTime() / HOUR) * HOUR - 2 * HOUR;
  const grid = route.sampleGrid.map((km) => {
    const p = pointAtRouteKm(route, km);
    const list: GridHour[] = [];
    for (let n = 0; n < 72; n++) {
      const at = new Date(first + n * HOUR);
      const since = (at.getTime() - now.getTime()) / HOUR - startH;
      const wet = since >= 0 && since < hours;
      list.push({ at, t: 14, rh: 70, ghi: 200, pp: wet ? 80 : 5, mm: wet ? 1.5 : 0, code: wet ? code : 2, windMs: 3, windFrom: 200, gustMs: 6 });
    }
    return { km, lat: p.lat, lon: p.lon, hours: list, ...(has15 ? { rain15: list.slice(0, 48).flatMap((h) => [1, 2, 3, 4].map((q) => ({ at: new Date(h.at.getTime() - HOUR + (q * HOUR) / 4), mm: h.mm / 4 }))) } : {}) };
  });
  return { fetchedAt: new Date(now.getTime() - HOUR), runs: [], grid, has15 };
}

const screens = new WeakMap<ScreenInputs, ReturnType<typeof buildScreen>['screen']>();
const check = (id: string, i: ScreenInputs): boolean => {
  const c = CHECKS.find((x) => x.id === id)!;
  const s = screens.get(i) ?? buildScreen(i).screen;
  screens.set(i, s);
  if (!c.appliesTo(i, s)) return false;
  c.check(i, s, (x) => buildScreen(x).screen);
  return true;
};

describe.each(FIXTURE_IDS.map((id) => [id] as const))('%s', (id) => {
  let f: Fixture;
  beforeAll(async () => {
    f = await fixture(id);
    const i: ScreenInputs = { ...f.base, now: instantAt(DEPARTURE, '07:30', TZ), positions: [], forecast: null };
    const t0 = performance.now();
    buildScreen(i);
    console.log(`[fixture] ${id}: ${f.route.lengthKm.toFixed(0)} km, ${f.base.places.length} places, ${f.base.matches.length} matches, ${f.route.points.length} points, ${(performance.now() - t0).toFixed(0)} ms a screen`);
  }, 300_000);

  test('[LB-FIXTURES] the day before departure and each trip day: leave-by meets its limits, and later departures break one', () => {
    const moments: { now: Date; positions: Position[] }[] = [{ now: instantAt(addDaysIso(DEPARTURE, -1), '20:00', TZ), positions: [] }];
    f.route.stages.forEach((stage, n) => {
      const date = addDaysIso(DEPARTURE, n);
      const at = instantAt(date, '07:30', TZ);
      moments.push({ now: at, positions: [positionAt(f.route, stage.startKm, at)] });
    });
    let leaveBys = 0;
    for (const m of moments) {
      const i: ScreenInputs = { ...f.base, ...m, forecast: forecastOn(f.route, m.now, 3, 0, 0, false) };
      const { screen, faults } = buildScreen(i);
      expect(faults).toEqual([]);
      for (const name of ['INV-13', 'INV-14', 'INV-15', 'INV-16', 'INV-05']) check(name, i);
      if (screen.phase !== 'route-end' && world(i).lb?.unrounded) leaveBys++;
    }
    expect(leaveBys, 'a leave-by on at least one day').toBeGreaterThan(0);
  }, 300_000);

  test('[LB-FIXTURES] every check of the simulator holds on the first days', () => {
    f.route.stages.slice(0, 2).forEach((stage, n) => {
      for (const time of ['07:30', '12:30', '17:30']) {
        const at = instantAt(addDaysIso(DEPARTURE, n), time, TZ);
        const km = time === '07:30' ? stage.startKm : time === '12:30' ? (stage.startKm + stage.endKm) / 2 : stage.endKm - 0.5;
        const i: ScreenInputs = { ...f.base, now: at, positions: [positionAt(f.route, km, at)], forecast: forecastOn(f.route, at, 61, 1, 3, false), waterLeft: { litres: 1.5, at, confirmed: true } };
        for (const c of CHECKS) if (c.id !== 'INV-26' && c.id !== 'INV-29') check(c.id, i);
      }
    });
  }, 300_000);
});

describe.each(['heidelberg-strasbourg', 'multi-day-800'].flatMap((id) => [[id, false], [id, true]] as [FixtureRouteId, boolean][]))('rainy forecasts on %s, 15-minute rain %s', (id, has15) => {
  let f: Fixture;
  beforeAll(async () => { f = await fixture(id); }, 300_000);

  const moments = (): { now: Date; forecast: StoredForecast; positions: Position[] }[] => {
    const out: { now: Date; forecast: StoredForecast; positions: Position[] }[] = [];
    f.route.stages.slice(0, 2).forEach((stage, n) => {
      const at = instantAt(addDaysIso(DEPARTURE, n), '08:15', TZ);
      for (const [code, startH, hours] of [[61, 2, 3], [80, 1, 2], [95, 3, 2]] as const) {
        out.push({ now: at, forecast: forecastOn(f.route, at, code, startH, hours, has15), positions: [positionAt(f.route, stage.startKm, at)] });
      }
    });
    return out;
  };

  test('[STOP-FIXTURES] plan bands, open from arrival to +30 min, no roof in a thunderstorm plan', () => {
    let plans = 0;
    let storms = 0;
    for (const m of moments()) {
      const i: ScreenInputs = { ...f.base, ...m };
      const w = world(i);
      plans += w.plans.filter((p) => p.covers.length > 0).length;
      for (const p of w.plans) {
        if (p.window.kind !== 'thunder') continue;
        storms++;
        for (const c of p.covers) must(c.coverClass <= 2, `a class ${c.coverClass} cover in a thunderstorm plan on ${id}`);
      }
      for (const name of ['INV-06', 'INV-07', 'INV-09', 'INV-10']) check(name, i);
    }
    expect(plans, 'plans with a cover').toBeGreaterThan(0);
    expect(storms, 'thunderstorm plans').toBeGreaterThan(0);
  }, 300_000);
});
