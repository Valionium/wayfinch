// Section 8's degraded situations that can happen with no trip: which of them apply right now.
// The store (Task 3) will feed `hasRoute` and `hasPreparedTrip`; until it exists there is no route and no trip.
import { signal } from '@preact/signals';
import type { DegradedKind } from './card.tsx';

export const degradedSignal = signal<DegradedKind[]>(['noRoute']);

export interface DegradedFacts {
  hasRoute: boolean;
  hasPreparedTrip: boolean;
  online: boolean;
  storageBlocked: boolean;
}

/** In the order a rider should read them: the one that stops saving first. */
export function degradedKinds(facts: DegradedFacts): DegradedKind[] {
  const kinds: DegradedKind[] = [];
  if (facts.storageBlocked) kinds.push('storageBlocked');
  if (!facts.hasRoute) kinds.push('noRoute');
  if (!facts.online && !facts.hasPreparedTrip) kinds.push('noSignalNoTrip');
  return kinds;
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

let known: DegradedFacts = { hasRoute: false, hasPreparedTrip: false, online: true, storageBlocked: false };
const publish = (): void => { degradedSignal.value = degradedKinds(known); };

/** Trip tells the shell whether a route is stored and whether Get ready offline has ended for it, so the notices fit. */
export function noteTripFacts(hasRoute: boolean, hasPreparedTrip: boolean): void {
  known = { ...known, hasRoute, hasPreparedTrip };
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
