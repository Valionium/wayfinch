// Locate on route (spec section 6.1): from a fix to a route kilometre, how far off the route it lies, and which pass of
// the route it is on. Pure: the recent position and the fix's own time are arguments.
import { haversineKm, type LatLng } from '../geo/haversine.ts';
import { allSegments, segmentsNear, type SegmentIndex } from '../geo/index.ts';
import { passesOf, pointAtRouteKm, projectOnSegment, type Projection } from '../geo/project.ts';
import type { Km, Position, Route } from '../types.ts';

export type Fix = LatLng & { accuracyM: number; at: Date };

const CANDIDATE_BAND_KM = 0.2;
const RECENT_MS = 3 * 3_600_000;
const MAX_KPH = 40;
const OFF_ROUTE_MIN_M = 300;
const FAR_OFF_M = 5000;
const APPROXIMATE_OVER_M = 500;
const REJOIN_FACTOR = 1.3;
/** Fixes are not known to the millimetre, and floating-point noise must not tip a comparison with 300 m. */
const toMetres = (km: number): number => Math.round(km * 1e6) / 1e3;

/** The projections of `p` on each of `segments`, closest first being the caller's task. */
const project = (p: LatLng, route: Route, segments: number[]): Projection[] => segments.map((s) => projectOnSegment(p, route, s));

/** The closest projection in a list, the lowest kilometre on a tie. */
export function closestOf(list: Projection[]): Projection | null {
  let best: Projection | null = null;
  for (const q of list) if (!best || q.offKm < best.offKm) best = q;
  return best;
}

/** The distance from `p` to the route: the index first, widening until the answer lies inside what was searched. */
function nearestOffKm(p: LatLng, route: Route, idx: SegmentIndex): number {
  for (let radius = 2; radius <= 128; radius *= 4) {
    const best = closestOf(project(p, route, segmentsNear(idx, p, radius)));
    if (best && best.offKm <= radius) return best.offKm;
  }
  return closestOf(project(p, route, allSegments(idx)))?.offKm ?? Infinity;
}

function candidates(p: LatLng, route: Route, idx: SegmentIndex): Projection[] {
  const nearest = nearestOffKm(p, route, idx);
  if (!Number.isFinite(nearest)) return [];
  const limit = nearest + CANDIDATE_BAND_KM;
  return passesOf(project(p, route, segmentsNear(idx, p, limit)).filter((q) => q.offKm <= limit), p, route, limit);
}

const positionFrom = (p: Fix, km: Km, offKm: number): Position => ({
  lat: p.lat, lon: p.lon, accuracyM: p.accuracyM, at: p.at, km, offRouteM: toMetres(offKm),
  source: 'gps', approximate: p.accuracyM > APPROXIMATE_OVER_M,
});

const validDate = (d: Date): boolean => Number.isFinite(d.getTime());
const usableFix = (p: Fix): boolean =>
  Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && p.accuracyM >= 0 && p.accuracyM < Infinity && validDate(p.at);

/** Whether a stored position can be read at all. A bad value from the phone is no position. Written so that NaN fails. */
export const usablePosition = (p: Position): boolean =>
  usableFix(p) && Number.isFinite(p.km) && p.offRouteM >= 0 && p.offRouteM < Infinity;

export function locate(p: Fix, route: Route, idx: SegmentIndex, recent: Position | null):
  { kind: 'position'; position: Position } | { kind: 'ask'; options: [Km, Km] } | { kind: 'no-position' } {
  if (!usableFix(p)) return { kind: 'no-position' };
  const list = candidates(p, route, idx);
  const only = list[0];
  if (!only) {
    // A route of one point has no segment: the fix is measured to that point.
    const first = route.points[0];
    return { kind: 'position', position: positionFrom(p, first?.km ?? 0, first ? haversineKm(p, first) : 0) };
  }
  if (list.length === 1) return { kind: 'position', position: positionFrom(p, only.km, only.offKm) };

  if (recent) {
    const ageMs = Math.max(0, p.at.getTime() - recent.at.getTime());
    if (ageMs <= RECENT_MS) {
      const reach = (MAX_KPH * ageMs) / 3_600_000;
      const reachable = list
        .map((q) => ({ q, gap: Math.abs(q.km - recent.km) }))
        .filter((c) => c.gap <= reach)
        .sort((a, b) => a.gap - b.gap);
      const pick = reachable[0];
      if (pick) return { kind: 'position', position: positionFrom(p, pick.q.km, pick.q.offKm) };
    }
  }
  const two = [...list].sort((a, b) => a.offKm - b.offKm || a.km - b.km).slice(0, 2).sort((a, b) => a.km - b.km);
  return { kind: 'ask', options: [two[0]!.km, two[1]!.km] };
}

/** Off route: farther than 300 m or the fix's accuracy, whichever is larger. Answers then add the rejoin leg. */
export const isOffRoute = (pos: Position): boolean => pos.offRouteM > Math.max(OFF_ROUTE_MIN_M, pos.accuracyM);

/** Beyond 5 km off: the banner says the answers are approximate, and the position sets no phase. */
export const isFarOff = (pos: Position): boolean => pos.offRouteM > FAR_OFF_M;

/** Where answers measure from. An approximate position starts from the least favourable point of its radius, held to the route. */
export function adjusted(pos: Position, lengthKm: Km = Infinity): { aheadFromKm: Km; behindFromKm: Km; radius: [Km, Km] | null } {
  if (!pos.approximate) return { aheadFromKm: pos.km, behindFromKm: pos.km, radius: null };
  const accKm = pos.accuracyM / 1000;
  const ahead = Math.max(0, pos.km - accKm);
  const behind = Math.min(lengthKm, pos.km + accKm);
  return { aheadFromKm: ahead, behindFromKm: behind, radius: [ahead, behind] };
}

/** The rejoin leg in kilometres of a position `offRouteM` metres off: 1.3 times it. */
export const rejoinKm = (offRouteM: number): number => (REJOIN_FACTOR * offRouteM) / 1000;

/** A kilometre or town picked by hand: on the route, exact. Null when the kilometre or the time is no value. */
export function manualPosition(route: Route, km: Km, at: Date): Position | null {
  if (!Number.isFinite(km) || !validDate(at)) return null;
  const held = Math.max(0, Math.min(route.lengthKm, km));
  return { ...pointAtRouteKm(route, held), accuracyM: 0, at, km: held, offRouteM: 0, source: 'manual', approximate: false };
}

/**
 * Which of two positions came later: by time; of two from the same moment the manual one, which always overrides GPS; then
 * a fixed order, the more accurate last, so that the list's order decides nothing and every engine reads the same one.
 */
export const positionOrder = (a: Position, b: Position): number =>
  a.at.getTime() - b.at.getTime() || Number(a.source === 'manual') - Number(b.source === 'manual')
  || a.km - b.km || a.lat - b.lat || a.lon - b.lon || b.accuracyM - a.accuracyM || b.offRouteM - a.offRouteM;

/** The latest position, as `positionOrder` says. */
export function latestPosition(positions: Position[]): Position | null {
  let best: Position | null = null;
  for (const p of positions) if (!best || positionOrder(p, best) > 0) best = p;
  return best;
}
