// Compass bearing between two points, and the eight words it is read as (spec section 6.9).
import type { LatLng } from './haversine.ts';

const rad = (d: number): number => (d * Math.PI) / 180;

/** Initial bearing from `a` to `b`, degrees clockwise from north, in [0, 360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const WORDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** The bearing as one of eight words, each covering 45 degrees centred on its direction. */
export function compass8(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  return WORDS[Math.floor((d + 22.5) / 45) % 8]!;
}
