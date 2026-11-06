import { describe, expect, test } from 'vitest';
import sample from '../../../../contracts/bike-library/sample.json';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';

// Loose JSON, so a test can spoil one value at a time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test data, written by hand
type Json = any;
const [full, plain] = sample as unknown as [Record<string, unknown>, Record<string, unknown>];
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const PRESSURE_NONE = {
  bikeKg: null, wheel: 'unknown', rim: 'unknown', rimMm: null, frontMm: null, rearMm: null, frontCasing: 'unknown', rearCasing: 'unknown',
  frontMinBar: null, frontMaxBar: null, rearMinBar: null, rearMaxBar: null,
};

describe("a bike as the bag planner stores it (spec section 7.1's table), read read-only", () => {
  test('[BK-NORMALISE] the sample with every field reads back as it is', () => {
    expect(normaliseBike(clone(full))).toEqual(full);
  });

  test('[BK-NORMALISE] a bike with no fields set reads with every field at its default, the name "My bike"', () => {
    expect(normaliseBike({ id: 'bike_plain' })).toEqual({
      ...plain, name: 'My bike', pressure: PRESSURE_NONE, fit: null, maxWeight: null, maxWeightAsked: false, look: null, geometry: null,
    });
  });

  test('[BK-NORMALISE] no id, a bad id or no object reads as no bike', () => {
    for (const raw of [null, undefined, 'bike', 3, [], { name: 'x' }, { id: '' }, { id: 'has space' }, { id: 'x'.repeat(101) }, { id: 7 }]) {
      expect(normaliseBike(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  test('[BK-NORMALISE] an invalid value drops only itself', () => {
    const cases: [string, (b: Json) => void, (want: Json) => void][] = [
      ['a 200 cm triangle side', (b) => { b.fit.triangleCm.down = 200; }, (w) => { w.fit.triangleCm = null; }],
      ['lengths that are no triangle', (b) => { b.fit.triangleCm = { top: 20, seat: 30, down: 60 }; }, (w) => { w.fit.triangleCm = null; }],
      ['a 500 kg maximum', (b) => { b.maxWeight.v = 500; }, (w) => { w.maxWeight = null; }],
      ['the colour "red"', (b) => { b.look.colour = 'red'; }, (w) => { w.look.colour = null; }],
      ['a stack of 2,000 mm', (b) => { b.geometry.values.stack_mm.v = 2000; }, (w) => { delete w.geometry.values.stack_mm; }],
      ['an unknown frame style', (b) => { b.fit.style = 'tandem'; }, (w) => { w.fit.style = 'unknown'; }],
      ['a size of 90 cm', (b) => { b.fit.size = { kind: 'cm', value: 90 }; }, (w) => { w.fit.size = null; }],
      ['a handlebar called "aero"', (b) => { b.look.bars = 'aero'; }, (w) => { w.look.bars = null; }],
      ['brakes called "magic"', (b) => { b.brakes = 'magic'; }, (w) => { w.brakes = 'unknown'; }],
      ['a bike weight of 500 kg', (b) => { b.pressure.bikeKg = 500; }, (w) => { w.pressure.bikeKg = null; }],
      ['a year of 1850', (b) => { b.geometry.year = 1850; }, (w) => { w.geometry.year = null; }],
      ['an unknown field', (b) => { b.wings = 2; }, () => {}],
    ];
    for (const [name, spoil, expectDrop] of cases) {
      const bike = clone(full) as Json;
      spoil(bike);
      const want = clone(full) as Json;
      expectDrop(want);
      expect(normaliseBike(bike), name).toEqual(want);
    }
  });

  test("[TB-DETAILS-READ] suspension and rackMounts keep each listed value; anything else, a missing field or a wrong type reads 'unknown'; no other field changes", () => {
    const base = normaliseBike(clone(full))!;
    const rest = (b: Json): Json => { const others = { ...b }; delete others.suspension; delete others.rackMounts; return others; };
    for (const suspension of ['none', 'front', 'full'] as const) {
      const got = normaliseBike({ ...clone(full), suspension })!;
      expect(got.suspension, suspension).toBe(suspension);
      expect(rest(got), suspension).toEqual(rest(base));
    }
    for (const rackMounts of ['yes', 'no'] as const) {
      const got = normaliseBike({ ...clone(full), rackMounts })!;
      expect(got.rackMounts, rackMounts).toBe(rackMounts);
      expect(rest(got), rackMounts).toEqual(rest(base));
    }
    for (const odd of [{ suspension: 'Full' }, { suspension: true }, { suspension: 2 }, { suspension: null }, { rackMounts: true }, { rackMounts: 'maybe' }, { rackMounts: 'Yes' }, {}]) {
      const bike: Json = clone(full);
      delete bike.suspension; delete bike.rackMounts;
      const got = normaliseBike({ ...bike, ...odd })!;
      expect(got.suspension, JSON.stringify(odd)).toBe('unknown');
      expect(got.rackMounts, JSON.stringify(odd)).toBe('unknown');
      expect(rest(got), JSON.stringify(odd)).toEqual(rest(base));
    }
    expect(normaliseBike({ id: 'bike_bare' })).toMatchObject({ suspension: 'unknown', rackMounts: 'unknown' });
  });

  test('[BK-NORMALISE] a block with nothing set is null; a colour is stored in lower case; numbers round as the page rounds', () => {
    const bike = clone(full) as Json;
    bike.look = { colour: '#2563B8', bars: null, ebike: null };
    bike.fit = { style: 'unknown', bolts: {}, topTubeBag: 'maybe' };
    bike.maxWeight = { v: 300.04, u: 'lb', includes: 'unsure' };
    bike.geometry = { values: { stack_mm: { v: 'x' } } };
    const got = normaliseBike(bike)!;
    expect(got.look).toEqual({ colour: '#2563b8', bars: null, ebike: null });
    expect(got.fit).toBeNull();
    expect(got.maxWeight).toEqual({ v: 300, u: 'lb', includes: 'unsure' });
    expect(got.geometry).toBeNull();
    expect(normaliseBike({ id: 'a', fit: { seatGapCm: 22.04, triangleCm: { top: '51.14', seat: 35, down: 65 } } })!.fit)
      .toMatchObject({ seatGapCm: 22, triangleCm: { top: 51.1, seat: 35, down: 65 } });
  });
});
