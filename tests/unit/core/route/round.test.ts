import fc from 'fast-check';
import { expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { roundPoint } from '../../../../src/core/route/round.ts';

plain('[LOC-ROUND] 49.12345678 becomes 49.123457 and a height of 123.456 becomes 123.46', () => {
  const p = roundPoint({ lat: 49.12345678, lon: 8.98765432, ele: 123.456 });
  expect(p.lat).toBe(49.123457);
  expect(p.lon).toBe(8.987654);
  expect(p.ele).toBe(123.46);
});

plain('[LOC-ROUND] half a unit rounds up, also below zero, and a missing height stays missing', () => {
  expect(roundPoint({ lat: 0.0000005, lon: -0.0000015, ele: null })).toMatchObject({ lat: 0.000001, lon: -0.000001, ele: null });
  expect(roundPoint({ lat: 1, lon: 1, ele: 0.005 }).ele).toBe(0.01);
  expect(roundPoint({ lat: 1, lon: 1, ele: -0.4 }).ele).toBe(-0.4);
  expect(Object.is(roundPoint({ lat: -0.0000001, lon: 0, ele: -0.001 }).lat, 0)).toBe(true);
  expect(Object.is(roundPoint({ lat: 1, lon: 1, ele: -0.001 }).ele, 0)).toBe(true);
});

plain('[LOC-ROUND] the kilometre is kept as given', () => {
  expect(roundPoint({ lat: 1, lon: 1, ele: 1, km: 12.3456789 }).km).toBe(12.3456789);
});

test.prop([
  fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }),
  fc.option(fc.double({ min: -500, max: 10000, noNaN: true }), { nil: null }),
])('[LOC-ROUND] rounding twice changes nothing', (lat, lon, ele) => {
  const once = roundPoint({ lat, lon, ele });
  expect(roundPoint(once)).toEqual(once);
});

test.prop([fc.double({ min: -90, max: 90, noNaN: true })])('[LOC-ROUND] latitude moves by less than half a millionth of a degree', (lat) => {
  expect(Math.abs(roundPoint({ lat, lon: 0, ele: null }).lat - lat)).toBeLessThanOrEqual(5.0000001e-7);
});
