// The parts guide in words (care pictures design of 7 November 2026, section 4.1): the tags of parts only some bikes have and the sheet's
// own words. Each part's name and its two to four plain sentences, and each guide close-up's name and description (design 2.5), are in
// en-parts.json beside this file: a data file of its own in the build, fetched when the guide's sheet first opens and precached for
// offline use like the pictures (ruling 2 of PR 72: about 6 KB gzipped that the lazy JavaScript budget, PERF-JS-LAZY, has no room for).
// Both under the banned-words test (tests/unit/core/parts/guide.test.ts).
import type { PartId, PartTag } from '../parts/guide.ts';
import type { PictureWords } from './en-care-pictures.ts';

export type PartWords = { name: string; text: string };
export type PartsWordsFile = { parts: Record<PartId, PartWords>; pictures: Record<string, PictureWords> };

const isWords = (v: unknown, keys: string[]): boolean =>
  typeof v === 'object' && v !== null && keys.every((k) => typeof (v as Record<string, unknown>)[k] === 'string');

/** The words file as fetched, checked whole: every part with a name and a text, every picture with a name and a description; else null. */
export function partsWordsFrom(json: unknown, parts: readonly PartId[]): PartsWordsFile | null {
  if (typeof json !== 'object' || json === null) return null;
  const { parts: p, pictures: q } = json as { parts?: Record<string, unknown>; pictures?: Record<string, unknown> };
  if (!p || !q || !parts.every((id) => isWords(p[id], ['name', 'text']))) return null;
  if (!Object.values(q).every((w) => isWords(w, ['name', 'description']))) return null;
  return json as PartsWordsFile;
}

export const TAG_WORDS: Readonly<Record<PartTag, string>> = {
  rim: 'rim brakes', disc: 'disc brakes', 'cable-disc': 'cable disc brakes', tubeless: 'tubeless tyres', derailleur: 'derailleur gears',
  'hub-gears': 'hub gears', ebike: 'a motor', suspension: 'suspension forks',
};

export const PG = {
  close: 'Close',
  back: 'Back',
  mixed: 'Not to be mixed up with',
  onlyOn: (tag: string) => `Only on bikes with ${tag}`,
  // The bike view (design of 9 November 2026, 2.2, 5 and 6)
  kicker: 'What is it, where is it?',
  dialog: (card: string) => `Where to find: ${card}`,
  partsList: 'Parts in this card',
  tapHint: 'Tap a name, here or on the bike, to see what it is.',
  tools: 'Tools for this card',
  typical: (type: string) => `A typical ${type} bike.`,
  yourType: (type: string) => `A typical ${type} bike, your bike's type.`,
  add: 'Add your bike',
  addAfter: 'and this shows your type of bike.',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  whole: 'Whole bike',
  zoomGroup: 'Zoom the drawing',
  otherSide: 'other side',
  leftSide: 'left side',
  notDrawn: 'Not on this drawing.',
  drawing: (type: string, parts: string, marked: string | null, zoomed: boolean) =>
    `A typical ${type} bike, greyed out.${parts ? ` Standing out: ${parts}.` : ''}${marked ? ` Marked: ${marked}.` : ''}${zoomed ? ' Zoomed in.' : ''}`,
};
