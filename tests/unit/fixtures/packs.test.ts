import { expect, test } from 'vitest';
import { buildFixtures, readCommittedFixtures } from '../../../tools/build-fixtures.ts';
import { haversineKm } from '../../../src/core/geo/haversine.ts';
import { ALL_KINDS } from '../../../src/core/places/types.ts';
import { FIXTURE_IDS, loadFixturePack, loadFixtureRoute, withoutDrinkPlaces } from '../../fixtures/packs';
import type { FixtureRouteId } from '../../fixtures/packs';

type P = { lat: number; lon: number };
const lengthKm = (pts: P[]) => pts.reduce((s, p, i) => (i === 0 ? 0 : s + haversineKm(pts[i - 1]!, p)), 0);
const metresToRoute = (pts: P[], p: P) => Math.min(...pts.map((q) => haversineKm(q, p))) * 1000;

test.each(FIXTURE_IDS)('%s reads back through the real reader, hashes checked', async (id) => {
  const pack = await loadFixturePack(id);
  expect(pack.places.length).toBeGreaterThan(0);
  expect(new Set(pack.places.map((p) => p.id)).size).toBe(pack.places.length);
  expect((await loadFixtureRoute(id)).points.length).toBeGreaterThan(100);
});

test.each(FIXTURE_IDS)('%s has 4 to 25 places per km', async (id) => {
  const pack = await loadFixturePack(id);
  const density = pack.places.length / lengthKm((await loadFixtureRoute(id)).points);
  expect(density).toBeGreaterThanOrEqual(4);
  expect(density).toBeLessThanOrEqual(25);
});

test.each(FIXTURE_IDS)('%s carries every kind and water class', async (id) => {
  const { places, manifest } = await loadFixturePack(id);
  expect(new Set(places.map((p) => p.kind))).toEqual(new Set(ALL_KINDS));
  expect(new Set(manifest.kinds)).toEqual(new Set(ALL_KINDS));
  expect(new Set(places.map((p) => p.waterClass).filter(Boolean))).toEqual(new Set(['A', 'B', 'C']));
});

test.each(FIXTURE_IDS)('%s carries the special places of the contract', async (id) => {
  const { places, roofs } = await loadFixturePack(id);
  expect(places.some((p) => p.seasonal !== null)).toBe(true);
  expect(places.some((p) => p.tags.in_cemetery === 'yes')).toBe(true);
  expect(places.some((p) => p.kind === 'water' && p.indoorOrLimited && p.tags.amenity === 'water_point')).toBe(true);
  const shops = places.filter((p) => p.kind === 'shop');
  expect(shops.some((p) => p.openingHours === null)).toBe(true);
  expect(shops.some((p) => p.openingHours === 'Mo-Fr 25:00-26:00')).toBe(true);
  expect(shops.some((p) => p.openingHours?.includes('PH'))).toBe(true);
  const types = new Set(places.filter((p) => p.kind === 'shelter').map((p) => p.tags.shelter_type));
  for (const t of ['lean_to', 'weather_shelter', 'wetterpilz', 'picnic_shelter']) expect(types.has(t)).toBe(true);
  const weather = places.filter((p) => p.tags.shelter_type === 'weather_shelter');
  expect(weather.some((p) => p.tags.bench === 'yes')).toBe(true);
  expect(weather.some((p) => p.tags.bench === undefined)).toBe(true);
  expect(new Set(roofs.map((r) => r.kind))).toEqual(new Set(['bus_stop', 'bike_parking']));
  expect(roofs.some((r) => r.bench)).toBe(true);
  expect(roofs.some((r) => !r.bench)).toBe(true);
  const stations = places.filter((p) => p.kind === 'station');
  expect(stations.some((p) => p.platformRoof === true)).toBe(true);
  expect(stations.some((p) => p.platformRoof === false)).toBe(true);
  expect(places.some((p) => p.stop !== null && p.kind === 'cafe')).toBe(true);
  const contacts = places.map((p) => p.contact).filter((c) => c !== null);
  expect(contacts.some((c) => c.phones.length === 2)).toBe(true);
  expect(contacts.some((c) => c.phones.length === 1 && /^Tel\./.test(c.phones[0]!))).toBe(true);
  expect(contacts.some((c) => c.phones.length === 0 && c.website !== null)).toBe(true);
  expect(places.some((p) => ['campsite', 'lodging', 'hut', 'bike_shop'].includes(p.kind) && p.contact === null)).toBe(true);
});

