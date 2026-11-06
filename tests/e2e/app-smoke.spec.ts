// The smoke set (plan Decision 1, spec section 11.7): a few whole paths that every browser must walk. WebKit runs only these, in
// its own CI job that never blocks a merge; Chromium runs them with the rest. Nothing here needs Chromium's own tools.
import { expect, test } from '@playwright/test';
import { goOffline, loadApp, preparedTrip, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());
test.setTimeout(180_000);

test('[APP-SWITCH-ON] smoke: the shell opens on Trip with its four tabs, and each tab opens', async ({ page }) => {
  app = await loadApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
  for (const tab of ['Ahead', 'Tools', 'You', 'Trip']) {
    await page.locator('nav.tabs').getByRole('link', { name: tab }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tab);
  }
});

test('[FLOW-FLIGHT] smoke: a prepared trip opens offline on Ahead, with its six cards and Emergency', async ({ page }) => {
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: new Date().toISOString().slice(0, 10), places: true });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await page.goto(`${app.origin}/#/ahead`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ahead[data-ahead]')).toBeVisible();
  await page.locator('.ah-chips').getByRole('button', { name: 'Emergency', exact: true }).click();
  await page.locator('#chip-emergency').getByRole('button', { name: 'Call 112' }).click();   // it asks first (AH-CALL-CONFIRM)
  await expect(page.locator('#chip-emergency').getByRole('link', { name: 'Call 112 now' })).toHaveAttribute('href', 'tel:112');
});

test('[LC-GLIDE] smoke: Tools to the bag planner and Back to Wayfinch, by the rider\'s taps, with no page error (WebKit has the transition too)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tools');
  for (let i = 0; i < 2; i += 1) {
    await page.locator('main[data-screen="tools"] a[href="/tools/bags/"]').click();
    await page.waitForURL(/\/tools\/bags\/$/);
    await page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');
    await page.locator('#backToWayfinch').click();
    await page.waitForURL(`${app.origin}/#/tools`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tools');
  }
  expect(errors).toEqual([]);
});
