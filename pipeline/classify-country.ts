// One country's objects in, its places, roofs and rescue points out (section 5a steps 5 to 13).
import { classifyObject } from '../src/core/places/classify.ts';
import type { ClassifyOptions, Zone } from '../src/core/places/classify.ts';
import type { CountryCode } from '../src/core/places/countries.ts';
import { linkFuelShops } from '../src/core/places/fuel.ts';
import { NearIndex } from '../src/core/places/near.ts';
import { buildRescuePoints } from '../src/core/places/rescue.ts';
import { buildRoofs, platformRoofs } from '../src/core/places/roofs.ts';
import { mergeOutlinesAndNodes } from '../src/core/places/shelter.ts';
import type { OsmObject, PackRescuePoint, Place, Roof } from '../src/core/places/types.ts';
import { waterClass } from '../src/core/places/water.ts';
import { pointInRings } from './boundaries.ts';
import type { Ring } from './boundaries.ts';

export type CountryOutput = { cc: CountryCode; sourceDate: string; builtOn: string; places: Place[]; roofs: Roof[]; rescuePoints: PackRescuePoint[] };
export type CountryOptions = ClassifyOptions & { builtOn: string };

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

export async function classifyCountry(
  objects: AsyncIterable<OsmObject>,
  zoneOf: (lat: number, lon: number) => Zone | null,
  cc: CountryCode,
  sourceDate: string,
  opts: CountryOptions,
): Promise<CountryOutput> {
  const all: OsmObject[] = [];
  for await (const o of objects) all.push(o);

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
    const zone = zoneOf(o.lat, o.lon);
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
  return { cc, sourceDate, builtOn: opts.builtOn, places, roofs, rescuePoints };
}
