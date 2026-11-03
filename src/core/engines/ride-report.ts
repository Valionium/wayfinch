// The post-ride report on You (spec sections 3.5 and 6.3): what the rider says about a ride they have finished, worked into a
// logged ride, the drinking advice for such a day and the over-drinking check. Pure. The day's own schedule and weather are not
// kept after the day, so the loss the ride is compared with is the sweat-rate model on flat ground at the temperature the
// rider picks (ruling of group 8; the check-in range and the stored forecast stay for a later refinement).
import type { Profile } from '../types.ts';
import { LOAD_PENALTY } from '../route/stages.ts';
import { drinkingAdvice, overDrinking } from './water-factors.ts';
import type { Ride } from './water-base.ts';
import { masses, riderPower, stopRate, sweatRate } from './water-model.ts';
import type { Section } from './water-model.ts';

export type ReportTemp = 'cold' | 'cool' | 'mild' | 'warm' | 'hot';
/** The air temperature each tap stands for, °C. */
export const REPORT_TEMPS: Record<ReportTemp, number> = { cold: 3, cool: 12, mild: 20, warm: 27, hot: 33 };
const SUN_GHI: Record<ReportTemp, number> = { cold: 100, cool: 200, mild: 400, warm: 600, hot: 700 };
const PLAN_MARGIN_C = 1; // section 6.3: planning temperature is the forecast plus 1 °C
const BREAK_SHARE = 0.15;
const MIN_HOURS = 1; // "the update is skipped if the range is unknown or under an hour"
const MAX_HOURS = 16;

export type RideReport = {
  at: Date; hours: number; intakeL: number; feel: 'A' | 'B' | 'C' | null; temp: ReportTemp;
  /** Weight lost over the ride, kg (negative: gained); both weighings or none. */
  massLossKg?: number; toiletStops?: number;
  /** The one tap, "Flat or hilly?": true for hilly. */
  hilly?: boolean;
};

export type RideOutcome =
  | { ok: false; reason: 'short' | 'long' | 'intake' | 'weighing' }
  | {
    ok: true; ride: Ride; predictedL: number; srModel: number;
    advice: ReturnType<typeof drinkingAdvice>; over: boolean;
  };

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** SR_model for flat riding at the rider's usual speed, L/h, with the share of break time at the stop rate. */
function flatRate(profile: Profile, flatKph: number, temp: ReportTemp): { riding: number; perHourWithBreaks: number } {
  const { riderKg, loadKg, bikeKg } = masses(profile, null);
  const speedMs = (flatKph * LOAD_PENALTY) / 3.6;
  const section: Section = {
    hours: 1, powerW: riderPower({ totalKg: riderKg + loadKg + bikeKg, speedMs, grade: 0 }), planT: REPORT_TEMPS[temp] + PLAN_MARGIN_C,
    rhPct: 50, airflow: Math.max(1, speedMs), ghi: SUN_GHI[temp], day: true, elevM: 0,
  };
  const riding = sweatRate(section, riderKg, true);
  return { riding, perHourWithBreaks: riding + BREAK_SHARE * stopRate(section, riderKg) };
}

/** Works a report out. A report that cannot be used says why; nothing is logged then. */
export function reportRide(report: RideReport, profile: Profile, flatKph: number): RideOutcome {
  if (!finite(report.hours) || report.hours < MIN_HOURS) return { ok: false, reason: 'short' };
  if (report.hours > MAX_HOURS) return { ok: false, reason: 'long' };
  if (!finite(report.intakeL) || report.intakeL < 0 || report.intakeL > 20) return { ok: false, reason: 'intake' };
  if (report.massLossKg !== undefined && !(finite(report.massLossKg) && Math.abs(report.massLossKg) <= 10)) return { ok: false, reason: 'weighing' };
  if (report.toiletStops !== undefined && !(Number.isInteger(report.toiletStops) && report.toiletStops >= 0 && report.toiletStops <= 30)) return { ok: false, reason: 'weighing' };
  const rate = flatRate(profile, flatKph, report.temp);
  const predictedL = report.hours * rate.perHourWithBreaks;
  const ride: Ride = {
    at: report.at, predictedL, intakeL: report.intakeL, feel: report.feel,
    ...(report.massLossKg === undefined ? {} : { massLossKg: report.massLossKg }),
    ...(report.toiletStops === undefined ? {} : { toiletStops: report.toiletStops }),
    ...(report.hilly === true ? { hilly: true as const } : {}),
  };
  const temp = REPORT_TEMPS[report.temp];
  const planT = temp + PLAN_MARGIN_C;
  const advice = drinkingAdvice({
    kDrink: profile.kDrink, srModel: rate.riding, rideMin: report.hours * 60, maxPlanT: planT, minPlanT: planT,
    calibrated: profile.weighedRides > 0 || report.massLossKg !== undefined, ebike: profile.ebike,
  });
  const over = overDrinking({
    intakeLPerH: report.intakeL / report.hours, lossLPerH: profile.kDrink * rate.riding, hours: report.hours,
    ...(report.massLossKg !== undefined && report.massLossKg < 0 ? { weighedGainKg: -report.massLossKg } : {}),
  });
  return { ok: true, ride, predictedL, srModel: rate.riding, advice, over };
}
