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
    const steps = window.WayfinchAdvisor.adviseSteps(advisorInput('panniers', 'handling'));
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

/** The site's worker, as Make available offline registers it; then the page from its cache with the network off. */
async function offline(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('/offline-worker.js', { scope: '/', updateViaCache: 'none' });
    const w = reg.installing ?? reg.waiting ?? reg.active;
    if (w && w.state !== 'activated') await new Promise<void>((res) => w.addEventListener('statechange', () => { if (w.state === 'activated') res(); }));
  });
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY');
}

/** R2 of the plan's example riders: a gravel bikepacker with a swaying seat pack, no rack mounts, two cages. */
async function gravel(page: Page): Promise<void> {
  await page.evaluate(`S.bikeProfile = normaliseBikeProfile({ id: 'r2', name: 'Gravel', fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' }, bolts: { st: 'yes', dt: 'yes' } }, rackMounts: 'no' });
    Object.assign(S, { nights: 2, sleep: 'camp', mode: 'comfort', decks: { bar: false, rack: false }, nextUid: 6,
      bags: [{ uid: 1, pos: 'seat', L: 14 }, { uid: 2, pos: 'bar', L: 12 }, { uid: 3, pos: 'top', slot: 'front', L: 1 }, { uid: 4, pos: 'bottle', slot: 'dt', L: 0.75 }, { uid: 5, pos: 'bottle', slot: 'st', L: 0.75 }] });
    applyTripKitDefaults();`);
}

test('[GA-PROGRESS] a search longer than 300 ms shows "Trying N options…", and a tap during it starts the search again', async ({ page }) => {
  await planner(page);
  await tourer(page);
  // every trial a little slower, so the search runs well past 300 ms on any machine
  await page.evaluate('advisorTrial = ((f) => (...a) => { const t = performance.now(); while (performance.now() - t < 12); return f(...a); })(advisorTrial)');
  await page.evaluate("location.hash = '#gear-advisor'");
  const box = page.locator('#advisorBox');
  await expect(box).toBeVisible();
  await box.locator('label.adv-choice', { hasText: 'Panniers are fine' }).click();
  await box.locator('label.adv-choice', { hasText: 'Better handling' }).click();
  await expect(page.locator('#advisorProgress')).toBeVisible();
  await expect(page.locator('#advisorProgress')).toHaveText(/^Trying \d+ options…$/);
  // a tap while it runs: the other goal is taken, and the search starts again for it (how fast: the test below)
  await box.locator('label.adv-choice', { hasText: 'Get the backpack off' }).click();
  await expect(box.locator('input[name="advGoal"][value="backpack"]')).toBeChecked();
  expect(await page.evaluate('ADVISOR.goal')).toBe('backpack');
  await expect(page.locator('#advisorAnswer h3')).toHaveText('What to get', { timeout: 30_000 });
  await expect(page.locator('#advisorProgress')).toBeHidden();
  expect(await page.evaluate('ADVISOR.input.goal')).toBe('backpack');
});

test('[GA-PROGRESS] the real R3 search hands the page back after every 20 trials at most, and a tap during it gets its response within 1 s (phone stand-in included; review of PR 60, I3)', async ({ page }) => {
  await planner(page);
  await tourer(page);
  // counted in the page: trials run, the trial count at each hand-back (a zero-delay timer), long tasks, and a tap's wait
  await page.evaluate(`window.__adv = { trials: 0, yields: [], longest: 0, tap: null };
    advisorTrial = ((f) => (...a) => { window.__adv.trials++; return f(...a); })(advisorTrial);
    window.setTimeout = ((st) => (fn, ms, ...a) => { if (!ms && ADVISOR_RUN > 0) window.__adv.yields.push(window.__adv.trials); return st(fn, ms, ...a); })(window.setTimeout);
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__adv.longest = Math.max(window.__adv.longest, e.duration); }).observe({ type: 'longtask', buffered: false });
    document.addEventListener('pointerdown', (e) => { window.__adv.down = e.timeStamp; }, true);
    document.getElementById('advisorBox').addEventListener('change', (e) => { if (e.target.name === 'advGoal' && window.__adv.down) window.__adv.tap = performance.now() - window.__adv.down; });`);
  await page.evaluate("openAdvisor(document.getElementById('rigBikeDetails'))");
  const box = page.locator('#advisorBox');
  await box.locator('label.adv-choice', { hasText: 'Panniers are fine' }).click();
  await page.evaluate('window.__adv.trials = 0; window.__adv.yields = []; window.__adv.down = 0');
  await box.locator('label.adv-choice', { hasText: 'Better handling' }).click();
  await expect.poll(() => page.evaluate('window.__adv.trials')).toBeGreaterThan(25);
  await box.locator('label.adv-choice', { hasText: 'Get the backpack off' }).click();
  await expect(page.locator('#advisorAnswer h3')).toHaveText('What to get', { timeout: 30_000 });
  const r = await page.evaluate('window.__adv') as { trials: number; yields: number[]; longest: number; tap: number | null };
  const gaps = r.yields.map((y, i) => y - (i ? r.yields[i - 1]! : 0)).filter((g) => g > 0);
  const note = `tap ${r.tap?.toFixed(0)} ms, longest task ${r.longest.toFixed(0)} ms, largest gap ${Math.max(...gaps)} trials`;
  test.info().annotations.push({ type: 'GA-PROGRESS', description: note });
  console.log(`GA-PROGRESS ${test.info().project.name}: ${note}`);
  expect(gaps.length).toBeGreaterThan(1);
  expect(Math.max(...gaps), 'trials between two hand-backs').toBeLessThanOrEqual(20);
  expect(r.tap, 'the tap was handled').not.toBeNull();
  expect(r.tap!, 'a tap during the search waits under a second').toBeLessThan(1000);
  expect(r.longest, 'no stretch of the search holds the page a second or more').toBeLessThan(1000);
});

