// The app shell in a real browser, built with the launch switch on. Plan Tasks 1 and 2.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { goOffline, loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

test('[APP-SWITCH-ON] / opens the shell on Trip with no trip, with the tabs Ahead, Trip, Tools and You', async ({ page }) => {
  app = await loadApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveText(['Ahead', 'Trip', 'Tools', 'You']);
  await expect(nav.getByRole('link', { name: 'Trip' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText("Add a route to see what's ahead")).toBeVisible();
  await nav.getByRole('link', { name: 'Tools' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tools');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
});

test('[APP-SWITCH-ON] the address #/tools/tyre opens inside Tools, and the bag planner is served at /tools/bags/', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/tyre' });
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tools' })).toHaveAttribute('aria-current', 'page');
  const response = await page.request.get(`${app.origin}/tools/bags/`);
  expect(response.status()).toBe(200);
});

test('[APP-REGISTER] the worker is registered once, with the whole site as scope, and the shell then opens offline', async ({ page }) => {
  app = await loadApp(page);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations())[0]!.scope);
  expect(scope).toBe(`${app.origin}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
});

test('the shell has no automatic accessibility violations, and every tab is at least 44 px', async ({ page }) => {
  app = await loadApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  for (const link of await page.getByRole('navigation', { name: 'Main' }).getByRole('link').all()) {
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
});
