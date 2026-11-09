// The bag planner's bike wording table (spec section 8): §8's banned words, the same list the app's wording test uses, on every
// bike string of the page, Look and the photo picker included; and every limit sentence still says "you entered".
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';
import { bannedHits } from '../../fixtures/banned.ts';

const require = createRequire(import.meta.url);
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: () => { run: (code: string) => unknown; html: string } };

test('[LC-WORDS] no word of §8\'s list nor of the bag planner\'s own stricter list in the bike wording table, Look and the photo picker included; every limit sentence says "you entered"', () => {
  const page = appVM();
  const words = JSON.parse(page.run('JSON.stringify(Object.entries(BIKE_WORDING))') as string) as [string, { text: string; limit?: boolean }][];
  expect(words.length).toBeGreaterThan(40);
  // §8's list, and the bag planner's own stricter words for its bike strings
  const own = /warning|error|fail|invalid|\bmust\b|safe|\bOK\b|okay|approv|certif|guarant/i;
  for (const [key, w] of words) {
    expect(bannedHits(w.text), key).toEqual([]);
    expect(own.test(w.text), `${key}: ${w.text}`).toBe(false);
  }
  const limits = words.filter(([, w]) => w.limit);
  expect(limits.length).toBeGreaterThanOrEqual(4);
  for (const [key, w] of limits) expect(w.text, key).toContain('you entered');
  for (const key of ['lookHint', 'lookNone', 'lookNotSet', 'lookMore', 'lookPhoto', 'lookUndo', 'lookGuessBars', 'lookGuessEbike', 'photoChoose', 'photoTap', 'photoUse', 'photoNote', 'swapNote', 'addedChosen']) {
    expect(words.some(([k]) => k === key), key).toBe(true);
  }
  // the dialog's own markup, Look's section included
  const html = page.html;
  const dialog = html.slice(html.indexOf('id="bikeDetailsBox"'), html.indexOf('id="maxWeightBox"')).replace(/<[^>]+>/g, ' ');
  expect(bannedHits(dialog)).toEqual([]);
  expect(dialog.match(own)).toBeNull();
  // the bike's labels, Suspension and Rack mounts (sub-project 11) among them, are in the dialog and pass too
  const labels = JSON.parse(page.run('JSON.stringify(BIKE_PROFILE_LABELS)') as string) as Record<string, Record<string, string>>;
  for (const key of ['suspension', 'rackMounts']) expect(Object.keys(labels), key).toContain(key);
  const labelText = Object.values(labels).flatMap((l) => Object.values(l)).join(' ');
  expect(bannedHits(labelText)).toEqual([]);
  expect(labelText.match(own)).toBeNull();
  for (const words of ['Suspension', 'Rack mounts', 'Front fork', 'Full suspension', 'Small threaded holes near the rear axle and on the seat stays, for a rack.']) {
    expect(dialog, words).toContain(words);
  }
  // and the swatch names the picker shows
  const swatches = page.run('window.WayfinchBike.SWATCHES.map(s=>s.name).join(" ")') as string;
  expect(bannedHits(swatches)).toEqual([]);
  expect(own.test(swatches)).toBe(false);
});
