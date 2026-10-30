import { test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { haversineKm } from '../../../../src/core/geo/haversine';
import { latLng } from '../../../gen';

test('one degree of latitude is 111.19 km at R = 6371 km', () => {
  expect(haversineKm({ lat: 49, lon: 8 }, { lat: 50, lon: 8 })).toBeCloseTo(111.19, 2);
});

test('the same point is 0 km', () => {
  expect(haversineKm({ lat: 49, lon: 8 }, { lat: 49, lon: 8 })).toBe(0);
});

test.prop([latLng(), latLng()])('symmetric and within half the globe', (a, b) => {
  const d = haversineKm(a, b);
  expect(d).toBeCloseTo(haversineKm(b, a), 6);
  expect(d).toBeGreaterThanOrEqual(0);
  expect(d).toBeLessThanOrEqual(Math.PI * 6371 + 1e-6);
});
