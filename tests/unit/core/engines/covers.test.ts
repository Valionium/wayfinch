import { describe, expect, test } from 'vitest';
import { coverAt, seatingLine, type NotCover } from '../../../../src/core/engines/covers.ts';
import type { Cover, Place, PlaceHours } from '../../../../src/core/types.ts';
import { at, bakery, busStop, bikeParking, cafe, fastFood, fuelShop, hut, kiosk, restaurant, shelter, shop, station, supermarket, type PlaceOptions } from '../../../fixtures/build.ts';
import { placeAt } from '../../../fixtures/places.ts';
import { hoursOf, SAT } from './water-helpers.ts';

const T = at(`${SAT} 12:00`);
const seats = (yes: boolean | null): PlaceOptions => ({ stop: { indoorSeating: yes, outdoorSeating: null, toilets: null, takeaway: null, kitchenHours: null, bikeParking50m: false } });
const openUntil = (p: Place, hm: string): PlaceHours => hoursOf(p, [{ from: '07:00', to: hm }]);
const coverOf = (p: Place, h: PlaceHours | undefined, end: Date | null = null, off = 0, t = T): Cover | NotCover =>
  coverAt({ place: p, match: { placeId: p.id, km: 10, offRouteM: off } }, t, end, h);
const classOf = (r: Cover | NotCover): number | null => ('coverClass' in r ? r.coverClass : null);
const shelterOf = (type: string, more: Record<string, string> = {}): Place => shelter({ tags: { shelter_type: type, ...more } }).atKm(10);
const pack = (kind: Place['kind'], tags: Record<string, string>, over: PlaceOptions = {}): Place => placeAt(kind, 49, 8.4, { id: 'n1', tags, ...over } as Partial<Place>);

