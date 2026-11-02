// Climbs (spec section 6.7): a continuous ascent of at least 100 m gain and at least 3% average gradient, joined across
// dips of less than 20 m, found on the smoothed profile. A route with a missing height has no climbs: unknown, not none.
import type { Climb, Km, Route } from '../types.ts';
import { smoothedHeights } from './smooth.ts';

export const MIN_CLIMB_GAIN_M = 100;
export const MIN_CLIMB_GRADE_PCT = 3;
/** A dip of this depth or more ends a climb; a shallower one is joined across. */
export const CLIMB_DIP_M = 20;
const STEEP_WINDOW_KM = 0.5;

function steepest500m(km: Km[], h: number[], s: number, p: number): number {
  const length = km[p]! - km[s]!;
  const average = length > 0 ? ((h[p]! - h[s]!) / (length * 1000)) * 100 : 0;
  if (length < STEEP_WINDOW_KM) return average;
  // The profile is piecewise linear, so the steepest window starts or ends at a vertex.
  const at = (x: number): number => {
    let i = s;
    while (i < p - 1 && km[i + 1]! < x) i++;
    const width = km[i + 1]! - km[i]!;
    return width > 0 ? h[i]! + ((h[i + 1]! - h[i]!) * (x - km[i]!)) / width : h[i]!;
  };
  let best = average;
  for (let j = s; j <= p; j++) {
    const x = km[j]!;
    if (x + STEEP_WINDOW_KM <= km[p]! + 1e-12) best = Math.max(best, ((at(x + STEEP_WINDOW_KM) - h[j]!) / (STEEP_WINDOW_KM * 1000)) * 100);
    if (x - STEEP_WINDOW_KM >= km[s]! - 1e-12) best = Math.max(best, ((h[j]! - at(x - STEEP_WINDOW_KM)) / (STEEP_WINDOW_KM * 1000)) * 100);
  }
  return best;
}

export function findClimbs(route: Route): Climb[] {
  const pts = route.points;
  if (route.ascentM === null || pts.length < 2 || pts.some((q) => q.ele === null)) return [];
  const h = smoothedHeights(pts.map((q) => ({ kmExact: q.km, elev: q.ele as number })));
  const km = pts.map((q) => q.km);
  const out: Climb[] = [];

  const emit = (s: number, p: number): void => {
    const gain = h[p]! - h[s]!;
    const length = (km[p]! - km[s]!) * 1000;
    if (gain < MIN_CLIMB_GAIN_M || length <= 0) return;
    const avg = (gain / length) * 100;
    if (avg < MIN_CLIMB_GRADE_PCT) return;
    out.push({ startKm: km[s]!, topKm: km[p]!, gainM: gain, avgGradePct: avg, steepest500mPct: steepest500m(km, h, s, p) });
  };

  // s: the start (a low point), p: the highest point so far, v: the lowest point since that peak.
  let s = 0;
  let p = 0;
  let v = 0;
  for (let i = 1; i < pts.length; i++) {
    const height = h[i]!;
    if (p === s && height <= h[s]!) {
      s = p = v = i; // still going down or flat: the climb has not begun
    } else if (height > h[p]!) {
      p = v = i; // a new peak; any dip since the last one is joined
    } else {
      if (height < h[v]!) v = i;
      if (h[p]! - h[v]! >= CLIMB_DIP_M) {
        emit(s, p);
        s = p = v; // the next climb starts at the bottom of the dip; look at the points after it again
        i = v;
      }
    }
  }
  emit(s, p);
  return out;
}
