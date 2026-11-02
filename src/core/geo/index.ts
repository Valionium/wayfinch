// The route's segment grid index (spec sections 4.5 and 6.1): cells of about 2 km hold the segments that cross them,
// so a position or a place is compared with a handful of segments, not with all of them.
import type { LatLng } from './haversine.ts';
import type { Route } from '../types.ts';

const CELL_DEG = 0.02;
const KM_PER_DEG_LAT = 110.5; // a little under the true figure everywhere, so the search box is never too small
const COLS = 1 << 16; // more columns than the 360 / 0.02 the globe needs

export type SegmentIndex = { segments: number; cells: Map<number, number[]> };

const cellOf = (lat: number, lon: number): [number, number] => [Math.floor((lat + 90) / CELL_DEG), Math.floor((lon + 180) / CELL_DEG)];
const keyOf = (row: number, col: number): number => row * COLS + col;

export function buildSegmentIndex(route: Route): SegmentIndex {
  const cells = new Map<number, number[]>();
  const pts = route.points;
  const add = (lat: number, lon: number, seg: number): void => {
    const [row, col] = cellOf(lat, lon);
    const key = keyOf(row, col);
    const list = cells.get(key);
    if (!list) cells.set(key, [seg]);
    else if (list[list.length - 1] !== seg) list.push(seg);
  };
  for (let seg = 0; seg + 1 < pts.length; seg++) {
    const a = pts[seg]!;
    const b = pts[seg + 1]!;
    // Long segments are walked in half-cell steps. A corner missed between two steps is covered by the extra cell
    // of margin that `segmentsNear` searches.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.lat - a.lat), Math.abs(b.lon - a.lon)) / (CELL_DEG / 2)));
    for (let i = 0; i <= steps; i++) add(a.lat + ((b.lat - a.lat) * i) / steps, a.lon + ((b.lon - a.lon) * i) / steps, seg);
  }
  return { segments: Math.max(0, pts.length - 1), cells };
}

/** The segments that may lie within `radiusKm` of `p`, in route order, each once. A superset: callers measure. */
export function segmentsNear(idx: SegmentIndex, p: LatLng, radiusKm: number): number[] {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !Number.isFinite(radiusKm)) return [];
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const dLon = radiusKm / (KM_PER_DEG_LAT * Math.max(0.01, Math.cos(((Math.abs(p.lat) + dLat) * Math.PI) / 180)));
  const [r0, c0] = cellOf(p.lat - dLat, p.lon - dLon);
  const [r1, c1] = cellOf(p.lat + dLat, p.lon + dLon);
  if ((r1 - r0 + 3) * (c1 - c0 + 3) >= idx.cells.size) return allSegments(idx);
  const seen = new Set<number>();
  for (let r = r0 - 1; r <= r1 + 1; r++) {
    for (let c = c0 - 1; c <= c1 + 1; c++) {
      const list = idx.cells.get(keyOf(r, c));
      if (list) for (const seg of list) seen.add(seg);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

export function allSegments(idx: SegmentIndex): number[] {
  return Array.from({ length: idx.segments }, (_, i) => i);
}
