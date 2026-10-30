// Builds the six fixture routes and their synthetic place packs. No network, no clock: fixed way-points and a seed.
// Run: node tools/build-fixtures.ts   (rewrites tests/fixtures/routes and tests/fixtures/packs)
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { COUNTRIES } from '../src/core/places/countries.ts';
import type { CountryCode } from '../src/core/places/countries.ts';
import { haversineKm } from '../src/core/geo/haversine.ts';
import { encodeTile } from '../src/core/places/pack-format.ts';
import { tileOf } from '../src/core/places/tiles.ts';
import { ALL_KINDS } from '../src/core/places/types.ts';
import type { ManifestTile, PackManifest, PackRescuePoint, Place, PlaceKind, Roof, StopFlags, TileContent } from '../src/core/places/types.ts';
import { FIXTURE_DATA_DATE, placeAt, rescueAt, roofAt } from '../tests/fixtures/places.ts';

export const FIXTURE_IDS = ['heidelberg-strasbourg', 'alpine-pass', 'out-and-back', 'loop', 'multi-day-800', 'sunday-holiday'] as const;
export type FixtureRouteId = (typeof FIXTURE_IDS)[number];
export const PACK_TILE_LEVEL = 9;
export const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');

type ZoneKey = 'DE-BW' | 'DE-BY' | 'DE-BY-Augsburg' | 'FR-67' | 'AT-5' | 'AT-7' | 'AT-8' | 'CH-UR' | 'CH-TI' | 'CH-GR' | 'CH-ZH' | 'CH-BS';
type Zone = { country: CountryCode; subdivision: string; hoursRegionKey: string; holidayZone: string };
const zone = (country: CountryCode, key: string, holidayZone = key): Zone => ({ country, subdivision: key, hoursRegionKey: key, holidayZone });
const ZONES: Record<ZoneKey, Zone> = {
  'DE-BW': zone('DE', 'DE-BW'), 'DE-BY': zone('DE', 'DE-BY'), 'DE-BY-Augsburg': zone('DE', 'DE-BY', 'DE-BY-Augsburg'),
  'FR-67': zone('FR', 'FR-67'), 'AT-5': zone('AT', 'AT-5'), 'AT-7': zone('AT', 'AT-7'), 'AT-8': zone('AT', 'AT-8'),
  'CH-UR': zone('CH', 'CH-UR'), 'CH-TI': zone('CH', 'CH-TI'), 'CH-GR': zone('CH', 'CH-GR'), 'CH-ZH': zone('CH', 'CH-ZH'), 'CH-BS': zone('CH', 'CH-BS'),
};

// A way-point's zone applies from it to the next way-point.
type Waypoint = { lat: number; lon: number; ele: number; zone: ZoneKey };
type RouteSpec = { id: FixtureRouteId; name: string; targetKm: number; density: number; waypoints: Waypoint[]; backAndForth?: boolean };
const w = (lat: number, lon: number, ele: number, zoneKey: ZoneKey): Waypoint => ({ lat, lon, ele, zone: zoneKey });

