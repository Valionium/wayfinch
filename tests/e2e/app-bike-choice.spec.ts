// One chosen bike for every tool, both apps together in a real browser (sub-project 11, group 3), built with the launch switch on, in the
// four app projects (phone and laptop, both themes): a bike chosen in Tools is the Bag planner's plan bike at its next open, with the
// line; a bike chosen there is Tools' and the tyre tool's; online and offline. Nothing here prints the page: failures compare booleans,
// counts and short values.
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const mk = (id: string, name: string, colour: string) => ({ id, name, tyres: 'tubeless', frontTyre: '40-622', rearTyre: '40-622', pressure: { wheel: '700c', rim: 'hooked', rimMm: 23 }, fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' } }, look: { colour, bars: 'drop', ebike: false } });
const A = mk('bike_a', 'Trail Bike', '#2563b8');
const B = mk('bike_b', 'Gravel', '#c62f2a');
const RIDER = { 'loadcheck:bikeProfiles': JSON.stringify([A, B]), 'loadcheck:bikeProfile': JSON.stringify(A), 'loadcheck:walkthrough:v1': 'done', 'copilot:moved-card': 'seen' };

const read = (page: Page, key: string) => page.evaluate((k) => { const v = localStorage.getItem(k); return v === null ? null : JSON.parse(v); }, key);
const draftReady = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true', undefined, { timeout: 30_000 });

/** Wayfinch's Tools with two saved bikes, Trail Bike the plan's; optionally with its offline copy in place first. */
async function rider(page: Page, context: BrowserContext, offline: boolean): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, RIDER);
  await page.reload({ waitUntil: 'load' });
  if (offline) {
    // The first visit, online: the worker installs and holds both apps (the bag planner precached with the rest).
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload({ waitUntil: 'load' });
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await page.goto(`${app.origin}/tools/bags/`, { waitUntil: 'load' });
    await draftReady(page);
    await page.goto(`${app.origin}/#/tools`, { waitUntil: 'load' });
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
  }
  await expect(page.locator('#tools-bike')).toHaveValue('bike_a');
}
/** The bag planner, opened from Tools' bag card. */
async function openPlanner(page: Page): Promise<void> {
  await page.locator('a[href="/tools/bags/"]').first().click();
  await page.waitForURL(/\/tools\/bags\/$/);
  await draftReady(page);
}
/** Bike details from the bags step, with Saved bikes open, as a rider reaches it. */
async function bikeDetails(page: Page): Promise<void> {
  await page.locator('#s1 button[data-to="2"]').click();
  await page.locator('#bikeDetailsOpen').click();
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await page.locator('#bikeLibraryPanel > summary').click();
  await expect(page.locator('#bikeSavedSelect')).toBeVisible();
}
/** Bike details → Saved bikes → Use saved bike, as a rider picks one in the bag planner. */
async function useSavedInPlanner(page: Page, id: string): Promise<void> {
  await bikeDetails(page);
  await page.locator('#bikeSavedSelect').selectOption(id);
  await page.locator('#bikeUseSaved').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!).id)).toBe(id);
}

