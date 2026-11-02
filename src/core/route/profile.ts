// Building a route from raw points, ported from Load Check's gpxProfileFrom (spec sections 5 and 7.1): each point is
// rounded once, kilometres are haversine running totals of the rounded points (no distance is added across a section
// break), climbing is the sum of each section's realAscent rounded to 10 m, and the hash comes last.
//
// Heights that are missing stay missing here. Looking them up is a step of Get ready offline; the route is built again
// afterwards, and only then is its hash final. Stages and the sample grid need the trip's settings, so they are empty.
import { haversineKm } from '../geo/haversine.ts';
import type { Route, RoutePoint } from '../types.ts';
import { W } from '../wording/en.ts';
import { realAscent } from './ascent.ts';
import { findClimbs } from './climbs.ts';
import { GpxError } from './gpx.ts';
import type { RawPoint } from './gpx.ts';
import { routeHash } from './hash.ts';
import { roundPoint } from './round.ts';

/** Load Check refuses a track longer than this. */
const MAX_TRACK_KM = 100_000;

export async function buildRoute(raw: RawPoint[], name: string, source: 'gpx' | 'planned'): Promise<Route> {
  const points: RoutePoint[] = [];
  let distance = 0;
  raw.forEach((p, i) => {
    const r = roundPoint(p);
    if (i > 0 && p.break !== true) distance += haversineKm(points[i - 1]!, r);
    points.push({ ...r, km: distance });
  });
  if (distance > MAX_TRACK_KM) throw new GpxError('too-long', W.routeTrackTooLong);

  // Climbing: each section on its own, and a figure only when every height is known.
  let ascentM: number | null = null;
  if (points.length > 0 && points.every((p) => p.ele !== null)) {
    let total = 0;
    let first = 0;
    for (let i = 1; i <= points.length; i++) {
      if (i === points.length || raw[i]!.break === true) {
        total += realAscent(points.slice(first, i)) ?? 0;
        first = i;
      }
    }
    ascentM = Math.round(total / 10) * 10;
  }

  const hash = await routeHash(points);
  const route: Route = {
    id: `route-${hash.slice(0, 12)}`, name, points, lengthKm: distance, ascentM,
    stages: [], climbs: [], source, sampleGrid: [], hash,
  };
  route.climbs = findClimbs(route);
  return route;
}
