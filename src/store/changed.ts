// How the app's windows stay out of each other's way (spec sections 3.8 and 4.4). After each write a window sets
// `copilot:changed`, and the others re-read that section on the storage event. A window remembers which version of each
// section it last read or wrote, and never writes over a version it hasn't seen.

export type Section = 'trip' | 'settings' | 'profile' | 'calibration' | 'tyres' | 'positions' | 'water' | 'day' | 'plan-tomorrow' | 'weather' | 'all';
const SECTIONS: readonly string[] = ['trip', 'settings', 'profile', 'calibration', 'tyres', 'positions', 'water', 'day', 'plan-tomorrow', 'weather', 'all'];

export const CHANGED_KEY = 'copilot:changed';

let lastAt = 0;

const parseChange = (text: string | null): { at: number; section: Section } | null => {
  try {
    const v = JSON.parse(text ?? 'null') as { at?: unknown; section?: unknown } | null;
    return v && typeof v.at === 'number' && typeof v.section === 'string' && SECTIONS.includes(v.section) ? { at: v.at, section: v.section as Section } : null;
  } catch {
    return null;
  }
};

/** Tells the other windows. Each value differs from the last, as the browser only fires the event on a change. */
export function markChanged(section: Section): void {
  try {
    const before = parseChange(localStorage.getItem(CHANGED_KEY))?.at ?? 0;
    lastAt = Math.max(Date.now(), lastAt + 1, before + 1);
    localStorage.setItem(CHANGED_KEY, JSON.stringify({ at: lastAt, section }));
  } catch {
    // Storage blocked or full: the other window then finds out at its next read, and its write is refused until then.
  }
}

/** Calls back with the section another window changed. Returns how to stop listening. */
export function onChanged(callback: (section: Section) => void): () => void {
  const listener = (e: Event): void => {
    const { key, newValue } = e as StorageEvent;
    if (key !== CHANGED_KEY) return;
    const change = parseChange(newValue);
    if (change) callback(change.section);
  };
  globalThis.addEventListener('storage', listener);
  return () => globalThis.removeEventListener('storage', listener);
}

// ---- This window's copies ------------------------------------------------------------------------------------------

/** A write the store chose not to make: nothing went wrong with saving, and the caller is told why. */
export class RefusedError extends Error {}

/** A write was refused: another window changed this section since this window read it. */
export class NewerDataError extends RefusedError {
  readonly section: Section;
  constructor(section: Section) {
    super(`${section} was changed in another window`);
    this.name = 'NewerDataError';
    this.section = section;
  }
}

/**
 * What this window has read. `trip-settings` is the trip's fields as the settings panel last read them: reading those says
 * nothing about the whole trip a caller may hold from `readTrip`, so they count apart.
 */
export type Copy = Section | 'trip-settings';
const copies = new Map<Copy, string | null>();

/** The version of a section this window now holds; null when there was nothing stored. */
export const noteCopy = (section: Copy, stamp: string | null): void => { copies.set(section, stamp); };

/**
 * Whether this window may write over the stored version. Only over the very version it holds: also an older stored one
 * (an import can bring one) or none (another window deleted it) means this window's copy is out of date.
 */
export const holdsCopy = (section: Copy, stored: string | null): boolean => (copies.get(section) ?? null) === stored;

export const clearCopies = (): void => { copies.clear(); };

/** A stamp later than the stored one, also when two windows write in one millisecond or the clock moved back. */
export function nextStamp(stored: string | null): string {
  const before = stored === null ? Number.NaN : Date.parse(stored);
  return new Date(Number.isFinite(before) ? Math.max(Date.now(), before + 1) : Date.now()).toISOString();
}

// ---- Writes under way ----------------------------------------------------------------------------------------------

const pending = new Set<Promise<unknown>>();
let failedSinceFlush = false;

/** Counts a write for `flushWrites`, and hands its result on. A write the store refused is no failure to save. */
export function tracked<T>(write: Promise<T>): Promise<T> {
  const watched = write.catch((e: unknown) => { if (!(e instanceof RefusedError)) failedSinceFlush = true; });
  pending.add(watched);
  void watched.finally(() => pending.delete(watched));
  return write;
}

/** The store writes through, so saving means waiting for what's under way. False when a write failed since the last time. */
export async function flushWrites(): Promise<boolean> {
  while (pending.size > 0) await Promise.all(pending);
  const ok = !failedSinceFlush;
  failedSinceFlush = false;
  return ok;
}
