// Days that end where the rider can sleep (owner's ruling of 9 Nov 2026, which takes spec §6.2's "custom overnight stops are a
// later feature" in now). The stage model still gives the planned ends at equal effort; once places are saved, each day but the
// last ends at the saved sleep place that suits its planned end best (day-beds.ts chooses), or the rider's own choice, or at
// the planned end when nothing is near or the rider chose "No stop". The days are then worked out as the stage model works out
// its own: riding hours from the effort between the ends, climbing from the climbing between them.
import { candidatesNear } from '../engines/day-beds.ts';
import type { Nights } from '../engines/day-beds.ts';
import type { Km, Place, Route, RouteMatch, Stage, Stay, TripStop, TripStops } from '../types.ts';
import { effortProfile, LOAD_PENALTY, planStages } from './stages.ts';

/** A stop closer than this to the day's start or the next end would leave a day of almost nothing: it is not taken. */
const MIN_DAY_KM = 1;
const SAME_KM = 1e-6;

type Point = { kmExact: number; upExact: number | null; effortExact: number };

/** The stage model's line at a kilometre (`kmExact`) or at an effort (`effortExact`), each figure worked out between its samples. */
function lineAt(samples: Point[], key: 'kmExact' | 'effortExact', v: number): Point {
  const last = samples[samples.length - 1]!;
  if (v <= samples[0]![key]) return samples[0]!;
  if (v >= last[key]) return last;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]![key] < v) lo = mid; else hi = mid;
  }
  const a = samples[lo]!;
  const b = samples[hi]!;
  const span = b[key] - a[key];
  const f = span > 0 ? (v - a[key]) / span : 0;
  const along = (k: 'kmExact' | 'effortExact'): number => (k === key ? v : a[k] + (b[k] - a[k]) * f);
  return { kmExact: along('kmExact'), upExact: a.upExact !== null && b.upExact !== null ? a.upExact + (b.upExact - a.upExact) * f : null, effortExact: along('effortExact') };
}

/** The stages ending at `ends` (one per night, in order), worked out as planStages works out its own. */
export function stagesEndingAt(route: Route, ends: Km[], flatKph: number): Stage[] {
  const loadedKph = flatKph * LOAD_PENALTY;
  const { samples } = effortProfile(route);
  if (samples.length === 0) return [];
  const at = (km: Km): Point => lineAt(samples, 'kmExact', km);
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

/** The same ends, to a millionth of a kilometre. */
export const sameKms = (a: Km[], b: Km[]): boolean => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]!) <= SAME_KM);

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
 * The day ends for `nights` nights planned around the rider's own stops: `basis`, one per night; `days`, the own stop each night
 * keeps (null: chosen afresh); `kept` with its new night and its old (`was`), `dropped` with its old night, both 1-based; `uneven`,
 * each day much longer (`long`) or shorter than an even day, with its km.
 */
export type Around = {
  basis: Km[]; days: (TripStop | null)[]; kept: { stop: TripStop; night: number; was: number }[]; dropped: { stop: TripStop; night: number }[];
  uneven: { day: number; km: Km; long: boolean }[];
};

/** A day this much longer than an even day, or this much shorter, is said (the owner's ruling of 14 Nov 2026: said, never moved). */
const LONG_DAY = 1.5;
const SHORT_DAY = 0.5;

/**
 * The nights planned around the rider's own stops (the owner's rulings of 14 November 2026: own stops are kept, "Yes, plan around").
 * Each own stop, a place at its kilometre or a "No stop" at its planned end, is a fixed end; the stretches between them are split
 * into days at equal effort, as the stage model splits a route, and each night more than the own stops goes, one by one, to the
 * stretch whose days are longest (the first of equals). An own stop goes only when it cannot stay: not on the route (within a
 * kilometre of its start, its end or the stop before), more own stops than nights (the stop between the two shortest days next to
 * each other goes first), or a day ride. With no own stop it is the stage model's own plan. Days much longer or shorter than an even
 * day are listed, never moved. Automatic stops anchor nothing; another route's stops, or none, neither.
 */
export function planAround(stops: TripStops | undefined, route: Route, nights: number): Around {
  const n = Math.max(0, Math.trunc(Number.isFinite(nights) ? nights : 0));
  const even = plannedEnds([...planStages(route, { flatKph: 20, pace: 'sporting', nights: n })]);
  const out: Around = { basis: even, days: even.map(() => null), kept: [], dropped: [], uneven: [] };
  const { samples } = effortProfile(route);
  if (!stops || stops.routeId !== route.id || !Array.isArray(stops.days) || samples.length === 0) return out;
  const effort = (km: Km): number => lineAt(samples, 'kmExact', km).effortExact;
  const end = route.lengthKm;
  const anchors: { d: TripStop; was: number; km: Km }[] = [];
  stops.days.forEach((d, i) => {
    if (d?.by !== 'rider') return;
    const km = d.placeId === null ? stops.basis?.[i] : d.km;
    const before = anchors[anchors.length - 1]?.km ?? 0;
    if (typeof km === 'number' && km > before + MIN_DAY_KM && km < end - MIN_DAY_KM) anchors.push({ d, was: i + 1, km });
    else out.dropped.push({ stop: d, night: i + 1 });
  });
  while (anchors.length > n) {
    let k = 0;
    let best = Infinity;
    anchors.forEach((_, i) => {
      const span = effort(anchors[i + 1]?.km ?? end) - effort(anchors[i - 1]?.km ?? 0);
      if (span <= best) { best = span; k = i; }
    });
    const [gone] = anchors.splice(k, 1);
    out.dropped.push({ stop: gone!.d, night: gone!.was });
  }
  out.dropped.sort((a, b) => a.night - b.night);
  if (anchors.length === 0) return out;
  const cuts = [0, ...anchors.map((a) => a.km), end].map(effort);
  const parts = cuts.slice(1).map((to, i) => ({ from: cuts[i]!, to, days: 1 }));
  for (let more = n - anchors.length; more > 0; more -= 1) parts.reduce((a, b) => ((b.to - b.from) / b.days > (a.to - a.from) / a.days ? b : a)).days += 1;
  out.basis = [];
  out.days = [];
  parts.forEach((p, i) => {
    for (let d = 1; d < p.days; d += 1) {
      out.basis.push(lineAt(samples, 'effortExact', p.from + ((p.to - p.from) * d) / p.days).kmExact);
      out.days.push(null);
    }
    const a = anchors[i];
    if (!a) return;
    const stop = a.d.placeId === null ? { ...a.d, km: a.km } : a.d;
    out.basis.push(a.km);
    out.days.push(stop);
    out.kept.push({ stop, night: out.basis.length, was: a.was });
  });
  const ends = [0, ...out.basis, end];
  const day = (cuts[cuts.length - 1]! - cuts[0]!) / (n + 1);
  ends.slice(1).forEach((km, i) => {
    const e = effort(km) - effort(ends[i]!);
    if (e > LONG_DAY * day || e < SHORT_DAY * day) out.uneven.push({ day: i + 1, km: km - ends[i]!, long: e > LONG_DAY * day });
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
