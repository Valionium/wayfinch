import { expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { classifyObject } from '../../../../src/core/places/classify.ts';
import { buildRoofs, platformRoofs } from '../../../../src/core/places/roofs.ts';
import type { OsmObject } from '../../../../src/core/places/types.ts';
import { stopCluster } from '../../../gen';
import { haversineKm } from '../../../../src/core/geo/haversine.ts';
import { ctx, metresFrom, node, obj, opts, way } from './helpers.ts';

const stop1 = { lat: 49.4, lon: 8.7 };
const stop = (id: string, tags: Record<string, string>, p = stop1): OsmObject => node(id, p, { highway: 'bus_stop', ...tags });
const shelterAt = (p: { lat: number; lon: number }, type: string, id = 'n900'): OsmObject => node(id, p, { amenity: 'shelter', shelter_type: type });

plain('[PIPE-ROOF-01] which bus stops are roofs', () => {
  expect(buildRoofs([stop('n1', { shelter: 'yes' })])).toHaveLength(1);
  expect(buildRoofs([stop('n1', { shelter: 'separate' })])).toHaveLength(1);
  expect(buildRoofs([stop('n1', {})])).toHaveLength(0);
  expect(buildRoofs([stop('n1', { shelter: 'no' })])).toHaveLength(0);
  expect(buildRoofs([stop('n1', {}), shelterAt(metresFrom(stop1, 29), 'public_transport')])).toHaveLength(1);
  expect(buildRoofs([stop('n1', {}), shelterAt(metresFrom(stop1, 31), 'public_transport')])).toHaveLength(0);
  expect(buildRoofs([stop('n1', {}), shelterAt(metresFrom(stop1, 29), 'weather_shelter')])).toHaveLength(1);
  expect(buildRoofs([stop('n1', {}), shelterAt(metresFrom(stop1, 29), 'lean_to')])).toHaveLength(0);
});

test.each(['private', 'no', 'customers', 'permit'])('[PIPE-ROOF-02] covered bike parking with access=%s is no roof', (a) => {
  expect(buildRoofs([node('n1', stop1, { amenity: 'bicycle_parking', covered: 'yes', access: a })])).toHaveLength(0);
});

plain('[PIPE-ROOF-02] public covered bike parking is a roof; uncovered is not', () => {
  expect(buildRoofs([node('n1', stop1, { amenity: 'bicycle_parking', covered: 'yes' })])).toEqual([{ kind: 'bike_parking', lat: 49.4, lon: 8.7, bench: false }]);
  expect(buildRoofs([node('n1', stop1, { amenity: 'bicycle_parking', covered: 'yes', access: 'yes' })])).toHaveLength(1);
  expect(buildRoofs([node('n1', stop1, { amenity: 'bicycle_parking' })])).toHaveLength(0);
  expect(buildRoofs([node('n1', stop1, { amenity: 'bicycle_parking', covered: 'no' })])).toHaveLength(0);
});

plain('[PIPE-ROOF-03] stops with the same name are merged within 30 m', () => {
  const named = (id: string, p: typeof stop1, name: string) => stop(id, { shelter: 'yes', name }, p);
  expect(buildRoofs([named('n1', stop1, 'Markt'), named('n2', metresFrom(stop1, 29), 'Markt')])).toHaveLength(1);
  expect(buildRoofs([named('n1', stop1, 'Markt'), named('n2', metresFrom(stop1, 31), 'Markt')])).toHaveLength(2);
  expect(buildRoofs([named('n1', stop1, 'Markt'), named('n2', metresFrom(stop1, 5), 'Dorf')])).toHaveLength(2);
});

plain('[PIPE-ROOF-04] a stop mapped as bus stop and as platform counts once', () => {
  const pole = stop('n1', { shelter: 'yes', name: 'Markt' });
  const platform = node('n2', metresFrom(stop1, 8), { public_transport: 'platform', bus: 'yes', shelter: 'yes', name: 'Markt' });
  expect(buildRoofs([pole, platform])).toHaveLength(1);
  expect(buildRoofs([platform, pole])).toEqual(buildRoofs([pole, platform]));
});

plain('a roof that one of two merged objects earns keeps both benches', () => {
  const a = stop('n1', { shelter: 'yes', name: 'M' });
  const b = stop('n2', { shelter: 'yes', name: 'M', bench: 'yes' }, metresFrom(stop1, 10));
  expect(buildRoofs([a, b])).toEqual([{ kind: 'bus_stop', lat: 49.4, lon: 8.7, bench: true }]);
});

test.prop([stopCluster()])('[PIPE-ROOF-03] no two kept stops with one name lie within 30 m', (objs) => {
  const roofs = buildRoofs(objs.map((o) => ({ ...o, tags: { ...o.tags } })));
  // The cluster generator gives every stop a roof and one of three names, so we compare by position alone per name.
  for (let i = 0; i < roofs.length; i++) for (let j = i + 1; j < roofs.length; j++) {
    const names = new Set(objs.filter((o) => (o.lat === roofs[i]!.lat && o.lon === roofs[i]!.lon) || (o.lat === roofs[j]!.lat && o.lon === roofs[j]!.lon)).map((o) => o.tags.name));
    if (names.size === 1) expect(haversineKm(roofs[i]!, roofs[j]!) * 1000).toBeGreaterThan(30);
  }
});

test.prop([stopCluster()])('[PIPE-ROOF-03] the order of input never changes the roofs', (objs) => {
  expect(buildRoofs([...objs].reverse())).toEqual(buildRoofs(objs));
});

plain('[PIPE-ROOF-05] public_transport shelters are never places', () => {
  expect(classifyObject(obj({ amenity: 'shelter', shelter_type: 'public_transport' }), ctx(), opts())).toBeNull();
});

plain('the bench bit reads bench=yes on the stop or its shelter', () => {
  expect(buildRoofs([stop('n1', { shelter: 'yes', bench: 'yes' })])[0]!.bench).toBe(true);
  expect(buildRoofs([stop('n1', { shelter: 'yes' })])[0]!.bench).toBe(false);
  const withBench = node('n9', metresFrom(stop1, 10), { amenity: 'shelter', shelter_type: 'public_transport', bench: 'yes' });
  expect(buildRoofs([stop('n1', {}), withBench])[0]!.bench).toBe(true);
});

plain('[PIPE-STATION-01] platformRoof', () => {
  const st = node('n1', stop1, { railway: 'station' });
  const platform = (m: number, tags: Record<string, string>) => node('n2', metresFrom(stop1, m), { railway: 'platform', ...tags });
  expect(platformRoofs([st], [platform(299, { shelter: 'yes' })]).has('n1')).toBe(true);
  expect(platformRoofs([st], [platform(301, { shelter: 'yes' })]).has('n1')).toBe(false);
  expect(platformRoofs([st], [platform(100, { covered: 'yes' })]).has('n1')).toBe(true);
  expect(platformRoofs([st], [platform(100, {})]).has('n1')).toBe(false);
  expect(platformRoofs([st], [platform(100, { shelter: 'no' })]).has('n1')).toBe(false);
  expect(platformRoofs([st], [shelterAt(metresFrom(stop1, 299), 'weather_shelter')]).has('n1')).toBe(true);
  expect(platformRoofs([st], [shelterAt(metresFrom(stop1, 299), 'public_transport')]).has('n1')).toBe(true);
  expect(platformRoofs([st], [shelterAt(metresFrom(stop1, 299), 'lean_to')]).has('n1')).toBe(false);
  expect(platformRoofs([st], []).has('n1')).toBe(false);
});

plain('[PIPE-STATION-01] a platform area counts by its nearest corner, not only its centre', () => {
  const st = node('n1', stop1, { railway: 'station' });
  const far = metresFrom(stop1, 600);
  const longPlatform = way('w5', [[stop1.lat + 0.0002, stop1.lon], [far.lat, far.lon], [far.lat, far.lon + 0.0001]], { railway: 'platform', shelter: 'yes' });
  expect(haversineKm(stop1, longPlatform) * 1000).toBeGreaterThan(300);
  expect(platformRoofs([st], [longPlatform]).has('n1')).toBe(true);
});
