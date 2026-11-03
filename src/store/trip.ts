// The trip and its route (spec section 4.4). One trip at a time. Replacing the route removes everything stored for the old
// one in a single transaction, so a failure keeps all of the old and nothing of the old ever mixes into the new.
import { tileKey } from '../core/places/tiles.ts';
import type { TileContent } from '../core/places/types.ts';
import type { Route, Trip } from '../core/types.ts';
import type { PackRun, TileReport, TileStore } from '../data/packs/download.ts';
import { readManifest } from '../data/packs/reader.ts';
import { holdsCopy, markChanged, NewerDataError, nextStamp, noteCopy, RefusedError, tracked } from './changed.ts';
import { CURRENT, inTx, ROUTE_META_PREFIX, ROUTE_STORES } from './db.ts';
import type { Tx } from './db.ts';
import { routeProblem, tripProblem, usableTrip } from './rules.ts';
import { readLocalSettings, writeLocalSettings } from './settings-local.ts';

/** The key in `meta` of a section's `updatedAt`. */
export const stampKey = (section: string): string => `updatedAt:${section}`;

export const PLAN_TOMORROW_KEY = 'copilot:plan-tomorrow';

/** Inputs' `SAVED_KM_META`; inputs.ts imports from this file, so the key is stated here. */
const SAVED_KM_KEY = `${ROUTE_META_PREFIX}savedKm`;

/** A trip or route the store won't keep; `message` says why, in the rider's words. */
export class InvalidTripError extends RefusedError {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidTripError';
  }
}

export const readStamp = async (tx: Tx, section: string): Promise<string | null> => {
  const stamp: unknown = await tx.objectStore('meta').get(stampKey(section));
  return typeof stamp === 'string' ? stamp : null;
};

/** After this window's own write of the whole trip it knows every field of it. */
const noteTrip = (stamp: string): void => {
  noteCopy('trip', stamp);
  noteCopy('trip-settings', stamp);
};

/** Removes everything stored for the route. Inside the caller's transaction, which needs ROUTE_TX. */
export async function clearRouteData(tx: Tx): Promise<void> {
  await Promise.all(ROUTE_STORES.map((name) => tx.objectStore(name).clear()));
  await tx.objectStore('meta').delete(IDBKeyRange.bound(ROUTE_META_PREFIX, `${ROUTE_META_PREFIX}￿`));
}

/** The stores a transaction that may replace the route has to hold. */
export const ROUTE_TX = [...ROUTE_STORES, 'trip', 'meta'];

/** Whether two routes follow the same line. Final heights change a route's hash and id, not its line. */
export function sameLine(a: Route | null | undefined, b: Route): boolean {
  if (!a || !Array.isArray(a.points) || a.points.length !== b.points.length) return false;
  return a.points.every((p, i) => p.lat === b.points[i]!.lat && p.lon === b.points[i]!.lon);
}

/** A choice made for the old route's day: it goes with the old route. Called once the transaction has succeeded. */
export function forgetPlanTomorrow(): void {
  try { localStorage.removeItem(PLAN_TOMORROW_KEY); } catch { /* storage blocked: nothing was kept */ }
}

/** What was chosen for the old route alone. This write doesn't count as having seen a settings change from another window. */
export function forgetRouteChoices(): void {
  forgetPlanTomorrow();
  const { settings, stamp } = readLocalSettings();
  if (settings.nights === null) return;
  const held = holdsCopy('settings', stamp);
  const written = writeLocalSettings({ nights: null });
  if (written === null) return;
  if (held) noteCopy('settings', written);
  markChanged('settings');
}

export async function readTrip(): Promise<Trip | null> {
  const { raw, stamp } = await inTx(['trip', 'meta'], 'readonly', async (tx) => ({
    raw: (await tx.objectStore('trip').get(CURRENT)) as unknown,
    stamp: await readStamp(tx, 'trip'),
  }));
  noteCopy('trip', stamp);
  return usableTrip(raw, readLocalSettings().settings);
}

/** Saves the trip. Refused with an error when it's unusable, or when another window changed it since this one read it. */
export function saveTrip(trip: Trip): Promise<void> {
  return tracked(saving(trip));
}

async function saving(trip: Trip): Promise<void> {
  const problem = tripProblem(trip);
  if (problem) throw new InvalidTripError(problem);
  let replaced = false;
  const stamp = await inTx(ROUTE_TX, 'readwrite', async (tx) => {
    const stored = await readStamp(tx, 'trip');
    if (!holdsCopy('trip', stored)) throw new NewerDataError('trip');
    const before = (await tx.objectStore('trip').get(CURRENT)) as Trip | undefined;
    // With no trip above it, whatever is stored belongs to no route the new one could use.
    if (!before || !sameLine(before.route, trip.route)) {
      await clearRouteData(tx);
      replaced = Boolean(before);
    }
    return putTrip(tx, trip, stored);
  });
  noteTrip(stamp);
  if (replaced) forgetRouteChoices();
  markChanged('trip');
}

async function putTrip(tx: Tx, trip: Trip, stored: string | null): Promise<string> {
  const stamp = nextStamp(stored);
  await tx.objectStore('trip').put(trip, CURRENT);
  await tx.objectStore('meta').put(stamp, stampKey('trip'));
  return stamp;
}

