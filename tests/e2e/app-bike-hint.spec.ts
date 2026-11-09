// The first-run bike hint in a real browser (wish 17, design of 9 Nov 2026): the card on a new rider's first screen at phone and laptop
// size in both themes (the four app projects), Later by keyboard, Make it yours and back, 320 px, and a "fits better" line.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  return problems;
}
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('[HINT-NEW] a new rider\'s Trip: the card first, about 200 px, with the Route step\'s Choose a GPX file still on the first screen; no pop-up, nothing moves the focus', async ({ page }) => {
  const problems = watch(page);
  app = await loadApp(page);
  const card = page.getByRole('region', { name: 'Design your bike' });
  await expect(card).toBeVisible();
  await expect(card).toContainText("The app's answers are more accurate when it knows your bike's size and frame type.");
  await expect(page.locator('.trip-main > *').first()).toHaveClass(/bike-hint/);
  const box = (await card.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(230);
  const viewport = page.viewportSize()!;
  const gpx = page.getByText('Choose a GPX file').first();
  await expect(gpx).toBeVisible();
  expect((await gpx.boundingBox())!.y + 44).toBeLessThanOrEqual(viewport.height);
  for (const target of [card.getByRole('link', { name: 'Make it yours' }), card.getByRole('button', { name: 'Later: show this smaller' })]) {
    const t = (await target.boundingBox())!;
    expect(t.height).toBeGreaterThanOrEqual(44);
    expect(t.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.locator('[role=dialog], dialog[open]').count()).toBe(0);
  expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(true);
  expect(await noSideways(page)).toBe(true);
  const results = await new AxeBuilder({ page }).include('.bike-hint').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  expect(problems).toEqual([]);
});

test('[HINT-SMALL] Later by keyboard: today\'s line at once, the focus on its Add your bike; after a reload it stays small', async ({ page }) => {
  app = await loadApp(page);
  const later = page.getByRole('button', { name: 'Later: show this smaller' });
  await later.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.bike-hint')).toHaveCount(0);
  const add = page.locator('.trip-bike figcaption a');
  await expect(add).toHaveText('Add your bike');
  await expect(add).toBeFocused();
  expect((await page.locator('.trip-bike').boundingBox())!.height).toBeLessThanOrEqual(120);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.trip-bike figcaption')).toBeVisible();
  await expect(page.locator('.bike-hint')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('copilot:bikeHint:v1'))).toMatch(/^[atypcgsw]+$/);
});

test('[HINT-SMALL] Make it yours opens Bike details at Look; back on Trip without saving, the line is small', async ({ page }) => {
  app = await loadApp(page);
  await page.getByRole('region', { name: 'Design your bike' }).getByRole('link', { name: 'Make it yours' }).click();
  await expect(page).toHaveURL(`${app.origin}/tools/bags/`);
  await expect(page.locator('#bikeLookTitle')).toBeFocused();
  await page.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.trip-bike figcaption')).toBeVisible();
  await expect(page.locator('.bike-hint')).toHaveCount(0);
});

test('[HINT-NEW] 320 px: the card fits with no sideways scroll; [FIT-LINE] Tyre pressure\'s line shows with its 44 px link', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  app = await loadApp(page);
  await expect(page.getByRole('region', { name: 'Design your bike' })).toBeVisible();
  expect(await noSideways(page)).toBe(true);
  await page.goto(`${app.origin}/#/tools/tyre`, { waitUntil: 'domcontentloaded' });
  const line = page.locator('[data-fit-line]');
  await expect(line).toHaveText('No saved bike, so nothing is filled in. Add your bike and its tyre sizes fill in here.');
  expect((await line.getByRole('link', { name: 'Add your bike' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await noSideways(page)).toBe(true);
});
