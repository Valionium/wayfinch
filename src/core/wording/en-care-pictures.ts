// Bike care's pictures in words (care pictures design of 7 November 2026, section 2.5): each drawing's short name (one sentence) and its
// description (what it shows, in plain words, two to four sentences), and a one-line caption where the picture shows a test or method the
// step only names, or a view that needs saying. They are in en-care-pictures.json beside this file: a data file of its own in the build,
// fetched with the first picture and precached like the pictures (the redo of 9 November 2026, as ruling 12 of PR 72 did for the guide's
// words: the lazy JavaScript budget, PERF-JS-LAZY, has no room for them). Under the banned-words test (tests/unit/core/care/pictures.test.ts).
// Labels drawn inside a picture are repeated there. The redo redraws the pictures with tools/care-art, batch by batch.
export type PictureWords = { name: string; description: string; caption?: string };

/** Each kind's name on the step view's switch (redo, answer 4): "Other kinds: V-brake · Hydraulic rim brake". */
export const KIND_WORDS: Readonly<Record<string, string>> = {
  caliper: 'Road caliper', 'v-brake': 'V-brake', hydraulic: 'Hydraulic rim brake',
  'hydraulic-disc': 'Hydraulic disc brakes', thru: 'Thru-axle', qr: 'Quick release', nuts: 'Axle nuts', drop: 'Drop bars', flat: 'Flat bars', cable: 'Cable gears',
  'in-tube': 'In the down tube', 'on-tube': 'On the down tube',
};
/** Above a picture drawn for one kind only, while the bike's detail is Not sure (live-site sweep of 14 November 2026, item 46). */
export const IF_WORDS: Readonly<Record<string, string>> = { 'hydraulic-disc': 'If you have hydraulic disc brakes:', cable: 'If you have cable gears:' };
/** The switch's own words. */
export const SWITCH_WORDS = { other: 'Other kinds', show: (kind: string): string => `Show ${kind}` } as const;

/**
 * The titles of the steps for some bikes only (the owner's decision of 9 November 2026: "Rim brakes only: close the brake again"), in the
 * same file: per card, one entry a step, null for a step every bike sees. Checked whole; else null, and the steps keep "Step n".
 */
export function stepTitlesFrom(json: unknown): Record<string, (string | null)[]> | null {
  const t = typeof json === 'object' && json !== null ? (json as { titles?: unknown }).titles : null;
  if (typeof t !== 'object' || t === null) return null;
  const ok = Object.values(t).every((a) => Array.isArray(a) && a.every((x) => x === null || typeof x === 'string'));
  return ok ? (t as Record<string, (string | null)[]>) : null;
}

/** The step pictures' words file as fetched (en-care-pictures.json), checked whole: each picture with a name and a description; else null. */
export function pictureWordsFrom(json: unknown): Record<string, PictureWords> | null {
  if (typeof json !== 'object' || json === null) return null;
  const p = (json as { pictures?: unknown }).pictures;
  if (typeof p !== 'object' || p === null) return null;
  const ok = Object.values(p).every((w) => typeof w === 'object' && w !== null && typeof (w as PictureWords).name === 'string'
    && typeof (w as PictureWords).description === 'string' && ['string', 'undefined'].includes(typeof (w as PictureWords).caption));
  return ok ? (p as Record<string, PictureWords>) : null;
}
