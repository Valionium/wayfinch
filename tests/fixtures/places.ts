import type { PackRescuePoint, Place, PlaceKind, Roof } from '../../src/core/places/types.ts';

export const FIXTURE_DATA_DATE = '2026-10-26';

// Short builders that state a place in one line. Defaults sit in Baden-Württemberg.
export function placeAt(kind: PlaceKind, lat: number, lon: number, overrides: Partial<Place> = {}): Place {
  return {
    id: `n${Math.abs(Math.round(lat * 1e5) * 31 + Math.round(lon * 1e5))}`,
    kind, name: `Test ${kind}`, lat, lon,
    waterClass: kind === 'water' ? 'A' : null,
    indoorOrLimited: false, openingHours: null, seasonal: null, checkDate: null,
    country: 'DE', subdivision: 'DE-BW', hoursRegionKey: 'DE-BW', holidayZone: 'DE-BW', timeZone: 'Europe/Berlin',
    tags: {}, source: 'pack', dataDate: FIXTURE_DATA_DATE,
    stop: null, platformRoof: null, contact: null,
    ...overrides,
  };
}

export const roofAt = (lat: number, lon: number, overrides: Partial<Roof> = {}): Roof =>
  ({ kind: 'bus_stop', lat, lon, bench: false, ...overrides });

export const rescueAt = (lat: number, lon: number, ref = 'X-1'): PackRescuePoint => ({ lat, lon, ref });
