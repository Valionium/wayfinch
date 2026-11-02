// The Climbing card (spec section 6.7): climbing left to the day's stop and to the end, and the next climb with the time at
// its top. Heights come from the one effort profile that also splits the stages, so a stage's climbing and the climbing
// left on it are one figure. Unknown heights read unknown, never 0 m, and the card is never a warning.
import { formatAbout, makeAnswer } from '../answers/index.ts';
import { wallClock } from '../answers/time.ts';
import { effortProfile, shownAscentM } from '../route/stages.ts';
import type { Answer, Climb, DayRide, Km, Route, ZoneSpan } from '../types.ts';
import { showKm, W } from '../wording/en.ts';
import { routeZoneAt } from './leaveby.ts';
import type { Schedule } from './pace.ts';
import { weekdayOf } from './weather-windows.ts';

export type ClimbingFacts = { route: Route; ride: DayRide; schedule: Schedule; climbs: Climb[]; routeZones: ZoneSpan[] };

type Up = { kms: Float64Array; ups: Float64Array };
const profiles = new WeakMap<Route, Up | null>();

/** Cumulative smoothed climbing by kilometre, or null when the route's climbing cannot be placed along it. */
function upProfile(route: Route): Up | null {
  const known = profiles.get(route);
  if (known !== undefined) return known;
  let result: Up | null = null;
  const heights = route.ascentM !== null && Number.isFinite(route.ascentM) && route.points.length >= 2 && route.points.every((p) => p.ele !== null && Number.isFinite(p.ele));
  if (heights) {
    const { samples } = effortProfile(route);
    if (samples.length >= 2 && samples.every((s) => s.upExact !== null && Number.isFinite(s.upExact))) {
      result = { kms: Float64Array.from(samples, (s) => s.kmExact), ups: Float64Array.from(samples, (s) => s.upExact as number) };
    }
  }
  profiles.set(route, result);
  return result;
}

/** Climbing from the route start to `km`, linear between samples and held to the route's ends. */
function upAt(p: Up, km: Km): number {
  const last = p.kms.length - 1;
  if (km <= p.kms[0]!) return p.ups[0]!;
  if (km >= p.kms[last]!) return p.ups[last]!;
  let lo = 0;
  let hi = last;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (p.kms[mid]! <= km) lo = mid; else hi = mid;
  }
  const span = p.kms[hi]! - p.kms[lo]!;
  return span > 0 ? p.ups[lo]! + ((p.ups[hi]! - p.ups[lo]!) * (km - p.kms[lo]!)) / span : p.ups[lo]!;
}

const between = (p: Up, a: Km, b: Km): number => Math.max(0, upAt(p, b) - upAt(p, a));
const validClimb = (c: Climb): boolean =>
  [c.startKm, c.topKm, c.gainM, c.avgGradePct, c.steepest500mPct].every((v) => Number.isFinite(v)) && c.topKm > c.startKm;

const shortDay = (t: Date, tz: string): string => {
  const w = wallClock(t, tz);
  return W.timeShortDay(weekdayOf(t, tz), w.day, W.timeMonth(w.month - 1));
};

export function climbingAnswer(f: ClimbingFacts): Answer {
  const freshness = { dataDates: {}, stale: false };
  const up = upProfile(f.route);
  if (!up) {
    return makeAnswer({
      topic: 'climbing', status: 'unknown', title: W.climbUnknown, stamp: null, detail: '', items: [],
      basis: [W.climbBasisNoHeights], freshness, missing: ['heights'],
    });
  }
  const { startKm, stopKm } = f.ride;
  const lengthKm = f.route.lengthKm;
  if (!Number.isFinite(startKm) || !Number.isFinite(stopKm) || !Number.isFinite(lengthKm)) {
    return makeAnswer({ topic: 'climbing', status: 'unknown', title: W.climbCantWorkOut, stamp: null, detail: '', items: [], basis: [W.climbBasis], freshness });
  }

  const toEnd = shownAscentM(between(up, startKm, lengthKm));
  const toStop = shownAscentM(between(up, startKm, stopKm));
  const title = stopKm >= lengthKm ? W.climbLeftToEnd(String(toEnd)) : W.climbLeft(String(toStop), showKm(stopKm), String(toEnd));

  // The first climb whose top lies ahead; a climb the rider is on still counts.
  const next = f.climbs.filter(validClimb).sort((a, b) => a.startKm - b.startKm).find((c) => c.topKm > startKm);
  const items = [];
  if (next) {
    const arrival = f.schedule.atKm(next.topKm);
    const timed = Number.isFinite(arrival.getTime());
    const tz = routeZoneAt(f, next.topKm);
    const later = timed && f.schedule.rideOf(next.topKm).date !== f.ride.date;
    const top = timed ? [W.climbTop(later ? `${shortDay(arrival, tz)}, ${formatAbout(arrival, tz)}` : formatAbout(arrival, tz))] : [];
    const detail = [
      W.climbNextDetail(showKm(next.topKm - next.startKm), String(shownAscentM(next.gainM)), next.avgGradePct.toFixed(1), next.steepest500mPct.toFixed(1)),
      ...top,
    ].join(' · ');
    items.push({ label: W.climbNext(showKm(next.startKm)), stamp: timed ? { km: next.topKm, at: arrival } : { km: next.topKm }, status: 'fine' as const, detail });
  }
  return makeAnswer({
    topic: 'climbing', status: 'fine', title, stamp: { km: Math.min(stopKm, lengthKm) }, detail: next ? '' : W.climbNone, items,
    basis: [W.climbBasis], freshness,
  });
}
