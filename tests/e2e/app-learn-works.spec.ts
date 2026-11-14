// How it works on How a bike is built, in a real browser (design of 14 November 2026, "How a bike works"): the third switch, its own
// chunk loaded on the press with the focus kept on it, the topics' steps with Back, Next and the arrow keys, each step's parts marked and
// named on the drawing, the line for a part the bike shown lacks, the tyre tool's link, offline, 320 px and both themes (the projects).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { goOffline, loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const step = (page: Page) => page.locator('.bw-step');
const works = (page: Page) => page.getByRole('button', { name: 'How it works' });
const marked = (page: Page) => page.locator('.bl-layer .bl-hot');
const label = (page: Page, id: string) => page.locator(`.bl-label[data-part="${id}"]`);
const storage = (page: Page) => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));

async function openWorks(page: Page): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/#/tools?learn' });
  await expect(page.locator('.bl-canvas')).toBeVisible();
  await works(page).click();
  await expect(step(page)).toHaveText('Step 1 of 5: Cranks and bottom bracket');
}

test('[BW-OPEN] How it works is a third switch beside Explore and Build-up: a press keeps the focus on it, its own chunk loads, step 1 marks its parts', async ({ page }) => {
  const chunks: string[] = [];
  page.on('request', (r) => { if (/\/assets\/.+\.js$/.test(r.url())) chunks.push(r.url()); });
  app = await loadApp(page, { launch: true, path: '/#/tools?learn' });
  await expect(page.locator('.bl-canvas')).toBeVisible();
  const before = await storage(page);
  const loaded = chunks.length;
  const modes = page.getByRole('group', { name: 'Way to learn' }).getByRole('button');
  await expect(modes).toHaveText(['Explore', 'Build-up', 'How it works']);
  await works(page).focus();
  await page.keyboard.press('Enter');
  await expect(works(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(step(page)).toHaveText('Step 1 of 5: Cranks and bottom bracket');
  // the focus stays on the switch it pressed, and a chunk of its own came with the press
  await expect(works(page)).toBeFocused();
  expect(chunks.length).toBeGreaterThan(loaded);
  await expect(page.getByLabel('Topic')).toHaveValue('cranks');
  await expect(page.locator('.bw-text')).toContainText('bottom bracket is a pair of bearings');
  await expect(marked(page).first()).toBeAttached();
  await expect(label(page, 'bottom-bracket')).toBeAttached();
  await expect(label(page, 'crank')).toBeAttached();
  // Explore's list is not shown; the drawing names the step in its name
  await expect(page.locator('.bl-list')).toHaveCount(0);
  await expect(page.locator('.bl-canvas')).toHaveAttribute('aria-label', /Step 1 of 5: Cranks and bottom bracket/);
  // away and back: the topic and the step are kept; Explore keeps the focus on its own button
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Explore' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Explore' })).toBeFocused();
  await expect(page.locator('.bl-list')).toBeVisible();
  await works(page).click();
  await expect(step(page)).toHaveText('Step 2 of 5: Cranks and bottom bracket');
  expect(await storage(page)).toBe(before);
});

test('[BW-STEPS] Back and Next turn a topic\'s steps, each marking its parts; the arrow keys too; Back on reaching step 1 hands the focus to Next', async ({ page }) => {
  await openWorks(page);
  await page.getByLabel('Topic').selectOption('brakes');
  await expect(page.getByLabel('Topic')).toBeFocused();
  await expect(step(page)).toHaveText('Step 1 of 5: Brakes');
  await expect(page.locator('[aria-live="polite"]')).toHaveText(/^Step 1 of 5: Brakes\. You pull the brake lever/);
  const back = page.getByRole('button', { name: 'Back' });
  const next = page.getByRole('button', { name: 'Next' });
  await expect(back).toBeDisabled();
  await expect(label(page, 'brake-lever')).toBeAttached();
  await next.click();
  await expect(step(page)).toHaveText('Step 2 of 5: Brakes');
  // a gravel bike's disc brakes: the caliper, the disc and the pads stand out
  await expect(label(page, 'caliper')).toBeAttached();
  await expect(label(page, 'disc')).toBeAttached();
  await expect(label(page, 'brake-lever')).toHaveCount(0);
  // a part of the step: its words, as in Build-up
  await page.locator('.bw-works .bl-part[data-part="caliper"]').click();
  await expect(page.locator('.bl-name')).toHaveText('Disc caliper');
  await next.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(step(page)).toHaveText('Step 5 of 5: Brakes');
  await expect(page.locator('.bw-text')).toContainText('mineral oil or DOT fluid');
  await page.keyboard.press('ArrowRight');
  await expect(step(page)).toHaveText('Step 5 of 5: Brakes');
  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(step(page)).toHaveText('Step 1 of 5: Brakes');
  await next.click();
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(step(page)).toHaveText('Step 1 of 5: Brakes');
  await expect(back).toBeDisabled();
  await expect(next).toBeFocused();
  // a new topic starts at its first step
  await next.click();
  await page.getByLabel('Topic').selectOption('chain');
  await expect(step(page)).toHaveText('Step 1 of 5: Chain and gear ratio');
});

test('[BW-MISSING] a step about a part the bike shown lacks says so and names a bike that has it; the tyre step links to Tyre pressure', async ({ page }) => {
  await openWorks(page);
  await page.getByLabel('Topic').selectOption('gears');
  const next = page.getByRole('button', { name: 'Next' });
  await next.click();
  await next.click();
  await expect(step(page)).toHaveText('Step 3 of 5: Gears and shifting');
  await expect(page.locator('.bw-none')).toHaveText('No front derailleur on the bike shown: choose Road in Bike to show.');
  await page.getByLabel('Bike to show').selectOption('road');
  await expect(step(page)).toHaveText('Step 3 of 5: Gears and shifting');
  await expect(page.locator('.bw-none')).toHaveCount(0);
  await expect(label(page, 'front-derailleur')).toBeAttached();
  await page.getByLabel('Topic').selectOption('pressure');
  for (let n = 0; n < 4; n += 1) await next.click();
  await expect(step(page)).toHaveText('Step 5 of 5: Tyre pressure');
  await page.getByRole('link', { name: 'Open Tyre pressure' }).click();
  await expect(page).toHaveURL(/#\/tools\/tyre$/);
});

test('[BW-PHONE] How it works opens offline, and at 320 px and in this project\'s size and theme: no sideways scroll, 44 px targets, nothing axe objects to', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await page.goto(`${app.origin}/#/tools?learn`);
  await page.reload();
  await expect(page.locator('.bl-canvas')).toBeVisible();
  // the topics' chunk was never loaded online: the worker's precache brings it
  await works(page).click();
  await expect(step(page)).toHaveText('Step 1 of 5: Cranks and bottom bracket');
  if ((page.viewportSize()?.width ?? 0) < 600) await page.setViewportSize({ width: 320, height: 640 });
  await page.getByLabel('Topic').selectOption('pressure');
  for (let n = 0; n < 4; n += 1) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('link', { name: 'Open Tyre pressure' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const small = await page.evaluate(() => [...document.querySelectorAll('.bl button, .bl select, .bl a')]
    .filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect())
    .filter((r) => r.height < 44 || r.width < 44).length);
  expect(small).toBe(0);
  const results = await new AxeBuilder({ page }).include('.bl').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
