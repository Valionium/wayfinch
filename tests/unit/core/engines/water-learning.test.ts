import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { drinkingAdvice, overDrinking, uncertainty, updateCarrying, updateDrinking, type Ride } from '../../../../src/core/engines/water-learning.ts';
import { W } from '../../../../src/core/wording/en.ts';
import { bannedHits } from '../../../fixtures/banned.ts';

const NOW = new Date('2026-10-17T12:00:00Z');
const DAY = 86_400_000;
const daysAgo = (d: number): Date => new Date(NOW.getTime() - d * DAY);
const intake = (feel: 'A' | 'B' | 'C', intakeL: number, predictedL: number, ago = 0): Ride => ({ at: daysAgo(ago), predictedL, intakeL, feel });
const weighed = (massLossKg: number, intakeL: number, predictedL: number, ago = 0, toiletStops = 0): Ride =>
  ({ at: daysAgo(ago), predictedL, intakeL, feel: null, massLossKg, toiletStops });
const avg = { thirst: 'average' as const };

describe('the carrying factor', () => {
  test('[W-K-PRIOR] prior 1.0, or 1.2 with "more"', () => {
    expect(updateCarrying(avg, [], NOW)).toEqual({ k: 1, sumW: 0, U: 1.4 });
    expect(updateCarrying({ thirst: 'more' }, [], NOW)).toEqual({ k: 1.2, sumW: 0, U: 1.4 });
  });

  test('[W-K-PRIOR] "less" gives exactly the same advice as "average"', () => {
    const rides = [intake('A', 1, 2, 3), intake('B', 2, 2, 2), weighed(2, 1, 3, 1)];
    expect(updateCarrying({ thirst: 'less' }, [], NOW)).toEqual(updateCarrying(avg, [], NOW));
    expect(updateCarrying({ thirst: 'less' }, rides, NOW)).toEqual(updateCarrying(avg, rides, NOW));
  });

  test('[W-K-BOUNDS] the prior is worth two rides: a weighed ride of r = 1.1 moves ln k by a third of ln 1.1', () => {
    const { k } = updateCarrying(avg, [weighed(2.2, 0, 2)], NOW);
    expect(Math.log(k)).toBeCloseTo(Math.log(1.1) / 3, 9);
  });

  test('[W-K-BOUNDS] the ratios: weighed, A, B, C, with 0.3 L per toilet stop', () => {
    // Weighed: (mass loss + intake - urine) / predicted, weight 1. r = (1 + 1.6 - 0.6) / 2 = 1.
    expect(updateCarrying(avg, [weighed(1, 1.6, 2, 0, 2)], NOW).k).toBeCloseTo(1, 9);
    // B: 1.2 x intake / predicted, weight 0.5. r = 1.05: ln k = 0.5 ln 1.05 / 2.5.
    expect(Math.log(updateCarrying(avg, [intake('B', 1.75, 2)], NOW).k)).toBeCloseTo((0.5 * Math.log(1.05)) / 2.5, 9);
    // A: intake / predicted, weight 0.5, and a decrease counts half. r = 0.9.
    expect(Math.log(updateCarrying(avg, [intake('A', 1.8, 2)], NOW).k)).toBeCloseTo((0.5 * (0.5 * Math.log(0.9))) / 2.5, 9);
  });

  test('[W-K-BOUNDS] one intake-only ride moves k by at most 10%', () => {
    const up = updateCarrying(avg, [intake('C', 50, 1)], NOW);
    expect(up.k).toBeCloseTo(1.1, 9);
    const start = [weighed(1.2, 0, 1, 8)];
    const before = updateCarrying(avg, start, NOW).k;
    const after = updateCarrying(avg, [...start, intake('A', 0, 1, 1)], NOW).k;
    expect(after).toBeLessThan(before);
    expect(Math.abs(Math.log(after / before))).toBeLessThanOrEqual(Math.log(1.1) + 1e-12);
  });

  test('[W-K-BOUNDS] r is clipped to 0.5-2.5', () => {
    // r = 25 and r = 2.5 give the same k, below the 10% bound (weight 0.5 of 2.5: ln 2.5 / 5 is above ln 1.1, so use a stack).
    const many = (r: number): Ride[] => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((d) => weighed(r, 0, 1, 12 - d));
    expect(updateCarrying(avg, many(25), NOW).k).toBeCloseTo(updateCarrying(avg, many(2.5), NOW).k, 12);
    expect(updateCarrying(avg, many(25), NOW).k).toBeGreaterThan(updateCarrying(avg, many(1.5), NOW).k);
    expect(updateCarrying(avg, many(0.01), NOW).k).toBeCloseTo(updateCarrying(avg, many(0.5), NOW).k, 12);
  });

  test('[W-K-BOUNDS] k stays within 0.6-2.0', () => {
    const up = Array.from({ length: 60 }, (_, i) => weighed(2.5, 0, 1, 60 - i));
    const down = Array.from({ length: 200 }, (_, i) => weighed(0.5, 0, 1, (200 - i) * 0.01));
    expect(updateCarrying({ thirst: 'more' }, up, NOW).k).toBeLessThanOrEqual(2);
    expect(updateCarrying(avg, down, NOW).k).toBeGreaterThanOrEqual(0.6);
  });

  test('[W-K-BOUNDS] decreases count half: the same ratio down moves k half as far as up', () => {
    const up = Math.log(updateCarrying(avg, [weighed(1.1, 0, 1)], NOW).k);
    const down = Math.log(updateCarrying(avg, [weighed(1 / 1.1, 0, 1)], NOW).k);
    expect(down).toBeCloseTo(-up / 2, 9);
  });

  test('[W-K-BOUNDS] weights fade with a 30-day half-life', () => {
    expect(updateCarrying(avg, [weighed(1, 0, 1, 30)], NOW).sumW).toBeCloseTo(0.5, 9);
    expect(updateCarrying(avg, [weighed(1, 0, 1, 60)], NOW).sumW).toBeCloseTo(0.25, 9);
    expect(updateCarrying(avg, [intake('B', 1, 1, 30)], NOW).sumW).toBeCloseTo(0.25, 9);
    // Inside k too: an old ride counts less at the moment of the next one.
    const r = 1.05;
    const after = (gapDays: number): number => updateCarrying(avg, [weighed(r, 0, 1, gapDays), weighed(r, 0, 1, 0)], NOW).k;
    expect(after(90)).toBeLessThan(after(1));
  });

  test('[W-K-BOUNDS] a ride that can\'t give a ratio is skipped: no intake, no answer, or a broken prediction', () => {
    for (const r of [
      { at: NOW, predictedL: 2, intakeL: null, feel: 'A' as const },
      { at: NOW, predictedL: 2, intakeL: 1, feel: null },
      { at: NOW, predictedL: 0, intakeL: 1, feel: 'B' as const },
      { at: NOW, predictedL: NaN, intakeL: 1, feel: 'B' as const },
      { at: NOW, predictedL: 2, intakeL: NaN, feel: 'B' as const },
      { at: NOW, predictedL: Infinity, intakeL: 1, feel: 'B' as const },
      { at: new Date(NaN), predictedL: 2, intakeL: 1, feel: 'B' as const },
      { at: NOW, predictedL: 2, intakeL: 1, feel: null, massLossKg: NaN },
    ]) expect(updateCarrying(avg, [r], NOW)).toEqual({ k: 1, sumW: 0, U: 1.4 });
  });

  test('[W-K-C] C sets r = max(1.3 x intake / predicted, 1.1 x k)', () => {
    // 1.3 x 1 / 2 = 0.65, so r = 1.1: ln k = 0.5 ln 1.1 / 2.5.
    expect(Math.log(updateCarrying(avg, [intake('C', 1, 2)], NOW).k)).toBeCloseTo((0.5 * Math.log(1.1)) / 2.5, 9);
    // 1.3 x 2 / 2 = 1.3 > 1.1.
    expect(Math.log(updateCarrying(avg, [intake('C', 2, 2)], NOW).k)).toBeCloseTo((0.5 * Math.log(1.3)) / 2.5, 9);
  });

  test('[W-K-C] even when old rides pull the mean down, C never lowers k', () => {
    // Decreases count half, so k sits above the plain mean. A C ride then must not pull it to the mean.
    const low = [weighed(0.5, 0, 1, 40), weighed(0.5, 0, 1, 30), weighed(0.5, 0, 1, 20), weighed(0.5, 0, 1, 10)];
    const before = updateCarrying(avg, low, NOW).k;
    expect(updateCarrying(avg, [...low, intake('C', 0, 2, 0)], NOW).k).toBeGreaterThanOrEqual(before);
  });

  fcTest.prop([
    fc.array(fc.record({ d: fc.double({ min: 0, max: 200, noNaN: true }), intakeL: fc.double({ min: 0, max: 15, noNaN: true }), predictedL: fc.double({ min: 0.1, max: 15, noNaN: true }), feel: fc.constantFrom<'A' | 'B' | 'C'>('A', 'B', 'C') }), { maxLength: 12 }),
    fc.double({ min: 0, max: 15, noNaN: true }), fc.double({ min: 0.1, max: 15, noNaN: true }),
  ])('[W-K-C] property: a C answer never lowers k, one ride never moves it by more than 10%, k stays in bounds', (rides, intakeL, predictedL) => {
    const history = rides.map((r) => intake(r.feel, r.intakeL, r.predictedL, r.d + 1));
    const before = updateCarrying(avg, history, NOW).k;
    const after = updateCarrying(avg, [...history, intake('C', intakeL, predictedL, 0)], NOW).k;
    expect(after).toBeGreaterThanOrEqual(before - 1e-12);
    expect(Math.abs(Math.log(after / before))).toBeLessThanOrEqual(Math.log(1.1) + 1e-9);
    expect(after).toBeLessThanOrEqual(2);
    expect(after).toBeGreaterThanOrEqual(0.6);
  });
});

