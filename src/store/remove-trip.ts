// Remove this trip (owner's wish, 9 November 2026), Trip's Route step: the route, the trip and everything En route keeps for it go,
// so Trip and En route start over as on the very first open. The rider's bikes, setups and Bag planner plans (the bag planner's own
// keys, never touched), the settings, the rider's details, rides and tyre details stay byte for byte. Delete co-pilot data
// (export.ts) still removes everything.
//
// One step for the rider, all or nothing (as importAll puts the settings back): this browser's few trip keys are set aside and
// removed first, then the database's part goes in one transaction; if that fails the keys are put back, so Trip and En route
// still read the whole trip. A chunk of its own, loaded with the confirm step.
import type { Route } from '../core/types.ts';
import { W } from '../core/wording/en.ts';
import { flushWrites, markChanged, noteCopy, RefusedError, tracked } from './changed.ts';
import { CURRENT, inExistingTx } from './db.ts';
import { clearRouteData, PLAN_TOMORROW_KEY, ROUTE_TX, sameLine, stampKey } from './trip.ts';

/**
 * This browser's keys of the trip: the plan for tomorrow, the mark that the route's heights were looked up (ui/trip/services.ts) and
 * Plan bags for this trip's envelope (ui/trip/handoff.ts, whose GPX is in the `handoffs` store). Spelled out here, since the store
 * imports nothing of the screens; a test holds them to the screens' names.
 */
export const TRIP_KEYS: readonly string[] = [PLAN_TOMORROW_KEY, 'copilot:heights-lookup', 'copilot:handoff:v1'];

const HANDOFFS = 'handoffs';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // no storage: nothing of the trip is kept there
  }
};

function putBack(kept: [string, string][]): void {
  for (const [key, value] of kept) {
    try { localStorage.setItem(key, value); } catch { /* it was there a moment ago, so this is not expected */ }
  }
}

/**
 * Removes the trip. `expected` is the route the rider's question named (null: none): if another window has put in a different one
 * since, nothing is removed and the error says so (as Add a route's replace question). Writes under way in this window end first,
 * so none lands after it; anything still on its way for the old route (Get ready offline, a weather refresh, a position) is refused
 * by the store, which writes only over the route it was meant for. The other windows are told, and read again.
 */
export async function removeTrip(expected: Route | null): Promise<void> {
  await flushWrites();
  return tracked(removing(expected));
}

async function removing(expected: Route | null): Promise<void> {
  const kept: [string, string][] = [];
  for (const key of TRIP_KEYS) {
    const value = read(key);
    if (value !== null) kept.push([key, value]);
  }
  try {
    for (const [key] of kept) localStorage.removeItem(key);
    await inExistingTx([...ROUTE_TX, HANDOFFS], async (tx) => {
      const before = (await tx.objectStore('trip').get(CURRENT)) as { route?: Route } | undefined;
      if (before?.route && (!expected || !sameLine(before.route, expected))) throw new RefusedError(W.appStoreChangedElsewhere);
      await clearRouteData(tx);
      await tx.objectStore('trip').delete(CURRENT);
      await tx.objectStore('meta').delete(stampKey('trip'));
      await tx.objectStore(HANDOFFS).clear();
    });
  } catch (e) {
    putBack(kept);
    throw e;
  }
  // This window now holds the version that is stored: none.
  noteCopy('trip', null);
  noteCopy('trip-settings', null);
  markChanged('all');
}
