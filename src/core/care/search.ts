// Bike care's search (sub-project 12; design 3.1): every word typed must be found in the item's text (its name, part and everyday words),
// forgiving capitals, accents, punctuation and simple endings. Pure; never throws.
//
// A word typed is found when:
// - it starts a word of the text (a word part way typed finds it); or
// - its root (the word without a simple ending: s, es, ies to y, ing, ed; or without a silent e) has at least four letters and starts a
//   word of the text: "charging" meets "charge", "storing" and "store" meet "storage", "slips" meets "slipping"; or
// - a form of its root (as is, with an e back, with a doubled last letter undone) is a whole word of the text, or of the text's own
//   roots: "lubing" meets "lube", "oiling" meets "oil".
// Short roots never start-match, so "spring" (spr) never meets "sprocket", "speed" (spe) never meets "spectacles" (review of PR 58, M3
// and re-check R1).

const ENDINGS: readonly [string, string][] = [['ies', 'y'], ['ing', ''], ['ed', ''], ['es', ''], ['s', '']];
const VOWELS = /[aeiou]/;

/** Lower case, accents removed (NFKD, marks dropped), punctuation to spaces, split into words. */
export function normaliseQuery(q: string): string[] {
  return q.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
}

/** The word without each simple ending it has, when at least three letters are left; `verb` marks an -ing or -ed root. */
function roots(word: string): { root: string; verb: boolean }[] {
  const out: { root: string; verb: boolean }[] = [];
  for (const [end, add] of ENDINGS) {
    if (word.endsWith(end) && word.length - end.length >= 3) out.push({ root: word.slice(0, -end.length) + add, verb: end === 'ing' || end === 'ed' });
  }
  return out;
}

/** Roots long enough to start-match: four letters or more, and the word without a silent e. */
function startRoots(word: string): string[] {
  const out = roots(word).map((r) => r.root).filter((r) => r.length >= 4);
  if (word.endsWith('e') && word.length >= 5) out.push(word.slice(0, -1));
  return out;
}

/** Whole-word forms of the roots: as is, and for an -ing or -ed root also with an e back and with a doubled last letter undone. */
function wholeForms(word: string): string[] {
  const out: string[] = [];
  for (const { root, verb } of roots(word)) {
    out.push(root);
    if (!verb) continue;
    out.push(`${root}e`);
    const last = root[root.length - 1]!;
    if (root.length >= 4 && last === root[root.length - 2] && !VOWELS.test(last)) out.push(root.slice(0, -1));
  }
  return out;
}

/** The items whose text holds every query word, in the list's order; an empty query gives them all. */
export function searchCare<T extends { id: string }>(query: string, items: readonly T[], text: (t: T) => string[]): T[] {
  const wanted = normaliseQuery(query);
  if (wanted.length === 0) return [...items];
  return items.filter((item) => {
    const words = text(item).flatMap(normaliseQuery);
    const whole = new Set([...words, ...words.flatMap(wholeForms)]);
    const starts = (p: string): boolean => words.some((w) => w.startsWith(p));
    // A short word (one or two letters) that is not the one being typed must be a whole word: "no brakes" is not "noisy brakes".
    return wanted.every((q, i) => (q.length <= 2 && i < wanted.length - 1 ? words.includes(q) : starts(q) || startRoots(q).some(starts)) || wholeForms(q).some((s) => whole.has(s)));
  });
}
