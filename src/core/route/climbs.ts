// Climbs (spec section 6.7): a continuous ascent of at least 100 m gain and at least 3% average gradient, joined across
// dips of less than 20 m, found on the smoothed profile. A route with a missing height has no climbs: unknown, not none.
import type { Climb, Km, Route } from '../types.ts';
import { smoothedHeights } from './smooth.ts';

export const MIN_CLIMB_GAIN_M = 100;
export const MIN_CLIMB_GRADE_PCT = 3;
/** A dip of this depth or more ends a climb; a shallower one is joined across. */
export const CLIMB_DIP_M = 20;
const STEEP_WINDOW_KM = 0.5;

/** Half the distance the heights are averaged over before the steepest 500 m is read. */
const STEEP_AVERAGE_HALF_KM = 0.25;
/** Besides the places where the averaged profile bends, windows are tried this often. */
const STEEP_STEP_KM = 0.01;

/**
 * The steepest 500 m of a climb, read on its heights averaged over 500 m of distance (review of PR 150, I2): a recording's height
 * noise, or a bridge or a tunnel in a map's heights, then barely moves it, and a steady grade still reads as itself. Never under the
 * climb's own average.
 */
function steepest500m(km: Km[], h: number[], s: number, p: number): number {
  const length = km[p]! - km[s]!;
  const average = length > 0 ? ((h[p]! - h[s]!) / (length * 1000)) * 100 : 0;
  if (length < STEEP_WINDOW_KM) return average;
  const last = km.length - 1;
  // The area under the profile from the route's start to each point; the profile is straight between points.
  const area = [0];
  for (let i = 1; i <= last; i++) area.push(area[i - 1]! + ((h[i - 1]! + h[i]!) / 2) * (km[i]! - km[i - 1]!));
  const integral = (x: number): number => {
    if (x <= km[0]!) return 0;
    if (x >= km[last]!) return area[last]!;
    let lo = 0;
    let hi = last;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (km[mid]! <= x) lo = mid; else hi = mid;
    }
    const width = km[hi]! - km[lo]!;
    const y = width > 0 ? h[lo]! + ((h[hi]! - h[lo]!) * (x - km[lo]!)) / width : h[lo]!;
    return area[lo]! + ((h[lo]! + y) / 2) * (x - km[lo]!);
  };
  // The height averaged over 250 m either side, held to the route's ends.
  const averaged = (x: number): number => {
    const a = Math.max(km[0]!, x - STEEP_AVERAGE_HALF_KM);
    const b = Math.min(km[last]!, x + STEEP_AVERAGE_HALF_KM);
    return (integral(b) - integral(a)) / (b - a);
  };
  const from = km[s]!;
  const to = km[p]! - STEEP_WINDOW_KM;
  let best = average;
  const tryFrom = (x: number): void => {
    if (x < from || x > to) return;
    best = Math.max(best, ((averaged(x + STEEP_WINDOW_KM) - averaged(x)) / (STEEP_WINDOW_KM * 1000)) * 100);
  };
  // The averaged profile bends where a point is 250 m from a window's end, so the steepest window mostly starts at such a place;
  // a grid catches the rest.
  const w = STEEP_AVERAGE_HALF_KM;
  const L = STEEP_WINDOW_KM;
  for (let j = 0; j <= last; j++) {
    const x = km[j]!;
    if (x < from - L - w || x > km[p]! + w) continue;
    for (const d of [0, w, -w, -L, w - L, -w - L]) tryFrom(x + d);
  }
  for (let x = from; x <= to; x += STEEP_STEP_KM) tryFrom(x);
  tryFrom(to);
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
