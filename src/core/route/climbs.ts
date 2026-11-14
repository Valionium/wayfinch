// Climbs (spec section 6.7): a continuous ascent of at least 100 m gain and at least 3% average gradient, joined across
// dips of less than 20 m, found on the smoothed profile. A route with a missing height has no climbs: unknown, not none.
//
// A climb starts at its foot and ends at its top. Real files have a point every 5 to 50 m, so a flat is never exactly flat: its
// heights wobble by a fraction of a metre (the smoothing) or by metres (a recording). A climb is therefore found on the height above
// a gentle slope of CLIMB_EDGE_GRADE_PCT: a flat or a valley road that rises less is not part of the climb at either end, and a long
// flat ends a climb as a dip does (review of PR 150, C1). Where the whole rise still averages under 3% (a long valley road before
// a steep pass), its steeper part is the climb.
import type { Climb, Km, Route } from '../types.ts';
import { smoothedHeights } from './smooth.ts';

export const MIN_CLIMB_GAIN_M = 100;
export const MIN_CLIMB_GRADE_PCT = 3;
/** A dip of this depth or more ends a climb; a shallower one is joined across. */
export const CLIMB_DIP_M = 20;
/** A stretch rising less than this, in percent, is no part of a climb at its foot or its top. */
export const CLIMB_EDGE_GRADE_PCT = 0.5;
/** Metres lost against that slope that end a climb as a dip does: 6 km of flat, or a long gentle descent. */
export const CLIMB_FLAT_DROP_M = 30;
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

/** The pair j <= k in [a, b] where `e` rises most, `e[k] - e[j]`; null when it never rises. */
function steepestRise(e: number[], a: number, b: number): [number, number] | null {
  let low = a;
  let best: [number, number] | null = null;
  let rise = 0;
  for (let k = a; k <= b; k++) {
    if (e[k]! < e[low]!) low = k;
    else if (e[k]! - e[low]! > rise) { rise = e[k]! - e[low]!; best = [low, k]; }
  }
  return best;
}

export function findClimbs(route: Route): Climb[] {
  const pts = route.points;
  if (route.ascentM === null || pts.length < 2 || pts.some((q) => q.ele === null)) return [];
  const h = smoothedHeights(pts.map((q) => ({ kmExact: q.km, elev: q.ele as number })));
  const km = pts.map((q) => q.km);
  // The height above a gentle slope: it falls along a flat, so a climb's foot is its lowest point and its top its highest.
  const slope = (grade: number): number[] => h.map((x, i) => x - (grade / 100) * km[i]! * 1000);
  const e = slope(CLIMB_EDGE_GRADE_PCT);
  let core: number[] | null = null;
  const out: Climb[] = [];

  // The climb in [a, b]: from the foot to the top above the gentle slope. One that averages under 3% keeps its steeper part (the
  // stretch rising most above a 3% slope), and the stretches before and after it are looked at again.
  const emit = (a: number, b: number): void => {
    const ranges: [number, number][] = [[a, b]];
    const found: Climb[] = [];
    while (ranges.length > 0) {
      const [from, to] = ranges.pop()!;
      const edges = steepestRise(e, from, to);
      if (!edges) continue;
      const [s, p] = edges;
      const gain = h[p]! - h[s]!;
      const length = (km[p]! - km[s]!) * 1000;
      if (gain < MIN_CLIMB_GAIN_M || length <= 0) continue;
      const avg = (gain / length) * 100;
      if (avg >= MIN_CLIMB_GRADE_PCT) {
        found.push({ startKm: km[s]!, topKm: km[p]!, gainM: gain, avgGradePct: avg, steepest500mPct: steepest500m(km, h, s, p) });
        continue;
      }
      core ??= slope(MIN_CLIMB_GRADE_PCT);
      const steep = steepestRise(core, s, p);
      if (!steep || (steep[0] === s && steep[1] === p)) continue;
      ranges.push([s, steep[0]], [steep[0], steep[1]], [steep[1], p]);
    }
    out.push(...found.sort((x, y) => x.startKm - y.startKm));
  };

  // s: the start (a low point), p: the top so far (the highest above the slope), v: the lowest height since that top, w: the
  // lowest point above the slope since it.
  let s = 0;
  let p = 0;
  let v = 0;
  let w = 0;
  for (let i = 1; i < pts.length; i++) {
    if (p === s && e[i]! <= e[s]!) {
      s = p = v = w = i; // still going down or flat: the climb has not begun
    } else if (e[i]! > e[p]!) {
      p = v = w = i; // a new top; any dip since the last one is joined
    } else {
      if (h[i]! < h[v]!) v = i;
      if (e[i]! < e[w]!) w = i;
      if (h[p]! - h[v]! >= CLIMB_DIP_M || e[p]! - e[w]! >= CLIMB_FLAT_DROP_M) {
        emit(s, p);
        s = p = v = w; // the next climb starts at the lowest point since the top; look at the points after it again
        i = w;
      }
    }
  }
  emit(s, p);
  return out;
}
