// Cases on the production grid, and the review's cases: the grid rounds its kilometres to 0.001 km, stage ends stay exact.
import { describe, expect, test } from 'vitest';
import type { StopFacts } from '../../../../src/core/engines/covers.ts';
import { latestPosition } from '../../../../src/core/engines/locate.ts';
import { rainPlan, rainPlans } from '../../../../src/core/engines/rain-plans.ts';
import { thunderNear } from '../../../../src/core/engines/shelter.ts';
import { weatherAnswer, weatherStatus, weatherWindows, type WeatherFacts } from '../../../../src/core/engines/weather.ts';
import { chanceLine, rainAtStart, rainHereNow } from '../../../../src/core/engines/weather-windows.ts';
import { sampleGrid } from '../../../../src/core/route/grid.ts';
import type { Answer, StoredForecast, Trip } from '../../../../src/core/types.ts';
import { at, cafe, flatRoute, pos, testTrip } from '../../../fixtures/build.ts';
import { forecastOf, momentOf, SAT, stamps, stopFactsOf, SUN, type ForecastOpts, type Moment, type Spell, type StopCase } from './weather-helpers.ts';

/** A trip whose grid is the production grid: stage ends rounded to 0.001 km. */
function roundedTrip(ends: number[], length = 300, over: Partial<Trip> = {}): Trip {
  const route = flatRoute(length, { stageEnds: ends });
  route.sampleGrid = sampleGrid(route, [], route.stages);
  return testTrip({ route, ...over });
}
const LODGING = { stay: 'accommodation' as const };

function factsOf(spells: Spell[], m: Moment, o: ForecastOpts = {}, forecast?: StoredForecast | null): WeatherFacts {
  const c = momentOf(m);
  return {
    forecast: forecast === undefined ? forecastOf(c.trip.route, spells, o) : forecast, baseline: null, trip: c.trip, ride: c.ride,
    schedule: c.schedule, now: c.now, position: latestPosition(c.positions), routeZones: c.routeZones,
  };
}
const statusOf = (f: WeatherFacts): string => weatherStatus(f, weatherWindows(f)).status;
const answerOf = (f: WeatherFacts): Answer => weatherAnswer(f, weatherWindows(f), [], null);
const plansOf = (c: StopCase): ReturnType<typeof rainPlans> => {
  const f: StopFacts = stopFactsOf(c);
  return rainPlans(weatherWindows(f), f);
};

describe('the rounded grid and the exact stop', () => {
  const up = roundedTrip([78.1236, 150.1236, 222], 300, LODGING);
  const STOP_UP = 78.124;

  test('[WX-WARN-THUNDER] the fixture is what production builds: the grid point lies just past the stop', () => {
    expect(up.route.sampleGrid).toContain(STOP_UP);
    expect(up.route.stages[0]!.endKm).toBe(78.1236);
  });
  test('[WX-WARN-THUNDER] a storm at the stop\'s grid point at the arrival, rounded up: warning, any stay', () => {
    const f = factsOf([{ km: STOP_UP, stamps: [`${SAT} 13:00`], pp: 40, code: 95 }], { trip: up });
    expect(f.ride.stopKm).toBe(78.1236);
    expect(statusOf(f)).toBe('warning');
    expect(answerOf(f).title).toMatch(/^Thunderstorms possible/);
    expect(weatherWindows(f)[0]!.toKm).toBe(78.1236);
  });
  test('[WX-WARN-THUNDER] and it gets its plan', () => {
    const p = plansOf({ moment: { trip: up }, spells: [{ km: STOP_UP, stamps: [`${SAT} 13:00`], pp: 40, code: 95 }], spots: [{ b: cafe('x'), km: 70, id: 'n1' }] });
    expect(p).toHaveLength(1);
    expect(p[0]!.covers.map((c) => c.placeId)).toEqual(['n1']);
  });
  test('[WX-ACTION] 80% with 5 mm at that point: action', () => {
    expect(statusOf(factsOf([{ km: STOP_UP, stamps: [`${SAT} 13:00`], pp: 80, mm: 5 }], { trip: up }))).toBe('action');
  });
  test('[WX-WARN-THUNDER] rounded down it reads the same', () => {
    const down = roundedTrip([78.1234, 150, 222], 300, LODGING);
    expect(down.route.sampleGrid).toContain(78.123);
    expect(statusOf(factsOf([{ km: 78.123, stamps: [`${SAT} 13:00`], pp: 40, code: 95 }], { trip: down }))).toBe('warning');
  });
  const close = { trip: up, positions: [pos({ km: 77.56, at: `${SAT} 12:40` })], now: `${SAT} 12:40` };
  test('[WX-SEASONAL] a rider just before that stop has a forecast', () => {
    const f = factsOf([], close);
    expect(answerOf(f).title).not.toContain('No forecast');
    expect(statusOf(f)).toBe('fine');
  });
  test('[WX-WARN-THUNDER] and a storm there warns him', () => {
    expect(statusOf(factsOf([{ km: STOP_UP, stamps: [`${SAT} 13:00`], pp: 40, code: 95 }], close))).toBe('warning');
  });
  test('[WX-WINDOW-STOP] a later day\'s rounded stop still ends its window', () => {
    const f = factsOf([{ km: [150.124], stamps: stamps(SUN, 8, 18), pp: 80 }, { km: [165], stamps: stamps('2026-10-19', 8, 12), pp: 80 }], { trip: up, now: `${SAT} 08:00` });
    const later = weatherWindows(f).filter((w) => w.fromKm > 100);
    expect(later.map((w) => [w.fromKm, w.toKm])).toEqual([[150.1236, 150.1236], [165, 165]]);
  });
  test('[WX-WARN-THUNDER] the route end rounded up is still on the ride', () => {
    const end = roundedTrip([200], 299.9996, LODGING);
    expect(end.route.sampleGrid).toContain(300);
    const m = { trip: end, positions: [pos({ km: 295, at: `${SAT} 14:00` })], now: `${SAT} 14:00` };
    const f = factsOf([{ km: 300, stamps: [`${SAT} 15:00`], pp: 40, code: 95 }], m);
    expect(f.ride.stopKm).toBe(299.9996);
    expect(statusOf(f)).toBe('warning');
    expect(statusOf(factsOf([], m))).toBe('fine');
  });
});

