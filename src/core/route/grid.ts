// The forecast sample grid (spec section 6.6), built once at preparation from fixed route kilometres: every 10 to 15 km,
// each stage end, the route high point, and the top and bottom of each climb. The whole grid is always requested, so a
// refresh reveals nothing about the rider's progress. The same route always gives the same grid.
import type { Climb, Km, Route, Stage } from '../types.ts';

const MAX_SPACING_KM = 15;

const to3 = (km: Km): Km => Math.round(km * 1000) / 1000;

/**
 * Grid kilometres are rounded to 0.001 km, while stage ends and the route length stay exact: a grid point and the stop it
 * was made for can differ by this much. Never compare the two for equality or order without it.
 */
export const GRID_KM_ROUNDING = 0.0005 + 1e-9;

export function sampleGrid(route: Route, climbs: Climb[], stages: Stage[]): Km[] {
  const length = Math.max(0, route.lengthKm);
  const grid = new Set<Km>();
  const add = (km: Km): void => {
    if (Number.isFinite(km) && km >= 0 && km <= length) grid.add(to3(km));
  };

  // Equal steps of at most 15 km (and, on any route longer than 30 km, of at least 10 km).
  const intervals = Math.max(1, Math.ceil(length / MAX_SPACING_KM - 1e-9));
  for (let i = 0; i <= intervals; i++) add((length * i) / intervals);

  for (const s of stages) add(s.endKm);

  // Heights are needed for the high point and the climbs; without them there are no such points.
  const heights = route.ascentM !== null && route.points.length > 0 && route.points.every((p) => p.ele !== null);
  if (heights) {
    let high = route.points[0]!;
    for (const p of route.points) if (p.ele! > high.ele!) high = p;
    add(high.km);
    for (const c of climbs) {
      add(c.startKm);
      add(c.topKm);
    }
  }
  return [...grid].sort((a, b) => a - b);
}