const SPECS: RouteSpec[] = [
  { id: 'heidelberg-strasbourg', name: 'Fixture: Heidelberg to Strasbourg', targetKm: 165, density: 8, waypoints: [
    w(49.40, 8.69, 115, 'DE-BW'), w(49.32, 8.43, 100, 'DE-BW'), w(49.01, 8.40, 115, 'DE-BW'), w(48.86, 8.20, 120, 'DE-BW'),
    w(48.57, 7.81, 135, 'DE-BW'), w(48.575, 7.795, 135, 'FR-67'), w(48.58, 7.75, 140, 'FR-67')] },
  { id: 'alpine-pass', name: 'Fixture: Altdorf over the Gotthard to Bellinzona', targetKm: 90, density: 10, waypoints: [
    w(46.88, 8.64, 460, 'CH-UR'), w(46.634, 8.594, 1440, 'CH-UR'), w(46.56, 8.56, 2106, 'CH-TI'), w(46.53, 8.61, 1175, 'CH-TI'),
    w(46.48, 8.80, 760, 'CH-TI'), w(46.36, 8.97, 300, 'CH-TI'), w(46.19, 9.02, 240, 'CH-TI')] },
  { id: 'out-and-back', name: 'Fixture: Freiburg to Offenburg and back', targetKm: 60, density: 10, backAndForth: true, waypoints: [
    w(47.99, 7.85, 278, 'DE-BW'), w(48.34, 7.87, 165, 'DE-BW'), w(48.47, 7.94, 160, 'DE-BW')] },
  { id: 'loop', name: 'Fixture: Heilbronn loop', targetKm: 100, density: 8, waypoints: [
    w(49.14, 9.22, 160, 'DE-BW'), w(49.20, 9.50, 230, 'DE-BW'), w(49.11, 9.74, 300, 'DE-BW'), w(48.95, 9.43, 260, 'DE-BW'), w(49.14, 9.22, 160, 'DE-BW')] },
  { id: 'multi-day-800', name: 'Fixture: Passau to Freiburg over the Alps', targetKm: 800, density: 5, waypoints: [
    w(48.57, 13.46, 310, 'DE-BY'), w(47.80, 13.04, 430, 'AT-5'), w(47.27, 11.39, 575, 'AT-7'), w(47.50, 9.75, 400, 'AT-8'),
    w(46.85, 9.53, 590, 'CH-GR'), w(47.37, 8.54, 410, 'CH-ZH'), w(47.56, 7.59, 260, 'CH-BS'), w(47.99, 7.85, 278, 'DE-BW')] },
  { id: 'sunday-holiday', name: 'Fixture: Günzburg to Munich through Augsburg', targetKm: 120, density: 8, waypoints: [
    w(48.45, 10.28, 450, 'DE-BY'), w(48.37, 10.80, 490, 'DE-BY-Augsburg'), w(48.36, 10.99, 480, 'DE-BY'), w(48.14, 11.46, 520, 'DE-BY'),
    w(48.137, 11.575, 520, 'DE-BY'), w(48.13, 11.69, 530, 'DE-BY')] },
];

// ---------- seeded numbers ----------
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashText = (s: string): number => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const M_PER_DEG = 111195;
const r5 = (v: number): number => Math.round(v * 1e5) / 1e5;
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => haversineKm(a, b);

// ---------- routes ----------
export type RoutePoint = { lat: number; lon: number; ele: number };
export type BuiltRoute = { id: FixtureRouteId; name: string; points: RoutePoint[]; zoneKeys: ZoneKey[] };
type Fine = { lat: number; lon: number; ele: number; u: number; zone: ZoneKey; nx: number; ny: number };

function baseFine(wps: Waypoint[]): Fine[] {
  const out: Fine[] = [];
  let u = 0;
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i]!; const b = wps[i + 1]!;
    const d = km(a, b) * 1000;
    const n = Math.max(1, Math.ceil(d / 25));
    const cos = Math.cos((a.lat * Math.PI) / 180);
    let dx = (b.lon - a.lon) * cos; let dy = b.lat - a.lat;
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    for (let s = 0; s < n || (i === wps.length - 2 && s === n); s++) {
      const f = s / n;
      out.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, ele: a.ele + (b.ele - a.ele) * f, u: u + d * f, zone: a.zone, nx: -dy, ny: dx });
    }
    u += d;
  }
  return out;
}

function meander(fine: Fine[], amplitude: number, wavelength: number, phase: number, noiseSeed: number): Fine[] {
  const total = fine[fine.length - 1]!.u;
  const r = rng(noiseSeed);
  const p1 = r() * 6.28; const p2 = r() * 6.28;
  return fine.map((f) => {
    const env = Math.min(1, f.u / 3000, (total - f.u) / 3000);
    const d = amplitude * env * Math.sin((2 * Math.PI * f.u) / wavelength + phase);
    const cos = Math.cos((f.lat * Math.PI) / 180);
    const noise = 12 * Math.sin(f.u / 1700 + p1) + 7 * Math.sin(f.u / 530 + p2);
    return { ...f, lat: f.lat + (f.ny * d) / M_PER_DEG, lon: f.lon + (f.nx * d) / (M_PER_DEG * cos), ele: Math.max(0, f.ele + noise) };
  });
}

