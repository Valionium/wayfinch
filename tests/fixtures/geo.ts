// A point at a distance and bearing from another, on the sphere the app's haversine uses. Test geometry only.
import type { LatLng } from '../../src/core/geo/haversine.ts';

const EARTH_RADIUS_M = 6_371_000;
const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

export function destination(from: LatLng, metres: number, bearingDeg: number): LatLng {
  const d = metres / EARTH_RADIUS_M;
  const b = rad(bearingDeg);
  const lat1 = rad(from.lat);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const dLon = Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lon: from.lon + deg(dLon) };
}
