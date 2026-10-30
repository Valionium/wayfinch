// The roof layer (section 5a step 8) and the station roof flag (step 9).
import { haversineKm } from '../geo/haversine.ts';
import { NearIndex } from './near.ts';
import { normaliseShelterType } from './shelter.ts';
import type { OsmObject, Roof } from './types.ts';

const v = (tags: Record<string, string>, key: string): string | undefined => tags[key]?.trim().toLowerCase();
const pointsOf = (o: OsmObject): [number, number][] => (o.points.length > 0 ? o.points : [[o.lat, o.lon]]);
const byId = (a: OsmObject, b: OsmObject): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;
const near = (o: OsmObject, m: number, index: NearIndex<OsmObject>): OsmObject[] => {
  const hits = new Set<OsmObject>();
  for (const [lat, lon] of pointsOf(o)) for (const h of index.within(lat, lon, m)) hits.add(h);
  return [...hits];
};
const withinM = (a: OsmObject, b: OsmObject, m: number): boolean =>
  pointsOf(a).some(([la, lo]) => pointsOf(b).some(([lb, ob]) => haversineKm({ lat: la, lon: lo }, { lat: lb, lon: ob }) * 1000 <= m));
const index = (objects: OsmObject[], cellM: number): NearIndex<OsmObject> => new NearIndex(objects, (o) => [o.lat, o.lon], cellM, pointsOf);

const isStop = (o: OsmObject): boolean =>
  v(o.tags, 'highway') === 'bus_stop' || v(o.tags, 'public_transport') === 'platform' || v(o.tags, 'railway') === 'platform';
const isTransportShelter = (o: OsmObject): boolean => {
  if (v(o.tags, 'amenity') !== 'shelter') return false;
  const type = normaliseShelterType(o.tags['shelter_type']);
  return type === 'public_transport' || type === 'weather_shelter';
};

/** Sheltered stops and covered public bike parking, as a lean list sorted by position. */
export function buildRoofs(objects: OsmObject[]): Roof[] {
  const shelters = index(objects.filter(isTransportShelter), 30);
  const candidates: { o: OsmObject; name: string; bench: boolean }[] = [];
  for (const o of [...objects].sort(byId)) {
    if (!isStop(o)) continue;
    const near30 = near(o, 30, shelters);
    const sheltered = v(o.tags, 'shelter') === 'yes' || v(o.tags, 'shelter') === 'separate' || near30.length > 0;
    if (!sheltered) continue;
    const bench = v(o.tags, 'bench') === 'yes' || near30.some((s) => v(s.tags, 'bench') === 'yes');
    candidates.push({ o, name: (o.tags['name'] ?? '').trim().toLowerCase(), bench });
  }

  // Stops with one name within 30 m are one stop: the smallest id stays, and a bench on any of them counts.
  const kept: { o: OsmObject; name: string; bench: boolean }[] = [];
  for (const c of candidates) {
    const same = kept.find((k) => k.name === c.name && withinM(k.o, c.o, 30));
    if (same) same.bench ||= c.bench; else kept.push({ ...c });
  }
  const roofs: Roof[] = kept.map((k) => ({ kind: 'bus_stop', lat: round5(k.o.lat), lon: round5(k.o.lon), bench: k.bench }));

  for (const o of objects) {
    const access = v(o.tags, 'access');
    if (v(o.tags, 'amenity') === 'bicycle_parking' && v(o.tags, 'covered') === 'yes'
        && !(access === 'private' || access === 'no' || access === 'customers' || access === 'permit')) {
      roofs.push({ kind: 'bike_parking', lat: round5(o.lat), lon: round5(o.lon), bench: false });
    }
  }
  const rank = (r: Roof): number => (r.kind === 'bike_parking' ? 2 : 0) + (r.bench ? 1 : 0);
  return roofs.sort((a, b) => a.lat - b.lat || a.lon - b.lon || rank(a) - rank(b));
}

/** Ids of the stations with a roof on a platform or a transport shelter within 300 m. */
export function platformRoofs(stations: OsmObject[], supports: OsmObject[]): Set<string> {
  const roofed = supports.filter((o) =>
    (v(o.tags, 'railway') === 'platform' && (v(o.tags, 'shelter') === 'yes' || v(o.tags, 'covered') === 'yes')) || isTransportShelter(o));
  const idx = index(roofed, 300);
  return new Set(stations.filter((s) => near(s, 300, idx).length > 0).map((s) => s.id));
}
