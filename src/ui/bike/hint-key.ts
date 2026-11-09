// The first-run bike hint's one key (wish 17, design section 3.1): `copilot:bikeHint:v1`, on the phone only. The `copilot:` prefix means
// Delete co-pilot data removes it; the export is built field by field and never carries it. Storage refused: the same rules hold for this
// visit only, from memory.
export const HINT_KEY = 'copilot:bikeHint:v1';

// Set only while the browser refuses to keep the key; any write it keeps again ends it.
let kept: string | null = null;
// Another window removed the key (Delete co-pilot data, ST-DELETE): as with every co-pilot store a delete removed, this page never writes
// it back; the hint follows its rules from memory until the next start.
let deleted = false;
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === null || (e.key === HINT_KEY && e.newValue === null)) deleted = true; });
}

export function readHint(): string {
  try {
    return kept ?? localStorage.getItem(HINT_KEY) ?? '';
  } catch {
    return kept ?? '';
  }
}

export function writeHint(key: string): void {
  try {
    if (!deleted) {
      localStorage.setItem(HINT_KEY, key);
      kept = null;
      return;
    }
  } catch { /* this visit only */ }
  kept = key;
}

/** A trip is read with Trip's snapshot, a bag plan with the bike; here, a tyre result or anything Wayfinch saved (`copilot:changed`). */
export function usedBefore(): boolean {
  try {
    return !!(localStorage.getItem('copilot:tyre:v1') ?? localStorage.getItem('copilot:changed'));
  } catch {
    return false;
  }
}