const pathKm = (p: { lat: number; lon: number }[]): number => p.reduce((s, q, i) => (i === 0 ? 0 : s + km(p[i - 1]!, q)), 0);

function buildLeg(spec: RouteSpec, seed: number): { points: RoutePoint[]; zoneKeys: ZoneKey[] } {
  const fine = baseFine(spec.waypoints);
  const r = rng(seed);
  const phase = r() * 6.28;
  const wavelength = 12000;
  let lo = 0; let hi = 30000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pathKm(meander(fine, mid, wavelength, phase, seed)) < spec.targetKm) lo = mid; else hi = mid;
  }
  const path = meander(fine, (lo + hi) / 2, wavelength, phase, seed);
  // Resample every 100 m along the path.
  const points: RoutePoint[] = []; const zoneKeys: ZoneKey[] = [];
  let acc = 0; let next = 0;
  for (let i = 0; i < path.length; i++) {
    const cur = path[i]!;
    if (i === 0) { points.push({ lat: r5(cur.lat), lon: r5(cur.lon), ele: Math.round(cur.ele * 10) / 10 }); zoneKeys.push(cur.zone); continue; }
    const prev = path[i - 1]!;
    const seg = km(prev, cur) * 1000;
    while (acc + seg >= next + 100 && seg > 0) {
      next += 100;
      const f = (next - acc) / seg;
      points.push({ lat: r5(prev.lat + (cur.lat - prev.lat) * f), lon: r5(prev.lon + (cur.lon - prev.lon) * f), ele: Math.round((prev.ele + (cur.ele - prev.ele) * f) * 10) / 10 });
      zoneKeys.push(f < 0.5 ? prev.zone : cur.zone);
    }
    acc += seg;
  }
  const last = path[path.length - 1]!;
  points.push({ lat: r5(last.lat), lon: r5(last.lon), ele: Math.round(last.ele * 10) / 10 });
  zoneKeys.push(last.zone);
  return { points, zoneKeys };
}

export function buildRoute(id: FixtureRouteId, seed: number): BuiltRoute {
  const spec = SPECS.find((s) => s.id === id)!;
  const leg = buildLeg(spec, seed + hashText(id));
  if (!spec.backAndForth) return { id, name: spec.name, ...leg };
  // The way back is the same road, a little to the east, so one tap serves both legs.
  const back = [...leg.points].reverse().map((p) => ({ ...p, lon: r5(p.lon + 0.0003) }));
  return { id, name: spec.name, points: [...leg.points, ...back], zoneKeys: [...leg.zoneKeys, ...[...leg.zoneKeys].reverse()] };
}

// ---------- places ----------
const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
const HOURS: (string | null)[] = ['Mo-Sa 08:00-18:00', 'Mo-Fr 07:00-19:00; Sa 07:00-13:00; PH off', 'Mo-Su 06:00-22:00', null, 'Mo-Fr 25:00-26:00'];
const RADIUS_M: Record<PlaceKind, number> = {
  water: 1000, shop: 1000, cafe: 1000, ice_cream: 1000, fuel_shop: 1000, toilets: 1000, restaurant: 600, drink: 600,
  campsite: 3000, shelter: 3000, hut: 3000, lodging: 3000, bike_shop: 5000, repair_station: 2000, air: 2000, pharmacy: 5000,
  hospital: 20000, station: 10000, settlement: 5000,
};
const WEIGHTS: [PlaceKind, number][] = [
  ['shop', 18], ['water', 14], ['cafe', 10], ['restaurant', 10], ['settlement', 6], ['toilets', 6], ['shelter', 5], ['lodging', 5],
  ['campsite', 4], ['drink', 4], ['station', 3], ['pharmacy', 3], ['bike_shop', 3], ['fuel_shop', 3], ['ice_cream', 3], ['repair_station', 2], ['air', 2], ['hospital', 1], ['hut', 1],
];
const tri = (r: () => number): boolean | null => { const v = r(); return v < 0.4 ? true : v < 0.7 ? false : null; };
const flags = (r: () => number): StopFlags => ({
  indoorSeating: tri(r), outdoorSeating: tri(r), toilets: tri(r), takeaway: tri(r), kitchenHours: r() < 0.3 ? 'Mo-Su 11:30-14:00' : null, bikeParking50m: r() < 0.4,
});
const CONTACTS = [
  { phones: ['+49 7221 123456', '+49 171 1234567'], website: 'https://example.invalid/camp' },
  { phones: ['Tel. nach Vereinbarung'], website: null },
  { phones: [], website: 'https://example.invalid/only-web' },
  null,
];

