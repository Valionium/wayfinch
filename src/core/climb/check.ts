// Climb check (the owner's idea of 14 November 2026, design 2026-11-14-climb-check-design.md): the route's climbs, the hardest
// first, each with its riding time at the trip's flat speed and a plain judgement from its steepest 500 m. The climbs are
// the route's own (CL-CLIMB, as En route's Climbing card reads them) and the time is the pace engine's, so Trip, En route and
// Climb check give one figure. A route with a missing height has no climbs here either: unknown, never "none".
import { ridingMin } from '../engines/pace.ts';
import type { Climb, Km, Route } from '../types.ts';

/** The steepest 500 m at this grade or more: steep, low gears with a loaded bike. */
export const CLIMB_STEEP_PCT = 8;
/** The steepest 500 m at this grade or more: likely a walk in places with a loaded bike (near walking speed at a touring effort). */
export const CLIMB_WALK_PCT = 12;
/** At most this many climbs are listed; the rest are counted. */
export const CLIMBS_SHOWN = 10;

export type ClimbLevel = 'steady' | 'steep' | 'walk';

export type CheckedClimb = {
  startKm: Km; topKm: Km; lengthKm: Km; gainM: number; avgGradePct: number; steepestPct: number;
  /** Riding minutes at the trip's flat speed with a loaded bike, without breaks; null when the speed gives no time. */
  ridingMin: number | null;
  level: ClimbLevel;
  /** The trip's days it starts and ends on, as Trip's days; null before the days are planned. */
  firstDay: number | null;
  lastDay: number | null;
  /** Each day that ends partway up it (review of PR 150, I1). */
  dayEnds: { day: number; km: Km }[];
};

export type ClimbCheck = { kind: 'no-heights' } | { kind: 'none' } | { kind: 'climbs'; climbs: CheckedClimb[]; more: number };

/** The judgement of the steepest 500 m. A bike with a motor gets no walk judgement: that depends on its assist. */
export function climbLevel(steepestPct: number, ebike = false): ClimbLevel {
  if (!ebike && steepestPct >= CLIMB_WALK_PCT) return 'walk';
  return steepestPct >= CLIMB_STEEP_PCT ? 'steep' : 'steady';
}

/** Minutes as shown: to 5, never under 5. */
export const shownClimbMin = (min: number): number => Math.max(5, Math.round(min / 5) * 5);

/** Long and steep rank high: gain times the average grade. */
const hardness = (c: Climb): number => c.gainM * c.avgGradePct;

const valid = (c: Climb): boolean =>
  [c.startKm, c.topKm, c.gainM, c.avgGradePct, c.steepest500mPct].every((v) => Number.isFinite(v)) && c.topKm > c.startKm;

export function climbCheck(route: Route, o: { flatKph: number; ebike?: boolean }): ClimbCheck {
  const heights = route.ascentM !== null && Number.isFinite(route.ascentM) && route.points.length >= 2 && route.points.every((p) => p.ele !== null && Number.isFinite(p.ele));
  if (!heights) return { kind: 'no-heights' };
  const found = route.climbs.filter(valid).sort((a, b) => hardness(b) - hardness(a) || a.startKm - b.startKm);
  if (found.length === 0) return { kind: 'none' };
  const stages = route.stages;
  // A climb starting where a day ends starts on the next day; one ending where a day ends is that day's.
  const firstDayOf = (km: Km): number | null =>
    stages.length === 0 ? null : (stages.find((s) => km >= s.startKm && km < s.endKm) ?? stages[stages.length - 1]!).day;
  const lastDayOf = (km: Km): number | null =>
    stages.length === 0 ? null : (stages.find((s) => km > s.startKm && km <= s.endKm) ?? stages[stages.length - 1]!).day;
  const climbs = found.slice(0, CLIMBS_SHOWN).map((c): CheckedClimb => {
    const min = ridingMin(route, c.startKm, c.topKm, o.flatKph);
    return {
      startKm: c.startKm, topKm: c.topKm, lengthKm: c.topKm - c.startKm, gainM: c.gainM, avgGradePct: c.avgGradePct, steepestPct: c.steepest500mPct,
      ridingMin: Number.isFinite(min) ? min : null, level: climbLevel(c.steepest500mPct, o.ebike === true),
      firstDay: firstDayOf(c.startKm), lastDay: lastDayOf(c.topKm),
      dayEnds: stages.filter((s) => s.endKm > c.startKm && s.endKm < c.topKm).map((s) => ({ day: s.day, km: s.endKm })),
    };
  });
  return { kind: 'climbs', climbs, more: found.length - climbs.length };
}
