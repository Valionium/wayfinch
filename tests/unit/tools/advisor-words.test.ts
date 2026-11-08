// The Gear advisor's words in the bag planner (sub-project 13, group 2): the LC-WORDS checks (§8's banned words and the bag planner's own
// stricter list) over the advisor's wording table, its dialog's markup and the tags the search adds, which come from en-advisor.ts.
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';
import { bannedHits } from '../../fixtures/banned.ts';
import { GA } from '../../../src/core/wording/en-advisor.ts';

const require = createRequire(import.meta.url);
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: () => { run: (code: string) => unknown; html: string } };
const own = /warning|error|fail|invalid|\bmust\b|safe|\bOK\b|okay|approv|certif|guarant/i;

test('[GA-WORDS] LC-WORDS over the Gear advisor\'s strings: its wording table, its dialog\'s markup and the tags it shows', () => {
  const page = appVM();
  const words = JSON.parse(page.run('JSON.stringify(Object.entries(ADVISOR_WORDING))') as string) as [string, { text: string }][];
  expect(words.length).toBeGreaterThan(40);
  for (const [key, w] of words) {
    expect(bannedHits(w.text), key).toEqual([]);
    expect(own.test(w.text), `${key}: ${w.text}`).toBe(false);
  }
  const html = page.html;
  const dialog = html.slice(html.indexOf('id="advisorBox"'), html.indexOf('id="legalBox"')).replace(/<[^>]+>/g, ' ');
  expect(dialog).toContain('Gear advisor');
  expect(bannedHits(dialog)).toEqual([]);
  expect(dialog.match(own)).toBeNull();
  const tags = (Object.values(GA) as unknown[]).filter((v) => typeof v === 'string').join(' ');
  expect(bannedHits(tags)).toEqual([]);
  expect(tags.match(own)).toBeNull();
  // the planner's own reasons the answer repeats
  const reasons = page.run('NO_MOUNT + " " + NO_ROOM') as string;
  expect(bannedHits(reasons)).toEqual([]);
});
