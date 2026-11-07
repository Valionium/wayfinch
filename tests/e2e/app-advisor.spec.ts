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
  // the bound measures the search alone, not the dialog's opening (review of PR 61, I4)
  await page.evaluate('window.__adv.trials = 0; window.__adv.yields = []; window.__adv.down = 0; window.__adv.longest = 0');
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

/** The reviewer's heavy plan (review of PR 61, I4): top 1, bar 12, seat 14, a half frame bag, a pair of fork cages, a 15 L backpack, five
 *  nights camping, carrying a lot. */
async function heavy(page: Page): Promise<void> {
  await page.evaluate(`S.bikeProfile = normaliseBikeProfile(${JSON.stringify(R3_BIKE)});
    Object.assign(S, { nights: 5, sleep: 'camp', mode: 'comfort', decks: { bar: false, rack: false }, nextUid: 7,
      bags: [{ uid: 1, pos: 'top', slot: 'front', L: 1 }, { uid: 2, pos: 'bar', L: 12 }, { uid: 3, pos: 'seat', L: 14 }, { uid: 4, pos: 'frame', shape: 2, L: 3 },
        { uid: 5, pos: 'fork', pair: true, L: 3 }, { uid: 6, pos: 'pack', L: 15 }] });
    applyTripKitDefaults();
    S.custom = Object.fromEntries(KIT.filter(k => k.tiers).map(k => { const t = [...k.tiers].sort((a, b) => b.L - a.L)[0]; return [k.id, { L: t.L, kg: t.kg, rigid: t.rigid }]; }));`);
}

test('[GA-PROGRESS] the heavy plan (many bags, five nights, a lot; Panniers are fine, Better handling): the search hands the page back within about 50 ms of trials, no task reaches 600 ms on the phone stand-in, and the progress line never counts more options than were tried (review of PR 61, I4)', async ({ page }) => {
  await planner(page);
  await heavy(page);
  await page.evaluate(`window.__adv = { trials: 0, longest: 0, shown: [], honest: true, backs: [] };
    advisorTrial = ((f) => (...a) => { window.__adv.trials++; return f(...a); })(advisorTrial);
    window.setTimeout = ((st) => (fn, ms, ...a) => { if (!ms && ADVISOR_RUN > 0 && window.__adv.trials > 0) window.__adv.backs.push(performance.now()); return st(fn, ms, ...a); })(window.setTimeout);
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__adv.longest = Math.max(window.__adv.longest, e.duration); }).observe({ type: 'longtask', buffered: false });
    new MutationObserver(() => { const m = /^Trying ([0-9]+) options…$/.exec(document.getElementById('advisorProgress').textContent || '');
      if (m) { window.__adv.shown.push(+m[1]); if (+m[1] > window.__adv.trials) window.__adv.honest = false; } })
      .observe(document.getElementById('advisorProgress'), { childList: true, characterData: true, subtree: true });`);
  await page.evaluate("openAdvisor(document.getElementById('rigBikeDetails'))");
  const box = page.locator('#advisorBox');
  await box.locator('label.adv-choice', { hasText: 'Panniers are fine' }).click();
  await page.evaluate('window.__adv.trials = 0; window.__adv.longest = 0; window.__adv.shown = []; window.__adv.backs = []');
  await box.locator('label.adv-choice', { hasText: 'Better handling' }).click();
  await expect(page.locator('#advisorAnswer h4').first()).toBeVisible({ timeout: 60_000 });
  const r = await page.evaluate('window.__adv') as { trials: number; longest: number; shown: number[]; honest: boolean; backs: number[] };
  const gaps = r.backs.slice(1).map((t, k) => t - r.backs[k]!).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)] ?? Infinity;
  const note = `${r.trials} trials, longest task ${r.longest.toFixed(0)} ms, progress shown ${r.shown.length} times, ${r.backs.length} hand-backs, median ${median.toFixed(0)} ms apart, at most ${(gaps.at(-1) ?? 0).toFixed(0)}`;
  test.info().annotations.push({ type: 'GA-PROGRESS heavy', description: note });
  console.log(`GA-PROGRESS heavy ${test.info().project.name}: ${note}`);
  expect(r.trials).toBeGreaterThan(100);
  expect(r.shown.length, 'the progress line showed').toBeGreaterThan(0);
  expect(r.honest, 'the progress line never counts more options than were tried').toBe(true);
  expect(r.shown.every((n, k) => k === 0 || n >= r.shown[k - 1]!), 'the count only grows').toBe(true);
  expect(r.longest, 'no stretch of the search holds the page 600 ms or more').toBeLessThan(600);
  // the hand-backs themselves: a slice of about 50 ms, not 20 heavy trials in a row (re-check of PR 61, n7); the median, as one slow
  // trial or a pause of the machine can stretch a single gap
  expect(r.backs.length).toBeGreaterThan(5);
  expect(median, 'the page gets its hand back every 150 ms or sooner, as a rule').toBeLessThan(150);
});

