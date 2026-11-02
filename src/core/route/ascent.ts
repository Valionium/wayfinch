// Climbing, ported from Load Check's realAscent (spec section 7.1). A GPX records every wobble of a barometer, so the
// heights are smoothed first (200 m of distance) and only sustained gains over 4 m count.
import type { RoutePoint } from '../types.ts';
import { smoothedHeights } from './smooth.ts';

/** Metres: below this a gain is barometer noise, not a hill. */
export const ASCENT_THRESHOLD_M = 4;

/**
 * The total climbing of one section of points, unrounded. Null as soon as one height is missing: the answer is then
 * unknown, never 0 m.
 */
export function realAscent(points: RoutePoint[]): number | null {
  if (points.some((p) => p.ele === null)) return null;
  if (points.length < 2) return 0;
  const smooth = smoothedHeights(points.map((p) => ({ kmExact: p.km, elev: p.ele as number })));
  let total = 0;
  let reference = smooth[0]!;
  for (const e of smooth) {
    if (e > reference + ASCENT_THRESHOLD_M) {
      total += e - reference;
      reference = e;
    } else if (e < reference) reference = e;
  }
  return total;
}
