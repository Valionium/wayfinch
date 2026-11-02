import { describe, expect, test } from 'vitest';
import { checkLimit, effectiveWidth, leverSplit, roundInward, tyreEstimate } from '../../../../src/tools/tyre/core.ts';
import { CASES, tyreInput, wheelLoads } from './cases.ts';

const find = (id: string) => CASES.find((c) => c.id === id)!;
const PSI = 14.5037738;
const NO_RANGE = 'This load needs more pressure than your tyre or rim allows — fit a wider tyre or carry less.';

describe('limits and warnings', () => {
  test('[TY-HOOKLESS] 120 kg on 28 mm tubeless, 25 mm hookless, 5.0 bar maximum: exactly 5.00 both ends, capped, below the ETRTO minimum', () => {
    const r = tyreEstimate(tyreInput({
      riderKg: 95, bikeKg: 10, load: { byPositionKg: null, unplacedKg: 15, emptyLuggageKg: null },
      rimType: 'hookless', rimInnerMm: 25, tyreMax: { value: 5, unit: 'bar' }, bars: 'drop',
    }));
    expect(r.front!.bar).toBe(5);
    expect(r.rear!.bar).toBe(5);
    expect(r.front!.capped && r.rear!.capped).toBe(true);
    expect(r.warnings.join(' ')).toContain('below ETRTO minimum width (29 mm)');
    expect(r.split!.source).toBe('default');
  });

  test('[TY-PRINTED] a printed 30 mm tubeless tyre on a 19 mm hookless rim caps at exactly 4.50 bar, with and without a calipered 29.5 mm', () => {
    const base = { rimType: 'hookless' as const, rimInnerMm: 19, tyreMax: { value: 6, unit: 'bar' as const }, measured: wheelLoads(120, 0.45) };
    for (const caliperMm of [null, 29.5]) {
      const r = tyreEstimate(tyreInput({ ...base, front: { printedMm: 30, caliperMm }, rear: { printedMm: 30, caliperMm } }));
      expect(r.front!.bar).toBe(4.5);
      expect(r.rear!.bar).toBe(4.5);
    }
  });

  test('[TY-FLOOR] a butyl tube raises Marathon 40-622 to exactly 3.50 bar; tubeless computes about 3.07, shows 3.05, warns only', () => {
    const tube = tyreEstimate(find('TC19').input);
    expect(tube.front!.bar).toBe(3.5);
    expect(tube.front!.raised).toBe(true);
    expect(tube.front!.limit).toBe('tube-floor');
    const free = tyreEstimate({ ...find('TC19').input, setup: 'tubeless' });
    expect(free.front!.estimate).toBeCloseTo(3.07, 1);
    expect(free.front!.bar).toBe(3.05);
    expect(free.warningCodes).toContain('belowSidewallMin');
    expect(free.incompatible).toBe(false);
  });

  test('[TY-FLOOR] with no minimum entered, the older ISO minimums apply and are labelled as such', () => {
    const narrow = tyreEstimate(tyreInput({
      setup: 'butyl', front: { printedMm: 25, caliperMm: null }, rear: { printedMm: 25, caliperMm: null }, measured: wheelLoads(40, 0.5),
    }));
    expect(narrow.front!.bar).toBeGreaterThanOrEqual(3);
    expect(narrow.decided.join(' ')).toMatch(/older ISO/i);
    const off = tyreEstimate(tyreInput({
      setup: 'butyl', surface: 'unpaved', front: { printedMm: 40, caliperMm: null }, rear: { printedMm: 40, caliperMm: null }, measured: wheelLoads(30, 0.5),
    }));
    expect(off.front!.bar).toBeGreaterThanOrEqual(1.5);
  });

  test('[TY-FLOOR] below 1.0 bar a tubeless result is warned about', () => {
    const r = tyreEstimate(tyreInput({
      front: { printedMm: 60, caliperMm: null }, rear: { printedMm: 60, caliperMm: null }, rimInnerMm: 30, surface: 'unpaved', measured: wheelLoads(40, 0.5),
    }));
    expect(r.front!.bar).toBeLessThan(1);
    expect(r.warningCodes).toContain('belowOneBar');
  });

  test('[TY-ROUND] values round down; a 5.00 bar cap shows 72 psi, 3.00 bar 43 psi, a 65 psi maximum 4.45 bar', () => {
    const five = tyreEstimate(find('TC16').input);
    expect(five.front!.bar).toBe(5);
    expect(five.front!.psi).toBe(72);
    const three = tyreEstimate(find('TC17').input);
    expect(three.rear!.bar).toBe(3);
    expect(three.rear!.psi).toBe(43);
    const psiCap = tyreEstimate(tyreInput({
      tyreMax: { value: 65, unit: 'psi' }, measured: wheelLoads(150, 0.5), front: { printedMm: 25, caliperMm: null }, rear: { printedMm: 25, caliperMm: null },
    }));
    expect(psiCap.front!.bar).toBe(4.45);
    expect(psiCap.front!.psi).toBe(65);
  });

  test('[TY-ROUND] 3.51 bar above a 3.5 bar tube floor shows 3.50 bar and 51 psi, never lower than the floor', () => {
    expect(roundInward(3.51, { step: 0.05, floor: 3.5, cap: 6 })).toBe(3.5);
    expect(roundInward(3.51 * PSI, { step: 1, floor: 3.5 * PSI, cap: 6 * PSI })).toBe(51);
    expect(roundInward(3.43, { step: 0.05, floor: 3.5, cap: 6 })).toBe(3.5);
    expect(roundInward(2.999, { step: 0.05, floor: null, cap: 3 })).toBe(2.95);
    expect(roundInward(5, { step: 0.05, floor: null, cap: 5 })).toBe(5);
    expect(roundInward(4.45, { step: 0.05, floor: null, cap: 4.45 })).toBe(4.45);
  });

  test('[TY-ROUND] the window is 90 to 100 percent of the result, never below a tube floor', () => {
    const r = tyreEstimate(find('TC18').input);
    expect(r.rear!.windowBar[1]).toBe(r.rear!.bar);
    expect(r.rear!.windowBar[0]).toBeLessThanOrEqual(r.rear!.windowBar[1]);
    expect(r.rear!.windowBar[0]).toBeGreaterThanOrEqual(r.rear!.bar * 0.9 - 0.05);
    const tube = tyreEstimate(find('TC19').input);
    expect(tube.front!.windowBar[0]).toBeGreaterThanOrEqual(3.5);
  });

  test('[TY-SPLIT] measured first, then the lever rule, then the default, with the reason', () => {
    const lever = tyreEstimate(tyreInput({
      riderKg: 70, bikeKg: 14, load: { byPositionKg: { fork: 2, rack: 8 }, unplacedKg: 0, emptyLuggageKg: null }, bars: 'drop',
    }));
    expect(lever.split!.source).toBe('lever');
    // 0.45 x 84 + 1.0 x 2 + 0.0 x 8 = 39.8 of 94 kg
    expect(lever.split!.share).toBeCloseTo(39.8 / 94, 4);
    const unplaced = tyreEstimate(tyreInput({ load: { byPositionKg: { rack: 8 }, unplacedKg: 1.5, emptyLuggageKg: null } }));
    expect(unplaced.split!.source).toBe('default');
    expect(unplaced.split!.why).toMatch(/not placed/i);
    const measured = tyreEstimate(tyreInput({ measured: { frontKg: 40, rearKg: 60 } }));
    expect(measured.split!.source).toBe('measured');
    expect(measured.split!.share).toBeCloseTo(0.4, 6);
  });

  test('[TY-SPLIT] the default is 0.45 for drop bars, 0.40 for flat or other; a backpack counts as rider; empty luggage sits at the rack', () => {
    for (const [bars, s0] of [['drop', 0.45], ['flat', 0.4], ['other', 0.4]] as const) {
      const r = tyreEstimate(tyreInput({ bars, riderKg: 80, bikeKg: 12, load: { byPositionKg: null, unplacedKg: 0, emptyLuggageKg: null } }));
      expect(r.split!.share).toBeCloseTo(s0, 6);
    }
    const a = leverSplit({ riderKg: 70, bikeKg: 14, byPositionKg: { pack: 5 }, emptyLuggageKg: null, bars: 'drop' });
    expect(a.share).toBeCloseTo(0.45, 6);
    const b = leverSplit({ riderKg: 70, bikeKg: 14, byPositionKg: {}, emptyLuggageKg: 2.4, bars: 'drop' });
    expect(b.frontKg).toBeCloseTo(0.45 * 84, 6);
    expect(b.frontKg + b.rearKg).toBeCloseTo(86.4, 6);
  });

  test('[TY-SPLIT] 47 mm on a 17 mm rim has an effective width of 43.8 mm', () => {
    expect(effectiveWidth(47, 17)).toBeCloseTo(43.8, 6);
  });

  test('[TY-WARN] hookless rims need tubeless-rated tyres; widths below the ETRTO minimum are flagged', () => {
    const r = tyreEstimate(tyreInput({ rimType: 'hookless', rimInnerMm: 25, tyreMax: { value: 6, unit: 'bar' } }));
    expect(r.warningCodes).toContain('hooklessTss');
    expect(r.warningCodes).toContain('belowEtrto');
    const tube = tyreEstimate(tyreInput({ rimType: 'hookless', setup: 'butyl', tyreMax: { value: 6, unit: 'bar' } }));
    expect(tube.warningCodes).toContain('hooklessNeedsTubeless');
    const hooked = tyreEstimate(tyreInput({ rimType: 'hooked', rimInnerMm: 19 }));
    expect(hooked.warningCodes).not.toContain('belowEtrto');
  });

  test('[TY-WARN] a floor above the cap marks the setup incompatible, in words', () => {
    // A 40 mm tyre on a hookless rim is capped at 3.5 bar, but its tube needs 4.
    const r = tyreEstimate(tyreInput({
      setup: 'butyl', rimType: 'hookless', front: { printedMm: 40, caliperMm: null }, rear: { printedMm: 40, caliperMm: null },
      tyreMin: { value: 4, unit: 'bar' }, tyreMax: { value: 6, unit: 'bar' }, measured: wheelLoads(100, 0.5),
    }));
    expect(r.incompatible).toBe(true);
    expect(r.warningCodes).toContain('incompatible');
    expect(r.warnings.join(' ')).toContain(NO_RANGE);
    expect(r.front!.bar).toBeLessThanOrEqual(3.5);
    // The older ISO minimum can do the same: 3.0 bar for a 25 mm tyre against a 2.5 bar maximum.
    const iso = tyreEstimate(tyreInput({
      setup: 'butyl', front: { printedMm: 25, caliperMm: null }, rear: { printedMm: 25, caliperMm: null }, tyreMax: { value: 2.5, unit: 'bar' },
    }));
    expect(iso.incompatible).toBe(true);
    expect(iso.front!.bar).toBeLessThanOrEqual(2.5);
    // A minimum above the maximum is refused at the start.
    const swapped = tyreEstimate(tyreInput({ setup: 'butyl', tyreMin: { value: 4, unit: 'bar' }, tyreMax: { value: 3.5, unit: 'bar' } }));
    expect(swapped.front).toBeNull();
    expect(swapped.refused.length).toBeGreaterThan(0);
  });

  test('[TY-WARN] when the cap binds, the words say so', () => {
    const r = tyreEstimate(find('TC18').input);
    expect(r.rear!.capped).toBe(true);
    expect(r.warnings.join(' ')).toContain(NO_RANGE);
  });
});