test('[GA-SCREEN] at this window size and theme, offline: the steps are headings, every choice 44 px or more, no sideways scroll, and the keyboard reaches every choice and suggestion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  await offline(page);
  await gravel(page);
  await page.evaluate("location.hash = '#gear-advisor'");
  const box = page.locator('#advisorBox');
  await expect(box).toBeVisible();
  await expect(box.locator('#advisorSteps h3')).toHaveText([/^1\. /, /^2\. /, /^3\. /]);
  // no rack mounts and no rack in the plan: the line says no rack or panniers are offered; every setup stays open (the owner, 7 Nov)
  await expect(box.locator('input[name="advStyle"][value="panniers"]')).toBeEnabled();
  await expect(box.locator('#advNoMounts')).toHaveText('Your bike has no rack mounts, so no rack or panniers are offered.');
  await expect(box.locator('input[name="advStyle"][value="bags-first"]')).toBeChecked();   // the default
  // the keyboard: from the dialog's close button, Tab into the styles, the arrow keys to choose
  await box.locator('#advisorClose').focus();
  for (let i = 0; i < 4 && (await page.evaluate('document.activeElement.name')) !== 'advStyle'; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate('document.activeElement.name')).toBe('advStyle');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate('ADVISOR.style')).toBe('panniers');
  expect(await page.evaluate('document.activeElement.value'), 'focus stays on the choice after it is drawn again').toBe('panniers');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate('ADVISOR.style')).toBe('bags');
  await page.keyboard.press('Tab');
  expect(await page.evaluate('document.activeElement.name')).toBe('advGoal');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate('ADVISOR.goal')).toBe('handling');
  await expect(page.locator('#advisorAnswer h3')).toHaveText('What to get', { timeout: 30_000 });
  const cards = await box.locator('.adv-card').count();
  expect(cards).toBeGreaterThan(0);
  // Tab on through the rest of the dialog: the switch, then each suggestion
  const reached = new Set<string>();
  for (let i = 0; i < 20 && reached.size < cards + 1; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate('document.activeElement.id || document.activeElement.getAttribute("aria-labelledby") || ""') as string;
    if (id) reached.add(id);
  }
  expect(reached.has('advSource'), 'the switch to the questionnaire').toBe(true);
  for (let i = 0; i < cards; i++) expect(reached.has(`advS${i}`), `suggestion ${i + 1}`).toBe(true);
  // every choice a labelled radio of at least 44 px, inside the screen; no sideways scroll
  const sizes = await box.locator('label.adv-choice').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { h: r.height, right: r.right }; }));
  expect(sizes.length).toBeGreaterThanOrEqual(5);
  const width = page.viewportSize()!.width;
  for (const s of sizes) { expect(s.h).toBeGreaterThanOrEqual(44); expect(s.right).toBeLessThanOrEqual(width); }
  expect(await page.evaluate('document.getElementById("advisorBody").scrollWidth <= document.getElementById("advisorBody").clientWidth')).toBe(true);
  expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true);
  // the suggestions drew the bike, offline (advisor.js from the worker's cache)
  await expect(box.locator('.adv-card svg.bk').first()).toBeVisible();
  // Escape closes it, and nothing of the plan changed
  await page.keyboard.press('Escape');
  await expect(box).toBeHidden();
  expect(await page.evaluate('S.bags.length')).toBe(5);
  expect(errors).toEqual([]);
  await page.context().setOffline(false);
});

test('[GA-STEPS] in the browser: each choice is a labelled radio of at least 44 px, and the answer needs all three steps', async ({ page }) => {
  await planner(page);
  await gravel(page);
  await page.evaluate("openAdvisor(document.getElementById('rigBikeDetails'))");
  const box = page.locator('#advisorBox');
  await expect(box.locator('#advisorAnswer')).toHaveText('Choose all three steps to see what to get.');
  for (const name of ['Bikepacking bags only', 'Bags first, panniers only if needed', 'Panniers are fine', 'Better handling', 'Get the backpack off']) {
    await expect(box.getByRole('radio', { name })).toHaveCount(1);
    const h = await box.locator('label.adv-choice', { hasText: name }).evaluate((el) => el.getBoundingClientRect().height);
    expect(h, name).toBeGreaterThanOrEqual(44);
  }
  await box.locator('label.adv-choice', { hasText: 'Bikepacking bags only' }).click();
  await expect(box.locator('#advisorAnswer')).toHaveText('Choose all three steps to see what to get.');
  await box.locator('label.adv-choice', { hasText: 'Better handling' }).click();
  await expect(page.locator('#advisorAnswer h3')).toHaveText('What to get', { timeout: 30_000 });
});