test('[GA-SCREEN] advisor.js still loading: a setup tapped before it arrives is kept, the view is not drawn again under the rider\'s focus, and no second search starts when it loads (review of PR 61, m4)', async ({ page }) => {
  await planner(page);
  await gravel(page);
  let release: () => void = () => {};
  const held = new Promise<void>((res) => { release = res; });
  await page.route('**/tools/bags/advisor.js', async (route) => { await held; await route.continue(); });
  await page.evaluate("openAdvisor(document.getElementById('rigBikeDetails'))");
  const box = page.locator('#advisorBox');
  await box.locator('label.adv-choice', { hasText: 'Bikepacking bags only' }).click();
  await expect(box.locator('input[name="advStyle"][value="bags"]')).toBeFocused();
  const before = await page.evaluate(`(() => { window.__mark = document.getElementById('advisorSteps').firstElementChild; return ADVISOR_RUN; })()`) as number;
  release();
  await page.waitForFunction('!!window.WayfinchAdvisor');
  await page.waitForTimeout(200);
  const after = await page.evaluate(`({ run: ADVISOR_RUN, style: ADVISOR.style, same: document.getElementById('advisorSteps').firstElementChild === window.__mark })`) as { run: number; style: string; same: boolean };
  expect(after.style).toBe('bags');
  expect(after.run, 'no second search').toBe(before);
  expect(after.same, 'the steps were not drawn again').toBe(true);
  await expect(box.locator('input[name="advStyle"][value="bags"]')).toBeFocused();
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

test('[GA-SCREEN] combinations side by side at this size and theme: the row of sketches never scrolls the page sideways, the keyboard reaches each sketch, each is named by its bags, and pressing one brings its card (the owner\'s ruling on PR 61)', async ({ page }) => {
  await planner(page);
  await gravel(page);
  await page.evaluate("openAdvisor(document.getElementById('rigBikeDetails'))");
  const box = page.locator('#advisorBox');
  await box.locator('label.adv-choice', { hasText: 'Bikepacking bags only' }).click();
  await box.locator('label.adv-choice', { hasText: 'Better handling' }).click();
  const combos = box.locator('.adv-combos').first().locator('button.adv-combo');
  await expect(combos.first()).toBeVisible({ timeout: 30_000 });
  const n = await combos.count();
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(3);
  expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), 'no sideways page scroll').toBe(true);
  expect(await page.evaluate('document.getElementById("advisorBody").scrollWidth <= document.getElementById("advisorBody").clientWidth'), 'nor in the dialog').toBe(true);
  for (let k = 0; k < n; k++) {
    const name = await combos.nth(k).getAttribute('aria-label');
    expect(name, 'named by its bags').toMatch(/^Your bike with /);
    expect((await combos.nth(k).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // the keyboard: Tab from the goal reaches each sketch
  await box.locator('input[name="advGoal"][value="handling"]').focus();
  const reached = new Set<string>();
  for (let i = 0; i < 12 && reached.size < n; i++) {
    await page.keyboard.press('Tab');
    const card = await page.evaluate('document.activeElement.classList.contains("adv-combo") ? document.activeElement.dataset.card : ""') as string;
    if (card) reached.add(card);
  }
  expect(reached.size, 'every sketch by Tab').toBe(n);
  // Enter on a sketch brings its card, with the focus
  const target = await combos.last().getAttribute('data-card');
  await combos.last().focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate('document.activeElement.getAttribute("aria-labelledby")')).toBe(target);
});

// ---- Trial bags (sub-project 13, group 3; decision 7) ----

/** The bag planner's own saved values a trial may never touch: the draft, the bikes and the setups. */
const saved = (page: Page) => page.evaluate(() => Object.fromEntries(['loadcheck:draft', 'loadcheck:bikeProfiles', 'loadcheck:setups'].map((k) => [k, localStorage.getItem(k)])));

test('[GA-TRY] [GA-TRIAL-NO-TRACE] [GA-KEEP] [GA-REMOVE] in the browser: Try in Bag planner shows the plan with the trial bag and its line; a reload keeps nothing of it; Remove it and Keep it from the line', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  await gravel(page);
  // the packing check's one-time question about the bike's maximum weight was asked before
  await page.evaluate('S.bikeProfile.maxWeightAsked = true; flushDraft()');
  // the plan as the page reads it back from storage
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY');
  const before = await saved(page);
  const bagsBefore = await page.evaluate('JSON.stringify(S.bags)');
  const box = page.locator('#advisorBox');
  const tryFirst = async (choose: boolean): Promise<void> => {
    await page.evaluate("location.hash = '#gear-advisor'");
    await expect(box).toBeVisible();
    if (choose) await box.locator('label.adv-choice', { hasText: 'Better handling' }).click();
    const button = box.getByRole('button', { name: 'Try in Bag planner' }).first();
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    await expect(box).toBeHidden();
    await expect(page.locator('#trialBar')).toBeVisible();
    await expect(page.locator('#trialText')).toHaveText(/^Trying: .+\. Not saved until you keep it$/);
    await expect(page.locator('#s4')).toBeVisible();
    expect(await page.evaluate('JSON.stringify(S.bags)')).not.toBe(bagsBefore);
  };
  await tryFirst(true);
  // Save setup waits with the line
  await page.locator('#quickSave').click();
  await expect(page.locator('#quickSaveMsg')).toHaveText(/^Trying: /);
  // a reload keeps nothing of it
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY');
  await expect(page.locator('#trialBar')).toBeHidden();
  expect(await page.evaluate('JSON.stringify(S.bags)')).toBe(bagsBefore);
  expect(await saved(page)).toEqual(before);
  // Remove it
  await tryFirst(true);
  await page.getByRole('button', { name: 'Remove it' }).click();
  await expect(page.locator('#trialBar')).toBeHidden();
  expect(await page.evaluate('JSON.stringify(S.bags)')).toBe(bagsBefore);
  await page.waitForTimeout(500);
  expect(await saved(page)).toEqual(before);
  // Keep it: the trial's bags are saved
  await tryFirst(false);
  const kept = await page.evaluate('JSON.stringify(S.bags)');
  await page.getByRole('button', { name: 'Keep it' }).click();
  await expect(page.locator('#trialBar')).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('loadcheck:draft')!).bags))).toBe(kept);
  expect(errors).toEqual([]);
});

