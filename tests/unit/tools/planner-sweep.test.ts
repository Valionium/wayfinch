// Small clarity fixes in the bag planner from the live sweep of 14 Nov 2026 (section D): wording slips, labels under the drawing, the
// pockets' question and the setup button beside the save line. The page is never printed: only short values and booleans are compared.
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';
import { bannedHits } from '../../fixtures/banned.ts';

const require = createRequire(import.meta.url);
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: () => { run: (code: string) => unknown; html: string; script: string } };

test('[LC-SWEEP-CLARITY] the wording slips are gone: bottle cages sit on the tubes, rain kit "still without a place" for any number of things, an all clear is not an alarm (sweep #36)', () => {
  const page = appVM();
  expect(page.script.includes("const where={st:'on the seat tube',dt:'on the down tube',un:'under the down tube'}")).toBe(true);
  expect(/inside the (seat|down) tube/.test(page.script)).toBe(false);
  expect(page.script.includes('still needs a place')).toBe(false);
  expect(page.script.includes('Still without a place: ')).toBe(true);
  expect(page.script.includes('Unusual — check it twice')).toBe(false);
  expect(page.script.includes("'<div class=\"emptyfind\">Nothing essential missing.</div>'")).toBe(true);
}, 30_000);

test('[LC-SWEEP-CLARITY] the buttons under the drawing say what they act on, and the setup button does not read as the only way to save (sweep #38, #35)', () => {
  const { html } = appVM();
  expect(html.includes('<button id="rigMode" aria-pressed="false"><span class="dotm"></span><b>Remove a bag</b></button>')).toBe(true);
  expect(html.includes('<button id="rigReset">Reset bags</button>')).toBe(true);
  expect(html.includes('<button class="go small" id="quickSave">Keep as a setup</button>')).toBe(true);
  expect(html.includes('>Save this plan<')).toBe(false);
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

test('[LC-SWEEP-CLARITY] one bag, one capacity: Where it goes gives a bag\'s litres as the plan\'s figures do, to 2 decimals (a 1.06 L top tube bag read "0.9 / 1.1 L"; sweep #26)', () => {
  const { script } = appVM();
  expect(script.includes("const used = +(s.cap - s.left).toFixed(2), full = s.left < s.cap*0.06;")).toBe(true);
  expect(script.split("${used} / ${+s.cap.toFixed(2)} L · ${kg.toFixed(1)} kg").length - 1).toBe(2);   // the list and the bag's popover
  expect(script.includes("const used = +(s.cap - s.left).toFixed(2);\n  const pct")).toBe(true);
  expect(script.includes("${s.cap.toFixed(1)} L")).toBe(false);
  expect(script.includes("${+s.left.toFixed(2)} L still free in here.")).toBe(true);
}, 30_000);
