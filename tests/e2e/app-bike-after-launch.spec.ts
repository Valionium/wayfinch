// After the launch, part 2 (8 Nov 2026), in a real browser, in the four app projects (phone and laptop, both themes), launch build:
// the Bag planner draws the real bike when it opens with no working plan; a plan cleared in a second tab keeps the selected bike there;
// "Without a bike" chosen in Tools moves the plan to the standard bike with the line and Undo, and Tools' card shows the grey bike.
// Nothing here prints the page: failures compare booleans, counts and short values.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const mk = (id: string, name: string, colour: string) => ({ id, name, tyres: 'tubeless', frontTyre: '40-622', rearTyre: '40-622', pressure: { wheel: '700c', rim: 'hooked', rimMm: 23 }, fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' } }, look: { colour, bars: 'drop', ebike: false } });
const A = mk('bike_a', 'Trail Bike', '#2563b8');
const B = mk('bike_b', 'Gravel', '#c62f2a');
const RIDER = { 'loadcheck:bikeProfiles': JSON.stringify([A, B]), 'loadcheck:bikeProfile': JSON.stringify(B), 'loadcheck:walkthrough:v1': 'done', 'copilot:moved-card': 'seen' };

const read = (page: Page, key: string) => page.evaluate((k) => { const v = localStorage.getItem(k); return v === null ? null : JSON.parse(v); }, key);
const draftReady = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true', undefined, { timeout: 30_000 });
/** Whether the Bag planner's rig carries this colour as the frame's paint. */
const rigPainted = (page: Page, colour: string) => page.evaluate((c) => document.getElementById('rigSvg')!.innerHTML.includes(`stroke="${c}"`), colour);

async function rider(page: Page, path: string): Promise<void> {
  app = await loadApp(page, { launch: true, path });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, RIDER);
}

test('[LC-RIG-START] the Bag planner opened with no working plan draws the selected bike, not the plain one', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await rider(page, '/tools/bags/');
  await page.reload({ waitUntil: 'load' });
  await draftReady(page);
  expect(await read(page, 'loadcheck:draft')).toBeNull();
  expect(await page.evaluate('S.bikeProfile.id')).toBe('bike_b');
  await expect.poll(() => rigPainted(page, '#c62f2a')).toBe(true);
  // the drawing is the plan's bike as bike.js draws it, not left over from before the bike loaded
  expect(await page.evaluate(() => document.getElementById('rigSvg')!.innerHTML.includes('bk-paint'))).toBe(true);
  expect(errors).toEqual([]);
});

test('[LC-RIG-START] after Start a new plan > Yes, clear this plan, the plan\'s bike is still drawn', async ({ page }) => {
  await rider(page, '/tools/bags/');
  await page.reload({ waitUntil: 'load' });
  await draftReady(page);
  // a working plan to clear: a change of nights saves the draft
  await page.locator('#s1 button[data-to="2"]').click();
  await expect.poll(() => read(page, 'loadcheck:draft').then((d) => d !== null)).toBe(true);
  await page.reload({ waitUntil: 'load' });
  await draftReady(page);
  await expect(page.locator('#draftBar')).toBeVisible();
  await page.locator('#draftNew').click();
  await expect(page.locator('#draftNew')).toHaveText('Yes, clear this plan');
  await Promise.all([page.waitForEvent('load'), page.locator('#draftNew').click()]);
  await draftReady(page);
  expect(await read(page, 'loadcheck:draft')).toBeNull();
  expect(await page.evaluate('S.bikeProfile.id')).toBe('bike_b');
  await expect.poll(() => rigPainted(page, '#c62f2a')).toBe(true);
});

test('[LC-TABS-BIKE] "Yes, clear this plan" in one tab never drops the selected bike in another tab', async ({ page, context }) => {
  await rider(page, '/tools/bags/');
  await page.reload({ waitUntil: 'load' });
  await draftReady(page);
  await page.locator('#s1 button[data-to="2"]').click();
  await expect.poll(() => read(page, 'loadcheck:draft').then((d) => d !== null)).toBe(true);
  await page.reload({ waitUntil: 'load' });
  await draftReady(page);
  const other = await context.newPage();
  await other.goto(`${app!.origin}/tools/bags/`, { waitUntil: 'load' });
  await draftReady(other);
  expect(await other.evaluate('S.bikeProfile.id')).toBe('bike_b');
  await page.locator('#draftNew').click();
  await Promise.all([page.waitForEvent('load'), page.locator('#draftNew').click()]);
  await draftReady(page);
  // the other tab hears the plan go and shows an empty plan, on the same bike
  await expect(other.locator('#tabText')).toHaveText('This plan was cleared in another tab, so this tab now shows an empty plan.');
  expect(await other.evaluate('S.bikeProfile && S.bikeProfile.id')).toBe('bike_b');
  await expect.poll(() => read(page, 'loadcheck:bikeProfile').then((b) => b?.id)).toBe('bike_b');
  expect(await page.evaluate('S.bikeProfile && S.bikeProfile.id')).toBe('bike_b');
  await other.close();
});

test('[TB-PAGE-NO-BIKE] "Without a bike" in Tools: the Tools card shows the grey standard bike and says so; the Bag planner moves to it at its next open, with the line and Undo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await rider(page, '/#/tools');
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#tools-bike')).toHaveValue('bike_b');
  const card = page.locator('main[data-screen="tools"] .card').first();
  await expect.poll(() => card.locator('.bike-art').innerHTML().then((h) => h.includes('stroke="#c62f2a"'))).toBe(true);
  await page.locator('#tools-bike').selectOption('default');
  await expect.poll(() => read(page, 'copilot:bikeChoice:v1').then((r) => r && r.bikeId)).toBeNull();
  // the card: no rider's colour on the bike, and the line saying what the Bag planner will use
  await expect(card.locator('.bike-art svg')).toBeVisible();
  await expect.poll(() => card.locator('.bike-art').innerHTML().then((h) => /stroke="#(2563b8|c62f2a)"/.test(h))).toBe(false);
  await expect(card.locator('.tools-no-bike')).toHaveText('No bike chosen. The Bag planner uses a standard bike.');
  // Open: the plan moves, never silently
  await page.locator('a[href="/tools/bags/"]').first().click();
  await page.waitForURL(/\/tools\/bags\/$/);
  await draftReady(page);
  await expect(page.locator('#bikeFollowBar')).toBeVisible();
  await expect(page.locator('#bikeFollowText')).toHaveText('Now planning without a saved bike ·');
  await expect(page.locator('#bikeFollowUndo')).toBeVisible();
  expect(await page.evaluate('S.bikeProfile')).toBeNull();
  await expect.poll(() => rigPainted(page, '#c62f2a')).toBe(false);
  // nothing more happens by itself
  await page.waitForTimeout(3000);
  await expect(page.locator('#bikeFollowText')).toHaveText('Now planning without a saved bike ·');
  expect(await page.evaluate('S.bikeProfile')).toBeNull();
  // Undo brings the bike back, drawn
  await page.locator('#bikeFollowUndo').click();
  await expect(page.locator('#bikeFollowText')).toHaveText('Back to planning for Gravel.');
  expect(await page.evaluate('S.bikeProfile.id')).toBe('bike_b');
  await expect.poll(() => rigPainted(page, '#c62f2a')).toBe(true);
  await expect.poll(() => read(page, 'loadcheck:bikeChoice:v1').then((r) => r?.bikeId)).toBe('bike_b');
  expect(errors).toEqual([]);
});
