// The rider's weight from You (spec section 3.5), where the tyre tool reads it: a function that answers at once, kept current
// by a signal. Loaded at start and after every change You makes or another window announces. Null until the rider has entered one.
import { signal } from '@preact/signals';
import { DB_NAME } from '../store/db.ts';
import { readProfile } from '../store/profile.ts';

const weight = signal<number | null>(null);

export const riderKg = (): number | null => weight.value;

/** Reads the profile again. A browser that won't open the database leaves the stand-in in use. */
export async function loadRiderKg(): Promise<void> {
  try {
    weight.value = (await readProfile()).weightKg;
  } catch {
    weight.value = null;
  }
}

/** Nothing is kept any more (Delete co-pilot data): the weight is none, and the database is not opened, so it is not made again. */
export function forgetRiderKg(): void {
  weight.value = null;
}

/**
 * Another window changed something. Reads again only when the database is there: after Delete co-pilot data in another window it is
 * gone, and opening it here would make an empty one. A browser that cannot list databases keeps what it has until the next start.
 */
export async function reloadRiderKg(): Promise<void> {
  try {
    const list = await indexedDB.databases?.();
    if (list === undefined) return;
    if (list.some((d) => d.name === DB_NAME)) await loadRiderKg();
    else forgetRiderKg();
  } catch {
    // The weight stays as it was.
  }
}
