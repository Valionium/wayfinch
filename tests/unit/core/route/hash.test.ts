import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { canonicalRoute, encodeRows, routeHash } from '../../../../src/core/route/hash.ts';
import type { RoutePoint } from '../../../../src/core/types.ts';
import { decodeRows } from '../../../fixtures/polyline.ts';

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
const point = (i: number, ele: number | null): RoutePoint => ({ lat: 49 + i * 0.001234, lon: 8.4 - i * 0.000987, ele, km: i });
const route = (n: number, ele: (i: number) => number | null): RoutePoint[] => Array.from({ length: n }, (_, i) => point(i, ele(i)));

plain('[LOC-POLYLINE] the published example of the algorithm: (38.5, -120.2), (40.7, -120.95), (43.252, -126.453) at 1e5', () => {
  const rows = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]].map((r) => r.map((v) => Math.round(v * 1e5)));
  expect(encodeRows(rows)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
});

plain('[LOC-POLYLINE] each column is a delta of the row before; an empty list is an empty line', () => {
  expect(encodeRows([])).toBe('');
  expect(decodeRows(encodeRows([[5, -5, 100], [5, -5, 100], [4, 7, -250]]), 3)).toEqual([[5, -5, 100], [5, -5, 100], [4, 7, -250]]);
});

test.prop([fc.array(fc.tuple(fc.integer({ min: -180_000_000, max: 180_000_000 }), fc.integer({ min: -90_000_000, max: 90_000_000 }), fc.integer({ min: -50_000, max: 1_000_000 })), { maxLength: 60 })])(
  '[LOC-POLYLINE] decoding gives back every row', (rows) => {
    expect(decodeRows(encodeRows(rows), 3)).toEqual(rows);
  });

describe('[LOC-HASH] the route hash', () => {
  plain('three values per point in micro-degrees and centimetres', () => {
    const pts = route(30, (i) => 100 + i * 1.234);
    const { line, missingEle, values } = canonicalRoute(pts);
    expect(values).toBe(3);
    expect(missingEle).toEqual([]);
    expect(decodeRows(line, 3)).toEqual(pts.map((p) => [Math.round(p.lat * 1e6), Math.round(p.lon * 1e6), Math.round(p.ele! * 100)]));
  });

  plain('a route with no heights has two values per point', () => {
    const pts = route(12, () => null);
    const { line, missingEle, values } = canonicalRoute(pts);
    expect(values).toBe(2);
    expect(missingEle).toEqual([]);
    expect(decodeRows(line, 2)).toEqual(pts.map((p) => [Math.round(p.lat * 1e6), Math.round(p.lon * 1e6)]));
  });

  plain('missing heights are index ranges, encoded as the previous height', () => {
    const missing = new Set([3, 4, 5, 9]);
    const pts = route(12, (i) => (missing.has(i) ? null : 100 + i));
    const { line, missingEle, values } = canonicalRoute(pts);
    expect(values).toBe(3);
    expect(missingEle).toEqual([[3, 5], [9, 9]]);
    const heights = decodeRows(line, 3).map((r) => r[2]);
    expect(heights).toEqual([10000, 10100, 10200, 10200, 10200, 10200, 10600, 10700, 10800, 10800, 11000, 11100]);
  });

  plain('heights missing at the start are encoded as 0', () => {
    const { line, missingEle } = canonicalRoute(route(5, (i) => (i < 2 ? null : 50)));
    expect(missingEle).toEqual([[0, 1]]);
    expect(decodeRows(line, 3).map((r) => r[2])).toEqual([0, 0, 5000, 5000, 5000]);
  });

  plain('the hash is the lower-case SHA-256 of the line followed by the missing list as JSON, in UTF-8', async () => {
    for (const pts of [route(40, (i) => 100 + i), route(10, () => null), route(15, (i) => (i % 4 === 0 ? null : 70 + i)), route(1, () => 5)]) {
      const { line, missingEle } = canonicalRoute(pts);
      const hash = await routeHash(pts);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).toBe(sha(line + JSON.stringify(missingEle)));
    }
  });

  plain('changing one height by 1 cm changes the hash, and so does moving one point by a millionth of a degree', async () => {
    const a = route(30, (i) => 100 + i);
    const base = await routeHash(a);
    const b = a.map((p, i) => (i === 17 ? { ...p, ele: p.ele! + 0.01 } : p));
    expect(await routeHash(b)).not.toBe(base);
    const c = a.map((p, i) => (i === 17 ? { ...p, lat: p.lat + 0.000001 } : p));
    expect(await routeHash(c)).not.toBe(base);
    expect(await routeHash(a.map((p) => ({ ...p })))).toBe(base);
  });

  plain('kilometres are not part of the hash: only the line is', async () => {
    const a = route(10, (i) => i);
    expect(await routeHash(a.map((p) => ({ ...p, km: p.km * 2 })))).toBe(await routeHash(a));
  });

  plain('missing heights in different places give different hashes', async () => {
    const a = await routeHash(route(10, (i) => (i === 4 ? null : 50)));
    const b = await routeHash(route(10, (i) => (i === 5 ? null : 50)));
    expect(a).not.toBe(b);
  });
});
