// One-line builders that state a case (spec section 12.2): flatRoute(90), shop('Mo-Sa 08:00-12:00').atKm(30),
// sun({ sunset: '17:00' }). Engine tests, the simulator and the contract tests all use them.
//
// Every built route runs due north from one fixed point, so a kilometre maps to a position by arithmetic, and a
// place "400 m off the route at km 30" is exactly that far east of the route's point at km 30.
import { zoneOffsetMin } from '../../src/core/answers/time.ts';
import type { PackRescuePoint, Place, PlaceKind, Roof, StopFlags } from '../../src/core/places/types.ts';
import type { Km, Position, Route, Stage, SunSource, SunTimes, Trip, ZoneLookup, ZoneSpan } from '../../src/core/types.ts';
import { placeAt, roofAt } from './places.ts';

const EARTH_RADIUS_KM = 6371; // the radius src/core/geo/haversine.ts uses, so kilometres match its running totals
const LAT0 = 49;
const LON0 = 8.4;
const BERLIN = 'Europe/Berlin';
const deg = (rad: number): number => (rad * 180) / Math.PI;

/** The point on the built routes at kilometre `km`, `offM` metres to the east (`side: 'west'` for the other side). */
export function pointAtKm(km: Km, offM = 0, side: 'east' | 'west' = 'east'): { lat: number; lon: number } {
  const lat = LAT0 + deg(km / EARTH_RADIUS_KM);
  const dLon = deg(offM / 1000 / (EARTH_RADIUS_KM * Math.cos((lat * Math.PI) / 180)));
  return { lat, lon: LON0 + (side === 'east' ? dLon : -dLon) };
}

// ---- time ----------------------------------------------------------------------------------------------------------

/** `at('2026-10-17 14:20')`: that wall-clock time in Europe/Berlin (or another zone) as an instant. */
export function at(text: string, tz: string = BERLIN): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) throw new Error(`at(): cannot read "${text}"`);
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  let utc = wall - zoneOffsetMin(new Date(wall), tz) * 60_000;
  utc = wall - zoneOffsetMin(new Date(utc), tz) * 60_000;
  return new Date(utc);
}

type SunSpec = { sunset?: string | null; dusk?: string | null; dawn?: string | null; sunrise?: string | null; lightAllNight?: boolean };

/** Sun times stubbed as local wall-clock times of the riding date: `sun({ sunset: '17:00' })`. */
export function sun(spec: SunSpec = {}, tz: string = BERLIN): SunSource {
  const pick = (key: 'sunset' | 'dusk' | 'dawn' | 'sunrise', fallback: string): string | null =>
    key in spec ? (spec[key] ?? null) : fallback;
  return (_lat, _lon, ridingDate): SunTimes => {
    const when = (hm: string | null): Date | null => (hm === null ? null : at(`${ridingDate} ${hm}`, tz));
    return {
      dawn: when(pick('dawn', '07:20')), sunrise: when(pick('sunrise', '07:55')),
      sunset: when(pick('sunset', '18:42')), dusk: when(pick('dusk', '19:17')),
      lightAllNight: spec.lightAllNight ?? false,
    };
  };
}

/** A position on the route at `km`, `off` metres to the east of it. Manual positions are never approximate. */
export function pos(o: { km: Km; at: string; acc?: number; off?: number; manual?: boolean }): Position {
  const { lat, lon } = pointAtKm(o.km, o.off ?? 0);
  const accuracyM = o.acc ?? 10;
  return {
    lat, lon, accuracyM, at: at(o.at), km: o.km, offRouteM: o.off ?? 0,
    source: o.manual ? 'manual' : 'gps', approximate: !o.manual && accuracyM > 500,
  };
}

// ---- routes and trips ----------------------------------------------------------------------------------------------

/** Loaded speed is 82% of the flat speed (section 6.2); the stage hours of built routes use it. */
const LOADED_FACTOR = 0.82;

/**
 * A flat route of `km` kilometres with a point every kilometre. Heights are 100 m, or all missing with `ele: null`.
 * `stageEnds` (the last one is the route end) splits it into stages. The hash is a stand-in: real routes get theirs
 * from `buildRoute`. The sample grid here is every 10 km plus the stage ends, not the production grid.
 */
