// Bike care's search (sub-project 12; design 3.1): every word typed must be found in the item's text (its name, part and everyday words),
// forgiving capitals, accents, punctuation and simple endings. Pure; never throws.
//
// A word typed is found when it starts a word of the text (so a word part way typed finds it), or when, without a simple ending (s, es,
// ies to y, ing, ed), it is a whole word of the text or of the text without such endings: "squeaking" meets "squeak", "batteries"
// "battery", "brakes" "brake". An ending is only taken off to meet a whole word, so "spring" never meets "sprocket" (review of PR 58, M3).

const ENDINGS: readonly [string, string][] = [['ies', 'y'], ['ing', ''], ['ed', ''], ['es', ''], ['s', '']];

/** Lower case, accents removed (NFKD, marks dropped), punctuation to spaces, split into words. */
export function normaliseQuery(q: string): string[] {
  return q.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
}

/** The word without each simple ending it has, when at least three letters are left. */
function stems(word: string): string[] {
  const out: string[] = [];
  for (const [end, add] of ENDINGS) if (word.endsWith(end) && word.length - end.length >= 3) out.push(word.slice(0, -end.length) + add);
  return out;
}

/** The items whose text holds every query word, in the list's order; an empty query gives them all. */
export function searchCare<T extends { id: string }>(query: string, items: readonly T[], text: (t: T) => string[]): T[] {
  const wanted = normaliseQuery(query);
  if (wanted.length === 0) return [...items];
  return items.filter((item) => {
    const words = text(item).flatMap(normaliseQuery);
    const whole = new Set([...words, ...words.flatMap(stems)]);
    return wanted.every((q) => words.some((w) => w.startsWith(q)) || stems(q).some((s) => whole.has(s)));
  });
}
