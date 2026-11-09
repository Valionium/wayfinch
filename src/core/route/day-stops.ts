// Days that end where the rider can sleep (owner's ruling of 9 Nov 2026, which takes spec §6.2's "custom overnight stops are a
// later feature" in now). The stage model still gives the planned ends at equal effort; once places are saved, each day but the
// last ends at the saved sleep place that suits its planned end best (day-beds.ts chooses), or the rider's own choice, or at
// the planned end when nothing is near or the rider chose "No stop". The days are then worked out as the stage model works out
// its own: riding hours from the effort between the ends, climbing from the climbing between them.
import { candidatesNear } from '../engines/day-beds.ts';
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
export function chooseStops(route: Route, plan: Stage[], places: Place[], matches: RouteMatch[], stay: Stay): TripStops {
  const days: TripStop[] = plan.slice(0, -1).map((s) => {
    const best = candidatesNear(s, places, matches, stay)[0];
    return best ? { placeId: best.placeId, km: best.km, name: best.name, town: best.town, by: 'auto' } : { placeId: null, km: s.endKm, name: null, town: null, by: 'auto' };
  });
  return { routeId: route.id, basis: plannedEnds(plan), days };
}

/** The route with its days ending at the stops, and the stops it carries. Null stops: the plan as it is. */
export function withStops(route: Route, plan: Stage[], stops: TripStops | null, flatKph: number): Stage[] {
  if (!stops || !stopsHold(stops, route, plan)) return plan;
  const ends = endsOf(stops, route.lengthKm);
  return sameKms(ends, plannedEnds(plan)) ? plan : stagesEndingAt(route, ends, flatKph);
}
