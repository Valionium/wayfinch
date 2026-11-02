// Places matched to the route (spec sections 4.5 and 6.0): one route kilometre per pass within the place's category
// radius; passes closer than twice the radius are one pass.
import { buildSegmentIndex, segmentsNear, type SegmentIndex } from '../geo/index.ts';
import { passesOf, projectOnSegment, type Projection } from '../geo/project.ts';
import type { PackRescuePoint } from '../places/types.ts';
import type { Place, PlaceKind, RescuePoint, Roof, Route, RouteMatch } from '../types.ts';

/**
 * Section 6.0's radii in kilometres. Shelters take Sleep's 3 km (lean-tos and basic huts) and Emergency's 3 km
 * (weather shelters); rain plans and the Shelter chip read only those within 300 m from `offRouteM`.
 */
const RADIUS_KM: Record<PlaceKind, number> = {
  water: 1, shop: 1, cafe: 1, fuel_shop: 1, ice_cream: 1, toilets: 1,
  restaurant: 0.6, drink: 0.6,
  campsite: 3, shelter: 3, hut: 3, lodging: 3,
  bike_shop: 5, pharmacy: 5, settlement: 5,
  repair_station: 2, air: 2,
  station: 10, hospital: 20,
};

export const radiusKmFor = (place: Place): number => RADIUS_KM[place.kind];

/** Merges passes closer than `mergeKm` of route into the closest of them. `passes` must be in route order. */
function merged(passes: Projection[], mergeKm: number): Projection[] {
  const out: Projection[] = [];
  let previousKm = -Infinity;
  for (const q of passes) {
    const last = out[out.length - 1];
    if (last && q.km - previousKm < mergeKm) {
      if (q.offKm < last.offKm) out[out.length - 1] = q;
    } else out.push(q);
    previousKm = q.km;
  }
  return out;
}

const ROOF_SEARCH_KM = 0.31; // a little over the 300 m of section 6.0: coverAt holds the limit, on the rounded distance
const roofIndexes = new WeakMap<Route, SegmentIndex>();
const roofMatches = new WeakMap<Roof[], { route: Route; list: RoofMatch[] }>();

export type RoofMatch = { roof: Roof; km: number; offRouteM: number };

/** Roofs have no id and come as a layer: one route kilometre per pass, kept for each list of roofs and route. */
export function matchRoofs(roofs: Roof[], route: Route): RoofMatch[] {
  const kept = roofMatches.get(roofs);
  if (kept?.route === route) return kept.list;
  let idx = roofIndexes.get(route);
  if (!idx) {
    idx = buildSegmentIndex(route);
    roofIndexes.set(route, idx);
  }
  const list: RoofMatch[] = [];
  for (const roof of roofs) {
    if (!(Math.abs(roof.lat) <= 90 && Math.abs(roof.lon) <= 180)) continue; // written so that NaN fails
    const within = segmentsNear(idx, roof, ROOF_SEARCH_KM)
      .map((s) => projectOnSegment(roof, route, s))
      .filter((q) => q.offKm <= ROOF_SEARCH_KM);
    for (const q of merged(passesOf(within, roof, route, ROOF_SEARCH_KM), 2 * ROOF_SEARCH_KM)) {
      list.push({ roof, km: q.km, offRouteM: Math.round(q.offKm * 1e6) / 1e3 });
    }
  }
  roofMatches.set(roofs, { route, list });
  return list;
}

export function matchPlaces(places: Place[], route: Route, idx: SegmentIndex): RouteMatch[] {
  const out: RouteMatch[] = [];
  for (const place of places) {
    const radius = radiusKmFor(place);
    const within = segmentsNear(idx, place, radius)
      .map((s) => projectOnSegment(place, route, s))
      .filter((q) => q.offKm <= radius);
    for (const q of merged(passesOf(within, place, route, radius), 2 * radius)) {
      out.push({ placeId: place.id, km: q.km, offRouteM: Math.round(q.offKm * 1e6) / 1e3 });
    }
  }
  return out;
}

const RESCUE_ROUTE_KM = 0.3;

/**
 * Adds a rescue point's route kilometres: one per pass within 300 m (section 6.9), for preparation. Points stored further
 * off (up to 3 km) stay in the list with no kilometre.
 */
export function matchRescuePoints(points: PackRescuePoint[], route: Route): RescuePoint[] {
  const idx = buildSegmentIndex(route);
  return points.map((p) => {
    if (!(Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)) return { ...p, kms: [] }; // written so that NaN fails
    const within = segmentsNear(idx, p, RESCUE_ROUTE_KM)
      .map((s) => projectOnSegment(p, route, s))
      .filter((q) => q.offKm <= RESCUE_ROUTE_KM);
    return { ...p, kms: merged(passesOf(within, p, route, RESCUE_ROUTE_KM), 2 * RESCUE_ROUTE_KM).map((q) => q.km) };
  });
}
