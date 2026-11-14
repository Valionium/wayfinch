// Days that end where the rider can sleep (owner's ruling of 9 Nov 2026, which takes spec §6.2's "custom overnight stops are a
// later feature" in now). The stage model still gives the planned ends at equal effort; once places are saved, each day but the
// last ends at the saved sleep place that suits its planned end best (day-beds.ts chooses), or the rider's own choice, or at
// the planned end when nothing is near or the rider chose "No stop". The days are then worked out as the stage model works out
// its own: riding hours from the effort between the ends, climbing from the climbing between them.
import { candidatesNear, windowKm } from '../engines/day-beds.ts';
import type { Nights } from '../engines/day-beds.ts';
import type { Km, Place, Route, RouteMatch, Stage, Stay, TripStop, TripStops } from '../types.ts';
import { effortProfile, LOAD_PENALTY } from './stages.ts';

/** A stop closer than this to the day's start or the next end would leave a day of almost nothing: it is not taken. */
const MIN_DAY_KM = 1;
const SAME_KM = 1e-6;

/** The stages ending at `ends` (one per night, in order), worked out as planStages works out its own. */
export function stagesEndingAt(route: Route, ends: Km[], flatKph: number): Stage[] {
  const loadedKph = flatKph * LOAD_PENALTY;
  const { samples } = effortProfile(route);
  if (samples.length === 0) return [];
  const at = (km: Km): { kmExact: number; upExact: number | null; effortExact: number } => {
    const last = samples[samples.length - 1]!;
    if (km <= samples[0]!.kmExact) return samples[0]!;
    if (km >= last.kmExact) return last;
    let lo = 0;
    let hi = samples.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid]!.kmExact < km) lo = mid; else hi = mid;
    }
    const a = samples[lo]!;
    const b = samples[hi]!;
    const span = b.kmExact - a.kmExact;
    const f = span > 0 ? (km - a.kmExact) / span : 0;
    return {
      kmExact: km,
      upExact: a.upExact !== null && b.upExact !== null ? a.upExact + (b.upExact - a.upExact) * f : null,
      effortExact: a.effortExact + (b.effortExact - a.effortExact) * f,
    };
  };
  const points = [samples[0]!, ...ends.map(at), samples[samples.length - 1]!];
  return points.slice(1).map((here, i) => {
    const previous = points[i]!;
    return {
      day: i + 1, startKm: previous.kmExact, endKm: here.kmExact,
      ridingHours: Math.max(0, here.effortExact - previous.effortExact) / loadedKph,
      ascentM: here.upExact === null ? null : previous.upExact === null ? 0 : Math.max(0, here.upExact - previous.upExact),
    };
  });
}

const sameKms = (a: Km[], b: Km[]): boolean => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]!) <= SAME_KM);

/** The planned ends (each day but the last) of an equal-effort plan. */
export const plannedEnds = (plan: Stage[]): Km[] => plan.slice(0, -1).map((s) => s.endKm);

/** Whether stored stops were chosen for this route and this very plan; any other route or plan has none. */
export function stopsHold(stops: TripStops | undefined, route: Route, plan: Stage[]): stops is TripStops {
  return stops !== undefined && stops !== null && stops.routeId === route.id && Array.isArray(stops.days)
    && sameKms(stops.basis, plannedEnds(plan)) && stops.days.length === stops.basis.length;
}

/** The kilometre each day ends at: the stop's, or the planned end when there is none, kept in order with room for a day. */
export function endsOf(stops: TripStops, lengthKm: Km): Km[] {
  const out: Km[] = [];
  stops.days.forEach((d, i) => {
    const planned = stops.basis[i]!;
    const before = out[i - 1] ?? 0;
    const after = stops.basis[i + 1] ?? lengthKm;
    const km = d.placeId !== null && Number.isFinite(d.km) && d.km > before + MIN_DAY_KM && d.km < after - MIN_DAY_KM && d.km < lengthKm ? d.km : planned;
    out.push(km);
  });
  return out;
}

