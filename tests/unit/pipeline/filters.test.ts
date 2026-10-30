import { expect, test } from 'vitest';
import { boundaryFilterArgs, boundaryLevelArgs, placeFilterArgs } from '../../../pipeline/filters.ts';
import { parseBoundaryLine, parseGeoJsonLine } from '../../../pipeline/read-geojson.ts';

test('filters include every tag set of section 6.0 and the supports', () => {
  const a = placeFilterArgs().join(' ');
  for (const t of ['amenity=drinking_water', 'man_made=water_tap', 'natural=spring', 'shop=supermarket', 'tourism=camp_site',
    'amenity=shelter', 'highway=bus_stop', 'public_transport=platform', 'railway=platform', 'amenity=bicycle_parking',
    'landuse=cemetery', 'amenity=grave_yard', 'highway=emergency_access_point', 'emergency=access_point',
    'place=city', 'amenity=fuel', 'railway=station', 'railway=halt', 'amenity=hospital'])
    expect(a).toContain(t.split('=')[1]);
});

test('every filter expression is a node-way-relation test on one key', () => {
  for (const e of placeFilterArgs()) expect(e).toMatch(/^nwr\/[a-z_:]+(=[a-z_,]+)?$/);
  expect(boundaryFilterArgs()).toEqual(['r/boundary=administrative']);
  expect(boundaryLevelArgs()).toEqual(['r/admin_level=2,3,4,6']);
});

const point = (id: unknown, tags: unknown, coordinates: unknown = [8.69, 49.4]): string =>
  JSON.stringify({ type: 'Feature', id, properties: tags, geometry: { type: 'Point', coordinates } });

test('parseGeoJsonLine: a point has the id, the centre and one vertex', () => {
  expect(parseGeoJsonLine(point('n12', { amenity: 'cafe' }))).toEqual({ id: 'n12', lat: 49.4, lon: 8.69, tags: { amenity: 'cafe' }, points: [[49.4, 8.69]], polygon: null });
});

test('parseGeoJsonLine: a polygon keeps its rings as lat/lon and its centre is the middle of the box', () => {
  const line = JSON.stringify({ type: 'Feature', id: 'w5', properties: { landuse: 'cemetery' }, geometry: { type: 'Polygon', coordinates: [[[8, 49], [10, 49], [10, 51], [8, 51], [8, 49]]] } });
  const o = parseGeoJsonLine(line)!;
  expect([o.id, o.lat, o.lon]).toEqual(['w5', 50, 9]);
  expect(o.polygon).toEqual([[[49, 8], [49, 10], [51, 10], [51, 8], [49, 8]]]);
});

test('parseGeoJsonLine: a multipolygon (relation) keeps all rings; a line has points and no polygon', () => {
  const mp = JSON.stringify({ type: 'Feature', id: 'r7', properties: { tourism: 'camp_site' }, geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]] } });
  expect(parseGeoJsonLine(mp)!.polygon).toHaveLength(2);
  const ls = JSON.stringify({ type: 'Feature', id: 'w8', properties: { railway: 'platform' }, geometry: { type: 'LineString', coordinates: [[8, 49], [8.1, 49]] } });
  expect(parseGeoJsonLine(ls)).toMatchObject({ id: 'w8', polygon: null, points: [[49, 8], [49, 8.1]] });
});

test('parseGeoJsonLine: junk gives null, and a record separator in front is ignored', () => {
  for (const bad of ['', '{ not json', '[]', 'null', point('x12', {}), point('n1', null), point('n1', {}, 'oops'), point('n1', {}, [200, 91]),
    JSON.stringify({ type: 'Feature', id: 'n1', properties: {}, geometry: null }),
    JSON.stringify({ type: 'Feature', id: 'n1', properties: {}, geometry: { type: 'GeometryCollection', geometries: [] } })])
    expect(parseGeoJsonLine(bad), bad).toBeNull();
  expect(parseGeoJsonLine('\u001e' + point('n3', { a: 'b' }))).toMatchObject({ id: 'n3' });
});

test('parseGeoJsonLine: tag values are text, other values are dropped', () => {
  expect(parseGeoJsonLine(point('n1', { a: 'b', c: 3, d: null }))!.tags).toEqual({ a: 'b' });
});

test('parseGeoJsonLine: a huge outline keeps at most 300 vertices but all of its rings', () => {
  const ring = Array.from({ length: 2000 }, (_, i) => [8 + i * 1e-5, 49 + (i % 2) * 1e-5]);
  const line = JSON.stringify({ type: 'Feature', id: 'w9', properties: { landuse: 'cemetery' }, geometry: { type: 'Polygon', coordinates: [ring] } });
  const o = parseGeoJsonLine(line)!;
  expect(o.points.length).toBeLessThanOrEqual(300);
  expect(o.polygon![0]).toHaveLength(2000);
});

test('parseBoundaryLine: rings stay lon/lat, tags are kept, points and junk give null', () => {
  const line = JSON.stringify({ type: 'Feature', id: 'r62422', properties: { admin_level: '2', name: 'Deutschland' }, geometry: { type: 'MultiPolygon', coordinates: [[[[8, 49], [9, 49], [9, 50], [8, 49]]], [[[1, 1], [2, 1], [2, 2], [1, 1]]]] } });
  expect(parseBoundaryLine(line)).toEqual({ id: 'r62422', tags: { admin_level: '2', name: 'Deutschland' }, rings: [[[8, 49], [9, 49], [9, 50], [8, 49]], [[1, 1], [2, 1], [2, 2], [1, 1]]] });
  expect(parseBoundaryLine(point('n1', { admin_level: '2' }))).toBeNull();
  expect(parseBoundaryLine('{ nope')).toBeNull();
});

test('parseGeoJsonLine: osmium names areas a<n>; odd n is relation (n-1)/2, even n is way n/2', () => {
  const area = (id: string): string => JSON.stringify({ type: 'Feature', id, properties: { tourism: 'camp_site' }, geometry: { type: 'MultiPolygon', coordinates: [[[[8, 49], [9, 49], [9, 50], [8, 49]]]] } });
  expect(parseGeoJsonLine(area('a815827'))!.id).toBe('r407913');
  expect(parseGeoJsonLine(area('a1000'))!.id).toBe('w500');
  expect(parseBoundaryLine(area('a815827'))!.id).toBe('r407913');
});
