// What a route costs to download (criterion 7): the tiles within a radius of the route, counted once.
import { corridorTiles } from '../src/core/places/tiles.ts';
import type { LatLng } from '../src/core/geo/haversine.ts';
import type { PackManifest } from '../src/core/places/types.ts';

export type SizeReport = { tiles: number; bytes: number; gzipBytes: number; byCountry: Record<string, number> };

/**
 * `shares` says, per tile ("z/x/y"), how many places each country holds there; with it the gzip bytes
 * of a tile are split between the countries by those shares.
 */
export function sizeReport(manifest: PackManifest, route: LatLng[], radiusKm: number, shares?: Map<string, Record<string, number>>): SizeReport {
  const tiles = corridorTiles(route, manifest, radiusKm);
  const byCountry: Record<string, number> = {};
  let bytes = 0; let gzipBytes = 0;
  for (const t of tiles) {
    bytes += t.bytes; gzipBytes += t.gzipBytes;
    const share = shares?.get(`${t.z}/${t.x}/${t.y}`);
    if (!share) continue;
    const total = Object.values(share).reduce((s, n) => s + n, 0);
    for (const [cc, n] of Object.entries(share)) byCountry[cc] = (byCountry[cc] ?? 0) + (t.gzipBytes * n) / total;
  }
  return { tiles: tiles.length, bytes, gzipBytes, byCountry };
}

const mb = (n: number): string => (n / 1_000_000).toFixed(2);

export const formatSizeReport = (label: string, r: SizeReport): string => `| ${label} | ${r.tiles} | ${mb(r.bytes)} | ${mb(r.gzipBytes)} |`;