describe('the band must be seen', () => {
  const trip = testTrip(LODGING);
  const f = (spells: Spell[], o: ForecastOpts = {}): string => statusOf(factsOf(spells, { trip }, o));
  test('[WX-WARN-THUNDER] a forecast ending 13:00 with the arrival at 12:52: its band is unseen, so not fine', () => {
    expect(f([], { until: `${SAT} 13:00` })).toBe('unknown');
    expect(f([], { until: `${SAT} 15:00` })).toBe('fine');
  });
  test('[WX-WARN-THUNDER] a broken or removed hour after the arrival at the stop: not fine', () => {
    expect(f([{ km: 78, stamps: [`${SAT} 14:00`], pp: Number.NaN }])).toBe('unknown');
    expect(f([{ km: 78, stamps: [`${SAT} 15:00`], pp: Number.NaN }])).toBe('fine');
    const c = momentOf({ trip });
    const forecast = forecastOf(trip.route, []);
    const g = forecast.grid.find((x) => x.km === 78)!;
    g.hours = g.hours.filter((h) => h.at.getTime() !== at(`${SAT} 14:00`).getTime());
    expect(statusOf(factsOf([], { trip }, {}, forecast))).toBe('unknown');
    expect(c.ride.stopKm).toBe(78);
  });
  test('[WX-WARN-THUNDER] a broken hour just before the rider\'s time: not fine', () => {
    expect(f([{ km: 0, stamps: [`${SAT} 08:00`], pp: Number.NaN }])).toBe('unknown');
  });
  test('[WX-WARN-THUNDER] a forecast that began at its fetch has no hours before it, and that hides nothing', () => {
    expect(statusOf(factsOf([], { trip, now: `${SAT} 08:20` }, { from: `${SAT} 09:00`, fetchedAt: `${SAT} 08:10` }))).toBe('fine');
  });
});

describe('an old forecast', () => {
  const m = { positions: [pos({ km: 40, at: `${SAT} 12:20` })], now: `${SAT} 12:20` };
  const old = { fetchedAt: '2026-10-15 10:00' }; // over 50 hours
  test('[WX-STALE] a storm on today\'s ride: warning, and its plan', () => {
    const c: StopCase = { moment: m, spells: [{ km: 60, stamps: stamps(SAT, 13, 15), pp: 40, code: 95 }], opts: old, spots: [{ b: cafe('x'), km: 52 }] };
    expect(plansOf(c)).toHaveLength(1);
  });
  test('[WX-STALE] rain on today\'s ride keeps its plan too', () => {
    expect(plansOf({ moment: m, spells: [{ km: 60, stamps: stamps(SAT, 13, 15), pp: 80 }], opts: old, spots: [{ b: cafe('x'), km: 52 }] })).toHaveLength(1);
  });
  test('[WX-WARN-THUNDER] a storm on day 1, days before the trip: warning, and its plan; rain that far off has none', () => {
    const early = { now: '2026-10-14 08:00' };
    const opts = { from: '2026-10-14 01:00', fetchedAt: '2026-10-14 07:00' };
    const storm = plansOf({ moment: early, opts, spells: [{ km: 60, stamps: stamps(SAT, 11, 14), pp: 40, code: 95 }], spots: [{ b: cafe('x'), km: 52 }] });
    expect(storm).toHaveLength(1);
    expect(plansOf({ moment: early, opts, spells: [{ km: 60, stamps: stamps(SAT, 11, 14), pp: 80 }], spots: [{ b: cafe('x'), km: 52 }] })).toEqual([]);
  });
  test('[WX-DETAIL] a storm plan beyond 48 h with no cover gives no time', () => {
    const p = plansOf({ moment: { now: '2026-10-14 08:00' }, opts: { from: '2026-10-14 01:00', fetchedAt: '2026-10-14 07:00' }, spells: [{ km: 60, stamps: stamps(SAT, 11, 14), pp: 40, code: 95 }] });
    expect(p).toHaveLength(1);
    expect(p[0]!.none).toBe('No mapped cover before km 60');
  });
  test('[WX-HONEST] rain here on a forecast over 48 h old gives no half-hour time', () => {
    const f = factsOf([{ km: 40, stamps: [`${SAT} 13:00`], pp: 80 }], m, old);
    const a = answerOf(f);
    expect(a.title).toBe('Rain likely here');
    expect(a.detail).not.toMatch(/\d\d:\d\d/);
    expect(a.detail).not.toContain('show rain here around');
  });
});

