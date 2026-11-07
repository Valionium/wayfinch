// The Gear advisor in the bag planner (sub-project 13, group 2), in a real browser, built with the launch switch on. The search is
// /tools/bags/advisor.js; the page hands it its own bagSpec and a trial over planWith. Nothing here prints the page: failures compare
// booleans, counts and short values. qa/advisor.cjs holds the rules on the page's own code.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const R3_BIKE = { id: 'r3', name: 'Tourer', fit: { style: 'diamond-level', size: { kind: 'letter', value: 'L' } }, rackMounts: 'yes' };

async function planner(page: Page, entries: Record<string, string> = {}): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, entries);
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#rigBike svg.bk')).toBeVisible();
  await page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY');
}

/** R3 of the plan's example riders: a tourer with panniers, 5 nights camping, carrying a lot (each item's bulkiest tier). The page's
 *  own names (S, KIT…) are top-level lexical names, so they are reached from a script string. */
async function tourer(page: Page): Promise<void> {
  await page.evaluate(`S.bikeProfile = normaliseBikeProfile(${JSON.stringify(R3_BIKE)});
    Object.assign(S, { nights: 5, sleep: 'camp', mode: 'comfort', decks: { bar: false, rack: true }, nextUid: 3,
      bags: [{ uid: 1, pos: 'rack', pair: true, L: 20 }, { uid: 2, pos: 'bar', L: 12 }] });
    applyTripKitDefaults();
    S.custom = Object.fromEntries(KIT.filter(k => k.tiers).map(k => { const t = [...k.tiers].sort((a, b) => b.L - a.L)[0]; return [k.id, { L: t.L, kg: t.kg, rigid: t.rigid }]; }));`);
}

test('[GA-FAST] on the phone stand-in (run with the [PERF-* budgets): the median advisorTrial is recorded; a full search on R3 finishes within 1 second, or runs in slices of 20 trials, each within that second', async ({ page }) => {
  await planner(page);
  await tourer(page);
  await page.addScriptTag({ url: 'advisor.js' });
  const r = await page.evaluate(`(() => {
    const times = [];
    for (let i = 0; i < 15; i++) { const t0 = performance.now(); advisorTrial(S.bags, S.decks); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    const steps = window.WayfinchAdvisor.adviseSteps(advisorInput('rack', 'handling'));
    const slices = [];
    const start = performance.now();
    let t = start, answer = null;
    for (;;) {
      const step = steps.next();
      const now = performance.now(); slices.push(now - t); t = now;
      if (step.done) { answer = step.value; break; }
    }
    return { median: times[7], total: t - start, longest: Math.max(...slices), kind: answer.kind, tried: answer.tried };
  })()`) as { median: number; total: number; longest: number; kind: string; tried: number };
  const text = `advisorTrial median ${r.median.toFixed(1)} ms; R3 search ${r.total.toFixed(0)} ms over ${r.tried} trials (${r.kind}), longest slice ${r.longest.toFixed(0)} ms`;
  test.info().annotations.push({ type: 'GA-FAST', description: text });
  console.log(`GA-FAST ${test.info().project.name}: ${text}`);
  expect(r.tried).toBeGreaterThan(20);
  // within a second, or in slices the view hands back to the page between (GA-PROGRESS), none of them a second long
  if (r.total > 1000) {
    expect(r.tried).toBeGreaterThan(20);
    expect(r.longest).toBeLessThan(1000);
  }
});