describe('the uncertainty factor', () => {
  test('[W-U] 1.4 at 0.99, 1.3 at 1 and 2.49, 1.2 at 2.5', () => {
    expect(uncertainty(0)).toBe(1.4);
    expect(uncertainty(0.99)).toBe(1.4);
    expect(uncertainty(1)).toBe(1.3);
    expect(uncertainty(2.49)).toBe(1.3);
    expect(uncertainty(2.5)).toBe(1.2);
    expect(uncertainty(40)).toBe(1.2);
  });

  test('[W-U] a broken sum is treated as no evidence', () => {
    expect(uncertainty(NaN)).toBe(1.4);
    expect(uncertainty(-Infinity)).toBe(1.4);
    expect(uncertainty(Infinity)).toBe(1.4);
  });

  test('[W-U] it rises again as rides fade', () => {
    const rides = [weighed(1, 0, 1, 0), weighed(1, 0, 1, 0), weighed(1, 0, 1, 0)];
    expect(updateCarrying(avg, rides, NOW).U).toBe(1.2);
    expect(updateCarrying(avg, rides, new Date(NOW.getTime() + 30 * DAY)).U).toBe(1.3);
    expect(updateCarrying(avg, rides, new Date(NOW.getTime() + 90 * DAY)).U).toBe(1.4);
  });
});

