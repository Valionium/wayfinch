// Share progress (spec section 6.14): a ready-made message home that says where the rider is and where they plan to stop.
// It is built on the phone and holds no water, health or body data, no app name, and no coordinates outside an added map
// link. The stop and the time are a plan ("planning to stop", "about"), never a promise. Plain characters only.
import { compareFinal, formatAbout, formatHm } from '../answers/index.ts';
import { wallClock } from '../answers/time.ts';
import { pointAtRouteKm } from '../geo/project.ts';
import type { DayRide, Km, Place, PlanTomorrow, Position, RouteMatch, Trip, ZoneSpan } from '../types.ts';
import { shortIsoDay, W } from '../wording/en.ts';
import { routeZoneAt } from './leaveby.ts';
import { adjusted, isOffRoute } from './locate.ts';
import type { Schedule } from './pace.ts';
import { ridingDate } from './tripday.ts';
import { weekdayOf } from './weather-windows.ts';

/** `planTomorrow` is the stored choice: without it, a stop is claimed only within 3 km of a stage end. */
export type ShareFacts = {
  ride: DayRide; position: Position | null; schedule: Schedule; trip: Trip; settlements: Place[]; matches: RouteMatch[];
  addMapLink: boolean; now: Date; routeZones: ZoneSpan[]; planTomorrow?: PlanTomorrow | null;
};

const SETTLEMENT_KM = 5;
const CLAIM_KM = 3;
const EPS = 1e-9;
const validDate = (d: Date): boolean => Number.isFinite(d.getTime());

/** A place name for a plain message: letters, marks, digits and a few marks of punctuation; every other symbol goes. */
function plainName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[^\p{L}\p{M}\p{N} '’.,()/&-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned === '' || !/[\p{L}\p{N}]/u.test(cleaned)) return null;
  if (/wayfinch|load[\s-]*check/i.test(cleaned) || /\d[.,]\d{3,}/.test(cleaned)) return null;
  return cleaned;
}

/** The nearest settlement within 5 km of a route kilometre, counted along the route and out to the place. */
function townNear(f: ShareFacts, km: Km): string | null {
  if (!Number.isFinite(km)) return null;
  const byId = new Map(f.settlements.map((p) => [p.id, p]));
  let best: { name: string; d: number; place: Place } | null = null;
  for (const m of f.matches) {
    const place = byId.get(m.placeId);
    if (!place || place.kind !== 'settlement' || !Number.isFinite(m.km) || !(m.offRouteM >= 0) || m.offRouteM === Infinity) continue;
    const name = plainName(place.name);
    if (name === null) continue;
    const d = Math.abs(m.km - km) + m.offRouteM / 1000;
    if (d > SETTLEMENT_KM + EPS) continue;
    if (best === null || d < best.d || (d === best.d && compareFinal(place, best.place) < 0)) best = { name, d, place };
  }
  return best?.name ?? null;
}

type Quality = { prefix: 'at' | 'around' | 'near'; tail: string; inner: string };
function qualityOf(p: Position): Quality {
  const off = isOffRoute(p);
  const approximate = p.source !== 'manual' && p.approximate;
  if (off && approximate) return { prefix: 'near', tail: W.shareProgressTailOffApproximate, inner: W.shareProgressInnerOffApproximate };
  if (off) return { prefix: 'near', tail: W.shareProgressTailOff, inner: W.shareProgressInnerOff };
  if (approximate) return { prefix: 'around', tail: W.shareProgressTailApproximate, inner: W.shareProgressInnerApproximate };
  if (p.source === 'manual') return { prefix: 'around', tail: '', inner: '' };
  return { prefix: 'at', tail: '', inner: '' };
}

const coordinate = (x: number): string => {
  const v = Math.round(x * 1000) / 1000;
  return (v === 0 ? 0 : v).toFixed(3);
};

