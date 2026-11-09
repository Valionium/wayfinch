// A place to sleep near each day's end, for Trip's days (owner, 9 Nov 2026: the days were split into equal thirds "without
// looking for towns or hotels where you could stop"). The days stay the stage model's: stage ends are the equal-effort split
// points, the same as in the bag planner (spec §6.2, Stages), and every card reads them. This only names, for each day but the
// last, the saved sleep place that suits the end best, and the town by it; with none near, the nearest town, or nothing.
import { haversineKm } from '../geo/haversine.ts';
import type { Km, Place, RouteMatch, Route, Stay } from '../types.ts';
import { W } from '../wording/en.ts';

/** At most this far before or after a day's planned end, along the route. */
export const BED_WINDOW_KM = 10;
const MIN_WINDOW_KM = 3;
const WINDOW_SHARE = 0.1;
/** A town counts as the bed's when it lies this close. */
const TOWN_NEAR_KM = 3;
/** A detour is ridden like the route, there and onwards (spec §6.2, Arrival at a place: 1.3 × offRouteM one way). */
const DETOUR_FACTOR = 1.3;

export type DayBed = {
  day: number; endKm: Km; last: boolean;
  /** The sleep place that suits the end best, or null when none lies in the window. */
  bed: { name: string; km: Km; offRouteM: number; kind: Place['kind']; town: string | null } | null;
  /** Without a bed: the town nearest the end in the window, if any. */
  town: { name: string; km: Km } | null;
};

/** Campsites, lodging and huts: never a lean-to, a basic hut or a weather shelter (spec §6.8). */
const BED_KINDS = new Set<Place['kind']>(['campsite', 'lodging', 'hut']);
const LODGING_WORDS = new Map<string, string>([
  ['hostel', W.sleepWordHostel], ['guest_house', W.sleepWordGuestHouse], ['hotel', W.sleepWordHotel], ['motel', W.sleepWordMotel],
]);
const named = (p: Place): string | null => (typeof p.name === 'string' && p.name.trim() !== '' ? p.name.trim() : null);
function nameOf(p: Place): string {
  const own = named(p);
  if (own) return own;
  if (p.kind === 'campsite') return W.sleepWordCampsite;
  if (p.kind === 'hut') return W.sleepWordHut;
  return LODGING_WORDS.get(p.tags['tourism'] ?? '') ?? W.sleepWordLodging;
}

/** 0 for the kind the trip's stay asks for first, 1 otherwise; a mixed stay takes any. */
function stayRank(kind: Place['kind'], stay: Stay): number {
  if (stay === 'camping') return kind === 'campsite' ? 0 : 1;
  if (stay === 'accommodation') return kind === 'campsite' ? 1 : 0;
  return 0;
}

export const windowKm = (dayKm: Km): Km => Math.min(BED_WINDOW_KM, Math.max(MIN_WINDOW_KM, dayKm * WINDOW_SHARE));

export function dayBeds(route: Route, places: Place[], matches: RouteMatch[], stay: Stay): DayBed[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  const passes = matches.flatMap((m) => {
    const place = byId.get(m.placeId);
    return place ? [{ place, km: m.km, offRouteM: m.offRouteM }] : [];
  });
  const beds = passes.filter((x) => BED_KINDS.has(x.place.kind));
  const towns = passes.filter((x) => x.place.kind === 'settlement' && named(x.place) !== null);
  const last = route.stages.length;
  return route.stages.map((s) => {
    const base = { day: s.day, endKm: s.endKm, last: s.day === last };
    if (s.day === last) return { ...base, bed: null, town: null };
    const w = windowKm(s.endKm - s.startKm);
    const inWindow = <T extends { km: Km }>(list: T[]): T[] => list.filter((x) => Math.abs(x.km - s.endKm) <= w + 1e-9);
    const cost = (x: { km: Km; offRouteM: number }): number => Math.abs(x.km - s.endKm) + (DETOUR_FACTOR * x.offRouteM) / 1000;
    const best = inWindow(beds).sort((a, b) => stayRank(a.place.kind, stay) - stayRank(b.place.kind, stay) || cost(a) - cost(b) || (a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0))[0];
    if (best) {
      const near = towns
        .filter((t) => haversineKm(t.place, best.place) <= TOWN_NEAR_KM && named(t.place) !== named(best.place))
        .sort((a, b) => haversineKm(a.place, best.place) - haversineKm(b.place, best.place) || (a.place.id < b.place.id ? -1 : 1))[0];
      return { ...base, bed: { name: nameOf(best.place), km: best.km, offRouteM: best.offRouteM, kind: best.place.kind, town: near ? named(near.place) : null }, town: null };
    }
    const town = inWindow(towns).sort((a, b) => cost(a) - cost(b) || (a.place.id < b.place.id ? -1 : 1))[0];
    return { ...base, bed: null, town: town ? { name: named(town.place)!, km: town.km } : null };
  });
}
