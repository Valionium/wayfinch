// Bike care's search (sub-project 12; design 3.1): every word typed must be the start of a word in the item's text (its name, part and
// everyday words), forgiving capitals, accents, punctuation and simple endings. Pure; never throws.

const ENDINGS = ['ing', 'ed', 'es', 's'] as const;

/** Lower case, accents removed (NFKD, marks dropped), punctuation to spaces, split into words. */
export function normaliseQuery(q: string): string[] {
  return q.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
}

/** A word and the word without a final s, es, ing or ed (when at least three letters are left), so both forms meet each other. */
function forms(word: string): string[] {
  const out = [word];
  for (const end of ENDINGS) if (word.endsWith(end) && word.length - end.length >= 3) out.push(word.slice(0, -end.length));
  return out;
}

/** The items whose text holds every query word, in the list's order; an empty query gives them all. */
export function searchCare<T extends { id: string }>(query: string, items: readonly T[], text: (t: T) => string[]): T[] {
  const wanted = normaliseQuery(query).map(forms);
  if (wanted.length === 0) return [...items];
  return items.filter((item) => {
    const have = text(item).flatMap(normaliseQuery).flatMap(forms);
    return wanted.every((qs) => qs.some((q) => have.some((h) => h.startsWith(q))));
  });
}