export function progressText(f: ShareFacts): string | null {
  const { ride, trip, position } = f;
  const route = trip.route;
  const length = route.lengthKm;
  if (!Number.isFinite(length) || !(length > 0)) return null;
  const atEnd = ride.phase === 'after-ride' && ride.noRide;
  // With no position the button hides; the one exception is tonight's stop at the route end (section 6.2a).
  if (position === null && !atEnd) return null;
  if (position !== null && !Number.isFinite(position.km)) return null;
  const stampAt = position ? position.at : f.now;
  if (!validDate(stampAt) || !Number.isFinite(ride.startKm) || !Number.isFinite(ride.stopKm)) return null;

  const held = (km: Km): Km => Math.max(0, Math.min(length, km));
  const kmText = (km: Km): string => String(Math.round(held(km)));
  const lengthText = String(Math.round(length));
  const zoneKm = held(position ? position.km : ride.startKm);
  const tz = routeZoneAt(f, zoneKm);
  const w = wallClock(stampAt, tz);
  const stamp = W.timeDayAt(W.timeShortDay(weekdayOf(stampAt, tz), w.day, W.timeMonth(w.month - 1)), formatHm(stampAt, tz));

  const stopWhere = (km: Km): string => {
    const town = townNear(f, km);
    return town === null ? W.shareProgressStopAt(kmText(km)) : W.shareProgressStopNear(town, kmText(km));
  };
  const planStop = (km: Km): string => {
    let arrival: string | null = null;
    if (trip.departureDate !== null) {
      const a = f.schedule.atKm(km);
      if (validDate(a)) arrival = formatAbout(a, routeZoneAt(f, km));
    }
    return W.shareProgressPlanStop(stopWhere(km), arrival);
  };
  const leaving = (): string | null => {
    if (trip.departureDate === null || !validDate(ride.departure)) return null;
    return formatAbout(ride.departure, routeZoneAt(f, held(ride.startKm)));
  };
  const plainKm = (km: Km): string => W.shareProgressKmOfLength(kmText(km), lengthText);
  const sentenceKm = (km: Km, q: Quality): string => W.shareProgressAtKm(q.prefix, kmText(km), lengthText, q.tail);
  const innerKm = (km: Km, q: Quality): string => (q.prefix === 'at' ? plainKm(km) : W.shareProgressAtKm(q.prefix, kmText(km), lengthText, q.inner));
  const fromKm = (km: Km, q: Quality): string => (q.prefix === 'at' ? plainKm(km) : sentenceKm(km, q));
  const tomorrow = (): string[] => (ride.tomorrowKm !== null && Number.isFinite(ride.tomorrowKm) ? [W.shareProgressTomorrow(stopWhere(ride.tomorrowKm))] : []);

  // What the message names, and so what a map link may point at: the position, or a point of the route.
  let body: string;
  let named: { lat: number; lon: number } | null = position ? { lat: position.lat, lon: position.lon } : null;
  const namedKm = (km: Km): { lat: number; lon: number } => pointAtRouteKm(route, held(km));

  if (ride.phase === 'route-end') {
    body = W.shareProgressReachedEnd(townNear(f, length), lengthText);
    named ??= namedKm(length);
  } else if (atEnd) {
    body = W.shareProgressStoppedAtEnd(townNear(f, length), lengthText);
    named ??= namedKm(length);
  } else if (ride.phase === 'riding') {
    const q = qualityOf(position!);
    body = [W.shareProgressWhere(sentenceKm(position!.km, q), townNear(f, position!.km)), planStop(ride.stopKm)].join(' ');
  } else if (ride.phase === 'after-ride') {
    const q = qualityOf(position!);
    const today = ridingDate(f.now, routeZoneAt(f, 0));
    const plan = f.planTomorrow;
    const chosen = !!plan && plan.date === today && !plan.backToTodayAt;
    const claimed = chosen || route.stages.some((s) => Math.abs(s.endKm - position!.km) <= CLAIM_KM + EPS);
    const town = townNear(f, position!.km);
    const first = claimed
      ? W.shareProgressStopped(town === null ? sentenceKm(position!.km, q) : W.shareProgressNearTown(town, innerKm(position!.km, q)))
      : W.shareProgressWhere(sentenceKm(position!.km, q), town);
    body = [first, ...tomorrow()].join(' ');
  } else {
    // Before the trip and before the day's ride: the ride's start, which is the position only when the ride starts there.
    const atPosition = ride.phase === 'before-ride' && position !== null
      && Math.abs(held(ride.startKm) - held(adjusted(position, length).aheadFromKm)) < 1e-6;
    let from: string;
    if (atPosition) {
      const q = qualityOf(position!);
      const town = townNear(f, position!.km);
      from = town === null ? fromKm(position!.km, q) : W.shareProgressNearTown(town, innerKm(position!.km, q));
    } else {
      const town = townNear(f, held(ride.startKm));
      from = town === null ? plainKm(ride.startKm) : W.shareProgressNearTown(town, plainKm(ride.startKm));
      named = namedKm(ride.startKm);
    }
    const on = ride.phase === 'before-trip' && trip.departureDate !== null ? shortIsoDay(ride.date) : null;
    body = [W.shareProgressStarting(on, from, leaving()), planStop(ride.stopKm)].join(' ');
  }

  const message = W.shareProgressMessage(stamp, body);
  if (!f.addMapLink || named === null || !Number.isFinite(named.lat) || !Number.isFinite(named.lon)) return message;
  return `${message}\n${W.shareProgressMap(coordinate(named.lat), coordinate(named.lon))}`;
}
