// Heights for a route that has none (spec section 5), asked for only by Prepare this route: a chunk of its own, so the first screen
// does not carry it. A sample of the route goes to the elevation service, at most MAX_HEIGHT_POINTS of them; what comes is kept
// for the route, so Try again asks only for the rest (9 Nov 2026).
import { formatHm } from '../core/answers/time.ts';
import type { Trip } from '../core/types.ts';
import { readWeatherState } from '../store/weather.ts';
import { RouteGoneError } from '../store/trip.ts';
import type { LatLng } from '../core/geo/haversine.ts';
import type { RawPoint } from '../core/route/gpx.ts';
import { buildRoute } from '../core/route/profile.ts';
import type { Route } from '../core/types.ts';
import { W } from '../core/wording/en.ts';
import { PS } from '../core/wording/en-prepare-steps.ts';
import type { PreparedStore } from '../store/prepared.ts';
import type { Retry } from './openmeteo.ts';
import type { PrepareDeps } from './prepare.ts';

/** Heights asked for no closer than this along the route; those between are interpolated (section 5). */
const HEIGHT_STEP_KM = 0.2;
/**
 * At most this many heights for one route (9 Nov 2026). The service counts each one as a call, refuses past 600 a minute and
 * shares its daily 10,000 among all riders: every 200 m of a 270 km route was 1,122, and the refusals took the forecast down
 * too. 400 keep 200 m up to 80 km and about 680 m on 270 km (measured on Heidelberg to Cologne: 370 m of climbing on its hilly
 * 60 km where 200 m gave 450 m), and leave the forecast and the archive room in the same minute.
 */
export const MAX_HEIGHT_POINTS = 400;
const waitMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
/** A height asked for, by the coordinates the request sends. */
const heightKey = (p: LatLng): string => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
/**
 * Waiting out the service's minute, said while it lasts (review of PR 98, I2): when it asks again, then the step's own notice
 * back (`after`). `zone` says the time as the rider reads it.
 */
export const toldRetry = (deps: PrepareDeps, zone: string, after: string): Retry => ({
  sleep: deps.sleep ?? waitMs, now: deps.now,
  onWait: (until) => deps.onNotice?.(until === null ? after : PS.appPrepWait(formatHm(until, zone))),
});
const deviceZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** The route's points as raw points, section breaks kept: a break shows as no distance between two different places. */
function rawOf(route: Route, ele: (i: number) => number | null): RawPoint[] {
  return route.points.map((p, i) => {
    const before = route.points[i - 1];
    const isBreak = before !== undefined && before.km === p.km && (before.lat !== p.lat || before.lon !== p.lon);
    return { lat: p.lat, lon: p.lon, ele: ele(i), ...(isBreak ? { break: true } : {}) };
  });
}

/**
 * Heights for every point from a sample of those missing them, or null when any sample stays unanswered. What did come is kept
 * for the route, so Try again asks only for the rest.
 */
async function lookedUpHeights(route: Route, deps: PrepareDeps, store: PreparedStore): Promise<(number | null)[] | null> {
  const pts = route.points;
  const sampled: number[] = [];
  const step = Math.max(HEIGHT_STEP_KM, route.lengthKm / (MAX_HEIGHT_POINTS - 2));
  let lastKm = -Infinity;
  pts.forEach((p, i) => {
    if (p.ele !== null) return;
    if (p.km - lastKm >= step || i === pts.length - 1) {
      sampled.push(i);
      lastKm = p.km;
    }
  });
  const kept = await store.readKeptHeights(route.id);
  const keys = sampled.map((i) => heightKey(pts[i]!));
  const ask = [...new Set(keys.filter((k) => !kept.has(k)))];
  if (ask.length > 0) {
    const at = new Map(sampled.map((i, n) => [keys[n]!, pts[i]!] as const));
    const answers = await deps.fetchElevation(ask.map((k) => ({ lat: at.get(k)!.lat, lon: at.get(k)!.lon })), deps.fetch, toldRetry(deps, deviceZone(), W.appPrepHeightsNotice));
    let more = false;
    ask.forEach((k, n) => {
      const h = answers[n];
      if (typeof h === 'number' && Number.isFinite(h)) {
        kept.set(k, h);
        more = true;
      }
    });
    if (more) await store.keepHeights(route.id, kept);
  }
  if (keys.some((k) => !kept.has(k))) return null;
  const known = new Map<number, number>();
  pts.forEach((p, i) => { if (p.ele !== null) known.set(i, p.ele); });
  sampled.forEach((i, n) => known.set(i, kept.get(keys[n]!)!));
  const anchors = [...known.keys()].sort((a, b) => a - b);
  let a = 0;
  return pts.map((p, i) => {
    const direct = known.get(i);
    if (direct !== undefined) return direct;
    while (a + 1 < anchors.length && anchors[a + 1]! < i) a++;
    const from = anchors[a]!;
    const to = anchors[a + 1];
    if (to === undefined || from > i) return known.get(from)!;
    const span = pts[to]!.km - pts[from]!.km;
    const f = span > 0 ? (p.km - pts[from]!.km) / span : 0;
    return known.get(from)! + (known.get(to)! - known.get(from)!) * f;
  });
}

/** The route with every height, or null while any sample stays unanswered. */
export async function routeWithHeights(route: Route, deps: PrepareDeps, store: PreparedStore): Promise<Route | null> {
  const heights = await lookedUpHeights(route, deps, store);
  if (!heights) return null;
  // Every height is in: none need keeping any more (review of PR 98, M5). A save of the route that then fails asks again next time.
  try {
    await store.dropKeptHeights();
  } catch {
    /* never read again: the route's id changes with its heights */
  }
  return buildRoute(rawOf(route, (i) => heights[i] ?? null), route.name, route.source);
}

// ---- Prepare this route's other parts that only it needs, off the first screen ----

/** Asked minutes ago and nothing saved: when it can try again (review of PR 98, I2); without a known ask, that it did not answer. */
export async function spacedNote(zone: string, gapMs: number): Promise<string> {
  const at = (await readWeatherState())?.lastAttemptAt;
  return at ? W.weatherSpaced(null, formatHm(new Date(at.getTime() + gapMs), zone)) : W.appPrepWeatherFailed;
}

/**
 * Each day ends at a place to sleep (owner, 9 Nov 2026), settled without a mid-run read of the screens; the trip as stored then.
 * Its failure keeps the planned ends; a route replaced meanwhile stops the run.
 */
export async function settleDayStops(now: Date, store: Pick<PreparedStore, 'readTrip'>, trip: Trip): Promise<Trip> {
  try {
    await (await import('./day-stops.ts')).settleStops(now, undefined, { announce: false });
  } catch {
    return trip;
  }
  const settled = await store.readTrip();
  if (!settled || settled.route.id !== trip.route.id) throw new RouteGoneError();
  return settled;
}