describe('classes of cover', () => {
  const c = cafe('x').atKm(10);
  test('[STOP-CLASS] a café with known hours and no end shown: class 1 when open at least 1 h, exactly 1 h included', () => {
    expect(classOf(coverOf(c, openUntil(c, '20:00')))).toBe(1);
    expect(classOf(coverOf(c, openUntil(c, '13:00')))).toBe(1);
    expect(classOf(coverOf(c, openUntil(c, '12:59')))).toBe(2);
  });
  test("[STOP-CLASS] with a shown end: class 1 only when open until the later of t + 30 min and the end", () => {
    expect(classOf(coverOf(c, openUntil(c, '15:00'), at(`${SAT} 15:00`)))).toBe(1);
    expect(classOf(coverOf(c, openUntil(c, '14:59'), at(`${SAT} 15:00`)))).toBe(2);
    expect(classOf(coverOf(c, openUntil(c, '12:30'), at(`${SAT} 12:10`)))).toBe(1);
  });
  test('[STOP-CLASS] closing within 30 minutes of the arrival it is no cover; closed, not listed', () => {
    expect(classOf(coverOf(c, openUntil(c, '12:30')))).toBe(2);
    const r = coverOf(c, openUntil(c, '12:29'));
    expect(classOf(r)).toBeNull();
    expect(r).toMatchObject({ listed: false });
  });
  test('[STOP-CLASS] the cover carries its facts', () => {
    const r = coverOf(c, openUntil(c, '18:00'), null, 120) as Cover;
    expect(r).toMatchObject({ placeId: c.id, roof: null, km: 10, offRouteM: 120, arrival: T, coverClass: 1, lightning: false });
    expect(r.openUntil).toEqual(at(`${SAT} 18:00`));
  });
  test('[STOP-CLASS] a bakery with indoor_seating=yes: class 1, or 2 when it closes earlier', () => {
    const b = bakery('x', seats(true)).atKm(10);
    expect(classOf(coverOf(b, openUntil(b, '18:00')))).toBe(1);
    expect(classOf(coverOf(b, openUntil(b, '12:45')))).toBe(2);
  });
  test('[STOP-CLASS] the seating tag alone counts as well as the flag', () => {
    const b = bakery('x', { tags: { indoor_seating: 'yes' } }).atKm(10);
    expect(classOf(coverOf(b, openUntil(b, '18:00')))).toBe(1);
  });
  test.each([
    ['bakery', () => bakery('x').atKm(10)], ['supermarket', () => supermarket('x').atKm(10)], ['convenience', () => shop('x').atKm(10)],
    ['fuel shop', () => fuelShop('x').atKm(10)], ['fast food', () => fastFood('x').atKm(10)],
  ])('[STOP-CLASS] %s without seating mapped: class 2 for as long as it is open', (_n, make) => {
    const p = make();
    expect(classOf(coverOf(p, openUntil(p, '20:00')))).toBe(2);
  });
  test('[STOP-CLASS] restaurant and pub: class 1', () => {
    const r = restaurant('x').atKm(10);
    expect(classOf(coverOf(r, openUntil(r, '20:00')))).toBe(1);
    const pub = pack('drink', { amenity: 'pub' });
    expect(classOf(coverOf(pub, openUntil(pub, '20:00')))).toBe(1);
  });
  test('[STOP-CLASS] ice-cream parlours and beer gardens only with indoor_seating=yes', () => {
    for (const p of [pack('ice_cream', { amenity: 'ice_cream' }), pack('drink', { amenity: 'biergarten' })]) {
      expect(classOf(coverOf(p, openUntil(p, '20:00')))).toBeNull();
      expect(coverOf(p, openUntil(p, '20:00'))).toMatchObject({ listed: false });
    }
    const g = pack('drink', { amenity: 'biergarten' }, seats(true));
    expect(classOf(coverOf(g, openUntil(g, '20:00')))).toBe(1);
    expect(classOf(coverOf(g, openUntil(g, '12:45')))).toBe(2);
  });
  test('[STOP-CLASS] lean-to and basic hut: 3', () => {
    expect(classOf(coverOf(shelterOf('lean_to'), undefined))).toBe(3);
    expect(classOf(coverOf(shelterOf('basic_hut'), undefined))).toBe(3);
  });
  test('[STOP-CLASS] weather shelter or Wetterpilz with bench: 4; picnic shelter: 4; without bench: 5', () => {
    expect(classOf(coverOf(shelterOf('weather_shelter', { bench: 'yes' }), undefined))).toBe(4);
    expect(classOf(coverOf(shelterOf('wetterpilz', { bench: 'yes' }), undefined))).toBe(4);
    expect(classOf(coverOf(shelterOf('picnic_shelter'), undefined))).toBe(4);
    expect(classOf(coverOf(shelterOf('weather_shelter'), undefined))).toBe(5);
    expect(classOf(coverOf(shelterOf('wetterpilz', { bench: 'no' }), undefined))).toBe(5);
  });
  test('[STOP-CLASS] a bus shelter with the bench bit: 4; without: 5; bike parking: 5, bench or not', () => {
    const roofOf = (r: ReturnType<ReturnType<typeof busStop>['atKm']>): number | null => classOf(coverAt({ roof: r, match: { placeId: '', km: 10, offRouteM: 0 } }, T, null, undefined));
    expect(roofOf(busStop({ bench: true }).atKm(10))).toBe(4);
    expect(roofOf(busStop().atKm(10))).toBe(5);
    expect(roofOf(bikeParking().atKm(10))).toBe(5);
    expect(roofOf(bikeParking({ bench: true }).atKm(10))).toBe(5);
  });
  test('[STOP-CLASS] a station with platformRoof: 5', () => {
    expect(classOf(coverOf(station({ platformRoof: true }).atKm(10), undefined))).toBe(5);
  });
  test('[STOP-CLASS] a roof carries itself', () => {
    const roof = busStop().atKm(10);
    expect(coverAt({ roof, match: { placeId: '', km: 10, offRouteM: 50 } }, T, null, undefined)).toMatchObject({ placeId: null, roof, km: 10, offRouteM: 50, coverClass: 5 });
  });
});

