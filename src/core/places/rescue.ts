// Rescue points (section 6.9, section 5a step 13).
import { haversineKm } from '../geo/haversine.ts';
import type { OsmObject, PackRescuePoint } from './types.ts';
import { limitedText } from './whitelist.ts';

const MAX_REF = 32;
const byId = (a: OsmObject, b: OsmObject): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;

/**
 * Nodes with `highway=emergency_access_point` or `emergency=access_point` and a ref of at most 32
 * characters (a longer one is left out, not cut). The same ref within 50 m is one point. The sign's own
 * phone number is not kept: only position and ref are.
 */
export function buildRescuePoints(objects: OsmObject[]): PackRescuePoint[] {
  const kept: { id: string; lat: number; lon: number; ref: string }[] = [];
  for (const o of [...objects].sort(byId)) {
    if (o.polygon !== null || !o.id.startsWith('n')) continue;
    const t = o.tags;
    if (t['highway']?.trim().toLowerCase() !== 'emergency_access_point' && t['emergency']?.trim().toLowerCase() !== 'access_point') continue;
    const ref = limitedText(t['ref'], MAX_REF);
    if (ref === null) continue;
    if (kept.some((k) => k.ref === ref && haversineKm(k, o) * 1000 <= 50)) continue;
    kept.push({ id: o.id, lat: o.lat, lon: o.lon, ref });
  }
  return kept
    .map((k) => ({ lat: round5(k.lat), lon: round5(k.lon), ref: k.ref }))
    .sort((a, b) => a.lat - b.lat || a.lon - b.lon || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
}
