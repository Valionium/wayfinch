// The rider's weight from You (spec section 3.5), where the tyre tool reads it: a function that answers at once, kept current
// by a signal. Loaded at start and after every change You makes or another window announces. Null until the rider has entered one.
import { signal } from '@preact/signals';
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
