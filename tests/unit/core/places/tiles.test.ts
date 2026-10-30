import { expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { corridorTiles, tileBounds, tileOf } from '../../../../src/core/places/tiles.ts';
import type { PackManifest } from '../../../../src/core/places/types.ts';
import { latLng, metaManifest } from '../../../gen';

test.prop([latLng(), fc.integer({ min: 0, max: 14 })])('[PIPE-TILE-01] a point lies inside its tile', (p, z) => {
  const b = tileBounds(tileOf(p.lat, p.lon, z));
  expect(p.lat).toBeGreaterThanOrEqual(b.south);
  expect(p.lat).toBeLessThanOrEqual(b.north);
  expect(p.lon).toBeGreaterThanOrEqual(b.west);
  expect(p.lon).toBeLessThanOrEqual(b.east);
});

plain('level 0 is the world and each level halves both axes', () => {
  expect(tileBounds({ z: 0, x: 0, y: 0 })).toEqual({ south: -90, north: 90, west: -180, east: 180 });
  expect(tileBounds({ z: 1, x: 1, y: 0 })).toEqual({ south: -90, north: 0, west: 0, east: 180 });
});

function oneTile() {
  const t = tileOf(49.5, 8.2, 10);
  const manifest: PackManifest = { ...metaManifest(), tiles: [{ ...t, sha256: '0'.repeat(64), bytes: 1, gzipBytes: 1, places: 1, roofs: 0, rescuePoints: 0 }] };
  return { b: tileBounds(t), manifest };
}

plain('corridorTiles finds a tile 19 km off the route and not one 21 km off', () => {
  const { b, manifest } = oneTile();
  const routeKmSouth = (km: number) => [
    { lat: b.south - km / 111.195, lon: b.west },
    { lat: b.south - km / 111.195, lon: b.east },
  ];
  expect(corridorTiles(routeKmSouth(19), manifest, 20)).toHaveLength(1);
  expect(corridorTiles(routeKmSouth(21), manifest, 20)).toHaveLength(0);
});

plain('corridorTiles finds a tile between two far-apart route points', () => {
  const { b, manifest } = oneTile();
  const mid = (b.south + b.north) / 2;
  expect(corridorTiles([{ lat: mid, lon: b.west - 1 }, { lat: mid, lon: b.east + 1 }], manifest, 1)).toHaveLength(1);
});