describe('the drinking factor', () => {
  test('[W-KDRINK] stays 1.0 until one weighed ride', () => {
    expect(updateDrinking([], NOW)).toBe(1);
    expect(updateDrinking([intake('A', 1, 2)], NOW)).toBe(1);
  });

  test('[W-KDRINK] answers A, B, C never change it, even when they raise k', () => {
    const answers = [intake('C', 5, 1, 3), intake('C', 5, 1, 2), intake('B', 3, 1, 1)];
    expect(updateCarrying(avg, answers, NOW).k).toBeGreaterThan(1);
    expect(updateDrinking(answers, NOW)).toBe(1);
    const once = [weighed(1.2, 0, 1, 4)];
    expect(updateDrinking([...once, ...answers], NOW)).toBe(updateDrinking(once, NOW));
  });

  test('[W-KDRINK] a weighed ride moves it, symmetrically, within the same bound', () => {
    const up = Math.log(updateDrinking([weighed(1.1, 0, 1)], NOW));
    const down = Math.log(updateDrinking([weighed(1 / 1.1, 0, 1)], NOW));
    expect(up).toBeCloseTo(Math.log(1.1) / 3, 9);
    expect(down).toBeCloseTo(-up, 9);
    expect(updateDrinking([weighed(2.5, 0, 1)], NOW)).toBeCloseTo(1.1, 9);
  });

  test('[W-KDRINK] a broken weighed ride leaves it alone', () => {
    expect(updateDrinking([weighed(NaN, 0, 1)], NOW)).toBe(1);
    expect(updateDrinking([weighed(1, 0, 0)], NOW)).toBe(1);
  });
});