let counter = 0;
const label: Record<PlaceKind, string> = {
  water: 'Tap', shop: 'Shop', cafe: 'Cafe', restaurant: 'Restaurant', fuel_shop: 'Fuel Shop', campsite: 'Campsite', shelter: 'Shelter', hut: 'Hut',
  lodging: 'Lodging', bike_shop: 'Bike Shop', repair_station: 'Repair Station', air: 'Air', pharmacy: 'Pharmacy', hospital: 'Hospital',
  station: 'Station', toilets: 'Toilets', settlement: 'Village', drink: 'Pub', ice_cream: 'Ice Cream',
};

// A place of one kind with plausible tags. `variant` picks between the forms a kind can take.
function details(kind: PlaceKind, r: () => number, variant: number): Partial<Place> {
  const hours = HOURS[variant % HOURS.length]!;
  switch (kind) {
    case 'water': {
      const cls = pick(r, ['A', 'A', 'B', 'C'] as const);
      const tags: Record<string, string> = cls === 'A' ? { amenity: 'drinking_water' } : cls === 'B' ? { natural: 'spring', drinking_water: 'yes' } : { natural: 'spring' };
      return { waterClass: cls, tags };
    }
    case 'shop': return { openingHours: hours, tags: { shop: pick(r, ['bakery', 'supermarket', 'convenience', 'kiosk']) }, stop: flags(r) };
    case 'cafe': return { openingHours: hours, tags: { amenity: pick(r, ['cafe', 'fast_food']) }, stop: flags(r) };
    case 'restaurant': return { openingHours: hours, tags: { amenity: 'restaurant' }, stop: flags(r) };
    case 'drink': return { openingHours: hours, tags: { amenity: pick(r, ['pub', 'biergarten']) }, stop: flags(r) };
    case 'ice_cream': return { openingHours: hours, tags: { amenity: 'ice_cream' }, stop: flags(r) };
    case 'fuel_shop': return { openingHours: hours, tags: { amenity: 'fuel', shop: 'convenience' }, stop: flags(r) };
    case 'campsite': return { tags: { tourism: 'camp_site' }, contact: CONTACTS[variant % CONTACTS.length]! };
    case 'shelter': return { tags: { amenity: 'shelter', shelter_type: pick(r, ['lean_to', 'weather_shelter', 'wetterpilz', 'picnic_shelter']), bench: pick(r, ['yes', 'no']) } };
    case 'hut': return { tags: { tourism: 'alpine_hut' }, contact: CONTACTS[variant % CONTACTS.length]! };
    case 'lodging': return { tags: { tourism: pick(r, ['hostel', 'guest_house', 'hotel']) }, contact: CONTACTS[variant % CONTACTS.length]! };
    case 'bike_shop': return { openingHours: hours, tags: { shop: 'bicycle' }, contact: CONTACTS[variant % CONTACTS.length]! };
    case 'repair_station': return { tags: { amenity: 'bicycle_repair_station' } };
    case 'air': return { tags: { amenity: 'compressed_air' } };
    case 'pharmacy': return { openingHours: hours, tags: { amenity: 'pharmacy' } };
    case 'hospital': return { tags: { amenity: 'hospital', emergency: pick(r, ['yes', 'no']) } };
    case 'station': return { tags: { railway: pick(r, ['station', 'halt']) }, platformRoof: variant % 2 === 0 };
    case 'toilets': return { openingHours: hours, tags: { amenity: 'toilets', fee: pick(r, ['yes', 'no']) } };
    case 'settlement': return { tags: { place: pick(r, ['village', 'town']), population: String(200 + Math.floor(r() * 9000)) } };
  }
}