describe('typing a limit', () => {
  test('[TY-PSI-QUERY] a bar value above 10 asks whether psi was meant', () => {
    const c = checkLimit(65, 'bar', {});
    expect(c.status).toBe('ask');
    if (c.status === 'ask') {
      expect(c.question).toBe('Did you mean 65 psi?');
      expect(c.asPsi).toEqual({ value: 65, unit: 'psi' });
    }
    expect(checkLimit(9.5, 'bar', {}).status).toBe('ok');
    expect(checkLimit(65, 'psi', {}).status).toBe('ok');
  });

  test('[TY-PSI-QUERY] after the query, above 11 bar is rejected; so is above 160 psi, below the minimum, and anything not a positive number', () => {
    expect(checkLimit(65, 'bar', { keepAsBar: true }).status).toBe('rejected');
    expect(checkLimit(11.5, 'bar', { keepAsBar: true }).status).toBe('rejected');
    expect(checkLimit(10.5, 'bar', { keepAsBar: true }).status).toBe('ok');
    expect(checkLimit(161, 'psi', {}).status).toBe('rejected');
    expect(checkLimit(160, 'psi', {}).status).toBe('ok');
    expect(checkLimit(3, 'bar', { min: { value: 4, unit: 'bar' } }).status).toBe('rejected');
    expect(checkLimit(40, 'psi', { min: { value: 3, unit: 'bar' } }).status).toBe('rejected');
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(checkLimit(bad, 'bar', {}).status).toBe('rejected');
  });

  test('[TY-PSI-QUERY] each limit is compared in its entered unit: a 65 psi maximum never shows above 65 psi', () => {
    const r = tyreEstimate(tyreInput({
      tyreMax: { value: 65, unit: 'psi' }, measured: wheelLoads(200, 0.5), front: { printedMm: 25, caliperMm: null }, rear: { printedMm: 25, caliperMm: null },
    }));
    expect(r.front!.psi).toBeLessThanOrEqual(65);
    expect(r.front!.bar).toBeLessThanOrEqual(65 * 0.0689475729);
  });
});