/** The whole round: B chosen in Tools, the Bag planner follows with the line, A chosen there, Tools and the tyre tool show A. */
async function bothApps(page: Page, context: BrowserContext, offline: boolean): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await rider(page, context, offline);
  await page.locator('#tools-bike').selectOption('bike_b');
  await expect.poll(() => read(page, 'copilot:bikeChoice:v1').then((r) => r?.bikeId)).toBe('bike_b');
  await openPlanner(page);
  // the plan follows, with one quiet line and Undo; the page writes no record of its own for it
  await expect(page.locator('#bikeFollowBar')).toBeVisible();
  await expect(page.locator('#bikeFollowText')).toHaveText('Now planning for Gravel, chosen in Tools ·');
  await expect(page.locator('#bikeFollowUndo')).toHaveText('Undo');
  expect(await page.evaluate('S.bikeProfile.id')).toBe('bike_b');
  await expect.poll(() => read(page, 'loadcheck:bikeProfile').then((b) => b?.id)).toBe('bike_b');
  expect(await read(page, 'loadcheck:bikeChoice:v1')).toBeNull();
  // A chosen there: the page's own record, newer
  await useSavedInPlanner(page, 'bike_a');
  await expect.poll(() => read(page, 'loadcheck:bikeChoice:v1').then((r) => r?.bikeId)).toBe('bike_a');
  await expect(page.locator('#bikeFollowBar')).toBeHidden();
  await page.locator('#bikeDetailsClose').click();
  await page.goto(`${app!.origin}/#/tools`, { waitUntil: 'load' });
  await expect(page.locator('#tools-bike')).toHaveValue('bike_a');
  await page.goto(`${app!.origin}/#/tools/tyre`, { waitUntil: 'load' });
  await expect(page.locator('#tyre-bike')).toHaveValue('bike_a');
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#tyre-bike')).toHaveValue('bike_a');
  await page.goto(`${app!.origin}/#/tools`, { waitUntil: 'load' });
  await expect(page.locator('#tools-bike')).toHaveValue('bike_a');
  // and the bag planner, opened again, stays on A: its own choice is the newer
  await openPlanner(page);
  expect(await page.evaluate('S.bikeProfile.id')).toBe('bike_a');
  await expect(page.locator('#bikeFollowBar')).toBeHidden();
  expect(errors).toEqual([]);
}

test('[TB-TWO-APPS] two saved bikes: B chosen in Tools is the Bag planner plan bike, with the line; A chosen there is the bike of Tools and the tyre tool, after a reload too', async ({ page, context }) => {
  await bothApps(page, context, false);
});

test('[TB-OFFLINE] the same with the network off after the first visit', async ({ page, context }) => {
  await bothApps(page, context, true);
});

test('[TB-PAGE-UNDO] in a real browser: the line\'s Undo brings back the plan\'s bike, and Tools shows it', async ({ page, context }) => {
  await rider(page, context, false);
  await page.locator('#tools-bike').selectOption('bike_b');
  await openPlanner(page);
  await expect(page.locator('#bikeFollowUndo')).toBeVisible();
  await page.locator('#bikeFollowUndo').click();
  await expect(page.locator('#bikeFollowText')).toHaveText('Back to planning for Trail Bike.');
  await expect(page.locator('#bikeFollowUndo')).toBeHidden();
  expect(await page.evaluate('S.bikeProfile.id')).toBe('bike_a');
  await expect.poll(() => read(page, 'loadcheck:bikeChoice:v1').then((r) => r?.bikeId)).toBe('bike_a');
  await page.goto(`${app!.origin}/#/tools`, { waitUntil: 'load' });
  await expect(page.locator('#tools-bike')).toHaveValue('bike_a');
});

test('[TB-CHOICE-FALLBACK] in a real browser: the chosen bike removed in the bag planner, Tools shows the fallback', async ({ page, context }) => {
  await rider(page, context, false);
  await page.locator('#tools-bike').selectOption('bike_b');
  await openPlanner(page);
  expect(await page.evaluate('S.bikeProfile.id')).toBe('bike_b');
  await bikeDetails(page);
  await page.locator('#bikeSavedSelect').selectOption('bike_b');
  await page.locator('#bikeRemove').click();
  await page.locator('#bikeRemoveConfirm').click();
  await expect.poll(() => read(page, 'loadcheck:bikeProfiles').then((l) => l.map((b: { id: string }) => b.id))).toEqual(['bike_a']);
  await page.locator('#bikeDetailsClose').click();
  await page.goto(`${app!.origin}/#/tools`, { waitUntil: 'load' });
  // one saved bike left: still a select (that bike and Without a bike, owner 8 Nov), and the removed one is never offered
  await expect(page.locator('#tools-bike option')).toHaveCount(2);
  await expect(page.locator('#tools-bike')).toContainText('Trail Bike');
  await expect(page.locator('#tools-bike')).not.toContainText('Gravel');
});

