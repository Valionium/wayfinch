// Which screen the app opens on (spec section 3.1): Ahead while a trip runs, otherwise Trip. It is decided once the store has been
// read, and only when the address names no screen and the rider has not already chosen one.
import { noteTripFacts } from '../degraded.ts';
import { defaultScreen, screenSignal } from '../nav.ts';
import type { TripSnapshot } from './services.ts';

export async function openOnFirstScreen(services: { load: () => Promise<TripSnapshot> }, hasAddress: boolean): Promise<void> {
  const shown = screenSignal.value;
  const snap = await services.load();
  noteTripFacts(snap.trip !== null, snap.prepared !== null);
  if (hasAddress || screenSignal.value !== shown) return;
  // No history entry: the app opened here, and Back should leave it.
  screenSignal.value = defaultScreen(snap.running);
}