type Anchor = { i: number; offsetM: number };
type Special = { kind: PlaceKind; edit: Partial<Place>; offsetM?: number; at?: number /* index fraction override */ };

// Things every pack must hold (the contract of sub-project 2, "Each fixture pack carries").
function specials(): Special[] {
  const s: Special[] = [];
  const add = (kind: PlaceKind, edit: Partial<Place> = {}, offsetM = 60) => s.push({ kind, edit, offsetM });
  add('water', { waterClass: 'A', tags: { amenity: 'drinking_water' } });
  add('water', { waterClass: 'A', tags: { amenity: 'drinking_water' }, seasonal: 'Apr-Oct' });
  add('water', { waterClass: 'B', tags: { natural: 'spring', drinking_water: 'yes' } });
  add('water', { waterClass: 'C', tags: { natural: 'spring' } });
  add('water', { waterClass: 'C', tags: { man_made: 'water_tap', in_cemetery: 'yes' } });
  add('water', { waterClass: 'A', indoorOrLimited: true, tags: { amenity: 'water_point', access: 'customers' } });
  add('toilets', { waterClass: 'A', indoorOrLimited: true, openingHours: 'Mo-Su 08:00-20:00', tags: { amenity: 'toilets', drinking_water: 'yes' } });
  add('shop', { waterClass: 'B', openingHours: 'Mo-Sa 07:00-18:00', tags: { shop: 'bakery', 'drinking_water:refill': 'yes' } });
  add('shop', { openingHours: 'Mo-Sa 08:00-12:00', tags: { shop: 'bakery' } });
  add('shop', { openingHours: null, tags: { shop: 'convenience' } });
  add('shop', { openingHours: 'Mo-Fr 25:00-26:00', tags: { shop: 'kiosk' } });
  add('shop', { openingHours: 'Mo-Su 08:00-22:00; PH off', tags: { shop: 'supermarket' } });
  add('shelter', { tags: { amenity: 'shelter', shelter_type: 'lean_to' } });
  add('shelter', { tags: { amenity: 'shelter', shelter_type: 'weather_shelter', bench: 'yes' } });
  add('shelter', { tags: { amenity: 'shelter', shelter_type: 'weather_shelter' } });
  add('shelter', { tags: { amenity: 'shelter', shelter_type: 'wetterpilz', bench: 'yes' } });
  add('shelter', { tags: { amenity: 'shelter', shelter_type: 'picnic_shelter' } });
  add('station', { platformRoof: true, tags: { railway: 'station' } }, 200);
  add('station', { platformRoof: false, tags: { railway: 'halt' } }, 200);
  add('campsite', { tags: { tourism: 'camp_site' }, contact: CONTACTS[0]! });
  add('lodging', { tags: { tourism: 'guest_house' }, contact: CONTACTS[1]! });
  add('bike_shop', { openingHours: 'Mo-Fr 09:00-18:00', tags: { shop: 'bicycle' }, contact: CONTACTS[2]! });
  add('hut', { tags: { tourism: 'alpine_hut' }, contact: null });
  add('cafe', { openingHours: 'Mo-Su 09:00-18:00', tags: { amenity: 'cafe' }, stop: { indoorSeating: true, outdoorSeating: true, toilets: true, takeaway: true, kitchenHours: 'Mo-Su 11:30-14:00', bikeParking50m: true } });
  add('cafe', { openingHours: 'Mo-Su 10:00-20:00', tags: { amenity: 'fast_food' }, stop: { indoorSeating: false, outdoorSeating: null, toilets: null, takeaway: true, kitchenHours: null, bikeParking50m: false } });
  add('fuel_shop', { openingHours: 'Mo-Su 06:00-22:00', tags: { amenity: 'fuel', shop: 'convenience' } });
  for (const k of ALL_KINDS) add(k);
  return s;
}

export type BuiltPack = { content: TileContent; countries: Partial<Record<CountryCode, number>> };

