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
export { placesAlong } from './along.ts';
export { clock, departureDate, startTime, sunOf, sunSpec } from './clocks.ts';
export { baselineOf, forecastChoice, forecastOf } from './forecasts.ts';
export { plannedKm, positions } from './positions.ts';
export { loadSummary, profile, waterLeft } from './profiles.ts';
export { route } from './routes.ts';
export { scenario } from './scenario.ts';
export { stageChoice, stagesOf, withStages } from './stages.ts';
export { ageH, chancePct, distanceM, edgeMin, gustKmh, onThreshold, rainMm, tempC } from './thresholds.ts';
export { bikeLibrary, rawBike } from './bikes.ts';
