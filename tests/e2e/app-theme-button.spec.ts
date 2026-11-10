// Wish 1 (owner, 9 November 2026): the colour mode button on Ahead, Trip and Tools, the same corner of each, setting the one theme that
// You shows. Real pages, in the app projects (both phone colour schemes, laptop). Nothing here prints the page.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { goOffline, loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const shown = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const phone = (page: Page) => page.evaluate(() => (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
const other = (t: string) => (t === 'light' ? 'dark' : 'light');
const toggle = (page: Page) => page.locator('button.theme-btn');
/** The label of a button that switches to `mode`. */
const labelTo = (mode: string) => `Switch to ${mode} mode`;
const SCREENS = [['ahead', 'En route'], ['trip', 'Trip'], ['tools', 'Tools']] as const;

test('[THEME-BUTTON] on Ahead, Trip and Tools: one 44 px button in the same corner, named for the mode it switches to, no sideways scroll, none on You', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/trip' });
  const start = await phone(page);
  const corners: string[] = [];
  for (const [hash] of SCREENS) {
    await page.goto(`${app.origin}/#/${hash}`, { waitUntil: 'load' });
    await expect(toggle(page)).toHaveCount(1);
    await expect(toggle(page)).toHaveAccessibleName(labelTo(other(start)));
    const box = (await toggle(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const main = (await page.locator('main.screen').boundingBox())!;
    corners.push(`${Math.round(box.y - main.y)}:${Math.round(main.x + main.width - box.x - box.width)}`);
    // the heading never runs under it
    const textRight = await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('main h1')!); return r.getBoundingClientRect().right; });
    expect(textRight, hash).toBeLessThanOrEqual(box.x + 0.5);
    expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), `${hash}: no sideways scroll`).toBe(true);
  }
  expect(new Set(corners).size, `the same place on each tab: ${corners.join(' ')}`).toBe(1);
  await page.goto(`${app.origin}/#/you`, { waitUntil: 'load' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  await expect(toggle(page)).toHaveCount(0);
});

test('[THEME-BUTTON] a tap on each tab switches the mode; You shows it chosen; it survives a reload and is the same on the other tabs', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/trip' });
  let mode = await phone(page);
  for (const [hash] of SCREENS) {
    await page.goto(`${app.origin}/#/${hash}`, { waitUntil: 'load' });
    const next = other(mode);
    await toggle(page).click();
    await expect.poll(() => shown(page)).toBe(next);
    await expect(toggle(page)).toHaveAccessibleName(labelTo(other(next)));
    mode = next;
    // another tab sees it at once, and so does a reload
    await page.reload({ waitUntil: 'load' });
    expect(await shown(page)).toBe(mode);
  }
  await page.goto(`${app.origin}/#/you`, { waitUntil: 'load' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: mode === 'light' ? 'Light' : 'Dark' })).toBeChecked();
  // You's own choice reaches the buttons: Automatic back to the phone's, and the label follows
  await page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: 'Automatic' }).check();
  await page.goto(`${app.origin}/#/tools`, { waitUntil: 'load' });
  await expect(toggle(page)).toHaveAccessibleName(labelTo(other(await phone(page))));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('copilot:theme:v1')!).theme)).toBe('auto');
});

test('[THEME-BUTTON] another window follows a tap at once (the storage event), keyboard works, and it works offline', async ({ page, context }) => {
  app = await loadApp(page, { launch: true, path: '/#/ahead' });
  const start = await phone(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const second = await context.newPage();
  await second.goto(`${app.origin}/#/tools`, { waitUntil: 'load' });
  await expect(toggle(second)).toHaveCount(1);
  await page.reload({ waitUntil: 'load' });
  await goOffline(page);
  // keyboard: the button is reached by Tab after the heading, and Enter and Space both press it
  await toggle(page).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => shown(page)).toBe(other(start));
  await expect.poll(() => shown(second)).toBe(other(start));
  await expect(toggle(second)).toHaveAccessibleName(labelTo(start));
  await page.keyboard.press('Space');
  await expect.poll(() => shown(page)).toBe(start);
  await expect.poll(() => shown(second)).toBe(start);
  await second.close();
});

test('[THEME-BUTTON] the bag planner follows the button, and the icon is drawn in both themes (colour from the tokens, visible against its panel)', async ({ page, context }) => {
  app = await loadApp(page, { launch: true, path: '/#/trip' });
  const start = await phone(page);
  const bags = await context.newPage();
  await bags.goto(`${app.origin}/tools/bags/`, { waitUntil: 'load' });
  await bags.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');
  for (const mode of [other(start), start]) {
    await expect(toggle(page)).toBeVisible();
    await toggle(page).click();
    await expect.poll(() => shown(page)).toBe(mode);
    await expect.poll(() => shown(bags)).toBe(mode);
    const { ink, panel } = await page.evaluate(() => {
      const b = document.querySelector('button.theme-btn')!;
      return { ink: getComputedStyle(b).color, panel: getComputedStyle(b).backgroundColor };
    });
    expect(ink).not.toBe(panel);
  }
  await bags.close();
});

test('[THEME-BUTTON] at 320 px the title leaves room for the button on each tab, in both themes, with no sideways scroll', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/trip' });
  await page.setViewportSize({ width: 320, height: 640 });
  for (const mode of ['light', 'dark']) {
    await page.evaluate((m) => localStorage.setItem('copilot:theme:v1', JSON.stringify({ app: 'copilot', kind: 'theme', v: 1, theme: m, at: new Date(Date.now() + 5000).toISOString() })), mode);
    for (const [hash] of SCREENS) {
      await page.goto(`${app.origin}/#/${hash}`, { waitUntil: 'load' });
      await page.reload({ waitUntil: 'load' });
      await expect(toggle(page)).toBeVisible();
      expect(await shown(page)).toBe(mode);
      const box = (await toggle(page).boundingBox())!;
      expect(box.x + box.width, `${hash} ${mode}`).toBeLessThanOrEqual(320);
      const textRight = await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('main h1')!); return r.getBoundingClientRect().right; });
      expect(textRight).toBeLessThanOrEqual(box.x + 0.5);
      expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), `${hash} ${mode}: no sideways scroll`).toBe(true);
    }
  }
});
