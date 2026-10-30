// Shared generators (spec section 12.2). A task extends this kit instead of writing its own.
import fc from 'fast-check';
import type { LatLng } from '../../src/core/geo/haversine';

export const latLng = (): fc.Arbitrary<LatLng> =>
  fc.record({
    lat: fc.double({ min: -90, max: 90, noNaN: true }),
    lon: fc.double({ min: -180, max: 180, noNaN: true }),
  });

export { coordinate, osmTags, place, shelterTags, stopCluster, zoneOf, GEN_DATA_DATE } from './places.ts';
export { hoursValue } from './hours.ts';
export { metaManifest, packEntry, packManifest, rescuePoint, roof, sha256Hex, tileBytes, tileContent, tileFileFor } from './packs.ts';
