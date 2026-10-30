import { expect, test } from 'vitest';
import { sizeReport, formatSizeReport } from '../../../pipeline/size-report.ts';
import { tileBounds, tileOf } from '../../../src/core/places/tiles.ts';
import type { ManifestTile, PackManifest } from '../../../src/core/places/types.ts';
import { metaManifest } from '../../gen';

const tile = (lat: number, lon: number, bytes: number, gz: number): ManifestTile => ({ ...tileOf(lat, lon, 9), sha256: '0'.repeat(64), bytes, gzipBytes: gz, places: 1, roofs: 0, rescuePoints: 0 });
const manifest = (tiles: ManifestTile[]): PackManifest => ({ ...metaManifest(), tiles });

test('sizeReport counts tiles within 20 km of the route once, and adds their sizes', () => {
  const near = tile(49.4, 8.69, 1000, 300);
  const alsoNear = tile(49.4, 8.69 + 0.4, 2000, 600);
  const far = tile(52.5, 13.4, 5000, 1500);
  const route = [{ lat: 49.4, lon: 8.69 }, { lat: 49.4001, lon: 8.6901 }, { lat: 49.4, lon: 8.69 + 0.4 }];
  const r = sizeReport(manifest([near, alsoNear, far]), route, 20);
  expect(r).toMatchObject({ tiles: 2, bytes: 3000, gzipBytes: 900 });
});

test('sizeReport splits the bytes by country with the shares it is given', () => {
  const t = tile(49.4, 8.69, 1000, 400);
  const key = `${t.z}/${t.x}/${t.y}`;
  const r = sizeReport(manifest([t]), [{ lat: 49.4, lon: 8.69 }], 20, new Map([[key, { DE: 3, FR: 1 }]]));
  expect(r.byCountry).toEqual({ DE: 300, FR: 100 });
});

test('sizeReport of an empty route is nothing', () => {
  expect(sizeReport(manifest([tile(49.4, 8.69, 1, 1)]), [], 20)).toMatchObject({ tiles: 0, bytes: 0, gzipBytes: 0 });
});

test('a tile touching the 20 km line is counted and one just beyond is not', () => {
  const t = tile(49.4, 8.69, 10, 5);
  const b = tileBounds(t);
  const at = (km: number) => [{ lat: b.north + km / 111.195, lon: (b.west + b.east) / 2 }];
  expect(sizeReport(manifest([t]), at(19), 20).tiles).toBe(1);
  expect(sizeReport(manifest([t]), at(21), 20).tiles).toBe(0);
});

test('formatSizeReport gives a markdown row in megabytes', () => {
  const text = formatSizeReport('3 MB limit, 5000 per tile, drink on', { tiles: 12, bytes: 4_000_000, gzipBytes: 1_500_000, byCountry: {} });
  expect(text).toBe('| 3 MB limit, 5000 per tile, drink on | 12 | 4.00 | 1.50 |');
});
