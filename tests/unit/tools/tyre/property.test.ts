import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { tyreEstimate } from '../../../../src/tools/tyre/core.ts';
import type { Limit, TyreInput } from '../../../../src/tools/tyre/core.ts';
import { tyreInput } from './cases.ts';

const limitArb = (): fc.Arbitrary<Limit> =>
  fc.oneof(
    fc.record({ value: fc.double({ min: 1.5, max: 9.5, noNaN: true }), unit: fc.constant('bar' as const) }),
    fc.record({ value: fc.integer({ min: 25, max: 140 }), unit: fc.constant('psi' as const) }),
  );
const sizeArb = fc.record({
  printedMm: fc.double({ min: 18, max: 83, noNaN: true }),
  caliperMm: fc.option(fc.double({ min: 15, max: 90, noNaN: true }), { nil: null }),
});
const inputArb: fc.Arbitrary<TyreInput> = fc
  .record({
    front: sizeArb,
    rear: sizeArb,
    rimInnerMm: fc.double({ min: 12, max: 40, noNaN: true }),
    wheelBsdMm: fc.constantFrom(622, 584, 571, 559, 507, 406),
    casing: fc.constantFrom('supple' as const, 'standard' as const, 'reinforced' as const),
    setup: fc.constantFrom('butyl' as const, 'latex' as const, 'tpu' as const, 'tubeless' as const),
    rimType: fc.constantFrom('hooked' as const, 'hookless' as const, 'tubular' as const, 'unset' as const),
    surface: fc.constantFrom('paved' as const, 'rough' as const, 'unpaved' as const),
    wet: fc.boolean(),
    bars: fc.constantFrom('drop' as const, 'flat' as const, 'other' as const),
    riderKg: fc.double({ min: 35, max: 150, noNaN: true }),
    bikeKg: fc.double({ min: 5, max: 40, noNaN: true }),
    unplacedKg: fc.double({ min: 0, max: 40, noNaN: true }),
    tyreMax: limitArb(),
    tyreMin: fc.option(limitArb(), { nil: null }),
    rimMax: fc.option(limitArb(), { nil: null }),
  })
  .map((g) => tyreInput({ ...g, load: { byPositionKg: null, unplacedKg: g.unplacedKg, emptyLuggageKg: null } }));

const PSI = 14.5037738;
const barOf = (l: Limit) => (l.unit === 'bar' ? l.value : l.value / PSI);
const inUnit = (l: Limit, shown: { bar: number; psi: number }) => (l.unit === 'bar' ? shown.bar : shown.psi);
const HOOKLESS_ROWS: [number, number][] = [[24, 5.5], [29, 5], [34, 4.5], [39, 4], [44, 3.5], [54, 3], [64, 2.5], [74, 2], [84, 1.5]];

describe('limits hold for every input', () => {
  fcTest.prop([inputArb])('[TY-PROP-LIMITS] a shown value never exceeds a limit in the unit it was entered in, never goes below a tube floor, never NaN', (input) => {
    const r = tyreEstimate(input);
    if (r.refused.length) return;
    for (const w of [r.front!, r.rear!]) {
      for (const n of [w.bar, w.psi, w.estimate, w.raw, w.windowBar[0], w.windowBar[1]]) expect(Number.isFinite(n)).toBe(true);
      for (const lim of [input.tyreMax, input.rimMax]) if (lim) expect(inUnit(lim, w)).toBeLessThanOrEqual(lim.value);
      expect(w.bar).toBeLessThanOrEqual(w.capBar + 1e-9);
      expect(w.estimate).toBeLessThanOrEqual(w.capBar);
      if (w.floorBar !== null && !r.incompatible) expect(w.estimate).toBeGreaterThanOrEqual(w.floorBar);
      if (input.rimType === 'hookless' || input.rimType === 'unset') expect(w.bar).toBeLessThanOrEqual(5);
      if (input.setup !== 'tubeless' && input.tyreMin && !r.incompatible) {
        expect(inUnit(input.tyreMin, w)).toBeGreaterThanOrEqual(input.tyreMin.value);
        expect(w.windowBar[0]).toBeGreaterThanOrEqual(barOf(input.tyreMin) - 1e-9);
      }
      expect(w.windowBar[0]).toBeLessThanOrEqual(w.windowBar[1]);
      expect(w.windowBar[1]).toBeLessThanOrEqual(w.capBar + 1e-9);
    }
  });

  fcTest.prop([inputArb, fc.constantFrom('front' as const, 'rear' as const)])('[TY-PROP-LIMITS] a hookless rim is capped by the printed width table, never by a calipered width', (input, which) => {
    const r = tyreEstimate({ ...input, rimType: 'hookless' });
    if (r.refused.length) return;
    const width = input[which].printedMm;
    const cap = HOOKLESS_ROWS.find(([hi]) => Math.ceil(width) <= hi)![1];
    expect(r[which]!.bar).toBeLessThanOrEqual(Math.min(cap, 5));
  });

  fcTest.prop([inputArb, fc.double({ min: 84.5, max: 400, noNaN: true })])('[TY-PROP-LIMITS] a width outside the table is refused in words, not extrapolated', (input, width) => {
    for (const bad of [{ ...input, front: { ...input.front, printedMm: width } }, { ...input, rear: { ...input.rear, printedMm: 17 } }]) {
      const r = tyreEstimate(bad);
      expect(r.front).toBeNull();
      expect(r.refused.length).toBeGreaterThan(0);
    }
  });

  test('[TY-PROP-LIMITS] a limit typed in the other unit: 65 entered as bar is refused, entered as psi it holds at 65 psi', () => {
    const asPsi = tyreEstimate(tyreInput({ tyreMax: { value: 65, unit: 'psi' }, measured: { frontKg: 90, rearKg: 90 } }));
    expect(asPsi.front!.psi).toBeLessThanOrEqual(65);
    const impossible = tyreEstimate(tyreInput({ tyreMax: { value: 65, unit: 'bar' } }));
    expect(impossible.front).toBeNull();
    expect(impossible.refused.join(' ')).toMatch(/psi|limit/i);
  });

  test('[TY-PROP-LIMITS] the table ends are honest: 18 and 83 mm compute, 17.9 and 84.1 do not; a rim outside the ETRTO table says so', () => {
    const at = (mm: number) => tyreEstimate(tyreInput({ front: { printedMm: mm, caliperMm: null }, rear: { printedMm: mm, caliperMm: null } }));
    expect(at(18).front).not.toBeNull();
    expect(at(83).front).not.toBeNull();
    expect(at(17.9).front).toBeNull();
    expect(at(84.1).front).toBeNull();
    const wide = tyreEstimate(tyreInput({ rimInnerMm: 40 }));
    expect(wide.warningCodes).toContain('rimOutsideTable');
    expect(tyreEstimate(tyreInput({ wheelBsdMm: 333 })).front).toBeNull();
  });
});
