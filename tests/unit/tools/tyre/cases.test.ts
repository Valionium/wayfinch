import { describe, expect, test } from 'vitest';
import { altitudeShiftBar, effectiveWidth, heatedGaugeBar, p15, surfaceFactor, tyreEstimate, wheelFactor } from '../../../../src/tools/tyre/core.ts';
import { CASES, TC19_TUBELESS } from './cases.ts';
import type { Case, Range } from './cases.ts';

const TOLERANCE_NOTE: Record<string, string> = { berto: '10%', schwalbe: '12%', enve: '15%', limit: 'exact', info: 'informational' };
const inRange = (v: number, [lo, hi]: Range) => v >= lo && v <= hi;
const run = (c: Case) => {
  const r = tyreEstimate(c.input);
  if (!r.front || !r.rear) throw new Error(`${c.id} was refused: ${r.refused.join(' ')}`);
  return { front: r.front, rear: r.rear, r };
};

describe('the twenty research cases', () => {
  for (const c of CASES.filter((x) => x.band !== 'info')) {
    test(`[TY-CASES] ${c.id} (${c.band}, ${TOLERANCE_NOTE[c.band]}) is inside its published range`, () => {
      const { front, rear } = run(c);
      if (c.front) expect(inRange(front.estimate, c.front), `front ${front.estimate} not in ${c.front}`).toBe(true);
      if (c.rear) expect(inRange(rear.estimate, c.rear), `rear ${rear.estimate} not in ${c.rear}`).toBe(true);
      if (c.exactFront !== undefined) expect(front.bar).toBeCloseTo(c.exactFront, 2);
      if (c.exactRear !== undefined) expect(rear.bar).toBeCloseTo(c.exactRear, 2);
    });
  }

  test('[TY-CASES] TC13 with a tube is also inside the range, TC19 tubeless is not raised and warns only', () => {
    const tc13 = CASES.find((c) => c.id === 'TC13')!;
    const withTube = tyreEstimate({ ...tc13.input, setup: 'butyl' });
    expect(inRange(withTube.front!.estimate, tc13.front!)).toBe(true);
    expect(inRange(withTube.rear!.estimate, tc13.rear!)).toBe(true);
    const tubeless = tyreEstimate(TC19_TUBELESS());
    expect(tubeless.front!.raised).toBe(false);
    expect(tubeless.front!.estimate).toBeGreaterThanOrEqual(3.05);
    expect(tubeless.front!.estimate).toBeLessThanOrEqual(3.1);
    expect(tubeless.incompatible).toBe(false);
    expect(tubeless.warningCodes).toContain('belowSidewallMin');
  });

  test('[TY-CASES] TC20 the width and physics helpers', () => {
    expect(effectiveWidth(47, 17)).toBeCloseTo(43.8, 1);
    expect(effectiveWidth(28, 23)).toBeCloseTo(29.6, 1);
    expect(heatedGaugeBar({ gaugeBar: 4.0, fromC: 15, toC: 25, atmFromBar: 1.01325, atmToBar: 1.01325 })).toBeCloseTo(4.17, 2);
    expect(altitudeShiftBar(0, 2000)).toBeCloseTo(0.22, 2);
  });

  test('[TY-CASES] the modifiers: wheel size about +3% for 650B and +5% for 26 inch, surface by width, a tube raises it by 0.10, wet is -3%', () => {
    expect(wheelFactor(40, 622)).toBe(1);
    expect(wheelFactor(40, 584)).toBeGreaterThan(1.025);
    expect(wheelFactor(40, 584)).toBeLessThan(1.04);
    expect(wheelFactor(40, 559)).toBeGreaterThan(1.04);
    expect(wheelFactor(40, 559)).toBeLessThan(1.06);
    expect(p15(50, 28)).toBeCloseTo(5.5, 1);
    expect(surfaceFactor('paved', 40, false)).toBe(1);
    expect(surfaceFactor('unpaved', 30, false)).toBeCloseTo(0.68, 6);
    expect(surfaceFactor('unpaved', 40, false)).toBeCloseTo(0.89, 6);
    expect(surfaceFactor('unpaved', 60, false)).toBeCloseTo(1, 6);
    expect(surfaceFactor('rough', 30, false)).toBeCloseTo(0.84, 6);
    expect(surfaceFactor('unpaved', 40, true)).toBeCloseTo(0.99, 6);
    expect(surfaceFactor('unpaved', 50, true)).toBe(1);
    const base = CASES.find((c) => c.id === 'TC04')!.input;
    const dry = tyreEstimate(base).front!.estimate;
    expect(tyreEstimate({ ...base, wet: true }).front!.estimate).toBeCloseTo(dry * 0.97, 9);
    expect(tyreEstimate({ ...base, casing: 'standard' }).front!.estimate).toBeCloseTo(dry / 1.05, 9);
  });

  test('[TY-CASES] the fixture holds cases TC01 to TC19; TC20 is the helper test above', () => {
    expect(CASES.map((c) => c.id)).toEqual(Array.from({ length: 19 }, (_, i) => `TC${String(i + 1).padStart(2, '0')}`));
  });
});

describe('the informational case', () => {
  test('[TY-VITTORIA] 50 mm at 70 kg stays inside the limits, and the deviation from the maker is printed, not gated', () => {
    const c = CASES.find((x) => x.id === 'TC15')!;
    const { front, rear } = run(c);
    expect(front.bar).toBeLessThanOrEqual(c.input.tyreMax.value);
    expect(rear.bar).toBeLessThanOrEqual(c.input.tyreMax.value);
    // Vittoria 1.89 / 1.99 bar against ours: the research documents about -30%.
    const dev = (ours: number, theirs: number) => Math.round(((ours - theirs) / theirs) * 100);
    console.log(`TY-VITTORIA informational: front ${front.estimate.toFixed(2)} vs 1.89 (${dev(front.estimate, 1.89)}%), rear ${rear.estimate.toFixed(2)} vs 1.99 (${dev(rear.estimate, 1.99)}%)`);
    expect(Number.isFinite(front.estimate) && Number.isFinite(rear.estimate)).toBe(true);
  });
});
