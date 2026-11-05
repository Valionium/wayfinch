// Daily stages, ported from Load Check's planRoute, stageEffortIndex and nightStops (spec section 7.1, same constants):
// loaded speed = flat speed x 0.82; effort km = distance + 4 km per 100 m of climbing; riding hours per day steady 4,
// sporting 6, hard 8; riding days = nights + 1; stage ends at equal effort.
import type { Route, Stage } from '../types.ts';
import { distanceSamples, smoothedHeights } from './smooth.ts';
import { simplifyProfile } from './simplify.ts';
import { ASCENT_THRESHOLD_M } from './ascent.ts';

export type Pace = 'steady' | 'sporting' | 'hard';
/**
 * Why stages are split by distance: the route has no climbing figure ('missing-climbing'), its height profile is
 * incomplete ('missing-profile'), or it has a climbing total that the profile cannot place ('unlocated-climbing').
 */
export type StageFallback = 'missing-climbing' | 'missing-profile' | 'unlocated-climbing';
export type StagePlan = Stage[] & {
  basis: 'effort' | 'distance';
  fallback: StageFallback | null;
  /** Loaded speed, km/h: the flat speed x 0.82. */
  loadedKph: number;
  /** Distance plus 4 km per 100 m of climbing. */
  effectiveKm: number;
  /** The nights this pace suggests for this route (riding days minus one). */
  suggestedNights: number;
};

export const PACE_HOURS: Record<Pace, number> = { steady: 4, sporting: 6, hard: 8 };
export const LOAD_PENALTY = 0.82;
export const CLIMB_COST_KM = 4;
const MAX_RIDING_DAYS = 31;

/** The climbing of a stage as shown: to 10 m. */
export const shownAscentM = (m: number): number => Math.round(m / 10) * 10;

export type Sample = { kmExact: number; elev: number | null; upExact: number | null; effortExact: number };

/**
 * The route's effort profile: distance plus climbing, by kilometre. Stages split it evenly, and the pace function
 * (engines/pace.ts) reads riding time from it, so a stage's hours and the time to ride it are one figure.
 */
export function effortProfile(route: Route): { samples: Sample[]; effective: number; fallback: StageFallback | null; localClimbing: boolean; ascent: number | null } {
  const distance = Math.max(0, route.lengthKm);
  const ascent = route.ascentM !== null && Number.isFinite(route.ascentM) ? Math.max(0, route.ascentM) : null;

  // The profile is the route thinned to 2,000 points, as in Load Check, whose profile holds its heights in whole metres
  // (gpxProfileFrom rounds them once the climbing total is known): so both apps end the days at the same place (DF-01).
  const profile = simplifyProfile(route.points.map((p) => ({ ...p, ele: p.ele === null ? null : Math.round(p.ele) })));
  const base = distanceSamples(profile, distance);
  let fallback: StageFallback | null = null;
  const gains: number[] = [];
  let up = 0;
  const complete = base.length >= 2 && base.every((p) => p.ele !== null && Number.isFinite(p.ele));
  if (ascent === null) fallback = 'missing-climbing';
  else if (!complete) fallback = 'missing-profile';
  else if (ascent > 0) {
    const heights = smoothedHeights(base.map((p) => ({ kmExact: p.kmExact, elev: p.ele as number })));
    let reference = heights[0]!;
    heights.forEach((h, i) => {
      if (i === 0) reference = h;
      else if (h > reference + ASCENT_THRESHOLD_M) {
        up += h - reference;
        reference = h;
      } else if (h < reference) reference = h;
      gains.push(up);
    });
    if (!up) fallback = 'unlocated-climbing';
  }
  const localClimbing = ascent !== null && fallback === null;
  const equivalent = ((ascent ?? 0) * CLIMB_COST_KM) / 100;
  const effective = distance + equivalent;

  const samples: Sample[] = base.map((p, i) => {
    const upExact = localClimbing ? (up > 0 ? (gains[i]! / up) * ascent : 0) : null;
    const climbKm = localClimbing ? (upExact! * CLIMB_COST_KM) / 100
      : distance > 0 ? (p.kmExact / distance) * equivalent
      : base.length > 1 ? (i / (base.length - 1)) * equivalent : 0;
    return { kmExact: p.kmExact, elev: p.ele, upExact, effortExact: p.kmExact + climbKm };
  });
  return { samples, effective, fallback, localClimbing, ascent };
}

export function planStages(route: Route, o: { flatKph: number; pace: Pace; nights: number }): StagePlan {
  const loadedKph = o.flatKph * LOAD_PENALTY;
  const perDay = PACE_HOURS[o.pace] * loadedKph;
  const { samples, effective, fallback, localClimbing, ascent } = effortProfile(route);

  // The stage ends at equal effort (stageBoundary). A boundary is found between two samples by linear interpolation.
  const boundary = (target: number): { kmExact: number; upExact: number | null; effortExact: number } => {
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    if (target <= 0) return first;
    if (target >= effective) return last;
    let lo = 0;
    let hi = samples.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid]!.effortExact < target) lo = mid; else hi = mid;
    }
    const a = samples[lo]!;
    const b = samples[hi]!;
    const span = b.effortExact - a.effortExact;
    const f = span > 0 ? (target - a.effortExact) / span : 0;
    return {
      kmExact: a.kmExact + (b.kmExact - a.kmExact) * f,
      upExact: a.upExact !== null && b.upExact !== null ? a.upExact + (b.upExact - a.upExact) * f : null,
      effortExact: target,
    };
  };

  const suggestedDays = Math.max(1, Math.ceil(effective / perDay));
  const ridingDays = Math.max(1, Math.min(MAX_RIDING_DAYS, Math.trunc(Number.isFinite(o.nights) ? o.nights : 0) + 1));
  const stages: Stage[] = [];
  if (samples.length === 0) {
    for (let n = 1; n <= ridingDays; n++) stages.push({ day: n, startKm: 0, endKm: 0, ridingHours: 0, ascentM: null });
  } else {
    let previous = boundary(0);
    for (let n = 1; n <= ridingDays; n++) {
      const here = n === ridingDays ? samples[samples.length - 1]! : boundary((effective * n) / ridingDays);
      const upDay = here.upExact === null ? null : previous.upExact === null ? 0 : Math.max(0, here.upExact - previous.upExact);
      stages.push({
        day: n,
        startKm: previous.kmExact,
        endKm: here.kmExact,
        ridingHours: Math.max(0, here.effortExact - previous.effortExact) / loadedKph,
        ascentM: upDay,
      });
      previous = here;
    }
  }
  return Object.assign(stages, {
    basis: localClimbing && (ascent ?? 0) > 0 ? ('effort' as const) : ('distance' as const),
    fallback, loadedKph, effectiveKm: effective, suggestedNights: suggestedDays - 1,
  });
}

