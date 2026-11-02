import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { climbingAnswer, type ClimbingFacts } from '../../../../src/core/engines/climbing.ts';
import { dayRide, scheduleFor } from '../../../../src/core/engines/tripday.ts';
import { findClimbs } from '../../../../src/core/route/climbs.ts';
import type { Climb, Position, Route, Stage, Trip } from '../../../../src/core/types.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { at, pos, sun, testTrip, zonesOf } from '../../../fixtures/build.ts';
import { routeOf, sampled } from '../../../fixtures/route.ts';

const SAT = '2026-10-17';
const SUN = '2026-10-18';
const STAGE_ENDS = [78, 150, 222, 300];

/** Height by kilometre: a 200 m climb on km 90-95 (4%), a 60 m dip, then a 150 m rise on km 160-170 that is no climb. */
const PROFILE: [number, number][] = [[0, 100], [90, 100], [95, 300], [100, 240], [160, 240], [170, 390], [300, 390]];
const heightAt = (km: number): number => {
  for (let i = 1; i < PROFILE.length; i++) {
    const [k0, e0] = PROFILE[i - 1]!;
    const [k1, e1] = PROFILE[i]!;
    if (km <= k1) return e0 + ((e1 - e0) * (km - k0)) / (k1 - k0);
  }
  return PROFILE.at(-1)![1];
};

const stagesFor = (lengthKm: number): Stage[] =>
  STAGE_ENDS.map((end, i) => ({ day: i + 1, startKm: i === 0 ? 0 : STAGE_ENDS[i - 1]!, endKm: i === STAGE_ENDS.length - 1 ? lengthKm : end, ridingHours: 4, ascentM: null }));
async function hills(ele: ((km: number) => number) | null = heightAt): Promise<Route> {
  const route = await routeOf(sampled(300, 1, ele));
  return { ...route, stages: stagesFor(route.lengthKm) };
}

type Case = { route: Route; positions?: Position[]; now?: string; climbs?: Climb[] };
function factsOf(c: Case): ClimbingFacts {
  const trip: Trip = testTrip({ route: c.route });
  const env = { sun: sun(), routeZones: zonesOf(c.route.lengthKm) };
  const ride = dayRide(trip, c.positions ?? [], null, null, at(c.now ?? `${SAT} 08:00`), env);
  return { route: c.route, ride, schedule: scheduleFor(ride, trip, env), climbs: c.climbs ?? findClimbs(c.route), routeZones: env.routeZones };
}
const night = (km: number): Position => pos({ km, at: `${SAT} 19:00` });
const near = (a: Date, b: Date): void => expect(Math.abs(a.getTime() - b.getTime())).toBeLessThanOrEqual(1000);

