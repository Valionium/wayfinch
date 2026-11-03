// The trip and its route (spec section 4.4). One trip at a time. Replacing the route removes everything stored for the old
// one in a single transaction, so a failure keeps all of the old and nothing of the old ever mixes into the new.
import type { Route, Trip } from '../core/types.ts';
import { holdsCopy, markChanged, NewerDataError, nextStamp, noteCopy, RefusedError, tracked } from './changed.ts';
import { CURRENT, inTx, ROUTE_META_PREFIX, ROUTE_STORES } from './db.ts';
import type { Tx } from './db.ts';
import { routeProblem, tripProblem, usableTrip } from './rules.ts';
import { readLocalSettings, writeLocalSettings } from './settings-local.ts';

/** The key in `meta` of a section's `updatedAt`. */
export const stampKey = (section: string): string => `updatedAt:${section}`;

export const PLAN_TOMORROW_KEY = 'copilot:plan-tomorrow';


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
