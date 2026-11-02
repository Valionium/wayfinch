import { expect, test } from 'vitest';
import { buildSegmentIndex } from '../../../../src/core/geo/index.ts';
import { matchPlaces, radiusKmFor } from '../../../../src/core/route/matches.ts';
import type { Place, Route } from '../../../../src/core/types.ts';
import { campsite, flatRoute, hospital, pointAtKm, restaurant, shelter, tap } from '../../../fixtures/build.ts';

function outAndBack(): Route {
  const points = [];
  for (let k = 0; k <= 150; k++) points.push({ ...pointAtKm(k <= 75 ? k : 150 - k), ele: 100, km: k });
  return { ...flatRoute(150), points, lengthKm: 150 };
}
const match = (route: Route, ...places: Place[]) => matchPlaces(places, route, buildSegmentIndex(route));

test('[LOC-MATCH] a tap 900 m off is matched at radius 1 km, at 1.1 km not', () => {
  const route = flatRoute(100);
  const near = tap().atKm(30, { off: 900 });
  const m = match(route, near);
  expect(m).toHaveLength(1);
  expect(m[0]!.placeId).toBe(near.id);
  expect(m[0]!.km).toBeCloseTo(30, 6);
  expect(m[0]!.offRouteM).toBeCloseTo(900, 1);
  expect(match(route, tap().atKm(30, { off: 1100 }))).toEqual([]);
});

test('[LOC-MATCH] on the out-and-back one tap gets two matches, one per pass', () => {
  const m = match(outAndBack(), tap().atKm(30, { off: 900 }));
  expect(m.map((x) => Math.round(x.km))).toEqual([30, 120]);
  expect(m[0]!.offRouteM).toBeCloseTo(m[1]!.offRouteM, 6);
});

test('[LOC-MATCH] passes closer than 2 km merge into one, at the closer pass', () => {
  // Out past the tap, a loop away beyond its radius, and back past it: two passes, `loopKm` of route apart.
  const passes = (loopKm: number): Route => {
    const points = [
      { ...pointAtKm(0), ele: 1, km: 0 }, { ...pointAtKm(10), ele: 1, km: 10 },
      { ...pointAtKm(10, 1500), ele: 1, km: 10 + loopKm / 2 },
      { ...pointAtKm(10.2), ele: 1, km: 10 + loopKm }, { ...pointAtKm(20), ele: 1, km: 20 + loopKm },
    ];
    return { ...flatRoute(20), points, lengthKm: 20 + loopKm };
  };
  const tapAt = tap().atKm(10.1, { off: 300, side: 'west' });
  expect(match(passes(1.6), tapAt)).toHaveLength(1);
  const apart = match(passes(4), tapAt);
  expect(apart).toHaveLength(2);
  expect(apart[0]!.km).toBeLessThan(apart[1]!.km);
});

test('[LOC-MATCH] every category has its radius of section 6.0', () => {
  expect(radiusKmFor(tap().atKm(1))).toBe(1);
  expect(radiusKmFor(restaurant(null).atKm(1))).toBe(0.6);
  expect(radiusKmFor(campsite().atKm(1))).toBe(3);
  expect(radiusKmFor(shelter().atKm(1))).toBe(3);
  expect(radiusKmFor(hospital().atKm(1))).toBe(20);
  const route = flatRoute(100);
  expect(match(route, restaurant(null).atKm(40, { off: 590 }))).toHaveLength(1);
  expect(match(route, restaurant(null).atKm(40, { off: 610 }))).toHaveLength(0);
  expect(match(route, hospital().atKm(40, { off: 19_000 }))).toHaveLength(1);
});