/** Each day's stop chosen afresh from the saved places: the best near each planned end, or none. */
export function chooseStops(route: Route, plan: Stage[], places: Place[], matches: RouteMatch[], stay: Stay, nights?: Nights): TripStops {
  const days: TripStop[] = plan.slice(0, -1).map((s) => {
    const best = candidatesNear(s, places, matches, stay, nights)[0];
    return best ? { placeId: best.placeId, km: best.km, name: best.name, town: best.town, by: 'auto' } : { placeId: null, km: s.endKm, name: null, town: null, by: 'auto' };
  });
  return { routeId: route.id, basis: plannedEnds(plan), days };
}

/**
 * What became of the rider's own stops when the plan changed under them: `days`, one per night of the new plan, the own stop kept for
 * it or null (chosen afresh); `kept` with its new night and its old (`was`), `lost` with its old night, both 1-based.
 */
export type Carried = { days: (TripStop | null)[]; kept: { stop: TripStop; night: number; was: number }[]; lost: { stop: TripStop; night: number }[] };

/**
 * The rider's own stops of another plan of the same route, carried to this one (the owner's ruling of 14 November 2026: other nights
 * keep the rider's picks where they still fit). An own stop, a place or "No stop", fits a night whose planned end is near its kilometre,
 * as near as that night's own choices are (candidatesNear's window), so a kept stop is one the rider could pick for it: the nearest
 * such night, and a night keeps one, the first in the route's order. A kept "No stop" ends at the new planned end (a kept place is
 * judged again for its new night by the caller). Every other own stop is lost, and named by the caller. Automatic stops are never
 * carried. Stops of this very plan (they hold), of another route, or none: nothing to carry.
 */
export function carryOwn(stops: TripStops | undefined, route: Route, plan: Stage[]): Carried {
  const nights = plan.slice(0, -1);
  const out: Carried = { days: nights.map(() => null), kept: [], lost: [] };
  const held: TripStops | undefined = stops;
  if (!stops || stops.routeId !== route.id || !Array.isArray(stops.days) || stopsHold(held, route, plan)) return out;
  stops.days.forEach((d, i) => {
    if (d?.by !== 'rider') return;
    const off = (s: Stage): number => Math.abs(d.km - s.endKm);
    let j = -1;
    nights.forEach((s, k) => { if (off(s) <= windowKm(s.endKm - s.startKm) + 1e-9 && (j < 0 || off(s) < off(nights[j]!))) j = k; });
    if (j < 0 || out.days[j]) {
      out.lost.push({ stop: d, night: i + 1 });
      return;
    }
    const stop = d.placeId === null ? { ...d, km: nights[j]!.endKm } : d;
    out.days[j] = stop;
    out.kept.push({ stop, night: j + 1, was: i + 1 });
  });
  return out;
}

/** The route with its days ending at the stops, and the stops it carries. Null stops: the plan as it is. */
export function withStops(route: Route, plan: Stage[], stops: TripStops | null, flatKph: number): Stage[] {
  if (!stops || !stopsHold(stops, route, plan)) return plan;
  const ends = endsOf(stops, route.lengthKm);
  return sameKms(ends, plannedEnds(plan)) ? plan : stagesEndingAt(route, ends, flatKph);
}

/** The stop a day of the trip ends at, when the trip's stops are the ones its stages end at; null otherwise (and for the last day). */
export function dayStopOf(trip: { route: Route; stops?: TripStops }, i: number): TripStop | null {
  const { stops, route } = trip;
  if (!stops || stops.routeId !== route.id || !Array.isArray(stops.days) || stops.days.length !== route.stages.length - 1) return null;
  const d = stops.days[i];
  const s = route.stages[i];
  if (!d || !s) return null;
  const end = d.placeId === null ? stops.basis[i] : d.km;
  return end !== undefined && Math.abs(s.endKm - end) <= SAME_KM ? d : null;
}