export function flatRoute(km: Km, opts: { stageEnds?: Km[]; ele?: number | null; flatKph?: number } = {}): Route {
  const ele = opts.ele === undefined ? 100 : opts.ele;
  const kms: Km[] = [];
  for (let i = 0; i < km; i++) kms.push(i);
  kms.push(km);
  const points = kms.map((k) => ({ ...pointAtKm(k), ele, km: k }));

  const ends = [...new Set([...(opts.stageEnds ?? []).filter((e) => e > 0 && e < km), km])].sort((a, b) => a - b);
  const loadedKph = (opts.flatKph ?? 25) * LOADED_FACTOR;
  const stages: Stage[] = ends.map((end, i) => {
    const start = i === 0 ? 0 : ends[i - 1]!;
    return { day: i + 1, startKm: start, endKm: end, ridingHours: (end - start) / loadedKph, ascentM: ele === null ? null : 0 };
  });
  const grid = new Set<Km>([0, km, ...ends]);
  for (let k = 10; k < km; k += 10) grid.add(k);

  return {
    id: 'test-route', name: 'Test route', points, lengthKm: km, ascentM: ele === null ? null : 0, stages, climbs: [],
    source: 'planned', sampleGrid: [...grid].sort((a, b) => a - b), hash: `flat-${km}`,
  };
}

/** The standard trip of the plan: stage ends at km 78, 150, 222 and 300, leaving Saturday 17 October 2026 at 08:30. */
export function testTrip(over: Partial<Trip> = {}): Trip {
  return {
    route: flatRoute(300, { stageEnds: [78, 150, 222, 300] }), departureDate: '2026-10-17', startTime: '08:30',
    flatKph: 25, stay: 'camping', campWaterL: 2, ...over,
  };
}

/** The whole route in one time zone, as `routeZones` and `ZoneLookup` want it. */
export const zonesOf = (lengthKm: Km, timeZone: string = BERLIN): ZoneSpan[] => [{ fromKm: 0, toKm: lengthKm, timeZone, holidayZone: null, country: 'DE' }];
export const zoneAt = (lengthKm: Km, timeZone: string = BERLIN): ZoneLookup => () => zonesOf(lengthKm, timeZone)[0]!;

// ---- places, roofs, rescue points ---------------------------------------------------------------------------------

export type AtOptions = { off?: number; side?: 'east' | 'west'; id?: string };
export type PlaceBuilder = { atKm(km: Km, o?: AtOptions): Place };
export type RoofBuilder = { atKm(km: Km, o?: AtOptions): Roof };
export type RescueBuilder = { atKm(km: Km, o?: AtOptions): PackRescuePoint };
export type PlaceOptions = Omit<Partial<Place>, 'tags'> & { tags?: Record<string, string> };

/** FNV-1a, so that the same builder at the same spot always gets the same id, and different ones differ. */
function idFor(label: string, km: Km, off: number, side: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${label}|${km}|${off}|${side}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return `n${h}`;
}

const FOOD_FLAGS: StopFlags = { indoorSeating: null, outdoorSeating: null, toilets: null, takeaway: null, kitchenHours: null, bikeParking50m: false };

function builder(label: string, kind: PlaceKind, tags: Record<string, string>, hours: string | null, opts: PlaceOptions, base: Partial<Place> = {}): PlaceBuilder {
  return {
    atKm(km, o = {}) {
      const off = o.off ?? 0;
      const side = o.side ?? 'east';
      const { lat, lon } = pointAtKm(km, off, side);
      const { tags: extra, ...rest } = opts;
      return placeAt(kind, lat, lon, {
        id: o.id ?? idFor(label, km, off, side), openingHours: hours, ...base, ...rest, tags: { ...tags, ...extra },
      });
    },
  };
}

const food = (label: string, kind: PlaceKind, tags: Record<string, string>, hours: string | null, opts: PlaceOptions): PlaceBuilder =>
  builder(label, kind, tags, hours, opts, { stop: { ...FOOD_FLAGS } });

