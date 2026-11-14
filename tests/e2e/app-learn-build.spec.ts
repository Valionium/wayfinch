// How a bike is built, the build-up, in a real browser (design of 14 November 2026, section 4): Back and Next through the steps, each
// adding its parts to the drawing, marked, with its line; the arrow keys; an e-bike's last step; 320 px and both themes (the projects).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const drawn = (page: Page, cls: string) => page.locator(`.bl-bike .${cls}`);
const step = (page: Page) => page.locator('.bl-step');

async function openBuild(page: Page): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/#/tools?learn' });
  await page.getByRole('button', { name: 'Build-up' }).click();
  await expect(page.getByRole('button', { name: 'Build-up' })).toHaveAttribute('aria-pressed', 'true');
}

test('[BL-BUILD] Build-up goes frame to saddle with Back and Next, each step adding its parts, marked and named, with how they attach', async ({ page }) => {
  await openBuild(page);
  await expect(step(page)).toHaveText('Step 1 of 7: Frame');
  await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled();
  await expect(drawn(page, 'bk-frame').first()).toBeAttached();
  await expect(drawn(page, 'bk-fork')).toHaveCount(0);
  await expect(drawn(page, 'bk-tyre')).toHaveCount(0);
  await expect(page.locator('.bl-build .bl-part[data-part="down-tube"]')).toBeVisible();
  // the parts list is Explore's; here the step's own parts
  await expect(page.locator('.bl-list')).toHaveCount(0);
  const next = page.getByRole('button', { name: 'Next' });
  await next.click();
  await expect(step(page)).toHaveText('Step 2 of 7: Fork and headset');
  await expect(drawn(page, 'bk-fork').first()).toBeAttached();
  await expect(page.locator('.bl-line')).toContainText('head tube');
  await next.click();
  await expect(step(page)).toHaveText('Step 3 of 7: Wheels');
  await expect(drawn(page, 'bk-tyre')).toHaveCount(2);
  await expect(page.locator('.bl-line')).toContainText('thru-axle');
  await expect(page.locator('.bl-layer .bl-hot').first()).toBeAttached();
  await expect(page.locator('.bl-label[data-part="tyre"]')).toBeAttached();
  await expect(drawn(page, 'bk-chain')).toHaveCount(0);
  await next.click();
  await expect(step(page)).toHaveText('Step 4 of 7: Drivetrain');
  await expect(drawn(page, 'bk-chain')).toHaveCount(1);
  await expect(drawn(page, 'bk-rotor')).toHaveCount(0);
  await next.click();
  await expect(step(page)).toHaveText('Step 5 of 7: Brakes');
  await expect(drawn(page, 'bk-rotor')).toHaveCount(2);
  await expect(page.locator('.bl-bike .bl-cable')).toHaveCount(1);
  await expect(drawn(page, 'bk-bar')).toHaveCount(0);
  await next.click();
  await expect(step(page)).toHaveText('Step 6 of 7: Cockpit');
  await expect(drawn(page, 'bk-bar')).toHaveCount(1);
  await expect(drawn(page, 'bk-saddle')).toHaveCount(0);
  await next.click();
  await expect(step(page)).toHaveText('Step 7 of 7: Saddle and seatpost');
  await expect(drawn(page, 'bk-saddle')).toHaveCount(1);
  await expect(page.locator('.bl-built')).toBeVisible();
  // a part of the step: its words, as in Explore
  await page.locator('.bl-build .bl-part[data-part="seat-clamp"]').click();
  await expect(page.locator('.bl-name')).toHaveText('Seat clamp');
  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(step(page)).toHaveText('Step 1 of 7: Frame');
  await expect(page.locator('[aria-live="polite"]')).toHaveText(/^Step 1 of 7: Frame\. The frame comes first/);
  // Explore again: the whole bike and the list
  await page.getByRole('button', { name: 'Explore' }).click();
  await expect(drawn(page, 'bk-saddle')).toHaveCount(1);
  await expect(page.locator('.bl-list')).toBeVisible();
});

test('[BL-BUILD] the arrow keys turn the steps while the focus is in the build-up; an e-bike has its motor step, and leaving it falls back to the last step', async ({ page }) => {
  await openBuild(page);
  await page.getByLabel('Bike to show').selectOption('ebike');
  await expect(step(page)).toHaveText('Step 1 of 8: Frame');
  await page.getByRole('button', { name: 'Next' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(step(page)).toHaveText('Step 3 of 8: Wheels');
  await page.keyboard.press('ArrowLeft');
  await expect(step(page)).toHaveText('Step 2 of 8: Fork and headset');
  for (let n = 0; n < 6; n += 1) await page.keyboard.press('ArrowRight');
  await expect(step(page)).toHaveText('Step 8 of 8: Motor, battery and display');
  await expect(drawn(page, 'bk-battery')).toHaveCount(1);
  await expect(drawn(page, 'bk-motor')).toHaveCount(1);
  // a further arrow stays on the last step; Next there starts again
  await page.keyboard.press('ArrowRight');
  await expect(step(page)).toHaveText('Step 8 of 8: Motor, battery and display');
  await page.getByLabel('Bike to show').selectOption('city');
  await expect(step(page)).toHaveText('Step 7 of 7: Saddle and seatpost');
  // the city bike's own drivetrain line
  for (let n = 0; n < 3; n += 1) await page.getByRole('button', { name: 'Back' }).click();
  await expect(step(page)).toHaveText('Step 4 of 7: Drivetrain');
  await expect(page.locator('.bl-line')).toContainText('hub gears');
});

test('[BL-BUILD-PHONE] Build-up at 320 px and in this project\'s size and theme: no sideways scroll, 44 px targets, nothing axe objects to', async ({ page }) => {
  await openBuild(page);
  if ((page.viewportSize()?.width ?? 0) < 600) await page.setViewportSize({ width: 320, height: 640 });
  for (let n = 0; n < 3; n += 1) await page.getByRole('button', { name: 'Next' }).click();
  await expect(step(page)).toHaveText('Step 4 of 7: Drivetrain');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const small = await page.evaluate(() => [...document.querySelectorAll('.bl button, .bl select, .bl a')]
    .filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect())
    .filter((r) => r.height < 44 || r.width < 44).length);
  expect(small).toBe(0);
  const results = await new AxeBuilder({ page }).include('.bl').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('[BL-FOCUS] Back that reaches the first step, by a press or the arrow key, hands the focus to Next, never to the page', async ({ page }) => {
  await openBuild(page);
  const back = page.getByRole('button', { name: 'Back' });
  const next = page.getByRole('button', { name: 'Next' });
  await next.click();
  await next.click();
  await back.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(step(page)).toHaveText('Step 1 of 7: Frame');
  await expect(back).toBeDisabled();
  await expect(next).toBeFocused();
  await next.click();
  await back.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(step(page)).toHaveText('Step 1 of 7: Frame');
  await expect(next).toBeFocused();
  expect(await page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null)).toBe(true);
});
