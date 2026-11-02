// Personal factors and drinking advice (spec section 6.3). Carrying (k, U) and drinking (k_drink) are kept apart: answers
// after a ride can raise what the rider carries, but never what the app prompts them to drink.
import type { Profile } from '../types.ts';
import { W } from '../wording/en.ts';

export type Ride = { at: Date; predictedL: number; intakeL: number | null; feel: 'A' | 'B' | 'C' | null; massLossKg?: number; toiletStops?: number };

const PRIOR_WEIGHT = 2; // the prior is worth two rides
const HALF_LIFE_MS = 30 * 86_400_000;
const R_MIN = 0.5;
const R_MAX = 2.5;
const K_MIN = 0.6;
const K_MAX = 2.0;
const MAX_STEP = Math.log(1.1);
const URINE_L = 0.3;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const fade = (ageMs: number): number => 0.5 ** (Math.max(0, ageMs) / HALF_LIFE_MS);
const inOrder = (rides: Ride[]): Ride[] => rides.filter((r) => Number.isFinite(r.at.getTime())).sort((a, b) => a.at.getTime() - b.at.getTime());

type Seen = { lnR: number; w: number; t: number };

/** A weighed ride's ratio, or null without a usable weighing. */
function weighedRatio(ride: Ride): number | null {
  if (!Number.isFinite(ride.massLossKg) || ride.intakeL === null || !Number.isFinite(ride.predictedL) || ride.predictedL <= 0) return null;
  const r = (ride.massLossKg! + ride.intakeL - URINE_L * (ride.toiletStops ?? 0)) / ride.predictedL;
  return Number.isFinite(r) ? r : null;
}

/** A ride's ratio and weight at the factor `k` it starts from, or null when it can't give one. */
function observation(ride: Ride, k: number): { r: number; w: number } | null {
  const weighed = weighedRatio(ride);
  if (weighed !== null) return { r: weighed, w: 1 };
  if (ride.intakeL === null || !Number.isFinite(ride.intakeL) || !Number.isFinite(ride.predictedL) || ride.predictedL <= 0) return null;
  const share = ride.intakeL / ride.predictedL;
  switch (ride.feel) {
    case 'A': return { r: share, w: 0.5 };
    case 'B': return { r: 1.2 * share, w: 0.5 };
    case 'C': return { r: Math.max(1.3 * share, 1.1 * k), w: 0.5 };
    default: return null;
  }
}

/** The weighted geometric mean with the prior, weights faded to the moment `t`. */
function meanLn(seen: Seen[], priorLn: number, t: number): number {
  let top = PRIOR_WEIGHT * priorLn;
  let bottom = PRIOR_WEIGHT;
  for (const s of seen) {
    const w = s.w * fade(t - s.t);
    top += w * s.lnR;
    bottom += w;
  }
  return top / bottom;
}

/** Evidence below 1 is none yet; a broken sum counts as none, so the rider keeps the largest margin. */
export const uncertainty = (sumW: number): 1.4 | 1.3 | 1.2 => {
  if (!Number.isFinite(sumW)) return 1.4;
  if (sumW >= 2.5) return 1.2;
  return sumW >= 1 ? 1.3 : 1.4;
};

/** The carrying factor k and the evidence behind it, from all logged rides. "Less" thirsty never lowers the prior. */
export function updateCarrying(prior: { thirst: Profile['thirst'] }, rides: Ride[], now: Date): { k: number; sumW: number; U: 1.4 | 1.3 | 1.2 } {
  const priorLn = Math.log(prior.thirst === 'more' ? 1.2 : 1.0);
  let lnK = priorLn;
  const seen: Seen[] = [];
  let lastT: number | null = null;
  /**
   * As weights fade, a k below the prior closes the same share of its gap as the mean does. A k above the prior stays:
   * time is no evidence that a rider sweats less, and U already rises. The careful side, where section 6.3 is silent.
   */
  const fadeTo = (t: number): void => {
    if (lastT === null || t <= lastT || lnK >= priorLn) return;
    const before = meanLn(seen, priorLn, lastT);
    const moved = meanLn(seen, priorLn, t) - before;
    if (before < priorLn && moved > 0) lnK += (moved / (priorLn - before)) * (priorLn - lnK);
    lastT = t;
  };
  for (const ride of inOrder(rides)) {
    fadeTo(ride.at.getTime());
    const o = observation(ride, Math.exp(lnK));
    if (!o) continue;
    const t = ride.at.getTime();
    seen.push({ lnR: Math.log(clamp(o.r, R_MIN, R_MAX)), w: o.w, t });
    let step = meanLn(seen, priorLn, t) - lnK;
    if (step < 0) step = weighedRatio(ride) === null && ride.feel === 'C' ? 0 : step / 2;
    lnK = clamp(lnK + clamp(step, -MAX_STEP, MAX_STEP), Math.log(K_MIN), Math.log(K_MAX));
    lastT = t;
  }
  fadeTo(now.getTime());
  const sumW = seen.reduce((sum, s) => sum + s.w * fade(now.getTime() - s.t), 0);
  return { k: Math.exp(lnK), sumW, U: uncertainty(sumW) };
}

