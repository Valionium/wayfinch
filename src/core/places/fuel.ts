// Fuel-station shops (section 6.0, Decision 15): a station counts only with a shop.
import { haversineKm } from '../geo/haversine.ts';
import { NearIndex } from './near.ts';
import type { OsmObject } from './types.ts';

const v = (tags: Record<string, string>, key: string): string | undefined => tags[key]?.trim().toLowerCase();
const byId = (a: OsmObject, b: OsmObject): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const pointsOf = (o: OsmObject): [number, number][] => (o.points.length > 0 ? o.points : [[o.lat, o.lon]]);

// What a linked shop node gives to the station, where the station has none of its own.
const TAKEN = ['opening_hours', 'check_date:opening_hours', 'check_date', 'seasonal', 'name'];

/**
 * Stations with a shop of their own stay as they are. A station without one takes the nearest unused
 * `shop=convenience|kiosk` node within 50 m, with its hours, and that node is not kept as a place of its own.
 * Automated stations never count. A bakery next door stays a bakery.
 */
export function linkFuelShops(stations: OsmObject[], shops: OsmObject[]): { fuelShops: OsmObject[]; usedShopIds: Set<string> } {
  const nodes = shops.filter((s) => s.polygon === null && ['convenience', 'kiosk'].includes(v(s.tags, 'shop') ?? '')).sort(byId);
  const index = new NearIndex(nodes, (o) => [o.lat, o.lon], 50);
  const used = new Set<string>();
  const fuelShops: OsmObject[] = [];
  for (const st of stations.filter((s) => v(s.tags, 'amenity') === 'fuel' && v(s.tags, 'automated') !== 'yes').sort(byId)) {
    const shop = v(st.tags, 'shop');
    if (shop !== undefined && shop !== 'no') { fuelShops.push(st); continue; }
    let best: { node: OsmObject; d: number } | null = null;
    for (const [lat, lon] of pointsOf(st)) {
      for (const n of index.within(lat, lon, 50)) {
        if (used.has(n.id)) continue;
        const d = haversineKm({ lat, lon }, n);
        if (best === null || d < best.d || (d === best.d && n.id < best.node.id)) best = { node: n, d };
      }
    }
    if (best === null) continue;
    used.add(best.node.id);
    const tags: Record<string, string> = { ...st.tags, shop: best.node.tags['shop']! };
    for (const key of TAKEN) {
      const value = best.node.tags[key];
      if (value !== undefined && (key === 'opening_hours' || tags[key] === undefined)) tags[key] = value;
    }
    fuelShops.push({ ...st, tags });
  }
  return { fuelShops, usedShopIds: used };
}
