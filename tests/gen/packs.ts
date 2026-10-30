import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import fc from 'fast-check';
import { COUNTRY_CODES } from '../../src/core/places/countries.ts';
import { encodeTile } from '../../src/core/places/pack-format.ts';
import { tileOf } from '../../src/core/places/tiles.ts';
import { ALL_KINDS } from '../../src/core/places/types.ts';
import type { ManifestTile, PackEntry, PackManifest, Roof, TileContent, PackRescuePoint } from '../../src/core/places/types.ts';
import { coordinate, GEN_DATA_DATE, place } from './places.ts';

export const roof = (): fc.Arbitrary<Roof> =>
  fc.record({ kind: fc.constantFrom('bus_stop' as const, 'bike_parking' as const), lat: coordinate().map((c) => c.lat), lon: coordinate().map((c) => c.lon), bench: fc.boolean() });

export const rescuePoint = (): fc.Arbitrary<PackRescuePoint> =>
  fc.record({ lat: coordinate().map((c) => c.lat), lon: coordinate().map((c) => c.lon), ref: fc.string({ minLength: 1, maxLength: 32 }) });

export const tileContent = (): fc.Arbitrary<TileContent> =>
  fc.record({
    places: fc.uniqueArray(place(), { selector: (p) => p.id, maxLength: 12 }),
    roofs: fc.array(roof(), { maxLength: 10 }),
    rescuePoints: fc.array(rescuePoint(), { maxLength: 6 }),
  });

const buildId = (): fc.Arbitrary<string> => fc.tuple(fc.integer({ min: 20260101, max: 20301231 }), fc.integer({ min: 1, max: 99 })).map(([d, n]) => `${d}-${n}`);
const hex64 = (): fc.Arbitrary<string> => fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 64, maxLength: 64 }).map((a) => a.map((n) => n.toString(16)).join(''));
const isoTime = (): fc.Arbitrary<string> => fc.date({ min: new Date('2026-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString().replace(/\.\d+Z$/, 'Z'));

export const packEntry = (): fc.Arbitrary<PackEntry> =>
  fc.tuple(buildId(), isoTime()).map(([id, at]) => ({ v: 1 as const, buildId: id, builtAt: at, manifest: `/packs/${id}/manifest.json` }));

const manifestTile = (): fc.Arbitrary<ManifestTile> =>
  fc.record({
    z: fc.integer({ min: 0, max: 14 }), x: fc.nat(100), y: fc.nat(100), sha256: hex64(),
    bytes: fc.nat(100000), gzipBytes: fc.nat(50000), places: fc.nat(5000), roofs: fc.nat(500), rescuePoints: fc.nat(50),
  });

export const packManifest = (): fc.Arbitrary<PackManifest> =>
  fc.record({
    v: fc.constant(1 as const), buildId: buildId(), builtAt: isoTime(),
    licence: fc.constant({ name: 'ODbL-1.0' as const, url: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors' as const, buildCode: 'https://github.com/Valionium/wayfinch' }),
    countries: fc.constant(manifestCountries()),
    kinds: fc.subarray([...ALL_KINDS]),
    tiles: fc.array(manifestTile(), { maxLength: 8 }),
  });

function manifestCountries(): PackManifest['countries'] {
  return Object.fromEntries(COUNTRY_CODES.map((c) => [c, { status: 'fresh' as const, builtOn: GEN_DATA_DATE, sourceDate: GEN_DATA_DATE, places: 10 }]));
}

/** A manifest that fits generated places, for round-trip tests. */
export const metaManifest = (): PackManifest => ({
  v: 1, buildId: '20261103-1', builtAt: '2026-11-03T03:17:00Z',
  licence: { name: 'ODbL-1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors', buildCode: 'https://github.com/Valionium/wayfinch' },
  countries: manifestCountries(), kinds: [...ALL_KINDS], tiles: [],
});

export const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export function tileFileFor(c: TileContent, z = 8): { id: { z: number; x: number; y: number }; text: string; bytes: Uint8Array; expected: ManifestTile } {
  const first = c.places[0] ?? { lat: 0, lon: 0 };
  const id = tileOf(first.lat, first.lon, z);
  const text = encodeTile(c, id);
  const bytes = new TextEncoder().encode(text);
  return {
    id, text, bytes,
    expected: { ...id, sha256: sha256Hex(bytes), bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length,
                places: c.places.length, roofs: c.roofs.length, rescuePoints: c.rescuePoints.length },
  };
}

export const tileBytes = (): fc.Arbitrary<{ bytes: Uint8Array; expected: ManifestTile; manifest: PackManifest }> =>
  tileContent().map((c) => {
    const f = tileFileFor(c);
    return { bytes: f.bytes, expected: f.expected, manifest: { ...metaManifest(), tiles: [f.expected] } };
  });
