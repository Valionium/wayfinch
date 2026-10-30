import type { ManifestTile, PackManifest, Place, PlaceKind, Roof, StopFlags, TileContent, TileId } from './types.ts';
import { ALL_KINDS } from './types.ts';

/** The tile format of section 5a: one JSON object without whitespace, equal content gives equal bytes. */
export class PackFormatError extends Error {
  code: 'bad-json' | 'bad-shape' | 'bad-version';
  constructor(code: 'bad-json' | 'bad-shape' | 'bad-version', message: string) {
    super(message);
    this.name = 'PackFormatError';
    this.code = code;
  }
}

type Zone = [string, string | null, string | null, string, string];
type TileFilePlace = {
  i: string; k: PlaceKind; a: number; o: number; z: number;
  n?: string; w?: 'A' | 'B' | 'C'; l?: 1; h?: string; s?: string; c?: string;
  t?: Record<string, string>; f?: StopFlags; r?: boolean; m?: { p: string[]; u?: string };
};

const e5 = (v: number): number => Math.round(v * 1e5);
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function delta(values: number[]): number[] {
  let prev = 0;
  return values.map((v) => { const d = v - prev; prev = v; return d; });
}

export function encodeTile(c: TileContent, id: TileId): string {
  const places = [...c.places].sort((a, b) => byText(a.id, b.id));
  const zones: Zone[] = [];
  const zoneIndex = (p: Place): number => {
    const z: Zone = [p.country, p.subdivision, p.hoursRegionKey, p.holidayZone ?? p.hoursRegionKey ?? p.country, p.timeZone];
    const key = JSON.stringify(z);
    let i = zones.findIndex((q) => JSON.stringify(q) === key);
    if (i < 0) { zones.push(z); i = zones.length - 1; }
    return i;
  };
  const p = places.map((pl): TileFilePlace => {
    if (pl.waterClass === 'D') throw new Error('class D never reaches a pack');
    const o: TileFilePlace = { i: pl.id, k: pl.kind, a: e5(pl.lat), o: e5(pl.lon), z: zoneIndex(pl) };
    if (pl.name !== null) o.n = pl.name;
    if (pl.waterClass !== null) o.w = pl.waterClass;
    if (pl.indoorOrLimited) o.l = 1;
    if (pl.openingHours !== null) o.h = pl.openingHours;
    if (pl.seasonal !== null) o.s = pl.seasonal;
    if (pl.checkDate !== null) o.c = pl.checkDate;
    const keys = Object.keys(pl.tags).sort(byText);
    if (keys.length > 0) o.t = Object.fromEntries(keys.map((k) => [k, pl.tags[k]!]));
    if (pl.stop !== null) {
      const s = pl.stop;
      o.f = { indoorSeating: s.indoorSeating, outdoorSeating: s.outdoorSeating, toilets: s.toilets, takeaway: s.takeaway,
              kitchenHours: s.kitchenHours, bikeParking50m: s.bikeParking50m };
    }
    if (pl.platformRoof !== null) o.r = pl.platformRoof;
    if (pl.contact !== null) {
      o.m = { p: [...pl.contact.phones] };
      if (pl.contact.website !== null) o.m.u = pl.contact.website;
    }
    return o;
  });

  const roofs = [...c.roofs]
    .map((r) => ({ a: e5(r.lat), o: e5(r.lon), f: (r.kind === 'bike_parking' ? 1 : 0) | (r.bench ? 2 : 0) }))
    .sort((x, y) => x.a - y.a || x.o - y.o || x.f - y.f);
  const rescue = [...c.rescuePoints]
    .map((r) => ({ a: e5(r.lat), o: e5(r.lon), ref: r.ref }))
    .sort((x, y) => x.a - y.a || x.o - y.o || byText(x.ref, y.ref));

  return JSON.stringify({
    v: 1, z: id.z, x: id.x, y: id.y, zones, p,
    roofs: { a: delta(roofs.map((r) => r.a)), o: delta(roofs.map((r) => r.o)), f: roofs.map((r) => r.f) },
    rescue: { a: delta(rescue.map((r) => r.a)), o: delta(rescue.map((r) => r.o)), ref: rescue.map((r) => r.ref) },
  });
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNullStr = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isNullBool = (v: unknown): v is boolean | null => v === null || typeof v === 'boolean';
const shape = (what: string): never => { throw new PackFormatError('bad-shape', `bad tile: ${what}`); };

function undelta(values: unknown, name: string): number[] {
  if (!Array.isArray(values) || !values.every(isInt)) return shape(name);
  let acc = 0;
  return (values as number[]).map((d) => (acc += d));
}

export function decodeTile(text: string, meta: { manifest: PackManifest }): TileContent {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new PackFormatError('bad-json', 'tile is not JSON'); }
  if (!isObj(raw)) return shape('not an object');
  if (raw.v !== 1) throw new PackFormatError('bad-version', `tile version ${String(raw.v)}`);
  if (!isInt(raw.z) || !isInt(raw.x) || !isInt(raw.y)) return shape('tile id');
  if (!Array.isArray(raw.zones) || !Array.isArray(raw.p)) return shape('zones or places');
  const zones = raw.zones.map((z: unknown): Zone => {
    if (!Array.isArray(z) || z.length !== 5 || !isStr(z[0]) || !isNullStr(z[1]) || !isNullStr(z[2]) || !isStr(z[3]) || !isStr(z[4])) return shape('zone');
    return [z[0], z[1], z[2], z[3], z[4]];
  });

  const places = raw.p.map((q: unknown): Place => {
    if (!isObj(q) || !isStr(q.i) || !isStr(q.k) || !(ALL_KINDS as readonly string[]).includes(q.k) || !isInt(q.a) || !isInt(q.o) || !isInt(q.z)) return shape('place');
    const zone = zones[q.z];
    if (!zone) return shape('zone index');
    if (q.n !== undefined && !isStr(q.n)) return shape('name');
    if (q.w !== undefined && q.w !== 'A' && q.w !== 'B' && q.w !== 'C') return shape('water class');
    if (q.l !== undefined && q.l !== 1) return shape('indoorOrLimited');
    for (const key of ['h', 's', 'c'] as const) if (q[key] !== undefined && !isStr(q[key])) return shape(key);
    let tags: Record<string, string> = {};
    if (q.t !== undefined) {
      if (!isObj(q.t) || !Object.values(q.t).every(isStr)) return shape('tags');
      tags = { ...(q.t as Record<string, string>) };
    }
    let stop: StopFlags | null = null;
    if (q.f !== undefined) {
      const f = q.f;
      if (!isObj(f) || !isNullBool(f.indoorSeating) || !isNullBool(f.outdoorSeating) || !isNullBool(f.toilets) || !isNullBool(f.takeaway)
          || !isNullStr(f.kitchenHours) || typeof f.bikeParking50m !== 'boolean') return shape('stop flags');
      stop = { indoorSeating: f.indoorSeating, outdoorSeating: f.outdoorSeating, toilets: f.toilets, takeaway: f.takeaway,
               kitchenHours: f.kitchenHours, bikeParking50m: f.bikeParking50m };
    }
    if (q.r !== undefined && typeof q.r !== 'boolean') return shape('platformRoof');
    let contact: Place['contact'] = null;
    if (q.m !== undefined) {
      const m = q.m;
      if (!isObj(m) || !Array.isArray(m.p) || !m.p.every(isStr) || (m.u !== undefined && !isStr(m.u))) return shape('contact');
      contact = { phones: m.p as string[], website: (m.u as string | undefined) ?? null };
    }
    const manifestCountry = meta.manifest.countries[zone[0]];
    return {
      id: q.i, kind: q.k as PlaceKind, name: (q.n as string | undefined) ?? null, lat: q.a / 1e5, lon: q.o / 1e5,
      waterClass: (q.w as 'A' | 'B' | 'C' | undefined) ?? null, indoorOrLimited: q.l === 1,
      openingHours: (q.h as string | undefined) ?? null, seasonal: (q.s as string | undefined) ?? null,
      checkDate: (q.c as string | undefined) ?? null,
      country: zone[0], subdivision: zone[1], hoursRegionKey: zone[2], holidayZone: zone[3], timeZone: zone[4],
      tags, source: 'pack', dataDate: manifestCountry?.sourceDate ?? meta.manifest.builtAt.slice(0, 10),
      stop, platformRoof: (q.r as boolean | undefined) ?? null, contact,
    };
  });

  if (!isObj(raw.roofs) || !isObj(raw.rescue)) return shape('roofs or rescue');
  const ra = undelta(raw.roofs.a, 'roof lat'); const ro = undelta(raw.roofs.o, 'roof lon');
  const rf = raw.roofs.f;
  if (!Array.isArray(rf) || !rf.every((f) => isInt(f) && f >= 0 && f <= 3) || ra.length !== ro.length || ra.length !== rf.length) return shape('roofs');
  const roofs: Roof[] = ra.map((a, i) => ({
    kind: ((rf[i] as number) & 1) === 1 ? 'bike_parking' : 'bus_stop', lat: a / 1e5, lon: ro[i]! / 1e5, bench: ((rf[i] as number) & 2) === 2,
  }));
  const sa = undelta(raw.rescue.a, 'rescue lat'); const so = undelta(raw.rescue.o, 'rescue lon');
  const refs = raw.rescue.ref;
  if (!Array.isArray(refs) || !refs.every(isStr) || sa.length !== so.length || sa.length !== refs.length) return shape('rescue');
  const rescuePoints = sa.map((a, i) => ({ lat: a / 1e5, lon: so[i]! / 1e5, ref: refs[i] as string }));
  return { places, roofs, rescuePoints };
}

export type { ManifestTile };
