// Share progress's one remembered choice (spec sections 4.4 and 6.14): whether to add a map link, "yes" or "no". Off by default.
// The text, the recipient and the fact of sharing are never stored.
export const SHARE_PROGRESS_KEY = 'copilot:share-progress';

export function readMapLink(): boolean {
  try {
    return localStorage.getItem(SHARE_PROGRESS_KEY) === 'yes';
  } catch {
    return false;
  }
}

/** False when the browser didn't keep it: the choice then holds for this visit only. */
export function writeMapLink(on: boolean): boolean {
  try {
    localStorage.setItem(SHARE_PROGRESS_KEY, on ? 'yes' : 'no');
    return true;
  } catch {
    return false;
  }
}
