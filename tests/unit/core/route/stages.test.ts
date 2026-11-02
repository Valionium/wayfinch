import fc from 'fast-check';
import { describe, expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { planStages, shownAscentM } from '../../../../src/core/route/stages.ts';
import { exactRoute, routeOf, sampled } from '../../../fixtures/route.ts';

const ramp120 = sampled(120, 0.5, (km) => (km <= 60 ? 100 + 25 * km : 1600));
const climb120 = () => routeOf(ramp120);

describe('ported from Load Check (section 7.1)', () => {
  plain('[LC-PORT-STAGES] 120 km climbing 1,500 m, 25 km/h, sporting, 1 night: day 1 = 45.0 km, 1,125 m up (shown 1,130), 4.4 h; day 2 = 75.0 km, 375 m up (shown 380), 4.4 h', async () => {
    const plan = planStages(exactRoute(ramp120), { flatKph: 25, pace: 'sporting', nights: 1 });
    expect(plan).toHaveLength(2);
    expect(plan.basis).toBe('effort');
    expect(plan.fallback).toBeNull();
    const d1 = plan[0]!;
    const d2 = plan[1]!;
    expect(d1.day).toBe(1);
    expect(d1.startKm).toBe(0);
    expect(d1.endKm).toBeCloseTo(45.0, 9);
    expect(d1.ascentM).toBeCloseTo(1125, 6);
    expect(shownAscentM(d1.ascentM!)).toBe(1130);
    expect(d1.ridingHours).toBeCloseTo(90 / 20.5, 2);
    expect(Math.round(d1.ridingHours * 10) / 10).toBe(4.4);
    expect(d2.day).toBe(2);
    expect(d2.startKm).toBe(d1.endKm);
    expect(d2.endKm - d2.startKm).toBeCloseTo(75.0, 9);
    expect(d2.ascentM).toBeCloseTo(375, 6);
    expect(shownAscentM(d2.ascentM!)).toBe(380);
    expect(Math.round(d2.ridingHours * 10) / 10).toBe(4.4);
  });

  plain('[LC-PORT-STAGES] the pace suggests the nights: 180 km of effort at 123 km a day is 2 days, 1 night', async () => {
    const plan = planStages(await climb120(), { flatKph: 25, pace: 'sporting', nights: 1 });
    expect(plan.suggestedNights).toBe(1);
    expect(planStages(await climb120(), { flatKph: 25, pace: 'steady', nights: 0 }).suggestedNights).toBe(2);
    expect(planStages(await climb120(), { flatKph: 25, pace: 'hard', nights: 0 }).suggestedNights).toBe(1);
  });

  plain('[LC-PORT-STAGES] nights are clipped to 0 to 30 and fractions dropped', async () => {
    const route = await routeOf(sampled(300, 5, () => 100));
    expect(planStages(route, { flatKph: 25, pace: 'steady', nights: -3 })).toHaveLength(1);
    expect(planStages(route, { flatKph: 25, pace: 'steady', nights: 99 })).toHaveLength(31);
    expect(planStages(route, { flatKph: 25, pace: 'steady', nights: 2.9 })).toHaveLength(3);
  });

  plain('[LC-PORT-DISTANCE] flat 100 km, 25 km/h, steady, 0 nights: one stage of 100 km, 4.9 h, planned by distance, no fallback', async () => {
    const plan = planStages(await routeOf(sampled(100, 1, () => 120)), { flatKph: 25, pace: 'steady', nights: 0 });
    expect(plan).toHaveLength(1);
    expect(plan[0]!.startKm).toBe(0);
    expect(plan[0]!.endKm).toBeCloseTo(100, 1);
    expect(plan[0]!.ridingHours).toBeCloseTo(100 / 20.5, 3);
    expect(Math.round(plan[0]!.ridingHours * 10) / 10).toBe(4.9);
    expect(plan.basis).toBe('distance');
    expect(plan.fallback).toBeNull();
    expect(plan[0]!.ascentM).toBe(0);
  });

  plain('[LC-PORT-NOHEIGHT] 90 km without heights, 25 km/h, sporting, 2 nights: stops at km 30, 60, 90, no climbing, 1.5 h a stage, never 0 m', async () => {
    const plan = planStages(await routeOf(sampled(90, 1, null)), { flatKph: 25, pace: 'sporting', nights: 2 });
    expect(plan.fallback).toBe('missing-climbing');
    expect(plan.basis).toBe('distance');
    expect(plan).toHaveLength(3);
    expect(plan[0]!.endKm).toBeCloseTo(30, 1);
    expect(plan[1]!.endKm).toBeCloseTo(60, 1);
    expect(plan[2]!.endKm).toBeCloseTo(90, 1);
    expect(plan.every((s) => s.ascentM === null)).toBe(true);
    expect(plan.every((s) => Math.round(s.ridingHours * 10) / 10 === 1.5)).toBe(true);
  });

  plain('[LC-PORT-HOURS] 200 km, 2,000 m, 32 km/h, hard, 0 nights: loaded 26.24 km/h, effective 280 km, 10.7 h', async () => {
    const plan = planStages(await routeOf(sampled(200, 0.5, (km) => 10 * km)), { flatKph: 32, pace: 'hard', nights: 0 });
    expect(plan.loadedKph).toBeCloseTo(26.24, 6);
    expect(plan.effectiveKm).toBeCloseTo(280, 3);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.ridingHours).toBeCloseTo(280 / 26.24, 2);
    expect(Math.round(plan[0]!.ridingHours * 10) / 10).toBe(10.7);
    expect(plan.basis).toBe('effort');
  });

  plain('[LC-PORT-STAGES] a climbing total that the profile cannot place splits by distance and says so', async () => {
    const flat = await routeOf(sampled(10, 0.5, () => 100));
    const plan = planStages({ ...flat, ascentM: 500 }, { flatKph: 25, pace: 'sporting', nights: 1 });
    expect(plan).toHaveLength(2);
    expect(plan.fallback).toBe('unlocated-climbing');
    expect(plan.basis).toBe('distance');
    expect(plan.every((s) => s.ascentM === null)).toBe(true);
    expect(plan[0]!.endKm).toBeCloseTo(plan[1]!.endKm / 2, 6);
  });

  plain('[LC-PORT-STAGES] a dense route of 5,000 points is planned like the same route with 500 points', async () => {
    const f = (km: number): number => (km <= 60 ? 100 + 25 * km : 1600);
    const dense = planStages(await routeOf(sampled(120, 0.024, f)), { flatKph: 25, pace: 'sporting', nights: 1 });
    const sparse = planStages(await routeOf(sampled(120, 0.24, f)), { flatKph: 25, pace: 'sporting', nights: 1 });
    expect(dense[0]!.endKm).toBeCloseTo(sparse[0]!.endKm, 1);
    expect(dense[0]!.ascentM!).toBeCloseTo(sparse[0]!.ascentM!, -1);
  });
});

