// The position routine of spec section 9.2: only after a tap, watch with high accuracy, accept readings up to 30 s old, for at
// most 45 s; keep the best reading and stop as soon as it is within 50 m. Then the route decides where on it that is (section
// 6.1): `locate` may find no position or ask which of two passes, and a kilometre picked by hand may be no kilometre at all.
import type { Fix } from '../core/engines/locate.ts';
import { latestPosition, locate, manualPosition } from '../core/engines/locate.ts';
import { haversineKm } from '../core/geo/haversine.ts';
import { buildSegmentIndex } from '../core/geo/index.ts';
import { pointAtRouteKm } from '../core/geo/project.ts';
import type { Km, Position, Route } from '../core/types.ts';

export type WatchOptions = { timeoutMs: number; goodM: number; maximumAgeMs: number };
export const ROUTINE: WatchOptions = { timeoutMs: 45_000, goodM: 50, maximumAgeMs: 30_000 };

export type Failure = { kind: 'denied' | 'unavailable' | 'timeout' | 'unsupported' };
export const isFailure = (x: Fix | Failure): x is Failure => 'kind' in x;

type Timers = { setTimeout: (f: () => void, ms: number) => unknown; clearTimeout: (t: unknown) => void };
const realTimers: Timers = { setTimeout: (f, ms) => globalThis.setTimeout(f, ms), clearTimeout: (t) => globalThis.clearTimeout(t as number) };

/**
 * Watches the position until a reading is good enough or the time is up, and gives the best one, or why there is none. `stop` ends it
 * at once (the trip it was for is gone).
 */
export function watchBest(o: WatchOptions, geo: Geolocation | undefined, timers: Timers = realTimers, stop?: AbortSignal): Promise<Fix | Failure> {
  if (!geo || typeof geo.watchPosition !== 'function') return Promise.resolve({ kind: 'unsupported' });
  return new Promise((resolve) => {
    let best: Fix | null = null;
    let lastError: Failure['kind'] | null = null;
    let done = false;
    let id: number | null = null;
    let timer: unknown = null;
    const finish = (x: Fix | Failure): void => {
      if (done) return;
      done = true;
      if (timer !== null) timers.clearTimeout(timer);
      if (id !== null) {
        try { geo.clearWatch(id); } catch { /* a watch that is gone already */ }
      }
      resolve(x);
    };
    timer = timers.setTimeout(() => finish(best ?? { kind: lastError ?? 'timeout' }), o.timeoutMs);
    stop?.addEventListener('abort', () => finish({ kind: 'timeout' }));
    try {
      id = geo.watchPosition(
        (p) => {
          const fix: Fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: p.coords.accuracy, at: new Date(p.timestamp) };
          if (!(fix.accuracyM >= 0)) return;
          if (best === null || fix.accuracyM < best.accuracyM) best = fix;
          if (fix.accuracyM <= o.goodM) finish(fix);
        },
        (e) => {
          // Denied ends the routine at once; the rest may still be followed by a reading within the time.
          if (e.code === 1) finish(best ?? { kind: 'denied' });
          else lastError = e.code === 3 ? 'timeout' : 'unavailable';
        },
        { enableHighAccuracy: true, maximumAge: o.maximumAgeMs, timeout: o.timeoutMs },
      );
      if (done && id !== null) geo.clearWatch(id);
    } catch {
      finish({ kind: 'unsupported' });
    }
  });
}

export type Located = { kind: 'position'; position: Position } | { kind: 'ask'; options: [Km, Km] } | { kind: 'no-position' };

const indexes = new WeakMap<Route, ReturnType<typeof buildSegmentIndex>>();

/** A reading on the route, against the latest accepted position (for loops and out-and-back routes). */
export function locateFix(fix: Fix, route: Route, positions: Position[]): Located {
  let idx = indexes.get(route);
  if (!idx) {
    idx = buildSegmentIndex(route);
    indexes.set(route, idx);
  }
  return locate(fix, route, idx, latestPosition(positions));
}

/**
 * The reading on the pass the rider named: one of the two kilometres `locate` offered, which are the reading's own projections,
 * so the distance off is the distance to the route there. A GPS position all the same, with its own accuracy.
 */
export function onPass(fix: Fix, route: Route, km: Km): Position | null {
  if (!Number.isFinite(km) || km < 0 || km > route.lengthKm) return null;
  const offRouteM = Math.round(haversineKm(fix, pointAtRouteKm(route, km)) * 1e6) / 1e3;
  return { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM, at: fix.at, km, offRouteM, source: 'gps', approximate: fix.accuracyM > APPROXIMATE_OVER_M };
}

const APPROXIMATE_OVER_M = 500; // section 6.1 step 4, as locate.ts marks it

/** A kilometre picked by hand, or null when it is no kilometre. */
export const manualAt = (route: Route, km: Km, now: Date): Position | null => manualPosition(route, km, now);
