import type { ClassifyOptions, PlaceContext } from '../../../../src/core/places/classify.ts';
import type { OsmObject } from '../../../../src/core/places/types.ts';

export const obj = (tags: Record<string, string>, over: Partial<OsmObject> = {}): OsmObject =>
  ({ id: 'n1', lat: 49.40123, lon: 8.69456, tags, points: [[49.40123, 8.69456]], polygon: null, ...over });

export const ctx = (over: Partial<PlaceContext> = {}): PlaceContext => ({
  zone: { country: 'DE', subdivision: 'DE-BW', hoursRegionKey: 'DE-BW', holidayZone: 'DE-BW', timeZone: 'Europe/Berlin' },
  inCemetery: false, onCampsite: false, sourceDate: '2026-10-26', ...over,
});

export const opts = (over: Partial<ClassifyOptions> = {}): ClassifyOptions => ({ drinkPlaces: true, settlementAltNames: false, ...over });

// One metre of latitude, at the radius haversineKm uses.
const DEG_PER_M = 180 / (Math.PI * 6371000);

/** A point `m` metres north of `p`. */
export const metresFrom = (p: { lat: number; lon: number }, m: number): { lat: number; lon: number } => ({ lat: p.lat + m * DEG_PER_M, lon: p.lon });

type Pt = { lat: number; lon: number };
export const node = (id: string, p: Pt, tags: Record<string, string>): OsmObject =>
  ({ id, lat: p.lat, lon: p.lon, tags, points: [[p.lat, p.lon]], polygon: null });

/** An area given as one ring of [lat, lon] corners; its centre is the average of the corners. */
export const way = (id: string, ring: [number, number][], tags: Record<string, string>): OsmObject => ({
  id, tags, points: ring, polygon: [ring],
  lat: ring.reduce((s, q) => s + q[0], 0) / ring.length, lon: ring.reduce((s, q) => s + q[1], 0) / ring.length,
});
