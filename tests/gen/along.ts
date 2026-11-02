// Places, roofs and rescue points along a route (spec section 12.2): sub-project 2's `place()` values set at route
// kilometres, on every category radius, on several passes of the route, with `hoursValue()`, and now and then with the odd
// tags real map data holds. Matches come from the real matching, so a place on an out-and-back has one match per pass.
import fc from 'fast-check';
import type { PlaceKind } from '../../src/core/places/types.ts';
import { matchRescuePoints } from '../../src/core/route/matches.ts';
import { pointAtRouteKm } from '../../src/core/geo/project.ts';
import type { Place, RescuePoint, Roof, Route } from '../../src/core/types.ts';
import { place } from './places.ts';
import { rescuePoint, roof } from './packs.ts';
import { DISTANCES_M, onThreshold } from './thresholds.ts';

const EARTH_KM = 6371;
const RAD = Math.PI / 180;

/** The kinds with the tags that make each what it is. */
const TAGS: [PlaceKind, Record<string, string>[]][] = [
  ['water', [{ amenity: 'drinking_water' }, { man_made: 'water_tap', drinking_water: 'yes' }, { in_cemetery: 'yes', amenity: 'drinking_water' }]],
  ['shop', [{ shop: 'supermarket' }, { shop: 'convenience' }, { shop: 'bakery' }, { shop: 'kiosk' }, { shop: 'butcher' }]],
  ['fuel_shop', [{ amenity: 'fuel', shop: 'convenience' }]],
  ['cafe', [{ amenity: 'cafe', indoor_seating: 'yes' }, { amenity: 'cafe' }, { amenity: 'fast_food' }]],
  ['restaurant', [{ amenity: 'restaurant' }]],
  ['drink', [{ amenity: 'biergarten' }, { amenity: 'pub' }]],
  ['ice_cream', [{ amenity: 'ice_cream' }]],
  ['toilets', [{ amenity: 'toilets' }, { amenity: 'toilets', access: 'private' }]],
  ['campsite', [{ tourism: 'camp_site', reservation: 'yes', fee: 'yes' }, { tourism: 'camp_site' }]],
  ['lodging', [{ tourism: 'hotel' }, { tourism: 'hostel' }]],
  ['hut', [{ tourism: 'alpine_hut' }, { tourism: 'wilderness_hut', locked: 'no' }]],
  ['shelter', [{ amenity: 'shelter', shelter_type: 'weather_shelter' }, { amenity: 'shelter', shelter_type: 'lean_to' }, { amenity: 'shelter', shelter_type: 'basic_hut' }, { amenity: 'shelter', shelter_type: 'picnic_shelter', bench: 'yes' }]],
  ['bike_shop', [{ shop: 'bicycle' }]],
  ['repair_station', [{ amenity: 'bicycle_repair_station' }]],
  ['air', [{ amenity: 'compressed_air' }]],
  ['pharmacy', [{ amenity: 'pharmacy' }]],
  ['station', [{ railway: 'station' }, { railway: 'halt' }]],
  ['hospital', [{ amenity: 'hospital', emergency: 'yes' }, { amenity: 'hospital', emergency: 'no' }, { amenity: 'hospital' }]],
  ['settlement', [{ place: 'village' }, { place: 'town' }]],
];
const TAGS_OF = new Map(TAGS);
/**
 * The classes real packs hold (src/core/places/water.ts): class D never reaches a pack (pack-format.ts refuses it). A shop, café or fuel-station shop has no water class: section 6.0
 * makes it a source by its hours. Only a refill venue among them is class B. Toilets are class A with drinking_water=yes,
 * and such a point inside a building or with limited access counts by its hours.
 */
function waterOf(kind: PlaceKind, n: number): Pick<Place, 'waterClass' | 'indoorOrLimited'> {
  switch (kind) {
    case 'water': {
      const pick = n % 10;
      if (pick === 8) return { waterClass: 'B', indoorOrLimited: false }; // a spring with a drinking tag, a tap with none
      if (pick === 9) return { waterClass: 'C', indoorOrLimited: false }; // a spring with no tag, a cemetery tap
      return { waterClass: 'A', indoorOrLimited: pick < 2 };
    }
    case 'toilets': return n % 2 === 0 ? { waterClass: 'A', indoorOrLimited: true } : { waterClass: null, indoorOrLimited: false };
    case 'shop': case 'cafe': case 'fuel_shop': return n % 10 === 0 ? { waterClass: 'B', indoorOrLimited: true } : { waterClass: null, indoorOrLimited: false };
    default: return { waterClass: null, indoorOrLimited: false };
  }
}

const ODD_VALUES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'] as const;
const ODD_HOURS = ['Mo-Fr', 'Mo-Su open', 'PH', 'PH off', 'Su,PH off; Mo-Sa 08:00-20:00', 'Mar-Oct', 'constructor', '__proto__', 'sunrise-sunset', 'open', 'Mo-Fr 08:00-12:00; Sa', ''] as const;

