import fc from 'fast-check';
import { expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { assignToTiles, splitTree } from '../../../pipeline/quadtree.ts';
import { tileBounds } from '../../../src/core/places/tiles.ts';
import type { TileId } from '../../../src/core/places/types.ts';
import { placeAt, rescueAt } from '../../fixtures/places.ts';

const placesAcrossEurope = (): fc.Arbitrary<ReturnType<typeof placeAt>[]> =>
  fc.array(fc.tuple(fc.double({ min: 35, max: 70, noNaN: true }), fc.double({ min: -10, max: 30, noNaN: true })), { minLength: 1, maxLength: 300 })
    .map((pts) => pts.map(([lat, lon], i) => placeAt('shop', lat, lon, { id: `n${i}` })));

const inside = (id: TileId, p: { lat: number; lon: number }): boolean => {
  const b = tileBounds(id);
  return p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east;
};

test.prop([placesAcrossEurope()])('[PIPE-TILE-02] no tile holds over the limit, and every place is in exactly one', (ps) => {
  const leaves = splitTree(ps, 50);
  expect(Math.max(...leaves.map((l) => l.places.length))).toBeLessThanOrEqual(50);
  expect(leaves.flatMap((l) => l.places)).toHaveLength(ps.length);
  expect(new Set(leaves.flatMap((l) => l.places.map((p) => p.id))).size).toBe(ps.length);
  for (const l of leaves) for (const p of l.places) expect(inside(l.id, p)).toBe(true);
});

plain('[PIPE-TILE-02] places at one identical point stop at the deepest level, not forever', () => {
  const ps = Array.from({ length: 60 }, (_, i) => placeAt('shop', 49.4, 8.69, { id: `n${i}` }));
  const leaves = splitTree(ps, 50);
  expect(leaves).toHaveLength(1);
  expect(leaves[0]!.id.z).toBe(14);
  expect(leaves[0]!.places).toHaveLength(60);
});

plain('[PIPE-TILE-01] a small input is one tile at level 0', () => {
  const leaves = splitTree([placeAt('shop', 49.4, 8.69, { id: 'n1' })], 50);
  expect(leaves.map((l) => l.id)).toEqual([{ z: 0, x: 0, y: 0 }]);
});

plain('splitTree of nothing is nothing', () => {
  expect(splitTree([], 50)).toEqual([]);
});

plain('assignToTiles puts a roof into the leaf that holds it', () => {
  const ps = [...Array.from({ length: 30 }, (_, i) => placeAt('shop', 49.4 + i * 1e-4, 8.69, { id: `n${i}` })), placeAt('shop', 55, 10, { id: 'nfar' })];
  const leaves = splitTree(ps, 10);
  const items = assignToTiles(leaves.map((l) => l.id), [rescueAt(49.4015, 8.69)]);
  expect(items).toHaveLength(1);
  expect(inside(items[0]!.id, { lat: 49.4015, lon: 8.69 })).toBe(true);
  expect(leaves.some((l) => l.id.z === items[0]!.id.z && l.id.x === items[0]!.id.x && l.id.y === items[0]!.id.y)).toBe(true);
});

plain('assignToTiles gives a point in an empty quadrant a leaf of its own, at the shallowest empty quadrant', () => {
  const ps = [...Array.from({ length: 30 }, (_, i) => placeAt('shop', 49.4 + i * 1e-4, 8.69, { id: `n${i}` })), placeAt('shop', 55, 10, { id: 'nfar' })];
  const leaves = splitTree(ps, 10);
  const items = assignToTiles(leaves.map((l) => l.id), [rescueAt(-30, -60), rescueAt(-31, -61)]);
  expect(items).toHaveLength(1);                                   // both fall into the same empty quadrant
  expect(items[0]!.items).toHaveLength(2);
  expect(inside(items[0]!.id, { lat: -30, lon: -60 })).toBe(true);
  expect(items[0]!.id.z).toBeLessThanOrEqual(2);
});

plain('assignToTiles with no leaves at all makes the root tile', () => {
  const items = assignToTiles([], [rescueAt(49, 8)]);
  expect(items.map((i) => i.id)).toEqual([{ z: 0, x: 0, y: 0 }]);
});
