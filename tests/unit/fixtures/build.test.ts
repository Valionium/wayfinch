import { describe, expect, test } from 'vitest';
import { haversineKm } from '../../../src/core/geo/haversine.ts';
import {
  at, bakery, busStop, campsite, cafe, flatRoute, fuelShop, pointAtKm, pos, rescue, restaurant, shelter, shop, sun,
  supermarket, tap, testTrip, toilet,
} from '../../fixtures/build.ts';

describe('at()', () => {
  test('reads Berlin wall-clock time, in summer and winter time', () => {
    expect(at('2026-10-17 14:20').toISOString()).toBe('2026-10-17T12:20:00.000Z');
    expect(at('2026-10-26 08:30').toISOString()).toBe('2026-10-26T07:30:00.000Z');
    expect(at('2026-10-17 11:17:34').toISOString()).toBe('2026-10-17T09:17:34.000Z');
  });

  test('takes another zone', () => {
    expect(at('2026-06-01 09:00', 'Europe/Lisbon').toISOString()).toBe('2026-06-01T08:00:00.000Z');
  });
});

describe('flatRoute()', () => {
  test('has the asked length, one point per km, and kilometres that match the haversine totals', () => {
    const r = flatRoute(90);
    expect(r.lengthKm).toBe(90);
    expect(r.points).toHaveLength(91);
    for (const p of r.points) {
      expect(haversineKm(r.points[0]!, p)).toBeCloseTo(p.km, 6);
    }
    expect(r.ascentM).toBe(0);
  });

  test('a route shorter than a kilometre still has two points', () => {
    const r = flatRoute(0.4);
    expect(r.points).toHaveLength(2);
    expect(r.points[1]!.km).toBe(0.4);
  });

  test('without heights, ascent is null and no point has a height', () => {
    const r = flatRoute(50, { ele: null });
    expect(r.ascentM).toBeNull();
    expect(r.points.every((p) => p.ele === null)).toBe(true);
  });

  test('stage ends split the route, the last one closing it', () => {
    const r = flatRoute(300, { stageEnds: [78, 150, 222, 300] });
    expect(r.stages.map((s) => [s.day, s.startKm, s.endKm])).toEqual([[1, 0, 78], [2, 78, 150], [3, 150, 222], [4, 222, 300]]);
    expect(r.stages[0]!.ridingHours).toBeCloseTo(78 / 20.5, 9);
    const open = flatRoute(100, { stageEnds: [40] });
    expect(open.stages.map((s) => s.endKm)).toEqual([40, 100]);
  });
});

describe('testTrip()', () => {
  test('is the standard trip of the plan', () => {
    const t = testTrip();
    expect(t.route.stages.map((s) => s.endKm)).toEqual([78, 150, 222, 300]);
    expect(t.route.lengthKm).toBe(300);
    expect(t.flatKph).toBe(25);
    expect(t.startTime).toBe('08:30');
    expect(t.departureDate).toBe('2026-10-17');
    expect(t.stay).toBe('camping');
    expect(t.campWaterL).toBe(2);
  });

  test('takes overrides', () => {
    expect(testTrip({ startTime: '07:00', departureDate: null }).startTime).toBe('07:00');
    expect(testTrip({ departureDate: null }).departureDate).toBeNull();
  });
});

