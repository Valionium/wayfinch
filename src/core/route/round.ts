// The one rounded form of a route point (spec section 5): latitude and longitude to 6 decimals (about 0.1 m) and
// heights to whole centimetres. Done once, as soon as a route is loaded or planned, so every device computes the same
// numbers from it.
import type { RoutePoint } from '../types.ts';

/** Rounds half up, and never returns -0 (it would encode differently from 0). */
function round(x: number, perUnit: number): number {
  const v = Math.round(x * perUnit) / perUnit;
  return v === 0 ? 0 : v;
}

/** A point in the rounded form. The kilometre is kept as given (0 when it is not known yet). */
export function roundPoint(p: { lat: number; lon: number; ele: number | null; km?: number }): RoutePoint {
  return { lat: round(p.lat, 1e6), lon: round(p.lon, 1e6), ele: p.ele === null ? null : round(p.ele, 100), km: p.km ?? 0 };
}
