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
