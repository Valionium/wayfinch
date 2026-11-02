import { expect, test } from 'vitest';
import { realAscent } from '../../../../src/core/route/ascent.ts';
import type { RoutePoint } from '../../../../src/core/types.ts';

const pts = (n: number, stepKm: number, ele: (i: number) => number | null): RoutePoint[] =>
  Array.from({ length: n }, (_, i) => ({ lat: 49, lon: 8, ele: ele(i), km: i * stepKm }));

test('[LC-PORT-ASCENT] 101 points 10 m apart alternating 100 m and 103 m climb 0 m', () => {
  expect(realAscent(pts(101, 0.01, (i) => (i % 2 === 0 ? 100 : 103)))).toBe(0);
});

test('[LC-PORT-ASCENT] 101 points 20 m apart, 100 + i m with 1.5 m noise, climb 98 to 101 m, and 100 m rounded to 10 m', () => {
  const total = realAscent(pts(101, 0.02, (i) => 100 + i + (i % 2 === 0 ? 1.5 : -1.5)))!;
  expect(total).toBeGreaterThanOrEqual(98);
  expect(total).toBeLessThanOrEqual(101);
  expect(Math.round(total / 10) * 10).toBe(100);
});

test('[LC-PORT-ASCENT] a missing height anywhere gives no figure, never 0', () => {
  expect(realAscent(pts(10, 0.5, (i) => (i === 4 ? null : 100 + i)))).toBeNull();
});

test('[LC-PORT-ASCENT] short routes: nothing to climb', () => {
  expect(realAscent([])).toBe(0);
  expect(realAscent(pts(1, 0.5, () => 100))).toBe(0);
});

test('[LC-PORT-ASCENT] a steady slope of 25 m per km over 60 km climbs 1500 m, and a descent climbs 0 m', () => {
  expect(realAscent(pts(121, 0.5, (i) => 100 + i * 12.5))).toBeCloseTo(1500, 0);
  expect(realAscent(pts(121, 0.5, (i) => 1600 - i * 12.5))).toBe(0);
});

test('[LC-PORT-ASCENT] a hill of 3 m is noise but one of 5 m counts', () => {
  expect(realAscent(pts(21, 0.5, (i) => (i < 10 ? 100 : 103)))).toBe(0);
  expect(realAscent(pts(21, 0.5, (i) => (i < 10 ? 100 : 105)))).toBe(5);
});

test('[LC-PORT-ASCENT] points closer than 200 m are smoothed over 200 m, sparse ones are not', () => {
  // Alternating 100/110 m every 10 m is nearly averaged away (some is left at the two ends of the section);
  // the same pattern 0.5 km apart is kept: 10 m up each time.
  expect(realAscent(pts(41, 0.01, (i) => (i % 2 === 0 ? 100 : 110)))).toBeLessThan(10);
  expect(realAscent(pts(41, 0.5, (i) => (i % 2 === 0 ? 100 : 110)))).toBe(200);
});
