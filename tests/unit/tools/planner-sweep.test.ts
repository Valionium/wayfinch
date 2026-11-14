// Small clarity fixes in the bag planner from the live sweep of 14 Nov 2026 (section D): wording slips, labels under the drawing, the
// pockets' question and the setup button beside the save line. What the page draws is read (review of PR 141, m2), never its source text;
// the page is never printed: only short values and booleans are compared.
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';
import { bannedHits } from '../../fixtures/banned.ts';

const require = createRequire(import.meta.url);
type Node = { innerHTML: string; textContent: string; value: string; dataset: Record<string, string> };
type Page = { run: (code: string) => unknown; html: string; nodes: Map<string, Node> };
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: () => Page };

const words = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
/** The page with its packing check drawn as the page draws it: renderResult and what it calls put back over the harness's stub, as
 *  qa/packing-audit.cjs does. */
function checkPage(): Page {
  const page = appVM();
  const a = 'function renderResult(){', start = page.html.indexOf(a);
  page.run(page.html.slice(start, page.html.indexOf('/* ==== 84-packing-checklist.js ==== */', start)));
  page.run("buildThumb=()=>'';DRAFT_READY=true;");
  return page;
}
/** A plan at the packing check: a 1.2 L top tube bag (1.06 L usable) and a little kit, the rain kit too big for it. */
const TOP_ONLY = `S.kit={tool:true,rain:true,rainpants:true,docs:true};S.kitTouched={tool:true,rain:true,rainpants:true,docs:true};S.bags=[{uid:1,pos:'top',slot:'front',L:1.2}];S.nextUid=2;S.step=4;S.placements=null;`;

test('[LC-SWEEP-CLARITY] the wording slips are gone: bottle cages sit on the tubes, rain kit "still without a place", an all clear is not an alarm (sweep #36)', () => {
  const page = checkPage();
  // Bike details' quick estimate of a frame with bolts on the seat and down tubes
  page.run(`$('fitStyleChoices').dataset.value='diamond-level';$('fitSizeLetter').value='M';$('fitBoltSt').value='yes';$('fitBoltDt').value='yes';`);
  const quick = String(page.run('fitQuickResultText()'));
  expect(quick.includes('Bottle cages: 2 likely, on the seat tube and on the down tube (estimate)')).toBe(true);
  expect(/inside the (seat|down) tube/.test(quick)).toBe(false);
  // the packing check of a plan whose rain kit has no fitting bag
  page.run(`${TOP_ONLY}renderResult();`);
  const check = words(page.nodes.get('resultBox')!.innerHTML);
  expect(/Still without a place: [A-Z][a-z ,]+\. Check the overflow/.test(check)).toBe(true);
  expect(check.includes('still needs a place')).toBe(false);
  expect(check.includes('Unusual')).toBe(false);
  expect(bannedHits(check)).toEqual([]);
}, 30_000);

test('[LC-SWEEP-CLARITY] the buttons under the drawing say what they act on, the Bags step\'s card names its own part of Bike details, and the setup button does not read as the only way to save (sweep #38, #35)', () => {
  const { html } = appVM();
  const button = (id: string) => words((new RegExp(`<button[^>]*id="${id}"[^>]*>([\\s\\S]*?)</button>`).exec(html) || ['', ''])[1]!).trim();
  expect(button('rigMode')).toBe('Remove a bag');
  expect(button('rigReset')).toBe('Reset bags');
  expect(button('rigBikeDetails')).toBe('Bike details');
  expect(button('bikeDetailsOpen')).toBe('Repair details');   // it opens Bike details at its repair part
  expect(button('quickSave')).toBe('Keep as a setup');
}, 30_000);

test('[LC-SWEEP-CLARITY] the pocket switches come with their question: which pockets you ride with, and what unticking one does (sweep #30)', () => {
  const page = appVM();
  page.run(`S.nights=0;S.pockets={jersey:true,bib:true};applyTripKitDefaults();`);
  const html = String(page.run('pocketsHtml()'));
  const ask = /<p class="small-water pocket-ask" id="pocketAsk-[a-z]+">([^<]+)<\/p><div class="pocket-switches" role="group" aria-labelledby="pocketAsk-[a-z]+">/.exec(html);
  expect(ask?.[1]).toBe('You ride with these pockets. Untick one and what rides there goes in a bag.');
  expect(bannedHits(ask![1]!)).toEqual([]);
  // the two boxes (the small view's and the packing check's) never share an id
  expect(String(page.run(`pocketsHtml('small')`)).includes('id="pocketAsk-small"')).toBe(true);
  expect(String(page.run(`pocketsHtml('check')`)).includes('id="pocketAsk-check"')).toBe(true);
}, 30_000);

test('[LC-SWEEP-CLARITY] one bag, one capacity: Where it goes gives a 1.06 L top tube bag as 1.06 L, the plan\'s own figure (it read "0.9 / 1.1 L"; sweep #26)', () => {
  const page = checkPage();
  page.run(`${TOP_ONLY}renderResult();`);
  expect(page.run('currentPlan().slots[0].cap')).toBe(1.06);
  const check = words(page.nodes.get('resultBox')!.innerHTML);
  expect(/\b[\d.]+ \/ 1\.06 L · [\d.]+ kg/.test(check)).toBe(true);
  expect(/\/ 1\.1 L/.test(check)).toBe(false);
  // the bag's popover gives the same figure; it needs the drawn rig, so it is not drawn in this harness
}, 30_000);
