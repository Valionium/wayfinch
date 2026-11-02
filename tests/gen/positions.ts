// Positions (spec section 12.2): 5 m to 2 km accuracy, manual, exactly on stage ends, more than 5 km off the route, at home
// before the trip, behind, ahead, past the end; a phone clock behind the fix; out of order, with a broken one first.
import fc from 'fast-check';
import { addDaysIso, instantAt, localIsoDate } from '../../src/core/answers/time.ts';
import { pointAtRouteKm } from '../../src/core/geo/project.ts';
import type { Position, Route, Trip } from '../../src/core/types.ts';
import { DISTANCES_M, onThreshold } from './thresholds.ts';

const EARTH_KM = 6371;
const RAD = Math.PI / 180;
const MIN = 60_000;
const KPH_FACTOR = 0.82 / 1.15; // the clock speed of a flat route: loaded, with breaks

/** Where a rider on the plan would be at this moment. */
export function plannedKm(trip: Trip, now: Date, tz: string): number {
  const { route } = trip;
  const stages = route.stages;
  if (trip.departureDate === null || stages.length === 0) return route.lengthKm / 2;
  const today = localIsoDate(now, tz);
  if (today < trip.departureDate) return 0;
  let index = 0;
  while (addDaysIso(trip.departureDate, index) < today && index < stages.length) index++;
  if (index >= stages.length) return route.lengthKm;
  const stage = stages[index]!;
  const start = instantAt(today, trip.startTime, tz);
  const ridden = (Math.max(0, now.getTime() - start.getTime()) / 3_600_000) * trip.flatKph * KPH_FACTOR;
  return Math.min(stage.endKm, stage.startKm + ridden);
}

type Kind = 'plan' | 'behind' | 'ahead' | 'stage-end' | 'off' | 'far-off' | 'home' | 'approximate' | 'manual' | 'past-end' | 'route-end';
const NOT_A_TIME = new Date(Number.NaN);

function positionAt(route: Route, km: number, off: number, at: Date, accuracyM: number, source: 'gps' | 'manual'): Position {
  const held = Math.max(0, Math.min(route.lengthKm, km));
  const p = pointAtRouteKm(route, held);
  const lon = p.lon + (off / 1000 / (EARTH_KM * Math.cos(p.lat * RAD))) / RAD;
  return { lat: p.lat, lon, accuracyM, at, km, offRouteM: off, source, approximate: source === 'gps' && accuracyM > 500 };
}

const accuracy = (): fc.Arbitrary<number> => onThreshold([5, 100, 300, 499, 500, 501, 800, 2000], fc.integer({ min: 5, max: 60 }));
/** Minutes since the fix. Below zero: the phone's clock is behind it (the plan's review focus 2). */
const ageMin = (): fc.Arbitrary<number> => onThreshold([-5, 0, 5, 10, 179, 180, 181, 720, 2879, 2880, 2881], fc.integer({ min: 0, max: 90 }));

type LatestChoice = { kind: Kind; shift: number; off: number; far: number; acc: number; approx: number; age: number; stage: number };

function latest(trip: Trip, now: Date, tz: string, c: LatestChoice): Position {
  const { route } = trip;
  const at = new Date(now.getTime() - c.age * MIN);
  const planned = plannedKm(trip, now, tz);
  const stage = route.stages[c.stage % Math.max(1, route.stages.length)];
  switch (c.kind) {
    case 'plan': return positionAt(route, planned, 0, at, c.acc, 'gps');
    case 'behind': return positionAt(route, Math.max(0, planned - c.shift), 0, at, c.acc, 'gps');
    case 'ahead': return positionAt(route, Math.min(route.lengthKm, planned + c.shift), 0, at, c.acc, 'gps');
    case 'stage-end': return positionAt(route, stage?.endKm ?? route.lengthKm, 0, at, c.acc, 'gps');
    case 'off': return positionAt(route, planned, c.off, at, c.acc, 'gps');
    case 'far-off': return positionAt(route, planned, c.far, at, c.acc, 'gps');
    case 'home': return positionAt(route, planned, 40_000, new Date(now.getTime() - 30 * MIN), 20, 'gps');
    case 'approximate': return positionAt(route, planned, 0, at, c.approx, 'gps');
    case 'manual': return positionAt(route, planned, 0, at, 0, 'manual');
    case 'route-end': return positionAt(route, route.lengthKm, 0, at, c.acc, 'gps');
    case 'past-end': return { ...positionAt(route, route.lengthKm, 0, at, c.acc, 'gps'), km: route.lengthKm + 0.2 };
  }
}

const BROKEN: ((p: Position) => Position)[] = [
  (p) => ({ ...p, lat: Number.NaN }), (p) => ({ ...p, km: Number.NaN }), (p) => ({ ...p, at: NOT_A_TIME }), (p) => ({ ...p, offRouteM: Infinity }), (p) => ({ ...p, accuracyM: Number.NaN }),
];

/** The latest position, earlier ones of the same trip, and now and then a broken one or a jumbled order. */
export function positions(trip: Trip, now: Date, tz: string): fc.Arbitrary<Position[]> {
  const kind = fc.constantFrom<Kind>('plan', 'plan', 'plan', 'plan', 'plan', 'plan', 'behind', 'behind', 'ahead', 'stage-end', 'stage-end', 'off', 'off', 'far-off', 'home', 'approximate', 'approximate', 'manual', 'past-end', 'route-end');
  const choice: fc.Arbitrary<LatestChoice> = fc.record({
    kind, shift: fc.integer({ min: 1, max: 60 }), off: onThreshold(DISTANCES_M, fc.integer({ min: 301, max: 4900 })), far: fc.integer({ min: 5001, max: 40_000 }),
    acc: accuracy(), approx: onThreshold([501, 800, 2000], fc.integer({ min: 502, max: 2000 })), age: ageMin(), stage: fc.nat(30),
  });
  return fc.record({
    none: fc.integer({ min: 0, max: 11 }), choice, morning: fc.boolean(), evening: fc.integer({ min: 0, max: 3 }).map((n) => n > 0), jumbled: fc.integer({ min: 0, max: 7 }),
    broken: fc.integer({ min: 0, max: 39 }),
  }).map((r) => {
    if (r.none === 0) return [];
    const list: Position[] = [];
    if (r.evening) list.push(positionAt(trip.route, plannedKm(trip, new Date(now.getTime() - 16 * 3_600_000), tz), 0, new Date(now.getTime() - 16 * 3_600_000), 15, 'gps'));
    if (r.morning) list.push(positionAt(trip.route, plannedKm(trip, new Date(now.getTime() - 3 * 3_600_000), tz), 0, new Date(now.getTime() - 3 * 3_600_000), 15, 'gps'));
    list.push(latest(trip, now, tz, r.choice));
    if (r.jumbled === 0) list.reverse();
    // A broken fix first, or as the newest one: it must not take the good ones down.
    const breaker = BROKEN[r.broken];
    if (breaker) {
      const bad = breaker(list[list.length - 1]!);
      return r.broken % 2 === 0 ? [bad, ...list] : [...list, bad];
    }
    return list;
  });
}
