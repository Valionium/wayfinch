// The first-run bike hint (wish 17, design of 9 Nov 2026): Trip shows a new rider a card saying the bike can be made theirs, without
// asking. Three states: new (the card), small (today's one line, for good) and gone (a saved bike). It is remembered in one key of a few
// letters, on the phone only: `a` the card was shown, `s` small for good, `w` the one-time "every tool now" line was shown, and the places
// seen (t Tools, y You, p Tyre pressure, c Bike care, g Gear advisor; src/ui/bike/hint-seen.ts). No time, no count, no id.

export type Hint = 'new' | 'small' | 'gone';

/** The key with each letter of `add` once. */
export const withLetters = (key: string, add: string): string => [...new Set(key + add)].join('');

/**
 * `bike`: a bike is known (saved, or the plan's); `used`: a trip, a bag plan or a tyre result is on the phone, so the rider already uses
 * the app. Small never grows back; a rider who reaches gone without ever seeing the card never sees the one-time line.
 */
export function bikeHint(bike: boolean, used: boolean, key: string): { hint: Hint; line: boolean; key: string } {
  const hint: Hint = bike ? 'gone' : used || key.includes('s') ? 'small' : 'new';
  return { hint, line: bike && key.includes('a') && !key.includes('w'), key: withLetters(key, bike ? 'sw' : hint === 'new' ? 'a' : 's') };
}
