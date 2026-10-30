import { expect, test as plain } from 'vitest';
import { classifyObject, kindOf } from '../../../../src/core/places/classify.ts';
import { linkFuelShops } from '../../../../src/core/places/fuel.ts';
import { NearIndex } from '../../../../src/core/places/near.ts';
import { stopFlags } from '../../../../src/core/places/stop-flags.ts';
import type { OsmObject } from '../../../../src/core/places/types.ts';
import { ctx, metresFrom, node, obj, opts } from './helpers.ts';

const at: [number, number] = [49.4, 8.7];
const pos = { lat: 49.4, lon: 8.7 };
const parkingIndex = (items: OsmObject[]) => new NearIndex(items, (o) => [o.lat, o.lon], 50);
const none = parkingIndex([]);
const parking = (id: string, m: number, tags: Record<string, string> = {}) => node(id, metresFrom(pos, m), { amenity: 'bicycle_parking', ...tags });

plain('[PIPE-STOP-01] flags read yes, no and missing', () => {
  const f = stopFlags({ indoor_seating: 'yes', outdoor_seating: 'no', toilets: 'yes', takeaway: 'only', 'opening_hours:kitchen': 'Mo 12:00-14:00' }, none, at);
  expect(f).toEqual({ indoorSeating: true, outdoorSeating: false, toilets: true, takeaway: true, kitchenHours: 'Mo 12:00-14:00', bikeParking50m: false });
  expect(stopFlags({}, none, at)).toEqual({ indoorSeating: null, outdoorSeating: null, toilets: null, takeaway: null, kitchenHours: null, bikeParking50m: false });
  expect(stopFlags({ takeaway: 'customers', toilets: 'no', indoor_seating: 'maybe' }, none, at)).toMatchObject({ takeaway: true, toilets: false, indoorSeating: null });
});

plain('[PIPE-STOP-01] toilets:access=customers still reads toilets true, and the tag stays', () => {
  expect(stopFlags({ toilets: 'yes', 'toilets:access': 'customers' }, none, at).toilets).toBe(true);
  const p = classifyObject(obj({ amenity: 'cafe', toilets: 'yes', 'toilets:access': 'customers', indoor_seating: 'yes', wheelchair: 'yes' }), ctx(), opts())!;
  expect(p.tags).toEqual({ amenity: 'cafe', toilets: 'yes', 'toilets:access': 'customers', indoor_seating: 'yes' });
});

plain('[PIPE-STOP-01] stop flags exist on food and drink places only', () => {
  const withStop: Record<string, string>[] = [{ shop: 'bakery' }, { amenity: 'cafe' }, { amenity: 'restaurant' }, { amenity: 'pub' }, { amenity: 'ice_cream' }, { amenity: 'fuel', shop: 'convenience' }];
  for (const t of withStop) {
    expect(classifyObject(obj(t), ctx(), opts())!.stop, JSON.stringify(t)).not.toBeNull();
  }
  const withoutStop: Record<string, string>[] = [{ tourism: 'camp_site' }, { amenity: 'drinking_water' }, { amenity: 'pharmacy' }, { shop: 'bicycle' }, { amenity: 'toilets' }];
  for (const t of withoutStop) {
    expect(classifyObject(obj(t), ctx(), opts())!.stop, JSON.stringify(t)).toBeNull();
  }
});

plain('[PIPE-STOP-02] public bike parking at 49 m counts, 51 m and private do not', () => {
  expect(stopFlags({}, parkingIndex([parking('n5', 49)]), at).bikeParking50m).toBe(true);
  expect(stopFlags({}, parkingIndex([parking('n5', 51)]), at).bikeParking50m).toBe(false);
  for (const a of ['private', 'no', 'customers', 'permit']) expect(stopFlags({}, parkingIndex([parking('n5', 10, { access: a })]), at).bikeParking50m).toBe(false);
  expect(stopFlags({}, parkingIndex([parking('n5', 10, { access: 'yes' })]), at).bikeParking50m).toBe(true);
  const p = classifyObject(obj({ amenity: 'cafe' }, { lat: at[0], lon: at[1] }), ctx({ bikeParking: parkingIndex([parking('n5', 20)]) }), opts())!;
  expect(p.stop!.bikeParking50m).toBe(true);
});

plain('[PIPE-KIND-02] a fuel station', () => {
  expect(kindOf({ amenity: 'fuel', shop: 'convenience' }, opts())).toBe('fuel_shop');
  expect(kindOf({ amenity: 'fuel' }, opts())).toBeNull();
  expect(kindOf({ amenity: 'fuel', shop: 'no' }, opts())).toBeNull();
  expect(kindOf({ amenity: 'fuel', shop: 'convenience', automated: 'yes' }, opts())).toBeNull();
});

const fuel = (id: string, tags: Record<string, string>, p = pos) => node(id, p, { amenity: 'fuel', ...tags });
const shopNode = (id: string, p: { lat: number; lon: number }, tags: Record<string, string>) => node(id, p, tags);

plain('[PIPE-KIND-02] a station takes a shop node within 50 m, with its hours, and the node goes', () => {
  const r = linkFuelShops([fuel('n1', {})], [shopNode('n2', metresFrom(pos, 49), { shop: 'kiosk', opening_hours: 'Mo-Su 06:00-22:00' })]);
  expect(r.fuelShops).toHaveLength(1);
  expect(r.fuelShops[0]!.id).toBe('n1');
  expect(r.fuelShops[0]!.tags.opening_hours).toBe('Mo-Su 06:00-22:00');
  expect(r.fuelShops[0]!.tags.shop).toBe('kiosk');
  expect(r.usedShopIds).toEqual(new Set(['n2']));
  expect(kindOf(r.fuelShops[0]!.tags, opts())).toBe('fuel_shop');
});

plain('[PIPE-KIND-02] a bakery beside a station stays a bakery; automated stations link nothing; a shop at 51 m stays', () => {
  const bakery = shopNode('n2', metresFrom(pos, 10), { shop: 'bakery' });
  expect(linkFuelShops([fuel('n1', {})], [bakery])).toEqual({ fuelShops: [], usedShopIds: new Set() });
  const kiosk = shopNode('n3', metresFrom(pos, 10), { shop: 'kiosk' });
  expect(linkFuelShops([fuel('n1', { automated: 'yes' })], [kiosk])).toEqual({ fuelShops: [], usedShopIds: new Set() });
  expect(linkFuelShops([fuel('n1', {})], [shopNode('n3', metresFrom(pos, 51), { shop: 'kiosk' })]).usedShopIds.size).toBe(0);
});

plain('[PIPE-KIND-02] a station with its own shop tag stays as it is, and a shop node is used only once', () => {
  const own = fuel('n1', { shop: 'convenience', opening_hours: 'Mo-Su 05:00-23:00' });
  expect(linkFuelShops([own], []).fuelShops).toEqual([own]);
  const k = shopNode('n9', metresFrom(pos, 20), { shop: 'convenience' });
  const a = fuel('n1', {});
  const b = fuel('n2', {}, metresFrom(pos, 30));
  const r = linkFuelShops([b, a], [k]);
  expect(r.fuelShops.map((s) => s.id)).toEqual(['n1']);
});
