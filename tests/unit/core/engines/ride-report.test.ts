import { describe, expect, test } from 'vitest';
import { REPORT_TEMPS, reportRide } from '../../../../src/core/engines/ride-report.ts';
import type { RideReport } from '../../../../src/core/engines/ride-report.ts';
import { updateCarrying } from '../../../../src/core/engines/water-learning.ts';
import { W } from '../../../../src/core/wording/en.ts';
import type { Profile } from '../../../../src/core/types.ts';

const profile: Profile = { weightKg: 75, thirst: 'average', ebike: false, capacityL: null, k: 1, sumW: 0, kDrink: 1, weighedRides: 0 };
const at = new Date('2026-10-10T18:00:00Z');
const base: RideReport = { at, hours: 5, intakeL: 2, feel: 'B', temp: 'mild' };

describe('the post-ride report (spec sections 3.5 and 6.3)', () => {
  test('[YOU-WATER-LEARN] a ride under an hour, over 16 hours, a broken drink or a broken weighing is not taken in', () => {
    expect(reportRide({ ...base, hours: 0.5 }, profile, 25)).toEqual({ ok: false, reason: 'short' });
    expect(reportRide({ ...base, hours: Number.NaN }, profile, 25)).toEqual({ ok: false, reason: 'short' });
    expect(reportRide({ ...base, hours: 17 }, profile, 25)).toEqual({ ok: false, reason: 'long' });
    expect(reportRide({ ...base, intakeL: -1 }, profile, 25)).toEqual({ ok: false, reason: 'intake' });
    expect(reportRide({ ...base, intakeL: 21 }, profile, 25)).toEqual({ ok: false, reason: 'intake' });
    expect(reportRide({ ...base, massLossKg: 11 }, profile, 25)).toEqual({ ok: false, reason: 'weighing' });
    expect(reportRide({ ...base, toiletStops: 1.5 }, profile, 25)).toEqual({ ok: false, reason: 'weighing' });
  });

  test('[YOU-WATER-LEARN] the loss it is compared with grows with the warmth and the hours, and a heavier or faster rider loses more', () => {
    const loss = (o: Partial<RideReport>, p: Profile = profile, kph = 25): number => {
      const r = reportRide({ ...base, ...o }, p, kph);
      if (!r.ok) throw new Error('refused');
      return r.predictedL;
    };
    const temps = (Object.keys(REPORT_TEMPS) as (keyof typeof REPORT_TEMPS)[]).map((temp) => loss({ temp }));
    expect([...temps].sort((a, b) => a - b)).toEqual(temps);
    expect(loss({ hours: 8 })).toBeGreaterThan(loss({ hours: 4 }));
    expect(loss({ temp: 'hot' }, { ...profile, weightKg: 100 })).toBeGreaterThan(loss({ temp: 'hot' }, { ...profile, weightKg: 60 }));
    expect(loss({ temp: 'hot' }, profile, 32)).toBeGreaterThan(loss({ temp: 'hot' }, profile, 20));
    expect(temps.every((t) => t > 0 && t < 30)).toBe(true);
  });

  test('[YOU-WATER-LEARN] the ride it logs moves the factors the engine reads: ran out (C) raises k, plenty left over (A) never raises it, weighing moves k_drink', () => {
    const logged = (o: Partial<RideReport>) => {
      const r = reportRide({ ...base, ...o }, profile, 25);
      if (!r.ok) throw new Error('refused');
      return r.ride;
    };
    const c = updateCarrying({ thirst: 'average' }, [logged({ feel: 'C', intakeL: 2.5 })], at);
    expect(c.k).toBeGreaterThan(1);
    expect(c.sumW).toBeGreaterThan(0);
    const a = updateCarrying({ thirst: 'average' }, [logged({ feel: 'A', intakeL: 0.3 })], at);
    expect(a.k).toBeLessThanOrEqual(1);
    const weighed = logged({ massLossKg: 1.2, toiletStops: 1 });
    expect(weighed.massLossKg).toBe(1.2);
    expect(weighed.toiletStops).toBe(1);
  });

  test('[YOU-WATER-LEARN] drinking advice: drink to thirst always; a schedule only in heat on a long ride; none for an e-bike', () => {
    const lines = (o: Partial<RideReport>, p: Profile = profile): string[] => {
      const r = reportRide({ ...base, ...o }, p, 25);
      if (!r.ok) throw new Error('refused');
      return r.advice.lines;
    };
    expect(lines({ temp: 'mild' })).toEqual([W.waterDrinkToThirst]);
    const hot = lines({ temp: 'hot', hours: 6 });
    expect(hot).toContain(W.waterDrinkToThirst);
    expect(hot).toContain(W.waterSaltyFood);
    expect(hot.some((l) => l.includes('/h') || l.toLowerCase().includes('hour'))).toBe(true);
    expect(lines({ temp: 'hot', hours: 6 }, { ...profile, ebike: true }).some((l) => l === W.waterOutsideRange)).toBe(true);
    expect(lines({ temp: 'cold', hours: 3 })).toContain(W.waterColdReminder);
  });

  test('[YOU-WATER-LEARN] over-drinking: well above the likely loss for over 3 hours, or a gain on the scale; a modest drink or a short ride is not', () => {
    const over = (o: Partial<RideReport>): boolean => {
      const r = reportRide({ ...base, ...o }, profile, 25);
      if (!r.ok) throw new Error('refused');
      return r.over;
    };
    expect(over({ hours: 6, intakeL: 9, temp: 'cool' })).toBe(true);
    expect(over({ hours: 6, intakeL: 1.5, temp: 'cool' })).toBe(false);
    expect(over({ hours: 2, intakeL: 6, temp: 'cool' })).toBe(false); // not over 3 hours, so only the scale can say so
    expect(over({ hours: 2, intakeL: 1, massLossKg: -0.5 })).toBe(true);
    expect(over({ hours: 2, intakeL: 1, massLossKg: 0.5 })).toBe(false);
  });

  test('[YOU-TERRAIN] the terrain tap goes onto the logged ride: hilly is marked, flat and untouched carry no mark', () => {
    const logged = (o: Partial<RideReport>) => {
      const r = reportRide({ ...base, ...o }, profile, 25);
      if (!r.ok) throw new Error('refused');
      return r.ride;
    };
    expect(logged({ hilly: true }).hilly).toBe(true);
    expect('hilly' in logged({ hilly: false })).toBe(false);
    expect('hilly' in logged({})).toBe(false);
  });

  test('[YOU-TERRAIN] a hilly report is not judged against the flat estimate: drink to thirst only, no schedule, no over-drinking caution, not counted as calibrated', () => {
    // The reviewer's probe: a warm 5 h hilly ride, 0.9 L/h, weighed 1.0 kg lighter (the real loss was far above the flat figure).
    const probe: RideReport = { at, hours: 5, intakeL: 4.5, feel: null, temp: 'warm', massLossKg: 1.0 };
    const hilly = reportRide({ ...probe, hilly: true }, profile, 25);
    if (!hilly.ok) throw new Error('refused');
    expect(hilly.advice.lines).toEqual([W.waterDrinkToThirst]);
    expect(hilly.advice.promptLPerH).toBeNull();
    expect(hilly.advice.dayFlag).toBe(false);
    expect(hilly.over).toBe(false);
    // The same words on flat ground are judged as before (the over-drinking check and the schedule remain for flat rides).
    const flat = reportRide(probe, profile, 25);
    if (!flat.ok) throw new Error('refused');
    expect(flat.over).toBe(true);
    // A weighed gain on a hilly day gives no caution either.
    const gain = reportRide({ ...probe, massLossKg: -0.5, hilly: true }, profile, 25);
    if (!gain.ok) throw new Error('refused');
    expect(gain.over).toBe(false);
  });
});
