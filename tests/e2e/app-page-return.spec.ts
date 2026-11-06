// Back in Wayfinch from the bag planner by the browser's back-forward cache (owner's iPhone rehearsal, 6 November 2026): Safari keeps
// the page as it was before the jump and shows it again without loading it. Playwright turns Chromium's cache off, and its headless
// shell has none at all; this file turns it back on and runs the full Chromium (WAYFINCH_BFCACHE_CHANNEL picks another Chromium, such
// as msedge, where that one can't start), so the restore here is the real one (`pageshow` with `persisted`), and each test first
// checks that it was.
// Nothing here prints the page: failures compare booleans, counts and short values.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

test.use({ channel: process.env.WAYFINCH_BFCACHE_CHANNEL ?? 'chromium', launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] } });

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const draftReady = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true', undefined, { timeout: 30_000 });

/** A returning Load Check rider at Wayfinch's first open; the page is marked so a restore from the cache can be told from a load. */
async function returningRider(page: Page, keys: Record<string, string>): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/' });
  await page.evaluate((k) => { localStorage.clear(); for (const [key, value] of Object.entries(k)) localStorage.setItem(key, value); }, keys);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#app .shell');
  await settled(page);
  await page.evaluate(() => {
    (window as unknown as { __before: boolean }).__before = true;
    window.addEventListener('pageshow', (e) => { (window as unknown as { __restored: boolean }).__restored = e.persisted; });
  });
}
/**
 * Wayfinch's start-up done (its worker, its lazy chunks, the handoff cleanup): Chromium drops a cached page that runs code while it is
 * kept (a request or a database answer arriving late), and the test would see a fresh load instead of the restore it is about.
 */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await navigator.serviceWorker?.ready; });
  await page.waitForTimeout(500);
}
/** The same page, kept by the cache: not loaded again. */
async function expectRestored(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __restored?: boolean }).__restored ?? null)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __before?: boolean }).__before === true)).toBe(true);
}

test('[SW-MOVED-RETURN] Open the Bag planner on the card, then Back to Wayfinch, restored from the cache: the screen the rider came from, the card gone', async ({ page }) => {
  await returningRider(page, { 'loadcheck:setups': '[]' });
  const card = page.locator('.moved-card');
  await expect(card).toBeVisible();
  const from = await page.evaluate(() => [location.pathname, location.hash, document.querySelector('main')?.getAttribute('data-screen') ?? null]);
  await card.getByRole('link').click();
  await page.waitForURL(/\/tools\/bags\/$/);
  await draftReady(page);
  await page.locator('#backToWayfinch').click();
  await page.waitForURL((u) => u.pathname === '/', { waitUntil: 'commit' });   // a restore fires no load event
  await expectRestored(page);
  expect(await page.evaluate(() => [location.pathname, location.hash, document.querySelector('main')?.getAttribute('data-screen') ?? null])).toEqual(from);
  await expect(card).toHaveCount(0);
  // and on the next start
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#app .shell');
  await page.waitForTimeout(300);
  await expect(card).toHaveCount(0);
});

test('[SW-MOVED-RETURN] the browser\'s own Back after the card\'s link, restored from the cache: the card gone too', async ({ page }) => {
  await returningRider(page, { 'loadcheck:draft': '{}' });
  await expect(page.locator('.moved-card')).toBeVisible();
  await page.locator('.moved-card').getByRole('link').click();
  await page.waitForURL(/\/tools\/bags\/$/);
  await draftReady(page);
  await page.goBack({ waitUntil: 'commit' });
  await expectRestored(page);
  await expect(page.locator('.moved-card')).toHaveCount(0);
});

test('[PAGE-RETURN] what the bag planner changed while Wayfinch sat in the cache shows at once: the bike and the theme', async ({ page }) => {
  await returningRider(page, { 'loadcheck:setups': '[]', 'copilot:moved-card': 'seen' });
  await page.goto(`${app!.origin}/#/trip`, { waitUntil: 'load' });
  await page.waitForSelector('#app .shell');
  await settled(page);
  await page.evaluate(() => {
    (window as unknown as { __before: boolean }).__before = true;
    window.addEventListener('pageshow', (e) => { (window as unknown as { __restored: boolean }).__restored = e.persisted; });
  });
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.goto(`${app!.origin}/tools/bags/`, { waitUntil: 'load' });
  await draftReady(page);
  const other = theme === 'light' ? 'dark' : 'light';
  await page.evaluate((t) => {
    const bike = { id: 'bike_red', name: 'Red', frontTyre: '40-622', rearTyre: '40-622', fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' } }, look: { colour: '#c62f2a', bars: 'drop', ebike: false } };
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify(bike));
    localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([bike]));
    localStorage.setItem('loadcheck:theme:v1', JSON.stringify({ app: 'load-check', kind: 'theme', v: 1, theme: t, at: new Date().toISOString() }));
  }, other);
  await page.goBack({ waitUntil: 'commit' });
  await expectRestored(page);
  await expect(page.locator('.trip-bike .bk-paint.bk-frame').first()).toHaveAttribute('stroke', '#c62f2a');
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(other);
});
