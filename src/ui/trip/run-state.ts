// Whether Get ready offline is running on this page (review of PR 73, I1): Trip's folded step says so. The run itself is run.tsx,
// a chunk of its own; this one signal is all the first screen carries of it.
import { signal } from '@preact/signals';

export const runningSignal = signal(false);
