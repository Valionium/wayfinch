import fc from 'fast-check';
import { expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { BoundaryIndex, pointInRings } from '../../../pipeline/boundaries.ts';
import type { BoundaryFeature, Ring } from '../../../pipeline/boundaries.ts';

const square = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const feature = (id: string, rings: Ring[], tags: Record<string, string> = {}): BoundaryFeature => ({ id, tags, rings });
const ids = (fs: BoundaryFeature[]): string[] => fs.map((f) => f.id).sort();

plain('[PIPE-ZONE-01] a point in a hole of the boundary is outside', () => {
  const ring = feature('r1', [square(0, 0, 10, 10), square(4, 4, 6, 6)]);
  const idx = new BoundaryIndex([ring], 1);
  expect(ids(idx.lookup(2, 2))).toEqual(['r1']);
  expect(ids(idx.lookup(5, 5))).toEqual([]);
});

plain('[PIPE-ZONE-01] a multipolygon holds its exclave', () => {
  const idx = new BoundaryIndex([feature('m', [square(0, 0, 4, 4), square(20, 20, 24, 24)])], 1);
  expect(ids(idx.lookup(22, 22))).toEqual(['m']);
  expect(ids(idx.lookup(10, 10))).toEqual([]);
});

plain('[PIPE-ZONE-01] a point outside every feature finds nothing', () => {
  const idx = new BoundaryIndex([feature('a', [square(0, 0, 4, 4)])], 1);
  expect(idx.lookup(50, 50)).toEqual([]);
  expect(idx.lookup(-3, -3)).toEqual([]);
});

plain('lookup returns every feature that holds the point', () => {
  const idx = new BoundaryIndex([feature('big', [square(0, 0, 10, 10)]), feature('small', [square(2, 2, 3, 3)])], 0.5);
  expect(ids(idx.lookup(2.5, 2.5))).toEqual(['big', 'small']);
});

const randomFeatures = fc.array(
  fc.record({
    cx: fc.double({ min: 0, max: 5, noNaN: true }), cy: fc.double({ min: 0, max: 5, noNaN: true }),
    radii: fc.array(fc.double({ min: 0.2, max: 2, noNaN: true }), { minLength: 3, maxLength: 12 }),
    hole: fc.boolean(),
  }),
  { minLength: 1, maxLength: 4 },
);
const star = (cx: number, cy: number, radii: number[], scale: number): Ring => {
  const ring: Ring = radii.map((r, i) => [cx + Math.cos((2 * Math.PI * i) / radii.length) * r * scale, cy + Math.sin((2 * Math.PI * i) / radii.length) * r * scale]);
  ring.push(ring[0]!);
  return ring;
};
const spot = fc.tuple(fc.double({ min: -1, max: 7, noNaN: true }), fc.double({ min: -1, max: 7, noNaN: true }));

test.prop([randomFeatures, fc.array(spot, { minLength: 20, maxLength: 40 }), fc.double({ min: 0.1, max: 1.5, noNaN: true })])(
  'BoundaryIndex answers like a plain scan', (specs, points, cell) => {
    const features = specs.map((s, i) => feature(`f${i}`, s.hole ? [star(s.cx, s.cy, s.radii, 1), star(s.cx, s.cy, s.radii, 0.3)] : [star(s.cx, s.cy, s.radii, 1)]));
    const idx = new BoundaryIndex(features, cell);
    for (const [lon, lat] of points) {
      const brute = features.filter((f) => pointInRings(f.rings, lon, lat)).map((f) => f.id).sort();
      expect(ids(idx.lookup(lat, lon))).toEqual(brute);
    }
  },
);