// Review of PR 56, I3: a visit through a Bike details link from Wayfinch is a side trip; the plan keeps its bike, and the next plain open
// follows, with the line and Undo.
test('[TB-PAGE-FOLLOWS] a Bike details link from Wayfinch leaves the plan alone; the next plain open follows, with the line and Undo', async ({ page, context }) => {
  await rider(page, context, false);
  await page.locator('#tools-bike').selectOption('bike_b');
  await expect.poll(() => read(page, 'copilot:bikeChoice:v1').then((r) => r?.bikeId)).toBe('bike_b');
  await page.goto(`${app!.origin}/tools/bags/#bike-details=bike_a&back=you`, { waitUntil: 'load' });
  await draftReady(page);
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  expect(await page.evaluate('S.bikeProfile.id')).toBe('bike_a');
  await expect(page.locator('#bikeFollowBar')).toBeHidden();
  await expect(page.locator('#bikeSwapNote')).toBeHidden();
  await page.locator('#bikeDetailsClose').click();
  await page.waitForURL((u) => u.pathname === '/');
  expect(await read(page, 'loadcheck:bikeProfile').then((b) => b?.id)).toBe('bike_a');
  await page.goto(`${app!.origin}/#/tools`, { waitUntil: 'load' });
  await openPlanner(page);
  expect(await page.evaluate('S.bikeProfile.id')).toBe('bike_b');
  await expect(page.locator('#bikeFollowText')).toHaveText('Now planning for Gravel, chosen in Tools ·');
  await expect(page.locator('#bikeFollowUndo')).toBeVisible();
});

// The Bike line at the drawing (wish 15, 10 Nov 2026): "Bike <name> ▾" under the drawing on a phone, beside it when wide, with the
// saved bikes and Without a bike; a pick there is the planner's own Use saved bike, so it is Tools' bike too.
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const planBits = (page: Page) => page.evaluate('JSON.stringify([S.bags, S.decks, S.placements, S.nextUid])');
/** The bag planner opened straight, with these bikes saved and this plan bike. */
async function plannerWith(page: Page, library: object[], planBike: object | null): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); },
    { 'loadcheck:bikeProfiles': JSON.stringify(library), 'loadcheck:walkthrough:v1': 'done', ...(planBike ? { 'loadcheck:bikeProfile': JSON.stringify(planBike) } : {}) });
  await page.reload({ waitUntil: 'load' });
  await draftReady(page);
}

test('[TB-PAGE-CHOOSER] in a real browser: the Bike line at the drawing picks a saved bike as Bike details does, the bags untouched; Tools shows it; Without a bike too', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await rider(page, context, false);
  await openPlanner(page);
  await page.evaluate("S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'frame', L:6 }]; S.nextUid = 3; go(2)");
  const select = page.getByRole('combobox', { name: /^Bike/ });
  await expect(select).toBeVisible();
  await expect(select).toHaveValue('bike_a');
  await expect(select.locator('option')).toHaveText(['Trail Bike', 'Gravel', 'Without a bike']);
  const bits = await planBits(page);
  await select.focus();
  await select.selectOption('bike_b');
  await expect.poll(() => page.evaluate('S.bikeProfile && S.bikeProfile.id')).toBe('bike_b');
  await expect.poll(() => read(page, 'loadcheck:bikeChoice:v1').then((r) => r?.bikeId)).toBe('bike_b');
  await expect.poll(() => read(page, 'loadcheck:bikeProfile').then((b) => b?.id)).toBe('bike_b');
  await expect(select).toBeFocused();   // the keyboard keeps its place
  await expect(select).toHaveValue('bike_b');
  expect((await page.locator('#rigBike').innerHTML()).toLowerCase()).toContain('#c62f2a');   // the drawing is Gravel's
  expect(await planBits(page)).toBe(bits);
  await expect(page.locator('#planBikeUndo')).toBeHidden();   // a saved bike replaced: no Undo, as in Bike details
  await page.goto(`${app!.origin}/#/tools`, { waitUntil: 'load' });
  await expect(page.locator('#tools-bike')).toHaveValue('bike_b');
  await openPlanner(page);
  await expect(select).toHaveValue('bike_b');
  await select.selectOption(':none');
  await expect.poll(() => page.evaluate('S.bikeProfile')).toBeNull();
  await expect.poll(() => read(page, 'loadcheck:bikeChoice:v1').then((r) => r && r.bikeId)).toBeNull();
  expect(await read(page, 'loadcheck:bikeProfiles').then((l) => l.length)).toBe(2);
  await page.goto(`${app!.origin}/#/tools`, { waitUntil: 'load' });
  await expect(page.locator('#tools-bike')).toHaveValue('default');
  expect(errors).toEqual([]);
});