// ---- The way in from Tools, and back (sub-project 13, group 3, Task 9) ----

test('[GA-TOOLS-CARD] [GA-BACK] Tools\' Gear advisor card opens the advisor in the bag planner; closing it lands on Tools', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  const open = page.getByRole('link', { name: 'Open Gear advisor' });
  await expect(open).toHaveAttribute('href', '/tools/bags/#gear-advisor&back=tools');
  await open.click();
  await page.waitForURL(/\/tools\/bags\//);
  await expect(page.locator('#advisorBox')).toBeVisible();
  await expect(page.locator('#advisorBack')).toBeVisible();
  await page.locator('#advisorClose').click();
  await page.waitForURL((u) => u.pathname === '/' && u.hash === '#/tools');
  await expect(page.getByRole('link', { name: 'Open Gear advisor' })).toBeVisible();
});

test('[GA-BACK] Bike details opened with back=advisor returns to the Gear advisor', async ({ page }) => {
  const bike = { id: 'r2', name: 'Gravel', fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' } } };
  await planner(page, { 'loadcheck:bikeProfiles': JSON.stringify([bike]), 'loadcheck:bikeProfile': JSON.stringify(bike) });
  // a fresh visit, as Wayfinch's link makes it
  await page.goto('about:blank');
  await page.goto(`${app!.origin}/tools/bags/#bike-details=r2&back=advisor`, { waitUntil: 'load' });
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await page.locator('#bikeDetailsClose').click();
  await expect(page.locator('#bikeDetailsBox')).toBeHidden();
  await expect(page.locator('#advisorBox')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/tools/bags/');
});
