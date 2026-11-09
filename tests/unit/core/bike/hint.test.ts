// The first-run bike hint (wish 17, design of 9 Nov 2026, section 3): which of its three states shows, and what the one key then holds.
import { expect, test } from 'vitest';
import { bikeHint, withLetters } from '../../../../src/core/bike/hint.ts';
import { seenKey } from '../../../../src/ui/bike/hint-seen.ts';

const has = (key: string, letters: string): boolean => [...letters].every((l) => key.includes(l));

test('[HINT-NEW] a new rider (no bike, nothing else on the phone, no key yet) gets the card, and the key then says it was shown', () => {
  const out = bikeHint(false, false, '');
  expect(out.hint).toBe('new');
  expect(out.line).toBe(false);
  expect(out.key).toBe('a');
  // Places seen alone (one so far) keep the card.
  expect(bikeHint(false, false, 'at').hint).toBe('new');
  // Unknown letters or junk never break it.
  expect(bikeHint(false, false, '{7}').hint).toBe('new');
});

test('[HINT-SMALL] Later, a look into Bike details or two places seen make it small for good; riders who already use the app start small', () => {
  // `s` is small, whatever else the key holds; it never grows back while there is no bike.
  expect(bikeHint(false, false, 'as').hint).toBe('small');
  expect(bikeHint(false, false, 's').hint).toBe('small');
  // A trip, a bag plan or a tyre result on the phone: small from the start, and the key keeps it so.
  const used = bikeHint(false, true, '');
  expect(used.hint).toBe('small');
  expect(has(used.key, 's')).toBe(true);
  expect(bikeHint(false, false, used.key).hint).toBe('small');
  // Two of Tools, You, Tyre pressure, Bike care and the Gear advisor, each counted once.
  expect(seenKey('a', 't')).toBe('at');
  expect(seenKey('at', 't')).toBe('at');
  expect(has(seenKey('at', 'y'), 's')).toBe(true);
  for (const [one, two] of [['t', 'p'], ['y', 'c'], ['c', 'g'], ['p', 'y']] as const) expect(bikeHint(false, false, seenKey(seenKey('a', one), two)).hint).toBe('small');
  // Trip and En route are no places: only the five letters count.
  expect(seenKey('a', 'x')).toBe('a');
  expect(seenKey('', 't')).toBe('t');
});

test('[HINT-GONE] a saved bike: gone, and the one-time line shows once, only for a rider who saw the card; removing every bike later is small, never new', () => {
  const first = bikeHint(true, false, 'as');
  expect(first.hint).toBe('gone');
  expect(first.line).toBe(true);
  expect(has(first.key, 'w')).toBe(true);
  // Once shown, never again.
  expect(bikeHint(true, false, first.key).line).toBe(false);
  // A rider with a bike from before this shipped (no key, or a key without the card) never sees the line.
  expect(bikeHint(true, true, '').line).toBe(false);
  expect(bikeHint(true, false, 'ty').line).toBe(false);
  // All bikes removed later: small, never the card again.
  expect(bikeHint(false, false, first.key).hint).toBe('small');
  expect(bikeHint(false, false, bikeHint(true, true, '').key).hint).toBe('small');
});

test('[HINT-LOCAL] the key holds a few letters only: no time, no count, no id', () => {
  let key = '';
  for (const step of [() => bikeHint(false, false, key).key, () => seenKey(key, 't'), () => seenKey(key, 't'), () => seenKey(key, 'y'), () => bikeHint(true, false, key).key]) {
    key = step();
    expect(key).toMatch(/^[atypcgsw]{0,8}$/);
  }
  expect(withLetters('as', 'sw')).toBe('asw');
});