/**
 * Puts a new route in the old one's place. The rider's way of riding stays. The departure date and the nights belonged to
 * the old route: kept, a past date would read as being on some day of a trip not begun, so the new route starts without
 * them and the screen says a date is missing.
 */
export function replaceRoute(route: Route): Promise<void> {
  return tracked(replacing(route));
}

// ---- The pack tiles of the route (spec sections 5 and 5a) ---------------------------------------------------------------

/** The run the saved tiles belong to. Under the route's prefix, so it goes with the route. */
export const PACK_RUN_META = `${ROUTE_META_PREFIX}packRun`;

/** The route was replaced, here or in another window, while its data was on the way: that data is of no use any more. */
export class RouteGoneError extends RefusedError {
  constructor() {
    super('the route has been replaced');
    this.name = 'RouteGoneError';
  }
}

const usableRun = (raw: unknown): PackRun | null => {
  const r = raw as Partial<PackRun> | null | undefined;
  if (typeof r?.buildId !== 'string') return null;
  try {
    return { buildId: r.buildId, manifest: readManifest(JSON.stringify(r.manifest), r.buildId) };
  } catch {
    return null; // damaged: the next run starts over, which costs only a download
  }
};

export async function readPackRun(): Promise<PackRun | null> {
  return usableRun(await inTx(['meta'], 'readonly', (tx) => tx.objectStore('meta').get(PACK_RUN_META)));
}

/** Refuses when there's no trip, or when it isn't the route this write was meant for. */
async function holdsRoute(tx: Tx, routeId: string | undefined): Promise<void> {
  const trip = (await tx.objectStore('trip').get(CURRENT)) as Trip | undefined;
  if (trip === undefined || (routeId !== undefined && trip.route?.id !== routeId)) throw new RouteGoneError();
}

const TILE_STORES = ['places', 'roofs', 'rescuePoints', 'savedTiles', 'matches', 'hours', 'meta', 'trip'];

/** Begins a run. What an earlier run of an older build left goes in the same transaction: builds never mix. */
export function startPackRun(run: PackRun, routeId?: string): Promise<void> {
  return tracked(inTx(TILE_STORES, 'readwrite', async (tx) => {
    await holdsRoute(tx, routeId);
    await Promise.all(['places', 'roofs', 'rescuePoints', 'savedTiles', 'matches', 'hours'].map((name) => tx.objectStore(name).clear()));
    await tx.objectStore('meta').delete(SAVED_KM_KEY);
    await tx.objectStore('meta').put(run, PACK_RUN_META);
  }));
}

export async function savedTileKeys(): Promise<Set<string>> {
  const keys = await inTx(['savedTiles'], 'readonly', (tx) => tx.objectStore('savedTiles').getAllKeys());
  return new Set(keys.map(String));
}

/**
 * One batch of verified tiles, all in one transaction, so a killed tab leaves whole batches and no tile reads as saved
 * without its content. Refused when the run isn't the stored one: the route was replaced meanwhile.
 */
export function saveTiles(content: TileContent[], report: TileReport, routeId?: string): Promise<void> {
  return tracked(inTx(['places', 'roofs', 'rescuePoints', 'savedTiles', 'meta', 'trip'], 'readwrite', async (tx) => {
    await holdsRoute(tx, routeId);
    const run = (await tx.objectStore('meta').get(PACK_RUN_META)) as { buildId?: unknown } | undefined;
    if (run?.buildId !== report.buildId) throw new RouteGoneError();
    // Each is awaited: a value the browser can't store throws at its call, and the requests before it would then be left
    // to fail unheard when the transaction is undone.
    for (const c of content) {
      for (const p of c.places) await tx.objectStore('places').put(p);
      for (const r of c.roofs) await tx.objectStore('roofs').add(r);
      for (const r of c.rescuePoints) await tx.objectStore('rescuePoints').add({ ...r, kms: [] });
    }
    for (const t of report.saved) await tx.objectStore('savedTiles').put({ buildId: report.buildId, z: t.z, x: t.x, y: t.y }, tileKey(t));
  }));
}

/** The store as a download sees it. */
export const tileStore: TileStore = { readRun: readPackRun, startRun: startPackRun, savedTileKeys, saveTiles };

async function replacing(route: Route): Promise<void> {
  const problem = routeProblem(route);
  if (problem) throw new InvalidTripError(problem);
  const local = readLocalSettings().settings;
  const stamp = await inTx(ROUTE_TX, 'readwrite', async (tx) => {
    const stored = await readStamp(tx, 'trip');
    if (!holdsCopy('trip', stored)) throw new NewerDataError('trip');
    const before = usableTrip(await tx.objectStore('trip').get(CURRENT), local);
    await clearRouteData(tx);
    const next: Trip = {
      ...(before ?? { startTime: local.startTime, flatKph: local.flatKph, stay: local.stay, campWaterL: local.campWaterL, pace: local.pace }),
      route, departureDate: null,
    };
    return putTrip(tx, next, stored);
  });
  noteTrip(stamp);
  forgetRouteChoices();
  markChanged('trip');
}
