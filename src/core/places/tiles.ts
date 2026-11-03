import { haversineKm } from '../geo/haversine.ts';
import type { LatLng } from '../geo/haversine.ts';
import type { ManifestTile, PackManifest, TileId } from './types.ts';

export type Bounds = { south: number; west: number; north: number; east: number };

// Level 0 is the world in plain degrees; each level halves both axes. y counts from the south.
export function tileBounds(t: TileId): Bounds {
  const n = 2 ** t.z;
  const h = 180 / n;
  const w = 360 / n;
  return { south: -90 + t.y * h, north: -90 + (t.y + 1) * h, west: -180 + t.x * w, east: -180 + (t.x + 1) * w };
}

export function tileOf(lat: number, lon: number, z: number): TileId {
  const n = 2 ** z;
  const clamp = (v: number) => Math.min(n - 1, Math.max(0, v));
  const t = { z, x: clamp(Math.floor(((lon + 180) / 360) * n)), y: clamp(Math.floor(((lat + 90) / 180) * n)) };
  // Rounding can put a point on the wrong side of an edge by one step; the box decides.
  for (;;) {
    const b = tileBounds(t);
    if (lon < b.west && t.x > 0) t.x--;
    else if (lon > b.east && t.x < n - 1) t.x++;
    else if (lat < b.south && t.y > 0) t.y--;
    else if (lat > b.north && t.y < n - 1) t.y++;
    else return t;
  }
}

function distanceToBoxKm(p: LatLng, b: Bounds): number {
  const clamped = {
    lat: Math.min(b.north, Math.max(b.south, p.lat)),
    lon: Math.min(b.east, Math.max(b.west, p.lon)),
  };
  return haversineKm(p, clamped);
}

// Long gaps between route points are filled in, so that a tile between two far points is not missed.
function densify(points: LatLng[], stepKm: number): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    out.push(a);
    const b = points[i + 1];
    if (!b) break;
    const steps = Math.floor(haversineKm(a, b) / stepKm);
    for (let s = 1; s <= steps; s++) {
      const f = s / (steps + 1);
      out.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
    }
  }
  return out;
}

/** The manifest's tiles lying within radiusKm of the route (section 5a; criterion 7 uses 20 km). */
export function corridorTiles(points: LatLng[], manifest: PackManifest, radiusKm: number): ManifestTile[] {
  if (points.length === 0) return [];
  const pts = densify(points, 1);
  const pad = radiusKm / 111 + 0.01;
  const latPad = pad;
  const maxAbsLat = Math.min(89, Math.max(...pts.map((p) => Math.abs(p.lat))) + pad);
  const lonPad = pad / Math.max(0.05, Math.cos((maxAbsLat * Math.PI) / 180));
  const box = {
    south: Math.min(...pts.map((p) => p.lat)) - latPad, north: Math.max(...pts.map((p) => p.lat)) + latPad,
    west: Math.min(...pts.map((p) => p.lon)) - lonPad, east: Math.max(...pts.map((p) => p.lon)) + lonPad,
  };
  return manifest.tiles.filter((t) => {
    const b = tileBounds(t);
    if (b.north < box.south || b.south > box.north || b.east < box.west || b.west > box.east) return false;
    return pts.some((p) => distanceToBoxKm(p, b) <= radiusKm);
  });
}

/** The corridor of section 5a: a kilometre has its place data when every tile within this of it is saved. */
export const CORRIDOR_KM = 20;

export const tileKey = (t: TileId): string => `${t.z}/${t.x}/${t.y}`;

/** How finely `savedKmRanges` walks the route: an edge of a range is true to this. */
const SAVED_STEP_KM = 0.25;

/**
 * The kilometres that have saved place data (section 9.10's coverage): those inside the covered countries, with every
 * listed tile within the corridor saved. A tile the manifest doesn't list holds no places, and is no gap. An edge falls on
 * the careful side: the stretch between a kilometre with data and one without counts as without.
 */
export function savedKmRanges(route: { points: (LatLng & { km: number })[]; lengthKm: number }, tiles: ManifestTile[], saved: ReadonlySet<string>,
  covered: (km: number) => boolean, radiusKm: number = CORRIDOR_KM): { fromKm: number; toKm: number }[] {
  const missing = tiles.filter((t) => !saved.has(tileKey(t))).map(tileBounds);
  const good = (p: LatLng, km: number): boolean => covered(km) && !missing.some((b) => distanceToBoxKm(p, b) <= radiusKm);
  const out: { fromKm: number; toKm: number }[] = [];
  let open: { fromKm: number; toKm: number } | null = null;
  const visit = (p: LatLng, km: number): void => {
    if (!good(p, km)) {
      open = null;
      return;
    }
    if (open) open.toKm = km;
    else {
      open = { fromKm: km, toKm: km };
      out.push(open);
    }
  };
  route.points.forEach((p, i) => {
    visit(p, p.km);
    const next = route.points[i + 1];
    if (!next) return;
    const steps = Math.floor(haversineKm(p, next) / SAVED_STEP_KM);
    for (let s = 1; s <= steps; s++) {
      const f = s / (steps + 1);
      visit({ lat: p.lat + (next.lat - p.lat) * f, lon: p.lon + (next.lon - p.lon) * f }, p.km + (next.km - p.km) * f);
    }
  });
  return out.filter((r) => r.toKm > r.fromKm);
}
