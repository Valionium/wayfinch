// Pace and the one arrival function (spec sections 6.2 and 12.4). Every card, the strip, the chips and leave-by read
// their arrivals from a Schedule, so a place has one unrounded arrival for one ride and departure.
import { addDaysIso, instantAt, localIsoDate } from '../answers/time.ts';
import { effortProfile, LOAD_PENALTY } from '../route/stages.ts';
import type { Km, Position, Route, RouteMatch, Stage, Trip, ZoneLookup } from '../types.ts';
import { rejoinKm } from './locate.ts';

const BREAKS = 1.15;
const R_MIN = 0.85;
const R_MAX = 1.5;
const CHECK_IN_ACCURACY_M = 100;
const CHECK_IN_MAX_OFF_M = 5000;
const MOVED_KM = 2;
const STRETCH_MIN_KM = 10;
const MS_PER_MIN = 60_000;

/** Kilometres and effort-kilometres of the route, for one binary search per question. */
type Effort = { kms: Float64Array; efforts: Float64Array };
const efforts = new WeakMap<Route, Effort>();

function effortOf(route: Route): Effort {
  let e = efforts.get(route);
  if (!e) {
    const { samples } = effortProfile(route);
    e = { kms: Float64Array.from(samples, (s) => s.kmExact), efforts: Float64Array.from(samples, (s) => s.effortExact) };
    efforts.set(route, e);
  }
  return e;
}

/** Distance plus climbing from the route start to `km`, linear between samples and held to the route's ends. */
function effortAt(route: Route, km: Km): number {
  const { kms, efforts: es } = effortOf(route);
  const last = kms.length - 1;
  if (last < 0) return Math.max(0, km);
  if (km <= kms[0]!) return es[0]!;
  if (km >= kms[last]!) return es[last]!;
  let lo = 0;
  let hi = last;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (kms[mid]! <= km) lo = mid; else hi = mid;
  }
  const span = kms[hi]! - kms[lo]!;
  return span > 0 ? es[lo]! + ((es[hi]! - es[lo]!) * (km - kms[lo]!)) / span : es[lo]!;
}

/** Minutes in the saddle between two route kilometres, without breaks. A ride back takes as long as the ride out. */
export function ridingMin(route: Route, fromKm: Km, toKm: Km, flatKph: number, r = 1): number {
  return ((Math.abs(effortAt(route, toKm) - effortAt(route, fromKm)) / (flatKph * LOAD_PENALTY)) * 60) * r;
}

/** Riding time with breaks: 15% of it, spread evenly. */
export function clockMin(route: Route, fromKm: Km, toKm: Km, flatKph: number, r = 1): number {
  return ridingMin(route, fromKm, toKm, flatKph, r) * BREAKS;
}

/** A rejoin leg or detour: ridden like a flat stretch of route, breaks included. */
export function flatLegClockMin(km: number, flatKph: number, r = 1): number {
  return ((km / (flatKph * LOAD_PENALTY)) * 60) * BREAKS * r;
}
/** A leg without breaks: what water use and the daylight margin read. */
export const flatLegRidingMin = (km: number, flatKph: number, r = 1): number => ((km / (flatKph * LOAD_PENALTY)) * 60) * r;

/**
 * From kilometre `k`: the end of the stage `k` lies in, or of the next stage when `k` is more than halfway through its
 * stage by route kilometre. A kilometre exactly at a stage end lies in the stage it ends. Never beyond the route end,
 * and always beyond `k` unless that is the route end.
 */
export function stopRule(stages: Stage[], k: Km, lengthKm: Km): Km {
  const held = (km: Km): Km => Math.min(km, lengthKm);
  const i = stages.findIndex((s) => k <= s.endKm);
  if (i < 0) return lengthKm;
  const here = stages[i]!;
  const halfway = (here.startKm + here.endKm) / 2;
  let stop = k > halfway ? (stages[i + 1]?.endKm ?? here.endKm) : here.endKm;
  for (let j = i + 1; stop <= k && j < stages.length; j++) stop = stages[j]!.endKm;
  return stop > k ? held(stop) : lengthKm;
}

/**
 * Today's correction r: the time between the stretch's two check-ins over the model's clock time between them, once the
 * latest lies at least 10 km of route beyond the first on the move. Clamped to 0.85-1.5. Until then, 1.
 */
export function correction(checkIns: Position[], dayStartKm: Km, route: Route, flatKph: number): number {
  const counted = checkIns
    .filter((p) => p.source === 'gps' && p.accuracyM <= CHECK_IN_ACCURACY_M && p.offRouteM <= CHECK_IN_MAX_OFF_M)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const first = counted.find((p) => Math.abs(p.km - dayStartKm) > MOVED_KM);
  const latest = counted[counted.length - 1];
  if (!first || !latest || latest.km - first.km < STRETCH_MIN_KM) return 1;
  const measuredMin = (latest.at.getTime() - first.at.getTime()) / MS_PER_MIN;
  const modelMin = clockMin(route, first.km, latest.km, flatKph);
  if (measuredMin <= 0 || modelMin <= 0) return 1;
  return Math.min(R_MAX, Math.max(R_MIN, measuredMin / modelMin));
}

/** One ride of a schedule: the day's ride first, then the later days. */
export type RideOfKm = { date: string; startKm: Km; stopKm: Km; departure: Date; r: number };