test.prop([
  fc.integer({ min: 0, max: 12 }),
  fc.constantFrom('steady' as const, 'sporting' as const, 'hard' as const),
  fc.integer({ min: 15, max: 40 }),
  fc.array(fc.integer({ min: -20, max: 60 }), { minLength: 2, maxLength: 40 }),
  fc.boolean(),
])('[LC-PORT-STAGES] stages are contiguous, cover the route, and their hours add up to the effort', async (nights, pace, flat, steps, heights) => {
  let h = 500;
  const pairs = steps.map((d, i): [number, number | null] => { h = Math.max(0, h + d); return [i * 2.5, heights ? h : null]; });
  const route = await routeOf(pairs);
  const plan = planStages(route, { flatKph: flat, pace, nights });
  expect(plan).toHaveLength(nights + 1);
  expect(plan[0]!.startKm).toBe(0);
  plan.forEach((s, i) => {
    expect(Number.isFinite(s.endKm) && Number.isFinite(s.ridingHours)).toBe(true);
    expect(s.endKm).toBeGreaterThanOrEqual(s.startKm);
    if (i > 0) expect(s.startKm).toBe(plan[i - 1]!.endKm);
    if (s.ascentM !== null) expect(s.ascentM).toBeGreaterThanOrEqual(0);
  });
  expect(plan.at(-1)!.endKm).toBeCloseTo(route.lengthKm, 6);
  const hours = plan.reduce((a, s) => a + s.ridingHours, 0);
  expect(hours * plan.loadedKph).toBeCloseTo(plan.effectiveKm, 6);
});
