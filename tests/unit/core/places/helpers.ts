import type { ClassifyOptions, PlaceContext } from '../../../../src/core/places/classify.ts';
import type { OsmObject } from '../../../../src/core/places/types.ts';

export const obj = (tags: Record<string, string>, over: Partial<OsmObject> = {}): OsmObject =>
  ({ id: 'n1', lat: 49.40123, lon: 8.69456, tags, points: [[49.40123, 8.69456]], polygon: null, ...over });

export const ctx = (over: Partial<PlaceContext> = {}): PlaceContext => ({
  zone: { country: 'DE', subdivision: 'DE-BW', hoursRegionKey: 'DE-BW', holidayZone: 'DE-BW', timeZone: 'Europe/Berlin' },
  inCemetery: false, onCampsite: false, sourceDate: '2026-10-26', ...over,
});

export const opts = (over: Partial<ClassifyOptions> = {}): ClassifyOptions => ({ drinkPlaces: true, settlementAltNames: false, ...over });