export type Schedule = {
  departure: Date; startKm: Km; startLegKm: number; r: number;
  /** The arrival at a route kilometre, later days included. */
  atKm(km: Km): Date;
  /** The arrival at a place: along the route, plus the one-way detour. */
  atPlace(m: RouteMatch): Date;
  /** A place behind: the ride back along the route at the same pace, plus the detour. */
  behind(m: RouteMatch): Date;
  withDeparture(d: Date): Schedule;
  /** Stopping at a place off the route: every later arrival on that ride adds the round trip. */
  through(m: RouteMatch): Schedule;
  /** Riding minutes between two kilometres, without breaks; r only on the part on the first ride. */
  ridingMinBetween(a: Km, b: Km): number;
  clockMinBetween(a: Km, b: Km): number;
  /** Riding on past the stop that evening, or riding there now: the first ride's pace, with no night in it. */
  ridingOnAt(km: Km): Date;
  /** Riding minutes from the start of the ride `km` lies on, with the rejoin leg: what the daylight margin reads. */
  ridingMinTo(km: Km): number;
  /** The ride `km` lies on. */
  rideOf(km: Km): RideOfKm;
};

export type RideStart = {
  startKm: Km; startLegKm: number; departure: Date; dayStopKm: Km; date: string;
  /** Where places behind are measured from, when that differs from `startKm` (an approximate position). */
  behindFromKm?: Km;
};

export function buildSchedule(trip: Trip, ride: RideStart, r: number, zone: ZoneLookup, stopsAt: RouteMatch[] = []): Schedule {
  const route = trip.route;
  const flat = trip.flatKph;
  const startZone = zone(0).timeZone;
  const days: RideOfKm[] = [{ date: ride.date, startKm: ride.startKm, stopKm: ride.dayStopKm, departure: ride.departure, r }];

  const added = (fromKm: Km, toKm: Km): number =>
    stopsAt.reduce((sum, m) => (m.km > fromKm && m.km < toKm ? sum + 2 * flatLegClockMin(rejoinKm(m.offRouteM), flat) : sum), 0);

  /** Minutes from a ride's departure to a kilometre of it. */
  const minutesOn = (day: RideOfKm, km: Km, leg: number): number =>
    (flatLegClockMin(leg, flat) + clockMin(route, day.startKm, km, flat) + added(day.startKm, km)) * day.r;

  const arrivalOn = (i: number, km: Km): Date => {
    const day = days[i]!;
    return new Date(day.departure.getTime() + minutesOn(day, km, i === 0 ? ride.startLegKm : 0) * MS_PER_MIN);
  };

  /** The index of the ride `km` lies on, building later days as far as needed. */
  const dayIndex = (km: Km): number => {
    let i = 0;
    while (km > days[i]!.stopKm && days[i]!.stopKm < route.lengthKm) {
      if (i + 1 === days.length) {
        const day = days[i]!;
        const startAt = instantAt(addDaysIso(day.date, 1), trip.startTime, zone(day.stopKm).timeZone);
        const arrival = arrivalOn(i, day.stopKm);
        const departure = arrival.getTime() > startAt.getTime() ? arrival : startAt;
        days.push({
          date: localIsoDate(departure, startZone), startKm: day.stopKm,
          stopKm: stopRule(route.stages, day.stopKm, route.lengthKm), departure, r: 1,
        });
      }
      i++;
    }
    return i;
  };

  const detourMin = (m: RouteMatch, rideR: number): number => flatLegClockMin(rejoinKm(m.offRouteM), flat, rideR);

  const self: Schedule = {
    departure: ride.departure, startKm: ride.startKm, startLegKm: ride.startLegKm, r,
    atKm: (km) => arrivalOn(dayIndex(km), km),
    atPlace: (m) => {
      const i = dayIndex(m.km);
      return new Date(arrivalOn(i, m.km).getTime() + detourMin(m, days[i]!.r) * MS_PER_MIN);
    },
    behind: (m) => {
      const from = ride.behindFromKm ?? ride.startKm;
      const min = flatLegClockMin(ride.startLegKm, flat, r) + clockMin(route, from, m.km, flat, r) + detourMin(m, r);
      return new Date(ride.departure.getTime() + min * MS_PER_MIN);
    },
    withDeparture: (d) => buildSchedule(trip, { ...ride, departure: d }, r, zone, stopsAt),
    through: (m) => buildSchedule(trip, ride, r, zone, [...stopsAt, m]),
    ridingMinBetween: (a, b) => {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const cut = Math.max(lo, Math.min(hi, ride.dayStopKm));
      return ridingMin(route, lo, cut, flat, r) + ridingMin(route, cut, hi, flat);
    },
    clockMinBetween: (a, b) => self.ridingMinBetween(a, b) * BREAKS,
    ridingOnAt: (km) => new Date(ride.departure.getTime() + minutesOn(days[0]!, km, ride.startLegKm) * MS_PER_MIN),
    ridingMinTo: (km) => {
      const i = dayIndex(km);
      const day = days[i]!;
      return flatLegRidingMin(i === 0 ? ride.startLegKm : 0, flat, day.r) + ridingMin(route, day.startKm, km, flat, day.r);
    },
    rideOf: (km) => ({ ...days[dayIndex(km)]! }),
  };
  return self;
}