function buildContent(route: BuiltRoute, density: number, seed: number): TileContent {
  const r = rng(seed + hashText(route.id) * 7);
  const pts = route.points;
  const lengthKm = pathKm(pts);
  const pointAt = ({ i, offsetM }: Anchor): { lat: number; lon: number } => {
    const p = pts[i]!; const a = pts[Math.max(0, i - 1)]!; const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const cos = Math.cos((p.lat * Math.PI) / 180);
    let dx = (b.lon - a.lon) * cos; let dy = b.lat - a.lat;
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    return { lat: r5(p.lat + (dx * offsetM) / M_PER_DEG), lon: r5(p.lon + (-dy * offsetM) / (M_PER_DEG * cos)) };
  };
  const total = Math.round(lengthKm * density);
  const sp = specials();
  const places: Place[] = [];
  const weightSum = WEIGHTS.reduce((s, [, n]) => s + n, 0);
  const pickKind = (): PlaceKind => { let v = r() * weightSum; for (const [k, n] of WEIGHTS) { v -= n; if (v < 0) return k; } return 'shop'; };
  const anchor = (k: PlaceKind, offsetM?: number): Anchor => {
    const i = Math.floor(r() * pts.length);
    const dist = offsetM ?? Math.round(RADIUS_M[k] * r() * r());
    return { i, offsetM: r() < 0.5 ? dist : -dist };
  };
  for (let n = 0; n < total || n < sp.length; n++) {
    const s = sp[n];
    const kind = s?.kind ?? pickKind();
    const a = s ? { ...anchor(kind, s.offsetM), i: Math.floor(((n + 0.5) / sp.length) * (pts.length - 1)) } : anchor(kind);
    const z = ZONES[route.zoneKeys[a.i]!];
    const pos = pointAt(a);
    counter++;
    const base = placeAt(kind, pos.lat, pos.lon, {
      id: `${pick(r, ['n', 'n', 'w'])}${1_000_000 + counter * 7 + (hashText(route.id) % 1000) * 100000}`,
      name: `Test ${label[kind]} ${n + 1}`,
      country: z.country, subdivision: z.subdivision, hoursRegionKey: z.hoursRegionKey, holidayZone: z.holidayZone, timeZone: COUNTRIES[z.country].timeZone,
      ...details(kind, r, n),
    });
    places.push({ ...base, ...(s?.edit ?? {}) });
  }

  // The out-and-back guarantee: one tap that both legs pass within 1 km.
  if (route.id === 'out-and-back') {
    const i = Math.floor(pts.length / 4);
    const pos = pointAt({ i, offsetM: 20 });
    places.push(placeAt('water', pos.lat, pos.lon, { id: 'n9000001', name: 'Test Shared Tap', tags: { amenity: 'drinking_water' }, waterClass: 'A' }));
  }

  const roofs: Roof[] = [];
  const nRoofs = Math.max(8, Math.round(lengthKm * 0.4));
  for (let n = 0; n < nRoofs; n++) {
    const a = anchor('water', Math.round(300 * r()));
    const p = pointAt({ i: n < 4 ? Math.floor(((n + 0.5) / 4) * (pts.length - 1)) : a.i, offsetM: a.offsetM });
    roofs.push(roofAt(p.lat, p.lon, { kind: n % 2 === 0 ? 'bus_stop' : 'bike_parking', bench: n % 4 < 2 }));
  }
  const rescue: PackRescuePoint[] = [];
  const nRescue = Math.max(6, Math.round(lengthKm / 10));
  for (let n = 0; n < nRescue; n++) {
    const near = n % 2 === 0;
    const dist = near ? Math.round(250 * r()) : 400 + Math.round(2400 * r());
    const i = Math.floor(((n + 0.5) / nRescue) * (pts.length - 1));
    const p = pointAt({ i, offsetM: r() < 0.5 ? dist : -dist });
    rescue.push(rescueAt(p.lat, p.lon, `T${n + 1}-${100 + Math.floor(r() * 900)}`));
  }
  // Unique ids: the counter and route hash make collisions unlikely; check anyway.
  const ids = new Set(places.map((p) => p.id));
  if (ids.size !== places.length) throw new Error(`duplicate place ids in ${route.id}`);
  return { places, roofs, rescuePoints: rescue };
}