describe('a grid off the route', () => {
  const moved = (f: StoredForecast, by: number, km?: number): StoredForecast => ({
    ...f, grid: f.grid.map((g) => (km === undefined || g.km === km ? { ...g, lat: g.lat + by } : g)),
  });
  const trip = testTrip(LODGING);
  const base = (spells: Spell[] = []): StoredForecast => forecastOf(trip.route, spells);

  test('[WX-SEASONAL] a whole grid 20 degrees away is no forecast: not fine, weather missing', () => {
    const f = factsOf([], { trip }, {}, moved(base(), 20));
    expect(statusOf(f)).toBe('unknown');
    expect(answerOf(f).missing).toContain('weather');
    expect(weatherWindows(f)).toEqual([]);
  });
  test('[WX-SEASONAL] one point away: it is a hole, and its rain is not on the route', () => {
    const wet = moved(base([{ km: 40, stamps: stamps(SAT, 9, 13), pp: 90 }]), 20, 40);
    const f = factsOf([], { trip }, {}, wet);
    expect(statusOf(f)).toBe('unknown');
    expect(weatherWindows(f)).toEqual([]);
  });
  test('[WX-SEASONAL] coordinates rounded to 0.02 degrees are still on the route', () => {
    expect(statusOf(factsOf([], { trip }, {}, moved(base(), 0.02)))).toBe('fine');
    expect(statusOf(factsOf([], { trip }, {}, moved(base(), 0.03)))).toBe('unknown');
  });
  test('[WX-SEASONAL] no coordinates at all: the same', () => {
    expect(statusOf(factsOf([], { trip }, {}, moved(base(), Number.NaN)))).toBe('unknown');
  });
  test('[WX-HERE-START] the chip and the plans read the same forecast', () => {
    const f = stopFactsOf({ forecast: moved(forecastOf(trip.route, [{ km: 0, stamps: stamps(SAT, 8, 12), pp: 90, code: 95 }]), 20), moment: { trip } });
    expect(thunderNear(f)).toBe(false);
    expect(rainPlans(weatherWindows(f), f)).toEqual([]);
  });
  test('[WX-HERE-START] rain here and at the start read only what lies on the route, given the route', () => {
    const wet = moved(base([{ km: 0, stamps: [`${SAT} 09:00`], pp: 90 }, { km: 120, stamps: [`${SAT} 15:00`], pp: 90 }]), 20);
    const c = momentOf({ trip });
    const p = pos({ km: 120, at: `${SAT} 14:20` });
    expect(rainAtStart(wet, c.ride, null, trip.route)).toBe(false);
    expect(rainHereNow(wet, p, at(`${SAT} 14:20`), trip.route)).toBeNull();
  });
});

describe('smaller findings', () => {
  test('[WX-KM-ROUND] a 3% storm does not read "0 in 10"', () => {
    const f = factsOf([{ km: 40, stamps: stamps(SAT, 9, 12), pp: 3, code: 95 }], {});
    expect(chanceLine(weatherWindows(f)[0]!)).toBe('under 1 in 10 forecast scenarios');
  });
  test('[STOP-RULE5] rain at the start: a separate storm window a little further on has its own plan, not the list', () => {
    const f = stopFactsOf({
      moment: { now: `${SAT} 08:00` }, opts: { extraKms: [3, 6, 12] },
      spells: [{ km: 0, stamps: [`${SAT} 09:00`], pp: 80 }, { km: 12, stamps: [`${SAT} 10:00`], pp: 40, code: 95 }],
    });
    const likely = weatherWindows(f).filter((w) => w.cls === 'likely');
    expect(likely.map((w) => w.fromKm)).toEqual([0, 12]);
    expect(rainPlan(likely[0]!, f).listInstead).not.toBeNull();
    const second = rainPlan(likely[1]!, f);
    expect(second.listInstead).toBeNull();
    expect(second.m).toBe(12);
  });
  test('[STOP-ORDER] one place on two passes is one cover in a plan', () => {
    const f = stopFactsOf({
      moment: { trip: testTrip({ route: flatRoute(300, { stageEnds: [200, 300] }) }), positions: [pos({ km: 60, at: `${SAT} 12:00` })], now: `${SAT} 12:00` },
      spells: [{ km: 100, stamps: stamps(SAT, 6, 23), pp: 80 }], spots: [{ b: cafe('x'), km: [90, 92], id: 'n1' }],
    });
    const p = rainPlan(weatherWindows(f)[0]!, f);
    expect(p.covers.map((c) => [c.placeId, c.km])).toEqual([['n1', 92]]);
  });
});
