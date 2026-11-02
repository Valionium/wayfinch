// The nearest rescue point (spec section 6.9): numbered signs that help rescuers find a place. It reads only a point's
// position, its ref and its passes, so the sign's own phone number can't reach the card.
import { bearingDeg, compass8 } from '../geo/bearing.ts';
import { haversineKm, type LatLng } from '../geo/haversine.ts';
import type { Km, RescuePoint } from '../types.ts';
import { shortMapDate, showKm, W } from '../wording/en.ts';

const WITHIN_M = 2000;
const NOT_STORED_OVER_M = 1000;
/** Under this a distance reads "under 50 m", and a direction would say nothing. */
const SAME_SPOT_M = 25;
/** The longest route a GPX may give (route/gpx.ts). Anything else is no route kilometre. */
const MAX_ROUTE_KM = 100_000;

export type RescueLine = {
  ref: string; lat: number; lon: number; distanceM: number;
  where: string; // "600 m north-east"
  short: string; // "KA-145 · 600 m north-east"
  lines: string[]; // the line in large text, each part in turn
  shareLine: string;
};

/** Written so that NaN, Infinity and things that are no numbers all fail. */
export const realCoordinates = (p: { lat?: unknown; lon?: unknown } | null | undefined): p is LatLng =>
  !!p && typeof p.lat === 'number' && typeof p.lon === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

/** A route kilometre that can be shown. */
export const realKm = (km: unknown): km is Km => typeof km === 'number' && km >= 0 && km <= MAX_ROUTE_KM;

/** To the nearest 50 m under 1 km, then to 0.1 km. */
export function distanceText(m: number): string {
  if (m < SAME_SPOT_M) return W.emergencyUnder50;
  const fifty = Math.round(m / 50) * 50;
  return fifty < 1000 ? `${fifty} m` : `${(Math.round(m / 100) / 10).toFixed(1)} km`;
}

/** "600 m north-east", the way this card reads any place from the position. No direction when it is right there. */
export function whereFrom(from: LatLng, to: LatLng): { metres: number; text: string; sameSpot: boolean } {
  // Fixes are not known to the millimetre, and floating-point noise must not tip a comparison with 2 km.
  const metres = Math.round(haversineKm(from, to) * 1e6) / 1e3;
  const sameSpot = metres < SAME_SPOT_M;
  return { metres, sameSpot, text: sameSpot ? distanceText(metres) : `${distanceText(metres)} ${compass8(bearingDeg(from, to))}` };
}

const isSign = (p: RescuePoint | null | undefined): p is RescuePoint => realCoordinates(p) && typeof p.ref === 'string' && p.ref.trim() !== '';

/** The route part: the pass nearest the position's kilometre, ahead or behind. With no kilometre, only a lone pass can be named. */
function routePart(kms: unknown, fromKm: Km | null): string | null {
  const passes = (Array.isArray(kms) ? kms : []).filter(realKm);
  if (!realKm(fromKm)) return passes.length === 1 ? W.emergencyRescueOnRoute(showKm(passes[0]!)) : null;
  let km: number | null = null;
  for (const k of passes) if (km === null || Math.abs(k - fromKm) < Math.abs(km - fromKm)) km = k;
  if (km === null) return null;
  const gapM = Math.abs(km - fromKm) * 1000;
  if (gapM < SAME_SPOT_M) return W.emergencyRescueOnRoute(showKm(km));
  return (km < fromKm ? W.emergencyRescueBack : W.emergencyRescueAhead)(showKm(km), distanceText(gapM));
}

/** The nearest stored point within 2 km in a straight line of `from`, or null: the card then has no rescue line. */
export function nearestRescue(points: RescuePoint[], from: LatLng, fromKm: Km | null, zoneCountry: string, dataDate: string, offRouteM: number): RescueLine | null {
  if (!realCoordinates(from) || !Array.isArray(points)) return null;
  let best: { p: RescuePoint; where: ReturnType<typeof whereFrom> } | null = null;
  for (const p of points) {
    if (!isSign(p)) continue;
    const where = whereFrom(from, p);
    if (!(where.metres <= WITHIN_M)) continue;
    const tie = best ? where.metres - best.where.metres || p.lat - best.p.lat || p.lon - best.p.lon : -1;
    if (tie < 0) best = { p, where };
  }
  if (!best) return null;

  const { p, where } = best;
  const date = shortMapDate(dataDate);
  const route = routePart(p.kms, fromKm);
  const lines = [
    W.emergencyRescuePoint(p.ref),
    where.text,
    ...(route ? [route] : []),
    ...(zoneCountry === 'DE' ? [W.emergencyRescueGerman] : []),
    W.helpGiveNumberAndCoordinates,
    date ? W.callAsMapped(date) : W.emergencyMappedNoDate,
    // Written so that an unknown distance off the route gets the note: the careful side.
    ...(offRouteM <= NOT_STORED_OVER_M ? [] : [W.emergencyRescueNotStored]),
  ];
  return {
    ref: p.ref, lat: p.lat, lon: p.lon, distanceM: where.metres, where: where.text,
    short: `${p.ref} · ${where.text}`, lines,
    shareLine: (where.sameSpot ? W.shareRescueUnder50 : W.shareRescue)(p.ref, where.text),
  };
}