describe('what is never cover', () => {
  test('[STOP-NOT-COVER] a kiosk never, even with seats mapped', () => {
    for (const k of [kiosk('x').atKm(10), kiosk('x', seats(true)).atKm(10)]) {
      expect(coverOf(k, openUntil(k, '20:00'))).toMatchObject({ listed: false });
      expect(classOf(coverOf(k, openUntil(k, '20:00')))).toBeNull();
    }
  });
  test('[STOP-NOT-COVER] indoor_seating=no never, by flag or by tag, whatever the kind', () => {
    for (const p of [cafe('x', seats(false)).atKm(10), restaurant('x', { tags: { indoor_seating: 'no' } }).atKm(10), bakery('x', seats(false)).atKm(10), fuelShop('x', seats(false)).atKm(10)]) {
      expect(classOf(coverOf(p, openUntil(p, '20:00')))).toBeNull();
      expect(coverOf(p, openUntil(p, '20:00'))).toMatchObject({ listed: false });
    }
  });
  test.each([
    ['unknown', undefined, 'hours unknown'], ['may be open', 'may be open, an assumption', 'may be open, an assumption'], ['possibly closed', 'possibly closed — local holiday, an assumption', 'possibly closed — local holiday, an assumption'],
  ])('[STOP-NOT-COVER] hours %s: listed after covers, marked, never counted', (name, reason, shown) => {
    const c = cafe('x').atKm(10);
    const state = name === 'possibly closed' ? 'possibly-closed' as const : 'unknown' as const;
    const h = hoursOf(c, [{ from: '07:00', to: '20:00', state, ...(reason ? { reason } : {}) }]);
    const r = coverOf(c, h);
    expect(classOf(r)).toBeNull();
    expect(r).toMatchObject({ listed: true });
    expect((r as NotCover).notCover).toBe(shown);
  });
  test('[STOP-NOT-COVER] no prepared hours at all: listed, "hours unknown"', () => {
    expect(coverOf(cafe('x').atKm(10), undefined)).toMatchObject({ notCover: 'hours unknown', listed: true });
  });
  test('[STOP-NOT-COVER] open at arrival, then unknown within 30 minutes: listed, not counted', () => {
    const c = cafe('x').atKm(10);
    const h = hoursOf(c, [{ from: '07:00', to: '12:10' }, { from: '12:10', to: '20:00', state: 'unknown', reason: 'hours unknown' }]);
    expect(coverOf(c, h)).toMatchObject({ notCover: 'hours unknown', listed: true });
  });
  test.each([[null], [false]])('[STOP-NOT-COVER] a station within 300 m with platformRoof %s: "station, shelter not mapped"', (roof) => {
    expect(coverOf(station({ platformRoof: roof }).atKm(10), undefined)).toEqual({ notCover: 'station, shelter not mapped', listed: true });
  });
  test('[STOP-NOT-COVER] a station beyond 300 m is not mentioned', () => {
    expect(coverOf(station({ platformRoof: true }).atKm(10), undefined, null, 301)).toMatchObject({ listed: false });
    expect(coverOf(station({ platformRoof: null }).atKm(10), undefined, null, 301)).toMatchObject({ listed: false });
  });
  test.each(['field_shelter', 'sun_shelter', 'pergola', 'gazebo', 'pavilion', 'rock_shelter', 'shopping_cart', 'smoking', 'public_transport', 'constructor', '__proto__', 'toString', ''])('[STOP-NOT-COVER] shelter_type %s never', (type) => {
    expect(coverOf(shelterOf(type), undefined)).toMatchObject({ listed: false });
  });
  test('[STOP-NOT-COVER] a shelter without a type never', () => {
    expect(coverOf(shelter({ tags: { shelter_type: undefined as unknown as string } }).atKm(10), undefined)).toMatchObject({ listed: false });
    expect(coverOf(placeAt('shelter', 49, 8.4, { id: 'n1', tags: {} }), undefined)).toMatchObject({ listed: false });
  });
  test.each(['private', 'no'])('[STOP-NOT-COVER] access=%s never, whatever it is', (access) => {
    expect(coverOf(shelterOf('weather_shelter', { access }), undefined)).toMatchObject({ listed: false });
    const c = cafe('x', { tags: { access } }).atKm(10);
    expect(coverOf(c, openUntil(c, '20:00'))).toMatchObject({ listed: false });
  });
  test.each([
    ['an alpine hut', () => hut().atKm(10)],
    ['a tap', () => placeAt('water', 49, 8.4)],
    ['a campsite', () => placeAt('campsite', 49, 8.4)],
  ])('[STOP-NOT-COVER] %s is not a rain cover', (_n, make) => {
    expect(coverOf(make(), undefined)).toMatchObject({ listed: false });
  });
  test('[STOP-NOT-COVER] strange shop tags: only a seat mapped makes them a food place', () => {
    const odd = pack('shop', { shop: 'constructor' });
    expect(coverOf(odd, openUntil(odd, '20:00'))).toMatchObject({ listed: false });
  });
  test('[STOP-NOT-COVER] no arrival time means no cover, of any kind', () => {
    const bad = new Date(Number.NaN);
    const c = cafe('x').atKm(10);
    expect(classOf(coverOf(c, openUntil(c, '20:00'), null, 0, bad))).toBeNull();
    expect(classOf(coverOf(shelterOf('lean_to'), undefined, null, 0, bad))).toBeNull();
    expect(classOf(coverAt({ roof: busStop().atKm(10), match: { placeId: '', km: 10, offRouteM: 0 } }, bad, null, undefined))).toBeNull();
  });
  test('[STOP-NOT-COVER] nothing to go on is no cover and does not throw', () => {
    expect(coverAt({}, T, null, undefined)).toMatchObject({ listed: false });
    expect(coverAt({ place: cafe('x').atKm(10) }, T, null, undefined)).toMatchObject({ listed: false });
    expect(coverAt({ roof: busStop().atKm(10) }, T, null, undefined)).toMatchObject({ listed: false });
  });
  test('[STOP-CLASS] an invalid window end is no end', () => {
    const c = cafe('x').atKm(10);
    expect(classOf(coverOf(c, openUntil(c, '13:00'), new Date(Number.NaN)))).toBe(1);
    expect(classOf(coverOf(c, openUntil(c, '12:59'), new Date(Number.NaN)))).toBe(2);
  });
});

