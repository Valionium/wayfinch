// Projection of a point onto a route segment (spec section 6.1). cheap-ruler, one ruler per latitude band, only finds
// where on the segment the point falls. Route kilometres come from the haversine running totals on the route points,
// and the distance off the route from haversine too, so both agree with every other distance in the app.
import CheapRuler from 'cheap-ruler';
import { haversineKm, type LatLng } from './haversine.ts';
import type { Km, Route } from '../types.ts';

export type Projection = { segment: number; t: number; km: Km; offKm: number };

const rulers = new Map<number, CheapRuler>();

function rulerFor(lat: number): CheapRuler {
  const band = Math.floor(lat);
  let ruler = rulers.get(band);
  if (!ruler) {
    ruler = new CheapRuler(band + 0.5, 'kilometers');
    rulers.set(band, ruler);
  }
  return ruler;
}

/** Where `p` falls on segment `segment` of the route (between points `segment` and `segment + 1`). */
export function projectOnSegment(p: LatLng, route: Route, segment: number): Projection {
  const a = route.points[segment]!;
  const b = route.points[segment + 1]!;
  const { t, point } = rulerFor(p.lat).pointOnLine([[a.lon, a.lat], [b.lon, b.lat]], [p.lon, p.lat]);
  return {
    segment, t,
    km: a.km + t * (b.km - a.km),
    offKm: haversineKm(p, { lon: point[0], lat: point[1] }),
  };
}

/**
 * Splits projections within `limitKm` of `p`, on segments in route order, into passes: unbroken runs of segments that
 * stay within `limitKm` where they join, so a long segment that leaves the circle and one that comes back are two
 * passes. Each pass is its closest projection.
 */
export function passesOf(list: Projection[], p: LatLng, route: Route, limitKm: number): Projection[] {
  const out: Projection[] = [];
  let run: Projection | null = null;
  let previous = -2;
  for (const q of list) {
    if (q.segment !== previous + 1 || haversineKm(p, route.points[q.segment]!) > limitKm) {
      if (run) out.push(run);
      run = q;
    } else if (run && q.offKm < run.offKm) run = q;
    previous = q.segment;
  }
  if (run) out.push(run);
  return out;
}

/** The point at route kilometre `km`, held to the route's two ends. */
export function pointAtRouteKm(route: Route, km: Km): LatLng {
  const pts = route.points;
  const first = pts[0];
  if (!first) return { lat: 0, lon: 0 };
  if (!(km > first.km)) return { lat: first.lat, lon: first.lon };
  let lo = 0;
  let hi = pts.length - 1;
  if (km >= pts[hi]!.km) return { lat: pts[hi]!.lat, lon: pts[hi]!.lon };
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.km <= km) lo = mid; else hi = mid;
  }
  const a = pts[lo]!;
  const b = pts[hi]!;
  const f = b.km > a.km ? (km - a.km) / (b.km - a.km) : 0;
  return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
}
