// The parts of water learning that the Water card reads (spec section 6.3): the ride record, the uncertainty factor and the heat rule.
// The rest (carrying and drinking factors, drinking advice) is in water-factors.ts, which only You loads, so the first screen does
// not carry it. Everything is re-exported from water-learning.ts.
export type Ride = { at: Date; predictedL: number; intakeL: number | null; feel: 'A' | 'B' | 'C' | null; massLossKg?: number; toiletStops?: number };

/** Evidence below 1 is none yet; a broken sum counts as none, so the rider keeps the largest margin. */
export const uncertainty = (sumW: number): 1.4 | 1.3 | 1.2 => {
  if (!Number.isFinite(sumW)) return 1.4;
  if (sumW >= 2.5) return 1.2;
  return sumW >= 1 ? 1.3 : 1.4;
};

const HEAT_FROM_C = 25;
const HEAT_OVER_MIN = 90;

/** Section 6.3's heat: any planning temperature at or over 25 °C on a ride over 90 minutes. */
export const heatRule = (maxPlanT: number, rideMin: number): boolean => maxPlanT >= HEAT_FROM_C && rideMin > HEAT_OVER_MIN;
