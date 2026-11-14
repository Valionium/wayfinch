// Remove this trip (owner's wish, 9 November 2026), Trip's Route step: the route, the trip and everything En route keeps for it go,
// so Trip and En route start over as on the very first open. The rider's bikes, setups and Bag planner plans (the bag planner's own
// keys, never touched), the rider's details, rides and tyre details stay byte for byte, and so does every setting but the nights:
// those go back to the stage model's suggestion, as when a route is replaced (the owner's ruling of 9 November 2026). Delete
// co-pilot data (export.ts) still removes everything.
//
// One step for the rider, all or nothing (as importAll puts the settings back): this browser's few trip keys are set aside and
// removed and the nights cleared first, then the database's part goes in one transaction; if that fails the keys and the settings
// are put back, so Trip and En route still read the whole trip. A chunk of its own, loaded with the confirm step.
import type { Route } from '../core/types.ts';
import { W } from '../core/wording/en.ts';
import { flushWrites, holdsCopy, markChanged, noteCopy, RefusedError, tracked } from './changed.ts';
import { CURRENT, inExistingTx } from './db.ts';
import { readLocalSettings, SETTINGS_KEY, writeLocalSettings } from './settings-local.ts';
import { clearRouteData, PLAN_TOMORROW_KEY, ROUTE_TX, sameLine, stampKey } from './trip.ts';

/**
 * This browser's keys of the trip: the plan for tomorrow, the mark that the route's heights were looked up (ui/trip/services.ts),
 * Plan bags for this trip's envelope (ui/trip/handoff.ts, whose GPX is in the `handoffs` store) and Before you leave's ticks
 * (store/prep-ticks.ts; the coordinator's ruling on PR 155). Spelled out here, since the store imports nothing of the screens and this
 * chunk none of the Prepare step's; a test holds them to their modules' names.
 */
export const TRIP_KEYS: readonly string[] = [PLAN_TOMORROW_KEY, 'copilot:heights-lookup', 'copilot:handoff:v1', 'copilot:tripPrep:v1'];

const HANDOFFS = 'handoffs';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // no storage: nothing of the trip is kept there
  }
};

/**
 * A removal that failed, and a key or the settings (the nights) that could not be put back either (review of PR 86, M4): the rider
 * is told so, never "nothing was changed". The trip itself is whole: the database's part is one transaction.
 */
export class NotPutBackError extends Error {
  constructor(cause: unknown) {
    super('the trip was kept, but not all of its keys could be put back', { cause });
    this.name = 'NotPutBackError';
  }
}

/** False when the browser refused one of them back. */
function putBack(kept: [string, string][]): boolean {
  let all = true;
  for (const [key, value] of kept) {
    try { localStorage.setItem(key, value); } catch { all = false; }
  }
  return all;
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
  // The nights were chosen for this route: a fresh start leaves them to the stage model. Already so, the settings are not written.
  const { settings, stamp } = readLocalSettings();
  const settingsBefore = settings.nights === null ? null : read(SETTINGS_KEY);
  let settingsStamp: string | null = null;
  try {
    for (const [key] of kept) localStorage.removeItem(key);
    // As a replaced route (trip.ts's forgetRouteChoices), with a new stamp; the other windows are told once all of it is done.
    if (settingsBefore !== null) {
      settingsStamp = writeLocalSettings({ nights: null });
      if (settingsStamp === null) throw new Error(W.appStoreNotKept);
      kept.push([SETTINGS_KEY, settingsBefore]);
    }
    await inExistingTx([...ROUTE_TX, HANDOFFS], async (tx) => {
      const before = (await tx.objectStore('trip').get(CURRENT)) as { route?: Route } | undefined;
      if (before?.route && (!expected || !sameLine(before.route, expected))) throw new RefusedError(W.appStoreChangedElsewhere);
      await clearRouteData(tx);
      await tx.objectStore('trip').delete(CURRENT);
      await tx.objectStore('meta').delete(stampKey('trip'));
      await tx.objectStore(HANDOFFS).clear();
    });
  } catch (e) {
    // The keys first, then the database (not the other way round, as a replace does): a refusal at any point can put the keys back,
    // while a committed transaction could not be undone if a key were refused after it. A tab closed between the two leaves the
    // trip with its day plan, heights mark and handoff envelope gone (and the nights at the suggestion): a loss on the careful side,
    // since the other order would leave them to reach the next route.
    if (!putBack(kept)) throw new NotPutBackError(e);
    throw e;
  }
  // This window now holds the version that is stored: none.
  noteCopy('trip', null);
  noteCopy('trip-settings', null);
  // This window's own write counts as read only if it had read the settings before.
  if (settingsStamp !== null && holdsCopy('settings', stamp)) noteCopy('settings', settingsStamp);
  markChanged('all');
}
