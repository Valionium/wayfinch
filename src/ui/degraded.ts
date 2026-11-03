// Section 8's degraded situations that can happen with no trip: which of them apply right now.
// Trip and Ahead feed `hasRoute` and `hasPreparedTrip` from what the store read; null until a read has succeeded.
import { signal } from '@preact/signals';
import type { DegradedKind } from './card.tsx';
import type { TabName } from './nav.ts';

export const degradedSignal = signal<DegradedKind[]>([]);

export interface DegradedFacts {
  /** null: not read yet, or the read failed. Nothing is said about a route the app hasn't read. */
  hasRoute: boolean | null;
  hasPreparedTrip: boolean | null;
  online: boolean;
  storageBlocked: boolean;
}

/** In the order a rider should read them: the one that stops saving first. */
export function degradedKinds(facts: DegradedFacts): DegradedKind[] {
  const kinds: DegradedKind[] = [];
  if (facts.storageBlocked) kinds.push('storageBlocked');
  if (facts.hasRoute === false) kinds.push('noRoute');
  // "this trip is not prepared … come from the route": only for a route that is there
  if (!facts.online && facts.hasRoute === true && facts.hasPreparedTrip === false) kinds.push('noSignalNoTrip');
  return kinds;
}

/** Spec section 8: "No route | Trip and Ahead". The route and trip notices belong where the route is used; blocked storage everywhere. */
export function kindsOnScreen(kinds: readonly DegradedKind[], tab: TabName): DegradedKind[] {
  return tab === 'trip' || tab === 'ahead' ? [...kinds] : kinds.filter((k) => k === 'storageBlocked');
}

/** True when the browser will not open a database for this site (a private window, or a setting that blocks it). */
export function isStorageBlocked(factory: IDBFactory | undefined): Promise<boolean> {
  if (!factory) return Promise.resolve(true);
  return new Promise((resolve) => {
    try {
      const request = factory.open('wayfinch-probe');
      request.onerror = () => resolve(true);
      request.onblocked = () => resolve(true);
      request.onsuccess = () => {
        request.result.close();
        try { factory.deleteDatabase('wayfinch-probe'); } catch { /* a probe left behind is harmless */ }
        resolve(false);
      };
    } catch {
      resolve(true);
    }
  });
}

let known: DegradedFacts = { hasRoute: null, hasPreparedTrip: null, online: true, storageBlocked: false };
const publish = (): void => { degradedSignal.value = degradedKinds(known); };

/**
 * Trip tells the shell whether a route is stored and whether Get ready offline has ended for it, so the notices fit. null for
 * both when the read failed.
 */
export function noteTripFacts(hasRoute: boolean | null, hasPreparedTrip: boolean | null): void {
  known = { ...known, hasRoute, hasPreparedTrip };
  publish();
}

/**
 * Ahead tells the shell a route is there when it shows one, so "Add a route" never stands above a route's answers; and null
 * when it couldn't read the trip, so "Add a route" never stands above "couldn't be read".
 */
export function noteRoute(hasRoute: boolean | null): void {
  known = { ...known, hasRoute };
  publish();
}

/** Looks at this device once, and again when the connection changes. */
export async function watchDegraded(env: { indexedDB: IDBFactory | undefined; online: () => boolean; addOnlineListener: (cb: () => void) => void }): Promise<void> {
  const blocked = await isStorageBlocked(env.indexedDB);
  const update = (): void => {
    known = { ...known, online: env.online(), storageBlocked: blocked };
    publish();
  };
  update();
  env.addOnlineListener(update);
}