const oddTags = (kind: PlaceKind, odd: string): Record<string, string> => {
  const tags = JSON.parse(`{"__proto__":"${odd}"}`) as Record<string, string>;
  tags['shop'] = odd;
  tags['amenity'] = odd;
  tags['shelter_type'] = odd;
  tags['reservation'] = odd;
  tags['fee'] = odd;
  tags['railway'] = odd;
  if (kind === 'shop') tags['indoor_seating'] = odd;
  return tags;
};

type PlaceChoice = { base: Place; kind: PlaceKind; tagAt: number; where: number; off: number; side: number; stageEnd: boolean; odd: number; oddValue: string; oddHours: string; n: number };

const placeChoice = (): fc.Arbitrary<PlaceChoice> => fc.record({
  base: place(),
  kind: fc.constantFrom<PlaceKind>(...TAGS.map(([k]) => k), 'water', 'water', 'water', 'shop', 'shop', 'shop', 'cafe', 'cafe', 'campsite', 'settlement', 'settlement'),
  tagAt: fc.nat(9),
  where: fc.integer({ min: 0, max: 10_000 }),
  off: onThreshold(DISTANCES_M, fc.integer({ min: 0, max: 400 })),
  side: fc.constantFrom(1, -1),
  stageEnd: fc.integer({ min: 0, max: 9 }).map((n) => n === 0),
  odd: fc.integer({ min: 0, max: 19 }),
  oddValue: fc.constantFrom(...ODD_VALUES),
  oddHours: fc.constantFrom(...ODD_HOURS),
  n: fc.nat(99_999),
});

function pointAside(route: Route, km: number, offM: number): { lat: number; lon: number } {
  const p = pointAtRouteKm(route, km);
  return { lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round((p.lon + (offM / 1000 / (EARTH_KM * Math.cos(p.lat * RAD))) / RAD) * 1e5) / 1e5 };
}

function placeOf(route: Route, c: PlaceChoice, index: number): Place {
  const stage = route.stages[c.where % Math.max(1, route.stages.length)];
  const km = c.stageEnd && stage ? stage.endKm : (c.where / 10_000) * route.lengthKm;
  const tagList = TAGS_OF.get(c.kind) ?? [{}];
  const odd = c.odd === 0;
  const { lat, lon } = pointAside(route, km, c.off * c.side);
  const name = odd ? c.oddValue : c.kind === 'settlement' ? `Town ${c.n % 400}` : c.base.name;
  return {
    ...c.base, id: `n${index}${c.n}`, kind: c.kind, lat, lon, name, tags: odd ? oddTags(c.kind, c.oddValue) : { ...tagList[c.tagAt % tagList.length]! },
    ...waterOf(c.kind, c.n),
    openingHours: c.odd === 1 ? c.oddHours : c.base.openingHours, seasonal: odd ? c.oddValue : c.kind === 'water' ? c.base.seasonal : null,
    stop: ['shop', 'cafe', 'restaurant', 'drink', 'ice_cream', 'fuel_shop'].includes(c.kind) ? (c.base.stop ?? { indoorSeating: null, outdoorSeating: null, toilets: null, takeaway: null, kitchenHours: null, bikeParking50m: false }) : null,
    contact: ['campsite', 'lodging', 'hut', 'bike_shop'].includes(c.kind) ? c.base.contact : null,
    platformRoof: c.kind === 'station' ? c.base.platformRoof : null,
  };
}

/** Density follows the route: a few places a kilometre at most, none at all on some. */
export function placesAlong(route: Route): fc.Arbitrary<{ places: Place[]; roofs: Roof[]; rescuePoints: RescuePoint[] }> {
  const most = Math.min(60, 3 + Math.ceil(route.lengthKm / 4));
  return fc.record({
    places: fc.array(placeChoice(), { maxLength: most, size: 'max' }),
    roofs: fc.array(fc.record({ base: roof(), where: fc.integer({ min: 0, max: 10_000 }), off: onThreshold(DISTANCES_M, fc.integer({ min: 0, max: 200 })) }), { maxLength: 6 }),
    rescue: fc.array(fc.record({ base: rescuePoint(), where: fc.integer({ min: 0, max: 10_000 }), off: onThreshold(DISTANCES_M, fc.integer({ min: 0, max: 400 })) }), { maxLength: 3 }),
    brokenFirst: fc.integer({ min: 0, max: 29 }),
  }).map((r) => {
    const places = r.places.map((c, i) => placeOf(route, c, i));
    // A broken record first in the list, where a loop that stops at the first bad item would lose them all.
    if (r.brokenFirst === 0 && places[0]) places.unshift({ ...places[0], id: 'n1', lat: Number.NaN, lon: Infinity, dataDate: 'not a date' });
    const roofs = r.roofs.map((x) => ({ ...x.base, ...pointAside(route, (x.where / 10_000) * route.lengthKm, x.off) }));
    const rescue = r.rescue.map((x) => ({ ...x.base, ...pointAside(route, (x.where / 10_000) * route.lengthKm, x.off) }));
    if (r.brokenFirst === 1 && rescue[0]) rescue[0] = { ...rescue[0], lat: Number.NaN };
    return { places, roofs, rescuePoints: matchRescuePoints(rescue, route) };
  });
}
