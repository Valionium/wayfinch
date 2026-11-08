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

// Re-check of PR 65, R3: back on Tools from a side trip into Bike details, the drawing the bike glides onto (the first screen's, there when
// the page is revealed) is the chosen bike, not the plan's first and the chosen one a moment later.
test('[TB-CARD-BIKE] a bike chosen in Tools, its drawing tapped, Bike details closed: the card the page is revealed with draws the chosen bike', async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener('pagereveal', () => {
      const svg = document.querySelector('main[data-screen="tools"] .bike-large .bike-art svg');
      if (location.pathname === '/') sessionStorage.setItem('wf:first-label', svg?.getAttribute('aria-label') ?? 'none');
    });
  });
  await rider(page, '/#/tools');
  await page.evaluate(() => localStorage.setItem('loadcheck:bikeProfile', localStorage.getItem('loadcheck:bikeProfiles')!.replace(/^\[(\{.*?\}),\{.*$/, '$1')));
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#tools-bike')).toHaveValue('bike_a');
  await page.locator('#tools-bike').selectOption('bike_b');
  const card = page.locator('main[data-screen="tools"] .card').first();
  await expect(card.locator('.bike-art svg')).toHaveAttribute('aria-label', /red frame/);
  await card.locator('.bike-tap').click();
  await page.waitForURL(/\/tools\/bags\//);
  await draftReady(page);
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  expect(await page.evaluate('S.bikeProfile.id')).toBe('bike_a');   // a side trip: the plan keeps its bike
  await page.locator('#bikeDetailsClose').click();
  await page.waitForURL(`${app!.origin}/#/tools`);
  await expect(card.locator('.bike-art svg')).toHaveAttribute('aria-label', /red frame/);
  expect(await page.evaluate(() => sessionStorage.getItem('wf:first-label'))).toMatch(/red frame/);
});

// The fork close-up (owner, 7 Nov 2026): while the rider chooses the fork's colours in Look, the same drawing at 2 to 3 times, cut to the
// fork, inside Look's Fork part; Look opened from Wayfinch (the Tools card) and inside the bag planner alike; no sideways scroll.
/** The close-up's zoom against the preview's, and whether everything fits across. */
const forkZoom = (page: Page) => page.evaluate(() => {
  const zoom = document.querySelector('#lookForkZoom svg');
  const preview = document.querySelector('#lookPreview svg');
  if (!zoom || !preview) return null;
  const vb = zoom.getAttribute('viewBox')!.split(' ').map(Number);
  const z = zoom.getBoundingClientRect(), p = preview.getBoundingClientRect(), body = document.getElementById('bikeDetailsBody')!;
  return {
    times: (z.width / vb[2]!) / (p.width / 320),
    inside: z.left >= body.getBoundingClientRect().left - 1 && z.right <= body.getBoundingClientRect().right + 1,
    across: body.scrollWidth <= body.clientWidth && document.documentElement.scrollWidth <= innerWidth,
    named: getComputedStyle(zoom).getPropertyValue('view-transition-name'),
    hidden: zoom.closest('[aria-hidden="true"]') !== null,
    html: zoom.outerHTML,
  };
});
async function chooseForkColours(page: Page): Promise<void> {
  await expect(page.locator('#lookForkSet')).toBeVisible();
  await expect(page.locator('#lookForkZoom')).toBeHidden();   // the fork as the frame: nothing to choose, no close-up
  await page.locator('#lookFork label:has(input[value="own"])').click();
  await expect(page.locator('#lookForkZoom')).toBeVisible();
  await expect(page.locator('#lookForkZoom svg')).toBeVisible();
  const z = (await forkZoom(page))!;
  expect(z.times).toBeGreaterThanOrEqual(2);
  expect(z.times).toBeLessThanOrEqual(3);
  expect(z.inside).toBe(true);
  expect(z.across).toBe(true);
  expect(z.named).not.toBe('wf-bike');   // the preview stays the one drawing that glides
  expect(z.hidden).toBe(true);           // a second picture of the same bike: the preview says it in words
  // each tap on the fork's colour shows in the close-up at once
  const swatch = page.locator('#lookForkColour label').nth(2);
  const hex = await swatch.locator('input').getAttribute('value');
  await swatch.click();
  await expect.poll(() => forkZoom(page).then((r) => r?.html.includes(`"${hex}"`))).toBe(true);
  // back to the frame's colours: no close-up
  await page.locator('#lookFork label:has(input[value="frame"])').click();
  await expect(page.locator('#lookForkZoom')).toBeHidden();
}

test('[BK-FORK-ZOOM] Look opened from Wayfinch\'s Tools card: choosing the fork\'s colours shows the fork enlarged 2 to 3 times, inside the dialog', async ({ page }) => {
  await rider(page, '/#/tools');
  await page.reload({ waitUntil: 'load' });
  await page.locator('main[data-screen="tools"] .card .bike-tap').first().click();
  await page.waitForURL(/\/tools\/bags\//);
  await draftReady(page);
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await chooseForkColours(page);
});

test('[BK-FORK-ZOOM] Look inside the bag planner: the same close-up', async ({ page }) => {
  await rider(page, '/tools/bags/');
  await page.reload({ waitUntil: 'load' });
  await draftReady(page);
  await page.locator('#s1 button[data-to="2"]').click();
  await page.locator('#bikeDetailsOpen').click();
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await page.locator('#bikeLookTitle').scrollIntoViewIfNeeded();
  await chooseForkColours(page);
});
