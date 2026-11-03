// One area's objects in, its places, roofs and rescue points out: the one classification code path (section 5a steps 5 to 13).
// The pipeline runs it on a country's extract, the phone on a refreshed stretch (section 5).
import { classifyObject } from './classify.ts';
import type { ClassifyOptions, Zone } from './classify.ts';
import { linkFuelShops } from './fuel.ts';
import { NearIndex } from './near.ts';
import { buildRescuePoints } from './rescue.ts';
import { pointInRings } from './rings.ts';
import type { Ring } from './rings.ts';
import { buildRoofs, platformRoofs } from './roofs.ts';
import { mergeOutlinesAndNodes } from './shelter.ts';
import type { OsmObject, PackRescuePoint, Place, Roof } from './types.ts';
import { waterClass } from './water.ts';

const v = (o: OsmObject, key: string): string | undefined => o.tags[key]?.trim().toLowerCase();
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const pointsOf = (o: OsmObject): [number, number][] => (o.points.length > 0 ? o.points : [[o.lat, o.lon]]);
const CELL = 0.01;

// Areas (cemeteries, campsites) in a grid of their bounding boxes, to ask "which area holds this point".
class AreaIndex {
  private readonly cells = new Map<string, Ring[][]>();

  constructor(areas: OsmObject[]) {
    for (const a of areas) {
      const rings: Ring[] = a.polygon!.map((r) => r.map(([lat, lon]): [number, number] => [lon, lat]));
      let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
      for (const r of rings) for (const [lon, lat] of r) { south = Math.min(south, lat); north = Math.max(north, lat); west = Math.min(west, lon); east = Math.max(east, lon); }
      for (let x = Math.floor(west / CELL); x <= Math.floor(east / CELL); x++) {
        for (let y = Math.floor(south / CELL); y <= Math.floor(north / CELL); y++) {
          const key = `${x},${y}`;
          const list = this.cells.get(key);
          if (list) list.push(rings); else this.cells.set(key, [rings]);
        }
      }
    }
  }

  holds(lat: number, lon: number): boolean {
    return (this.cells.get(`${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`) ?? []).some((rings) => pointInRings(rings, lon, lat));
  }
}

function firstZone(o: OsmObject, zoneOf: (lat: number, lon: number) => Zone | null): Zone | null {
  for (const [lat, lon] of o.points) { const z = zoneOf(lat, lon); if (z) return z; }
  return null;
}

const MAX_POINTS = 300;

/** An object from its vertices (lat, lon) and rings: its centre is the middle of the box, and at most 300 vertices stay. */
export function objectOf(id: string, tags: Record<string, string>, vertices: [number, number][], polygon: [number, number][][] | null): OsmObject {
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const [lat, lon] of vertices) { south = Math.min(south, lat); north = Math.max(north, lat); west = Math.min(west, lon); east = Math.max(east, lon); }
  const step = Math.ceil(vertices.length / MAX_POINTS);
  const points = step > 1 ? vertices.filter((_, i) => i % step === 0) : vertices;
  return { id, lat: (south + north) / 2, lon: (west + east) / 2, tags, points, polygon };
}

/** osmium may export a closed way twice (line and polygon) under one id: keep one, the polygon. */
export function keepPolygons(objects: Iterable<OsmObject>): OsmObject[] {
  const byObjectId = new Map<string, OsmObject>();
  for (const o of objects) {
    const seen = byObjectId.get(o.id);
    if (!seen || (seen.polygon === null && o.polygon !== null)) byObjectId.set(o.id, o);
  }
  return [...byObjectId.values()];
}

export function classifyAll(
  all: OsmObject[],
  zoneOf: (lat: number, lon: number) => Zone | null,
  sourceDate: string,
  opts: ClassifyOptions,
): { places: Place[]; roofs: Roof[]; rescuePoints: PackRescuePoint[] } {
  // Supports: stops, shelters, platforms, bike parking, cemeteries, campsites, shops that may belong to a fuel station.
  const shelters = all.filter((o) => v(o, 'amenity') === 'shelter');
  const stations = all.filter((o) => v(o, 'amenity') === 'fuel');
  const shopNodes = all.filter((o) => o.tags['shop'] !== undefined);
  const trainStations = all.filter((o) => ['station', 'halt'].includes(v(o, 'railway') ?? ''));
  const platforms = all.filter((o) => v(o, 'railway') === 'platform' || v(o, 'amenity') === 'shelter');
  const cemeteries = new AreaIndex(all.filter((o) => o.polygon !== null && (v(o, 'landuse') === 'cemetery' || v(o, 'amenity') === 'grave_yard')));
  const campsites = new AreaIndex(all.filter((o) => o.polygon !== null && v(o, 'tourism') === 'camp_site'));
  const bikeParking = new NearIndex(all.filter((o) => v(o, 'amenity') === 'bicycle_parking'), (o) => [o.lat, o.lon], 50, pointsOf);

  const mergedShelters = mergeOutlinesAndNodes(shelters);
  const { fuelShops, usedShopIds } = linkFuelShops(stations, shopNodes);
  const roofed = platformRoofs(trainStations, platforms);

  const candidates = new Map<string, OsmObject>();
  for (const o of all) {
    if (v(o, 'amenity') === 'shelter' || v(o, 'amenity') === 'fuel' || usedShopIds.has(o.id)) continue;
    candidates.set(o.id, o);
  }
  for (const o of [...mergedShelters, ...fuelShops]) candidates.set(o.id, o);

  const places: Place[] = [];
  for (const o of [...candidates.values()].sort(byId)) {
    // The centre of an outline may fall outside the country while the object reaches in.
    const zone = zoneOf(o.lat, o.lon) ?? firstZone(o, zoneOf);
    if (zone === null) continue;
    const maybeWater = waterClass(o.tags, { inCemetery: false }) !== null;
    const place = classifyObject(o, {
      zone, sourceDate, bikeParking,
      inCemetery: maybeWater && cemeteries.holds(o.lat, o.lon),
      onCampsite: maybeWater && campsites.holds(o.lat, o.lon),
    }, opts);
    if (place === null) continue;
    places.push(place.kind === 'station' ? { ...place, platformRoof: roofed.has(o.id) } : place);
  }

  const roofs = buildRoofs(all).filter((r) => zoneOf(r.lat, r.lon) !== null);
  const rescuePoints = buildRescuePoints(all).filter((r) => zoneOf(r.lat, r.lon) !== null);
  return { places, roofs, rescuePoints };
}