const advice = (o: Partial<Parameters<typeof drinkingAdvice>[0]> = {}) =>
  drinkingAdvice({ kDrink: 1, srModel: 0.8, rideMin: 240, maxPlanT: 30, minPlanT: 15, calibrated: false, ebike: false, ...o });

describe('drinking advice', () => {
  test('[W-CAPS] no prompt above 1.0 L/h uncalibrated', () => {
    expect(advice({ srModel: 1.3 }).promptLPerH).toBe(1.0);
    expect(advice({ srModel: 0.8 }).promptLPerH).toBe(0.8);
  });
  test('[W-CAPS] or 1.42 L/h for anyone', () => {
    expect(advice({ srModel: 1.3, calibrated: true }).promptLPerH).toBe(1.3);
    expect(advice({ srModel: 2, calibrated: true }).promptLPerH).toBe(1.42);
  });
  test('[W-CAPS] and none above k_drink x SR_model', () => {
    expect(advice({ srModel: 0.8, kDrink: 0.75, calibrated: true }).promptLPerH).toBeCloseTo(0.6, 12);
  });
  fcTest.prop([
    fc.double({ min: 0.25, max: 3, noNaN: true }), fc.double({ min: 0.6, max: 2, noNaN: true }), fc.boolean(),
  ])('[W-CAPS] property: every prompt keeps all three limits', (srModel, kDrink, calibrated) => {
    const p = advice({ srModel, kDrink, calibrated }).promptLPerH!;
    expect(p).toBeLessThanOrEqual(kDrink * srModel);
    expect(p).toBeLessThanOrEqual(calibrated ? 1.42 : 1.0);
    expect(p).toBeGreaterThan(0);
  });
  test('[W-CAPS] a day plan above 11.4 L is flagged; 11.4 L exactly is not', () => {
    expect(advice({ srModel: 11.4, rideMin: 60 }).dayFlag).toBe(false);
    expect(advice({ srModel: 11.5, rideMin: 60 }).dayFlag).toBe(true);
    expect(advice({ srModel: 1, rideMin: 690 }).dayFlag).toBe(true);
    expect(advice({ srModel: 1, rideMin: 60 }).dayFlag).toBe(false);
  });
  test('[W-CAPS] non-finite inputs give no prompt, and the day is flagged rather than passed', () => {
    for (const over of [{ srModel: NaN }, { kDrink: NaN }, { srModel: Infinity }, { kDrink: Infinity }]) {
      const a = advice(over);
      expect(a.promptLPerH).toBeNull();
      expect(a.dayFlag).toBe(true);
      expect(a.lines).toContain(W.waterDrinkToThirst);
    }
    expect(advice({ rideMin: NaN }).promptLPerH).toBeNull();
    expect(advice({ maxPlanT: NaN }).promptLPerH).toBeNull();
  });

  test('[W-HEAT-RULE] default: drink to thirst, in every case', () => {
    expect(advice({ maxPlanT: 20 }).lines).toContain(W.waterDrinkToThirst);
    expect(advice({ maxPlanT: 30 }).lines).toContain(W.waterDrinkToThirst);
  });
  test('[W-HEAT-RULE] a gentle schedule at 25 °C and 91 min, not at 24.9 °C or 90 min', () => {
    expect(advice({ maxPlanT: 25, rideMin: 91 }).promptLPerH).toBe(0.8);
    expect(advice({ maxPlanT: 24.9, rideMin: 91 }).promptLPerH).toBeNull();
    expect(advice({ maxPlanT: 25, rideMin: 90 }).promptLPerH).toBeNull();
  });
  test('[W-HEAT-RULE] the schedule line, salty food on long hot rides, a short reminder in the cold, nothing for altitude', () => {
    expect(advice({ maxPlanT: 25, rideMin: 91 }).lines).toContain(W.waterGentleSchedule(0.8));
    expect(advice({ maxPlanT: 25, rideMin: 91 }).lines).toContain(W.waterSaltyFood);
    expect(advice({ maxPlanT: 20 }).lines).not.toContain(W.waterSaltyFood);
    expect(advice({ maxPlanT: 8, minPlanT: 2 }).lines).toContain(W.waterColdReminder);
    expect(advice({ minPlanT: 15 }).lines).not.toContain(W.waterColdReminder);
    expect(advice().lines.join(' ')).not.toMatch(/altitude/i);
  });
  test('[W-HEAT-RULE] no line of the advice uses a banned word or calls an amount a target to reach', () => {
    for (const line of advice({ maxPlanT: 30, minPlanT: 2, srModel: 1.3 }).lines) expect(bannedHits(line)).toEqual([]);
  });

  test('[W-EBIKE] an e-bike gets no drinking schedule, and the validity label', () => {
    const a = advice({ ebike: true, maxPlanT: 30, rideMin: 240 });
    expect(a.promptLPerH).toBeNull();
    expect(a.lines).toContain(W.waterOutsideRange);
    expect(a.lines).not.toContain(W.waterGentleSchedule(0.8));
    expect(W.waterOutsideRange).toBe('outside the validated range');
  });
});