/** A convenience shop. `shop('Mo-Sa 08:00-12:00').atKm(30, { off: 400 })`; `null` hours are untagged. */
export const shop = (hours: string | null, opts: PlaceOptions = {}): PlaceBuilder => food('shop', 'shop', { shop: 'convenience' }, hours, opts);
export const bakery = (hours: string | null, opts: PlaceOptions = {}): PlaceBuilder => food('bakery', 'shop', { shop: 'bakery' }, hours, opts);
export const supermarket = (hours: string | null, opts: PlaceOptions = {}): PlaceBuilder => food('supermarket', 'shop', { shop: 'supermarket' }, hours, opts);
export const kiosk = (hours: string | null, opts: PlaceOptions = {}): PlaceBuilder => food('kiosk', 'shop', { shop: 'kiosk' }, hours, opts);
export const fuelShop = (hours: string | null, opts: PlaceOptions = {}): PlaceBuilder => food('fuel', 'fuel_shop', { amenity: 'fuel', shop: 'convenience' }, hours, opts);
export const cafe = (hours: string | null, opts: PlaceOptions = {}): PlaceBuilder => food('cafe', 'cafe', { amenity: 'cafe' }, hours, opts);
export const fastFood = (hours: string | null, opts: PlaceOptions = {}): PlaceBuilder => food('fastfood', 'cafe', { amenity: 'fast_food' }, hours, opts);
export const restaurant = (hours: string | null, opts: PlaceOptions = {}): PlaceBuilder => food('restaurant', 'restaurant', { amenity: 'restaurant' }, hours, opts);

/** An outdoor drinking-water tap (class A). */
export const tap = (opts: PlaceOptions = {}): PlaceBuilder =>
  builder('tap', 'water', { amenity: 'drinking_water' }, null, opts, { waterClass: 'A' });
export const toilet = (hours: string | null, opts: PlaceOptions = {}): PlaceBuilder => builder('toilet', 'toilets', { amenity: 'toilets' }, hours, opts);
export const campsite = (opts: PlaceOptions = {}): PlaceBuilder => builder('campsite', 'campsite', { tourism: 'camp_site' }, null, opts);
/** A weather shelter. Lean-tos and basic huts are `shelter` too: pass `tags: { shelter_type: 'lean_to' }`. */
export const shelter = (opts: PlaceOptions = {}): PlaceBuilder =>
  builder('shelter', 'shelter', { amenity: 'shelter', shelter_type: 'weather_shelter' }, null, opts);
export const hut = (opts: PlaceOptions = {}): PlaceBuilder => builder('hut', 'hut', { tourism: 'alpine_hut' }, null, opts);
export const lodging = (opts: PlaceOptions = {}): PlaceBuilder => builder('lodging', 'lodging', { tourism: 'hotel' }, null, opts);
export const pharmacy = (hours: string | null, opts: PlaceOptions = {}): PlaceBuilder => builder('pharmacy', 'pharmacy', { amenity: 'pharmacy' }, hours, opts);
export const hospital = (opts: PlaceOptions = {}): PlaceBuilder => builder('hospital', 'hospital', { amenity: 'hospital', emergency: 'yes' }, null, opts);
export const station = (opts: PlaceOptions = {}): PlaceBuilder => builder('station', 'station', { railway: 'station' }, null, opts);
export const bikeShop = (hours: string | null, opts: PlaceOptions = {}): PlaceBuilder => builder('bikeshop', 'bike_shop', { shop: 'bicycle' }, hours, opts);
export const repairStation = (opts: PlaceOptions = {}): PlaceBuilder => builder('repair', 'repair_station', { amenity: 'bicycle_repair_station' }, null, opts);
export const settlement = (name: string, opts: PlaceOptions = {}): PlaceBuilder =>
  builder(`settlement-${name}`, 'settlement', { place: 'village' }, null, { name, ...opts });

/** A roof of the lean layer: a bus stop (default) or bike parking. They have no id or name. */
export const busStop = (o: { bench?: boolean } = {}): RoofBuilder => ({
  atKm(km, at2 = {}) {
    const { lat, lon } = pointAtKm(km, at2.off ?? 0, at2.side ?? 'east');
    return roofAt(lat, lon, { kind: 'bus_stop', bench: o.bench ?? false });
  },
});
export const bikeParking = (o: { bench?: boolean } = {}): RoofBuilder => ({
  atKm(km, at2 = {}) {
    const { lat, lon } = pointAtKm(km, at2.off ?? 0, at2.side ?? 'east');
    return roofAt(lat, lon, { kind: 'bike_parking', bench: o.bench ?? false });
  },
});

/** A rescue point as a pack holds it: `rescue('KA-145').atKm(77.4, { off: 80 })`. */
export const rescue = (ref: string): RescueBuilder => ({
  atKm(km, o = {}) {
    const { lat, lon } = pointAtKm(km, o.off ?? 0, o.side ?? 'east');
    return { lat, lon, ref };
  },
});
