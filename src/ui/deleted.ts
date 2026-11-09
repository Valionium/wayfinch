// The keys the app writes on its own, never on a rider's tap: the first-run bike hint's and the moved card's. After Delete co-pilot data
// (in this window, in another, or while this page sat in the back/forward cache) this page never writes them back, as no window writes
// back any other co-pilot store a delete removed; a new start writes them again (ST-DELETE).
const WATCHED = ['copilot:bikeHint:v1', 'copilot:moved-card'];
const seen = new Set<string>();
const gone = new Set<string>();

/** What this page read or wrote of a watched key: a key it once held and finds gone on a return was deleted meanwhile. */
export const noteKey = (key: string, value: string | null): void => { if (value !== null) seen.add(key); };
export const isGone = (key: string): boolean => gone.has(key);

/** On a return from the back/forward cache, which hears no storage event (page-return.ts). */
export function checkGone(): void {
  for (const key of seen) {
    try {
      if (localStorage.getItem(key) === null) gone.add(key);
    } catch { /* storage refused: nothing to write back to */ }
  }
}

if (typeof window !== 'undefined') {
  // Another window's delete; and this window's own (store/export.ts), which no storage event tells.
  window.addEventListener('storage', (e) => { for (const key of WATCHED) if (e.key === null || (e.key === key && e.newValue === null)) gone.add(key); });
  window.addEventListener('copilot:deleted', () => { for (const key of WATCHED) gone.add(key); });
}