// ---------- packs ----------
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
export const BUILD_ID = '20261028-1';

export function packFiles(content: TileContent, base: { buildId: string; builtAt: string; kinds: PlaceKind[]; countries?: PackManifest['countries'] }): { manifest: PackManifest; files: Map<string, string> } {
  const groups = new Map<string, TileContent & { id: { z: number; x: number; y: number } }>();
  const group = (lat: number, lon: number) => {
    const id = tileOf(lat, lon, PACK_TILE_LEVEL);
    const key = `${id.z}/${id.x}/${id.y}`;
    let g = groups.get(key);
    if (!g) { g = { id, places: [], roofs: [], rescuePoints: [] }; groups.set(key, g); }
    return g;
  };
  for (const p of content.places) group(p.lat, p.lon).places.push(p);
  for (const p of content.roofs) group(p.lat, p.lon).roofs.push(p);
  for (const p of content.rescuePoints) group(p.lat, p.lon).rescuePoints.push(p);
  const files = new Map<string, string>();
  const tiles: ManifestTile[] = [];
  for (const key of [...groups.keys()].sort()) {
    const g = groups.get(key)!;
    const text = encodeTile(g, g.id);
    files.set(`t/${key}.json`, text);
    tiles.push({ ...g.id, sha256: sha256(text), bytes: Buffer.byteLength(text), gzipBytes: gzipSync(text, { level: 9 }).length,
                 places: g.places.length, roofs: g.roofs.length, rescuePoints: g.rescuePoints.length });
  }
  const counts: Record<string, number> = {};
  for (const p of content.places) counts[p.country] = (counts[p.country] ?? 0) + 1;
  const countries: PackManifest['countries'] = {};
  for (const c of Object.keys(counts).sort()) {
    const old = base.countries?.[c];
    countries[c] = { status: old?.status ?? 'fresh', builtOn: old?.builtOn ?? base.builtAt.slice(0, 10), sourceDate: old?.sourceDate ?? FIXTURE_DATA_DATE, places: counts[c]! };
  }
  const manifest: PackManifest = {
    v: 1, buildId: base.buildId, builtAt: base.builtAt,
    licence: { name: 'ODbL-1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors', buildCode: 'https://github.com/Valionium/wayfinch' },
    countries, kinds: base.kinds, tiles,
  };
  return { manifest, files };
}

/** Every fixture file as relative path → text. Nothing is written. */
export function buildFixtures(opts: { seed: number; builtAt: string }): Map<string, string> {
  counter = 0;
  const out = new Map<string, string>();
  for (const spec of SPECS) {
    const route = buildRoute(spec.id, opts.seed);
    out.set(`routes/${spec.id}.json`, JSON.stringify({ id: spec.id, name: spec.name, points: route.points }) + '\n');
    const content = buildContent(route, spec.density, opts.seed);
    const { manifest, files } = packFiles(content, { buildId: BUILD_ID, builtAt: opts.builtAt, kinds: [...ALL_KINDS] });
    out.set(`packs/${spec.id}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
    for (const [path, text] of files) out.set(`packs/${spec.id}/${path}`, text);
  }
  return out;
}

export function readCommittedFixtures(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^(routes|packs)[\\/]/.test(relative(FIXTURE_ROOT, full)) && /\.json$/.test(name)) out.set(relative(FIXTURE_ROOT, full).split('\\').join('/'), readFileSync(full, 'utf8'));
    }
  };
  walk(join(FIXTURE_ROOT, 'routes'));
  walk(join(FIXTURE_ROOT, 'packs'));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = buildFixtures({ seed: 20261030, builtAt: '2026-10-28T00:00:00Z' });
  rmSync(join(FIXTURE_ROOT, 'routes'), { recursive: true, force: true });
  for (const id of FIXTURE_IDS) rmSync(join(FIXTURE_ROOT, 'packs', id), { recursive: true, force: true });
  for (const [path, text] of files) {
    const full = join(FIXTURE_ROOT, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  console.log(`wrote ${files.size} files`);
}