describe('[CL-LEFT] climbing left and the next climb', () => {
  test('from km 76: to the stop and to the end, to 10 m', async () => {
    const route = await hills();
    const a = climbingAnswer(factsOf({ route, positions: [night(76)], now: `${SUN} 07:00` }));
    expect(a.topic).toBe('climbing');
    expect(a.status).toBe('fine');
    expect(a.title).toBe('200 m of climbing to km 150, 350 m to the end');
    expect(a.stamp).toEqual({ km: 150 });
  });

  test('the next climb shows start, length, gain, average gradient, steepest 500 m and the arrival at the top', async () => {
    const route = await hills();
    const f = factsOf({ route, positions: [night(76)], now: `${SUN} 07:00` });
    const a = climbingAnswer(f);
    expect(a.items).toHaveLength(1);
    const item = a.items[0]!;
    expect(item.label).toBe('Next climb: km 90');
    expect(item.status).toBe('fine');
    expect(item.stamp?.km).toBeCloseTo(95, 1);
    near(item.stamp!.at!, f.schedule.atKm(f.climbs[0]!.topKm));
    expect(item.detail).toMatch(/^5 km · \+200 m · 4\.0% average · steepest 500 m 4\.0% · top about \d\d:\d\d$/);
  });

  test('once the top is passed, the next climb is the following one, or none', async () => {
    const route = await hills();
    const a = climbingAnswer(factsOf({ route, positions: [night(76), pos({ km: 120, at: `${SUN} 12:00` })], now: `${SUN} 12:10` }));
    expect(a.items).toEqual([]);
    expect(a.detail).toBe('No more climbs of 100 m or more ahead');
    expect(a.status).toBe('fine');
    expect(a.title).toBe('0 m of climbing to km 150, 150 m to the end');
  });

  test('a rider on a climb still sees it as the next one', async () => {
    const route = await hills();
    const a = climbingAnswer(factsOf({ route, positions: [night(76), pos({ km: 92, at: `${SUN} 10:00` })], now: `${SUN} 10:10` }));
    expect(a.items).toHaveLength(1);
    expect(a.items[0]!.label).toBe('Next climb: km 90');
  });

  test('a climb beyond the day\'s stop is reached on a later day and says which', async () => {
    const route = await hills();
    const a = climbingAnswer(factsOf({ route, now: `${SAT} 07:00` }));
    // Day 1 rides to km 78; the climb on km 90-95 belongs to day 2.
    expect(a.items[0]!.detail).toMatch(/top Sun 18 Oct, about \d\d:\d\d$/);
  });

  test('with the day\'s stop at the route end, only the end is told', async () => {
    const route = await hills();
    const a = climbingAnswer(factsOf({ route, positions: [night(222)], now: `${SUN} 07:00` }));
    expect(a.title).toBe('0 m of climbing to the end');
  });

  test('the first climb in the list is not trusted: a broken one is skipped, an unsorted list gives the earliest', async () => {
    const route = await hills();
    const good: Climb = { startKm: 90, topKm: 95, gainM: 200, avgGradePct: 4, steepest500mPct: 4 };
    const later: Climb = { startKm: 200, topKm: 204, gainM: 120, avgGradePct: 3, steepest500mPct: 3 };
    const broken: Climb = { startKm: Number.NaN, topKm: Number.NaN, gainM: Number.NaN, avgGradePct: Number.NaN, steepest500mPct: Number.NaN };
    const half: Climb = { startKm: 85, topKm: 88, gainM: Infinity, avgGradePct: 4, steepest500mPct: 4 };
    const a = climbingAnswer(factsOf({ route, positions: [night(76)], now: `${SUN} 07:00`, climbs: [broken, later, half, good] }));
    expect(a.items).toHaveLength(1);
    expect(a.items[0]!.label).toBe('Next climb: km 90');
  });

  test('a speed that gives no times still gives the climbing, without a time', async () => {
    const route = await hills();
    const trip = testTrip({ route, flatKph: 0 });
    const env = { sun: sun(), routeZones: zonesOf(300) };
    const ride = dayRide(trip, [night(76)], null, null, at(`${SUN} 07:00`), env);
    const a = climbingAnswer({ route, ride, schedule: scheduleFor(ride, trip, env), climbs: findClimbs(route), routeZones: env.routeZones });
    expect(a.status).toBe('fine');
    expect(a.items[0]!.stamp?.at).toBeUndefined();
    expect(a.items[0]!.detail).not.toMatch(/top/);
    expect(JSON.stringify(a)).not.toMatch(/NaN|Invalid|undefined|Infinity/);
  });

  test('a start that is no number is unknown, not a count', async () => {
    const route = await hills();
    const f = factsOf({ route, positions: [night(76)], now: `${SUN} 07:00` });
    const a = climbingAnswer({ ...f, ride: { ...f.ride, startKm: Number.NaN } });
    expect(a.status).toBe('unknown');
    expect(JSON.stringify(a)).not.toMatch(/NaN|undefined/);
  });

  test('a time zone named "constructor" cannot break it', async () => {
    const route = await hills();
    const f = factsOf({ route, positions: [night(76)], now: `${SUN} 07:00` });
    const a = climbingAnswer({ ...f, routeZones: [{ fromKm: 0, toKm: 300, timeZone: 'constructor', holidayZone: null, country: '__proto__' }] });
    expect(a.status).toBe('fine');
    expect(a.items[0]!.detail).toMatch(/top about \d\d:\d\d$/);
  });

  fcTest.prop([fc.integer({ min: 0, max: 299 }), fc.integer({ min: 0, max: 40 })])('never warning, never a negative figure, no banned word', async (km, back) => {
    const route = await hills();
    const a = climbingAnswer(factsOf({ route, positions: [night(Math.max(0, km - back))], now: `${SUN} 07:00` }));
    expect(['fine', 'unknown']).toContain(a.status);
    expect(a.title).not.toMatch(/-\d/);
    expect(bannedHits(JSON.stringify(a))).toEqual([]);
  });
});

describe('[CL-UNKNOWN] no heights', () => {
  test('says unknown, never 0 m, and names the heights as missing', async () => {
    const route = await hills(null);
    const a = climbingAnswer(factsOf({ route, positions: [night(76)], now: `${SUN} 07:00` }));
    expect(a.title).toBe('Climbing unknown for this route');
    expect(a.status).toBe('unknown');
    expect(a.missing).toEqual(['heights']);
    expect(a.items).toEqual([]);
    expect(JSON.stringify(a)).not.toMatch(/\b0 m\b/);
  });

  test('one missing height anywhere is enough', async () => {
    const pairs = sampled(300, 1, heightAt);
    pairs[150] = [150, null];
    const built = await routeOf(pairs);
    const route = { ...built, stages: stagesFor(built.lengthKm) };
    const a = climbingAnswer(factsOf({ route, positions: [night(76)], now: `${SUN} 07:00` }));
    expect(a.status).toBe('unknown');
    expect(a.missing).toEqual(['heights']);
  });

  test('a height that is no number also reads unknown', async () => {
    const route = await hills();
    const points = route.points.map((p, i) => (i === 40 ? { ...p, ele: Number.NaN } : p));
    const a = climbingAnswer(factsOf({ route: { ...route, points }, positions: [night(76)], now: `${SUN} 07:00` }));
    expect(a.status).toBe('unknown');
    expect(a.missing).toEqual(['heights']);
  });

  test('with heights it is fine and never warning, and nothing is missing', async () => {
    const route = await hills();
    const a = climbingAnswer(factsOf({ route, now: `${SAT} 07:00` }));
    expect(a.status).toBe('fine');
    expect(a.missing).toEqual([]);
  });

  test('a flat route with heights is 0 m, known', async () => {
    const route = await hills(() => 100);
    const a = climbingAnswer(factsOf({ route, positions: [night(76)], now: `${SUN} 07:00` }));
    expect(a.status).toBe('fine');
    expect(a.title).toBe('0 m of climbing to km 150, 0 m to the end');
  });
});