test.each(FIXTURE_IDS)('%s has rescue points within 300 m and between 300 m and 3 km of the route', async (id) => {
  const { rescuePoints } = await loadFixturePack(id);
  const route = await loadFixtureRoute(id);
  const d = rescuePoints.map((r) => metresToRoute(route.points, r));
  expect(d.some((x) => x <= 300)).toBe(true);
  expect(d.some((x) => x > 300 && x <= 3000)).toBe(true);
});

const LENGTHS: Record<FixtureRouteId, [number, number]> = {
  'heidelberg-strasbourg': [160, 170], 'alpine-pass': [85, 95], 'out-and-back': [115, 125],
  loop: [95, 105], 'multi-day-800': [790, 810], 'sunday-holiday': [115, 125],
};
test.each(FIXTURE_IDS)('%s has the length of the contract', async (id) => {
  const len = lengthKm((await loadFixtureRoute(id)).points);
  expect(len).toBeGreaterThanOrEqual(LENGTHS[id][0]);
  expect(len).toBeLessThanOrEqual(LENGTHS[id][1]);
});

const zonesOf = async (id: FixtureRouteId) => new Set((await loadFixturePack(id)).places.map((p) => p.holidayZone));
const countriesOf = async (id: FixtureRouteId) => new Set((await loadFixturePack(id)).places.map((p) => p.country));

test('heidelberg-strasbourg crosses from DE-BW into FR-67', async () => {
  const zones = await zonesOf('heidelberg-strasbourg');
  expect(zones.has('DE-BW') && zones.has('FR-67')).toBe(true);
});

test('alpine-pass lies in CH-UR and CH-TI with heights over 2,000 m', async () => {
  const zones = await zonesOf('alpine-pass');
  expect(zones.has('CH-UR') && zones.has('CH-TI')).toBe(true);
  expect((await loadFixtureRoute('alpine-pass')).points.some((p) => p.ele > 2000)).toBe(true);
});

test('multi-day-800 crosses DE, AT and CH', async () => {
  expect(await countriesOf('multi-day-800')).toEqual(new Set(['DE', 'AT', 'CH']));
});

test('sunday-holiday holds DE-BY-Augsburg and DE-BY', async () => {
  const zones = await zonesOf('sunday-holiday');
  expect(zones.has('DE-BY-Augsburg') && zones.has('DE-BY')).toBe(true);
});

test('loop ends where it starts', async () => {
  const { points } = await loadFixtureRoute('loop');
  expect(points[0]!.lat).toBe(points.at(-1)!.lat);
  expect(points[0]!.lon).toBe(points.at(-1)!.lon);
});

test('out-and-back has one tap within 1 km of both legs', async () => {
  const { points } = await loadFixtureRoute('out-and-back');
  const half = Math.floor(points.length / 2);
  const { places } = await loadFixturePack('out-and-back');
  const within = (leg: P[], t: P) => metresToRoute(leg, t) <= 1000;
  const taps = places.filter((p) => p.waterClass === 'A');
  expect(taps.some((t) => within(points.slice(0, half), t) && within(points.slice(half), t))).toBe(true);
});

test('withoutDrinkPlaces drops drink and ice_cream and their kinds', async () => {
  const pack = await loadFixturePack('loop');
  expect(pack.places.some((p) => p.kind === 'drink')).toBe(true);
  const out = withoutDrinkPlaces(pack);
  expect(out.places.some((p) => p.kind === 'drink' || p.kind === 'ice_cream')).toBe(false);
  expect(out.places.length).toBeLessThan(pack.places.length);
  expect(out.manifest.kinds).not.toContain('drink');
  expect(out.manifest.kinds).not.toContain('ice_cream');
  expect(out.manifest.tiles.reduce((s, t) => s + t.places, 0)).toBe(out.places.length);
});

// gzipBytes comes from zlib, whose output can differ between machines; it is left out of the comparison.
const withoutGzip = (m: Map<string, string>) =>
  new Map([...m].map(([k, v]) => [k, k.endsWith('manifest.json') ? v.replace(/"gzipBytes": \d+/g, '"gzipBytes": 0') : v]));

test('the committed fixtures match the script', () => {
  const built = withoutGzip(buildFixtures({ seed: 20261030, builtAt: '2026-10-28T00:00:00Z' }));
  const committed = withoutGzip(readCommittedFixtures());
  expect([...committed.keys()].sort()).toEqual([...built.keys()].sort());
  for (const [k, v] of built) expect(committed.get(k) === v, k).toBe(true);
});
