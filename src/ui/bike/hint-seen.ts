// The places a rider has looked at, for the first-run bike hint (wish 17, design section 3): Tools, You, Tyre pressure, Bike care and the
// Gear advisor, each once. Two of them make the card small for good. Only their own lazy chunks import this, so the first screen does not
// carry it; Trip and En route are no places.
import { withLetters } from '../../core/bike/hint.ts';
import { readHint, writeHint } from './hint-key.ts';

const PLACES = 'typcg';

/** The key once `place` is seen: two places seen add `s`. Any other letter is no place. */
export function seenKey(key: string, place: string): string {
  const next = PLACES.includes(place) && place.length === 1 ? withLetters(key, place) : key;
  return [...PLACES].filter((p) => next.includes(p)).length >= 2 ? withLetters(next, 's') : next;
}

/** Notes a place seen; writes only a real change, and nothing once the hint is small for good. */
export function noteSeen(place: 't' | 'y' | 'p' | 'c' | 'g'): void {
  const key = readHint();
  if (key.includes('s')) return;
  const next = seenKey(key, place);
  if (next !== key) writeHint(next);
}
