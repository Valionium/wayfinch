import { expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { classifyObject, kindOf } from '../../../../src/core/places/classify.ts';
import { encodeTile } from '../../../../src/core/places/pack-format.ts';
import { osmTags } from '../../../gen';
import { ctx, obj, opts } from './helpers.ts';

plain('[PIPE-KIND-01] an object has one kind, in the fixed order', () => {
  expect(kindOf({ tourism: 'camp_site', amenity: 'restaurant' }, opts())).toBe('campsite');
  expect(kindOf({ amenity: 'fast_food' }, opts())).toBe('cafe');
  expect(kindOf({ tourism: 'camp_site', tents: 'no' }, opts())).toBeNull();
  expect(kindOf({ shop: 'kiosk' }, opts())).toBe('shop');
  expect(kindOf({ shop: 'bicycle', amenity: 'cafe' }, opts())).toBe('bike_shop');
  expect(kindOf({ amenity: 'pharmacy', shop: 'chemist' }, opts())).toBe('pharmacy');
  expect(kindOf({ amenity: 'toilets', drinking_water: 'yes' }, opts())).toBe('toilets');
  expect(kindOf({ shop: 'bakery', 'drinking_water:refill': 'yes' }, opts())).toBe('shop');
  expect(kindOf({ 'drinking_water:refill': 'yes' }, opts())).toBe('water');
  expect(kindOf({ tourism: 'wilderness_hut' }, opts())).toBe('hut');
  expect(kindOf({ tourism: 'motel' }, opts())).toBe('lodging');
  expect(kindOf({ amenity: 'bicycle_repair_station' }, opts())).toBe('repair_station');
  expect(kindOf({ amenity: 'compressed_air' }, opts())).toBe('air');
  expect(kindOf({ amenity: 'hospital' }, opts())).toBe('hospital');
  expect(kindOf({ amenity: 'shelter', shelter_type: 'lean_to' }, opts())).toBe('shelter');
  expect(kindOf({ amenity: 'bench' }, opts())).toBeNull();
});

plain('[PIPE-KIND-03] heritage and subway stations are not stations', () => {
  expect(kindOf({ railway: 'station' }, opts())).toBe('station');
  expect(kindOf({ railway: 'halt' }, opts())).toBe('station');
  for (const t of [{ railway: 'station', station: 'subway' }, { railway: 'station', usage: 'tourism' }, { railway: 'station', 'railway:preserved': 'yes' }])
    expect(kindOf(t, opts())).toBeNull();
});

plain('[PIPE-KIND-04] only whitelisted tags survive', () => {
  const many: Record<string, string> = { shop: 'bakery', access: 'yes', fee: 'no', name: 'Test Bakery', wheelchair: 'yes', website: 'https://x.de', 'addr:street': 'X', note: 'n' };
  for (let i = 0; i < 30; i++) many[`junk${i}`] = 'x';
  const p = classifyObject(obj(many), ctx(), opts())!;
  expect(p.tags).toEqual({ shop: 'bakery', access: 'yes', fee: 'no' });
  expect(p.name).toBe('Test Bakery');
});

plain('[PIPE-KIND-04] each kind keeps its own extra tags', () => {
  const t = (kind: Record<string, string>, extra: Record<string, string>) => classifyObject(obj({ ...kind, ...extra }), ctx(), opts())!.tags;
  expect(t({ amenity: 'drinking_water' }, { 'drinking_water:legal': 'yes', tents: 'x' })).toEqual({ amenity: 'drinking_water', 'drinking_water:legal': 'yes' });
  expect(t({ tourism: 'camp_site' }, { backcountry: 'yes', reservation: 'required', tents: 'yes', locked: 'no', bench: 'yes' }))
    .toEqual({ tourism: 'camp_site', backcountry: 'yes', reservation: 'required', tents: 'yes', locked: 'no' });
  expect(t({ amenity: 'shelter' }, { shelter_type: 'Wetterpilz', bench: 'yes', covered: 'yes', locked: 'no', reservation: 'x' }))
    .toEqual({ amenity: 'shelter', shelter_type: 'wetterpilz', bench: 'yes', covered: 'yes', locked: 'no' });
  expect(t({ shop: 'bicycle' }, { 'service:bicycle:repair': 'yes', 'service:bicycle:pump': 'yes', 'service:bicycle:tools': 'yes' }))
    .toEqual({ shop: 'bicycle', 'service:bicycle:repair': 'yes', 'service:bicycle:pump': 'yes' });
  expect(t({ amenity: 'hospital' }, { emergency: 'yes' })).toEqual({ amenity: 'hospital', emergency: 'yes' });
  expect(t({ amenity: 'toilets' }, { drinking_water: 'yes' })).toEqual({ amenity: 'toilets', drinking_water: 'yes' });
  expect(t({ place: 'village', name: 'X' }, { population: '300', 'name:en': 'Y' })).toEqual({ place: 'village', population: '300' });
});

plain('[PIPE-KIND-04] settlement alternative names follow the setting', () => {
  const tags = { place: 'town', name: 'X', 'name:en': 'A', 'name:de': 'B', 'name:fr': 'C', alt_name: 'D' };
  expect(classifyObject(obj(tags), ctx(), opts({ settlementAltNames: true }))!.tags).toEqual({ place: 'town', 'name:en': 'A', 'name:de': 'B', 'name:fr': 'C', alt_name: 'D' });
  expect(classifyObject(obj(tags), ctx(), opts())!.tags).toEqual({ place: 'town' });
});

plain('[PIPE-KIND-04] 120 and 255 character limits; control characters removed', () => {
  expect(classifyObject(obj({ shop: 'bakery', name: 'x'.repeat(120) }), ctx(), opts())!.name).toBe('x'.repeat(120));
  expect(classifyObject(obj({ shop: 'bakery', name: 'x'.repeat(121) }), ctx(), opts())!.name).toBeNull();
  const h = 'Mo-Fr 08:00-18:00; '.repeat(13).trim();
  expect(h.length).toBeLessThanOrEqual(255);
  expect(classifyObject(obj({ shop: 'bakery', opening_hours: h }), ctx(), opts())!.openingHours).toBe(h);
  expect(classifyObject(obj({ shop: 'bakery', opening_hours: 'x'.repeat(256) }), ctx(), opts())!.openingHours).toBeNull();
  const p = classifyObject(obj({ shop: 'bakery', name: 'Bad\u0000Name\u0007\n', opening_hours: 'Mo\u0000-Fr 08:00-18:00', fee: 'n\u0001o' }), ctx(), opts())!;
  expect(p.name).toBe('BadName');
  expect(p.openingHours).toBe('Mo-Fr 08:00-18:00');
  expect(p.tags.fee).toBe('no');
});

plain('[CA-KIND] a café with a phone has no contact; a campsite, hostel, alpine hut and bike shop have', () => {
  const phone = { phone: '+49 7221 123456', website: 'www.x.de' };
  expect(classifyObject(obj({ amenity: 'cafe', ...phone }), ctx(), opts())!.contact).toBeNull();
  for (const t of [{ tourism: 'camp_site' }, { tourism: 'hostel' }, { tourism: 'alpine_hut' }, { shop: 'bicycle' }]) {
    expect(classifyObject(obj({ ...t, ...phone }), ctx(), opts())!.contact).toEqual({ phones: ['+49 7221 123456'], website: 'http://www.x.de' });
  }
  expect(classifyObject(obj({ tourism: 'camp_site' }), ctx(), opts())!.contact).toBeNull();
  expect(classifyObject(obj({ tourism: 'camp_site', phone: '+49 7221 123456', website: 'javascript:alert(1)' }), ctx(), opts())!.contact)
    .toEqual({ phones: ['+49 7221 123456'], website: null });
});

plain('[CA-KIND] a wilderness hut has no contact', () => {
  expect(classifyObject(obj({ tourism: 'wilderness_hut', phone: '+49 7221 123456' }), ctx(), opts())!.contact).toBeNull();
});

plain('[PIPE-KIND-05] drink places follow the setting', () => {
  for (const a of ['pub', 'biergarten', 'ice_cream']) expect(kindOf({ amenity: a }, { ...opts(), drinkPlaces: false })).toBeNull();
  expect(kindOf({ amenity: 'pub' }, { ...opts(), drinkPlaces: true })).toBe('drink');
  expect(kindOf({ amenity: 'ice_cream' }, { ...opts(), drinkPlaces: true })).toBe('ice_cream');
});

test.prop([osmTags()])('[PIPE-KIND-04] any tag set classifies without throwing, and passes the format', (t) => {
  const p = classifyObject(obj(t), ctx(), opts());
  if (p) expect(() => encodeTile({ places: [p], roofs: [], rescuePoints: [] }, { z: 8, x: 1, y: 1 })).not.toThrow();
});

plain('a campsite water point and access=customers are indoorOrLimited', () => {
  expect(classifyObject(obj({ amenity: 'water_point' }), ctx({ onCampsite: true }), opts())!.indoorOrLimited).toBe(true);
  expect(classifyObject(obj({ amenity: 'drinking_water', access: 'customers' }), ctx(), opts())!.indoorOrLimited).toBe(true);
  expect(classifyObject(obj({ amenity: 'drinking_water' }), ctx(), opts())!.indoorOrLimited).toBe(false);
  expect(classifyObject(obj({ amenity: 'toilets', drinking_water: 'yes' }), ctx(), opts())!.indoorOrLimited).toBe(true);
});

plain('settlements need a name, not a population', () => {
  expect(classifyObject(obj({ place: 'village', name: 'Test Dorf' }), ctx(), opts())!.kind).toBe('settlement');
  expect(classifyObject(obj({ place: 'village' }), ctx(), opts())).toBeNull();
  expect(classifyObject(obj({ place: 'hamlet', name: 'X' }), ctx(), opts())).toBeNull();
});

plain('a place carries its zone, data date, hours and check date', () => {
  const p = classifyObject(obj({ shop: 'bakery', name: 'B', opening_hours: 'Mo-Sa 07:00-12:00', seasonal: 'no', 'check_date:opening_hours': '2026-09-01', check_date: '2020-01-01' }, { id: 'w77' }), ctx(), opts())!;
  expect(p).toMatchObject({ id: 'w77', lat: 49.40123, lon: 8.69456, country: 'DE', subdivision: 'DE-BW', hoursRegionKey: 'DE-BW', holidayZone: 'DE-BW',
    timeZone: 'Europe/Berlin', source: 'pack', dataDate: '2026-10-26', openingHours: 'Mo-Sa 07:00-12:00', seasonal: 'no', checkDate: '2026-09-01', stop: null });
  expect(classifyObject(obj({ shop: 'bakery', check_date: '2020-01-01' }), ctx(), opts())!.checkDate).toBe('2020-01-01');
});

plain('coordinates are rounded to five decimals and disused objects are dropped', () => {
  const p = classifyObject(obj({ shop: 'bakery' }, { lat: 49.4012349, lon: 8.6945651 }), ctx(), opts())!;
  expect([p.lat, p.lon]).toEqual([49.40123, 8.69457]);
  expect(classifyObject(obj({ shop: 'bakery', disused: 'yes' }), ctx(), opts())).toBeNull();
});
