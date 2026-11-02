// Places matched to the route (spec sections 4.5 and 6.0): one route kilometre per pass within the place's category
// radius; passes closer than twice the radius are one pass.
import { segmentsNear, type SegmentIndex } from '../geo/index.ts';
import { passesOf, projectOnSegment, type Projection } from '../geo/project.ts';
import type { Place, PlaceKind, Route, RouteMatch } from '../types.ts';

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