describe('place builders', () => {
  test("shop('…').atKm(30, { off: 400 }) stands 400 m beside the route at km 30", () => {
    const p = shop('Mo-Sa 08:00-12:00').atKm(30, { off: 400 });
    expect(p.kind).toBe('shop');
    expect(p.openingHours).toBe('Mo-Sa 08:00-12:00');
    const onRoute = pointAtKm(30);
    expect(haversineKm(onRoute, p)).toBeCloseTo(0.4, 3);
    expect(Math.abs(p.lat - onRoute.lat)).toBeLessThan(1e-4);
  });

  test('a place with no offset lies on the route; a shop can have no hours', () => {
    const p = shop(null).atKm(12);
    expect(p.openingHours).toBeNull();
    expect(haversineKm(pointAtKm(12), p)).toBeLessThan(1e-3);
  });

  test('each builder sets the kind and the tags the engines read', () => {
    expect(bakery('Mo-Sa 06:00-12:00').atKm(1).tags['shop']).toBe('bakery');
    expect(supermarket('Mo-Sa 08:00-20:00').atKm(1).tags['shop']).toBe('supermarket');
    expect(fuelShop('24/7').atKm(1).kind).toBe('fuel_shop');
    expect(cafe('Mo-Su 08:00-18:00').atKm(1).tags['amenity']).toBe('cafe');
    expect(restaurant('Mo-Su 11:00-22:00').atKm(1).kind).toBe('restaurant');
    const t = tap().atKm(5);
    expect(t.kind).toBe('water');
    expect(t.waterClass).toBe('A');
    expect(t.indoorOrLimited).toBe(false);
    expect(toilet(null).atKm(5).kind).toBe('toilets');
    expect(campsite().atKm(5).kind).toBe('campsite');
    expect(shelter().atKm(5).kind).toBe('shelter');
  });

  test('ids are text and differ between places', () => {
    const a = shop(null).atKm(10);
    const b = shop(null).atKm(11);
    expect(a.id).toMatch(/^n\d+$/);
    expect(a.id).not.toBe(b.id);
    expect(shop(null).atKm(10, { id: 'n99' }).id).toBe('n99');
  });

  test('roofs and rescue points get a position and no id', () => {
    const r = busStop({ bench: true }).atKm(20);
    expect(r.kind).toBe('bus_stop');
    expect(r.bench).toBe(true);
    expect('id' in r).toBe(false);
    const p = rescue('KA-145').atKm(20, { off: 100 });
    expect(p.ref).toBe('KA-145');
    expect(haversineKm(pointAtKm(20), p)).toBeCloseTo(0.1, 3);
  });
});

describe('sun() and pos()', () => {
  test('sun() gives the stubbed times of the riding date, in Berlin wall-clock time', () => {
    const s = sun({ sunset: '18:42', dusk: '19:17' });
    const t = s(49, 8.4, '2026-10-17');
    expect(t.sunset?.toISOString()).toBe('2026-10-17T16:42:00.000Z');
    expect(t.dusk?.toISOString()).toBe('2026-10-17T17:17:00.000Z');
    expect(t.lightAllNight).toBe(false);
    expect(t.dawn).not.toBeNull();
    expect(t.sunrise).not.toBeNull();
    expect(t.dawn!.getTime()).toBeLessThan(t.sunrise!.getTime());
    expect(s(49, 8.4, '2026-10-18').sunset?.toISOString()).toBe('2026-10-18T16:42:00.000Z');
  });

  test('sun() with no argument has the plan\'s standard times', () => {
    const t = sun()(49, 8.4, '2026-10-17');
    expect(t.sunset?.toISOString()).toBe('2026-10-17T16:42:00.000Z');
    expect(t.dusk?.toISOString()).toBe('2026-10-17T17:17:00.000Z');
  });

  test('pos() stands on the route at a km and is approximate only above 500 m', () => {
    const p = pos({ km: 76, at: '2026-10-17 14:20' });
    expect(p.km).toBe(76);
    expect(p.at.toISOString()).toBe('2026-10-17T12:20:00.000Z');
    expect(p.source).toBe('gps');
    expect(p.offRouteM).toBe(0);
    expect(p.approximate).toBe(false);
    expect(haversineKm(pointAtKm(76), p)).toBeLessThan(1e-3);
    expect(pos({ km: 76, at: '2026-10-17 14:20', acc: 500 }).approximate).toBe(false);
    expect(pos({ km: 76, at: '2026-10-17 14:20', acc: 501 }).approximate).toBe(true);
    expect(pos({ km: 76, at: '2026-10-17 14:20', manual: true, acc: 900 })).toMatchObject({ source: 'manual', approximate: false });
    const off = pos({ km: 90, at: '2026-10-17 14:20', off: 2000 });
    expect(off.offRouteM).toBe(2000);
    expect(haversineKm(pointAtKm(90), off)).toBeCloseTo(2, 2);
  });
});