describe('300 metres', () => {
  test('[STOP-ROOF-300] a roof at 300 m counts; 301 m does not', () => {
    const r = busStop().atKm(10);
    const at300 = coverAt({ roof: r, match: { placeId: '', km: 10, offRouteM: 300 } }, T, null, undefined);
    const at301 = coverAt({ roof: r, match: { placeId: '', km: 10, offRouteM: 301 } }, T, null, undefined);
    expect(classOf(at300)).toBe(5);
    expect(classOf(at301)).toBeNull();
    expect(at301).toMatchObject({ listed: false });
  });
  test('[STOP-ROOF-300] the same for shelters, huts and stations; a distance that is no number fails', () => {
    for (const p of [shelterOf('weather_shelter'), shelterOf('lean_to'), station({ platformRoof: true }).atKm(10)]) {
      expect(classOf(coverOf(p, undefined, null, 300))).not.toBeNull();
      expect(classOf(coverOf(p, undefined, null, 301))).toBeNull();
      expect(classOf(coverOf(p, undefined, null, Number.NaN))).toBeNull();
    }
  });
  test('[STOP-ROOF-300] an indoor place may lie farther off: its own radius has already held it', () => {
    const c = cafe('x').atKm(10);
    expect(classOf(coverOf(c, openUntil(c, '20:00'), null, 800))).toBe(1);
  });
});

describe('seats', () => {
  test('[STOP-SEATS] seats are claimed only with indoor_seating=yes', () => {
    expect(seatingLine(cafe('x', seats(true)).atKm(10))).toBe('indoor seating mapped');
    expect(seatingLine(cafe('x', { tags: { indoor_seating: 'yes' } }).atKm(10))).toBe('indoor seating mapped');
  });
  test('[STOP-SEATS] otherwise "seating not mapped", never "no"', () => {
    for (const p of [cafe('x').atKm(10), cafe('x', seats(null)).atKm(10), placeAt('cafe', 49, 8.4), cafe('x', { tags: { indoor_seating: 'constructor' } }).atKm(10)]) {
      expect(seatingLine(p)).toBe('seating not mapped');
    }
  });
});