describe('over-drinking', () => {
  const base = { intakeLPerH: 1.0, lossLPerH: 0.6, hours: 4 };
  test('[W-OVERDRINK] 70 kg, median 0.6 L/h, reported 1.0 L/h over 4 h: the caution', () => {
    expect(overDrinking(base)).toBe(true);
  });
  test('[W-OVERDRINK] a weighed ride showing +0.5 kg: the caution', () => {
    expect(overDrinking({ intakeLPerH: 0.5, lossLPerH: 0.6, hours: 2, weighedGainKg: 0.5 })).toBe(true);
    expect(overDrinking({ intakeLPerH: 0.5, lossLPerH: 0.6, hours: 2, weighedGainKg: 0 })).toBe(false);
  });
  test('[W-OVERDRINK] 0.25 L/h excess or exactly 3 h: not', () => {
    expect(overDrinking({ ...base, intakeLPerH: 0.85 })).toBe(false);
    expect(overDrinking({ ...base, hours: 3 })).toBe(false);
    expect(overDrinking({ ...base, intakeLPerH: 0.86, hours: 3.01 })).toBe(true);
  });
  test('[W-OVERDRINK] a broken report triggers nothing it can\'t show', () => {
    expect(overDrinking({ ...base, intakeLPerH: NaN })).toBe(false);
    expect(overDrinking({ ...base, lossLPerH: NaN })).toBe(false);
    expect(overDrinking({ ...base, hours: NaN })).toBe(false);
    expect(overDrinking({ intakeLPerH: 0.5, lossLPerH: 0.6, hours: 2, weighedGainKg: NaN })).toBe(false);
  });
});