test('[TB-PAGE-CHOOSER] a plan bike in no saved list: listed first; a pick shows the usual Undo line under the Bike line; Undo by keyboard brings it back and the focus goes to the line', async ({ page }) => {
  const D = mk('bike_d', 'Only in this plan', '#1f7a4d');
  await plannerWith(page, [A, B], D);
  const select = page.locator('#planBikeSelect');
  await expect(select).toHaveValue(':plan');
  await expect(select.locator('option')).toHaveText(['Only in this plan', 'Trail Bike', 'Gravel', 'Without a bike']);
  await select.selectOption('bike_b');
  await expect(page.locator('#planBikeSwapText')).toHaveText('This plan now uses the new bike. Only in this plan was only in this plan, so it is kept: Undo brings it back.');
  const undo = page.locator('#planBikeUndo');
  await expect(undo).toHaveText('Undo: bring back Only in this plan');
  expect((await undo.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await undo.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate('S.bikeProfile.id')).toBe('bike_d');
  await expect(undo).toBeHidden();
  await expect(select).toBeFocused();
  await expect(select).toHaveValue(':plan');
  await expect.poll(() => read(page, 'loadcheck:bikeChoice:v1').then((r) => r?.bikeId)).toBe('bike_d');
});

test('[TB-PAGE-CHOOSER-FIT] at 320 and 360 px with a 100-character name: the Bike select is 44 px tall, under the drawing, inside the screen, no sideways scroll; no saved bike, no line; the small view hides it', async ({ page }) => {
  const long = mk('bike_long', 'L'.repeat(100), '#2563b8');
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 640 });
    await plannerWith(page, [A, long], A);
    const select = page.locator('#planBikeSelect');
    await select.selectOption('bike_long');
    await expect.poll(() => page.evaluate('S.bikeProfile.id')).toBe('bike_long');
    const s = (await select.boundingBox())!;
    const rig = (await page.locator('#rigBox').boundingBox())!;
    expect(s.height, `${width}`).toBeGreaterThanOrEqual(44);
    expect(s.x, `${width}`).toBeGreaterThanOrEqual(0);
    expect(s.x + s.width, `${width}`).toBeLessThanOrEqual(width);
    expect(s.y, `${width}`).toBeGreaterThanOrEqual(rig.y + rig.height - 1);
    await expect(page.locator('label[for="planBikeSelect"]')).toBeInViewport();
    expect(await noSideways(page), `${width}`).toBe(true);
    await page.evaluate("document.body.classList.add('lc-small')");
    await expect(select).toBeHidden();
    await app!.close();
    app = undefined;
  }
  await plannerWith(page, [], null);
  await expect(page.locator('#planFitLine')).toBeVisible();
  await expect(page.locator('#planBike')).toBeHidden();
});
