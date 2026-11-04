// The bag planner's bike wording table (spec section 8): §8's banned words, the same list the app's wording test uses, on every
// bike string of the page, Look and the photo picker included; and every limit sentence still says "you entered".
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';
import { bannedHits } from '../../fixtures/banned.ts';

const require = createRequire(import.meta.url);
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: () => { run: (code: string) => unknown; html: string } };

test('[LC-WORDS] no word of §8\'s list in the bike wording table, Look and the photo picker included; every limit sentence says "you entered"', () => {
  const page = appVM();
  const words = JSON.parse(page.run('JSON.stringify(Object.entries(BIKE_WORDING))') as string) as [string, { text: string; limit?: boolean }][];
  expect(words.length).toBeGreaterThan(40);
  for (const [key, w] of words) expect(bannedHits(w.text), key).toEqual([]);
  const limits = words.filter(([, w]) => w.limit);
  expect(limits.length).toBeGreaterThanOrEqual(4);
  for (const [key, w] of limits) expect(w.text, key).toContain('you entered');
  for (const key of ['lookHint', 'lookNone', 'lookNotSet', 'lookMore', 'lookPhoto', 'lookUndo', 'lookGuessBars', 'lookGuessEbike', 'photoChoose', 'photoTap', 'photoUse', 'photoNote', 'swapNote', 'useShown']) {
    expect(words.some(([k]) => k === key), key).toBe(true);
  }
  // the dialog's own markup, Look's section included
  const html = page.html;
  const dialog = html.slice(html.indexOf('id="bikeDetailsBox"'), html.indexOf('id="maxWeightBox"')).replace(/<[^>]+>/g, ' ');
  expect(bannedHits(dialog)).toEqual([]);
  // and the swatch names the picker shows
  expect(bannedHits(page.run('window.WayfinchBike.SWATCHES.map(s=>s.name).join(" ")') as string)).toEqual([]);
});