/** The drinking factor: only weighed rides move it, with symmetric updates. Until one exists, exactly 1. */
export function updateDrinking(rides: Ride[], now: Date): number {
  let lnK = 0;
  const seen: Seen[] = [];
  for (const ride of inOrder(rides)) {
    const r = weighedRatio(ride);
    if (r === null) continue;
    const t = Math.min(ride.at.getTime(), now.getTime()); // a phone clock behind the ride: age 0
    seen.push({ lnR: Math.log(clamp(r, R_MIN, R_MAX)), w: 1, t });
    lnK = clamp(lnK + clamp(meanLn(seen, 0, t) - lnK, -MAX_STEP, MAX_STEP), Math.log(K_MIN), Math.log(K_MAX));
  }
  return seen.length === 0 ? 1 : Math.exp(lnK);
}

const HEAT_FROM_C = 25;
const HEAT_OVER_MIN = 90;

/** Section 6.3's heat: any planning temperature at or over 25 °C on a ride over 90 minutes. */
export const heatRule = (maxPlanT: number, rideMin: number): boolean => maxPlanT >= HEAT_FROM_C && rideMin > HEAT_OVER_MIN;
const PROMPT_UNCALIBRATED = 1.0;
const PROMPT_ANYONE = 1.42;
const DAY_FLAG_L = 11.4;
const COLD_BELOW_C = 5;

/**
 * Drink to thirst, with a gentle schedule only in heat on a long ride. The day flag reads k_drink x SR_model over the
 * ride, before any cap. Written so that a non-finite input gives no prompt and raises the flag.
 */
export function drinkingAdvice(o: { kDrink: number; srModel: number; rideMin: number; maxPlanT: number; calibrated: boolean; ebike: boolean; minPlanT: number }):
  { promptLPerH: number | null; dayFlag: boolean; lines: string[] } {
  const plan = o.kDrink * o.srModel;
  const heat = heatRule(o.maxPlanT, o.rideMin);
  const scheduled = heat && !o.ebike && Number.isFinite(plan) && plan > 0;
  const promptLPerH = scheduled ? Math.min(plan, o.calibrated ? PROMPT_ANYONE : PROMPT_UNCALIBRATED) : null;
  const dayFlag = !(plan * (o.rideMin / 60) <= DAY_FLAG_L);

  const lines: string[] = [W.waterDrinkToThirst];
  if (o.ebike) lines.push(W.waterOutsideRange);
  if (promptLPerH !== null) lines.push(W.waterGentleSchedule(promptLPerH));
  if (heat) lines.push(W.waterSaltyFood);
  if (o.minPlanT < COLD_BELOW_C) lines.push(W.waterColdReminder);
  if (dayFlag) lines.push(W.waterDayFlag);
  return { promptLPerH, dayFlag, lines };
}

const EXCESS_L_PER_H = 0.25;
const EXCESS_OVER_H = 3;

/** The post-ride check: reported intake above the likely loss for long enough, or a weighed gain. */
export function overDrinking(o: { intakeLPerH: number; lossLPerH: number; hours: number; weighedGainKg?: number }): boolean {
  return (o.intakeLPerH > o.lossLPerH + EXCESS_L_PER_H && o.hours > EXCESS_OVER_H) || (o.weighedGainKg ?? 0) > 0;
}
