import { expect, test } from 'vitest';
import { waterClass } from '../../../../src/core/places/water.ts';
import { classifyObject } from '../../../../src/core/places/classify.ts';
import { ctx, obj, opts } from './helpers.ts';

test.each([
  [{ amenity: 'drinking_water' }, false, 'A'], [{ amenity: 'water_point' }, false, 'A'],
  [{ man_made: 'water_tap', drinking_water: 'yes' }, false, 'A'], [{ amenity: 'fountain', drinking_water: 'yes' }, false, 'A'],
  [{ natural: 'spring', 'drinking_water:legal': 'yes' }, false, 'A'],
  [{ amenity: 'toilets', drinking_water: 'yes' }, false, 'A'], [{ man_made: 'water_tap', drinking_water: 'yes' }, true, 'A'],
])('[PIPE-WATER-01] %j (cemetery %s) is class A', (t, c, out) => expect(waterClass(t, { inCemetery: c })).toBe(out));

test.each([
  [{ natural: 'spring', drinking_water: 'yes' }], [{ man_made: 'water_well', drinking_water: 'yes' }],
  [{ man_made: 'water_tap' }], [{ shop: 'bakery', 'drinking_water:refill': 'yes' }],
])('[PIPE-WATER-02] %j is class B', (t) => expect(waterClass(t, { inCemetery: false })).toBe('B'));

test.each([
  [{ natural: 'spring' }, false], [{ man_made: 'water_well' }, false], [{ natural: 'spring', drinking_water: 'conditional' }, false],
  [{ natural: 'spring', drinking_water: 'boil' }, false], [{ natural: 'spring', drinking_water: 'untreated' }, false],
  [{ man_made: 'water_tap' }, true], [{ amenity: 'drinking_water', 'drinking_water:legal': 'no' }, false],
])('[PIPE-WATER-03] %j (cemetery %s) is class C', (t, c) => expect(waterClass(t, { inCemetery: c })).toBe('C'));

test.each([
  [{ amenity: 'drinking_water', drinking_water: 'no' }], [{ amenity: 'fountain' }],
  [{ amenity: 'drinking_water', disused: 'yes' }], [{ amenity: 'drinking_water', abandoned: 'yes' }],
  [{ amenity: 'drinking_water', access: 'private' }],
])('[PIPE-WATER-04] %j is class D and never reaches a pack', (t) => {
  expect(waterClass(t, { inCemetery: false })).toBe('D');
  expect(classifyObject(obj(t), ctx(), opts())).toBeNull();
});

test('things with no water function have no class', () => {
  expect(waterClass({ shop: 'bakery' }, { inCemetery: false })).toBeNull();
  expect(waterClass({ amenity: 'toilets' }, { inCemetery: false })).toBeNull();
  expect(waterClass({ amenity: 'toilets', drinking_water: 'no' }, { inCemetery: false })).toBeNull();
});

test('values are compared without regard to case', () => {
  expect(waterClass({ amenity: 'fountain', drinking_water: 'YES' }, { inCemetery: false })).toBe('A');
});

test('a cemetery tap with drinking_water=yes is class A and carries in_cemetery', () => {
  const p = classifyObject(obj({ man_made: 'water_tap', drinking_water: 'yes' }), ctx({ inCemetery: true }), opts());
  expect(p?.waterClass).toBe('A');
  expect(p?.tags.in_cemetery).toBe('yes');
  const q = classifyObject(obj({ man_made: 'water_tap' }), ctx({ inCemetery: true }), opts());
  expect(q?.waterClass).toBe('C');
  expect(q?.tags.in_cemetery).toBe('yes');
  expect(classifyObject(obj({ man_made: 'water_tap' }), ctx(), opts())?.tags.in_cemetery).toBeUndefined();
});
