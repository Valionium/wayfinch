// One theme for both apps (owner's try-out, 5 November 2026: "I changed to light mode [in the bag planner] ... went back to Wayfinch
// ... it was still the dark mode. So that should be consistent."). A choice in either app shows in the other at once, on the way back,
// and in a tab left open; an existing rider's two older choices are merged; export and import carry the one theme. Real pages, in
// the four app projects. Nothing here prints the page: failures compare booleans and short values.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const shown = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
/** The theme the phone itself has in this project. */
const phone = (page: Page) => page.evaluate(() => (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
const other = (t: string) => (t === 'light' ? 'dark' : 'light');
const themeRadio = (page: Page, name: 'Automatic' | 'Light' | 'Dark') => page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name });
async function planner(page: Page): Promise<void> {
  await page.goto(`${app!.origin}/tools/bags/`, { waitUntil: 'load' });
  await page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');
}
async function you(page: Page): Promise<void> {
  await page.goto(`${app!.origin}/#/you`, { waitUntil: 'load' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
}

test('[THEME-SYNC] the bag planner\'s theme button changes Wayfinch too: at once in an open tab, and You shows the choice', async ({ page, context }) => {
  app = await loadApp(page, { launch: true, path: '/#/you' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  await expect(themeRadio(page, 'Automatic')).toBeChecked();
  const start = await phone(page);
  const bags = await context.newPage();
  await planner(bags);
  expect(await shown(bags)).toBe(start);
  await bags.locator('#themeBtn').click();
  expect(await shown(bags)).toBe(other(start));
  // the Wayfinch tab, open all along
  await expect.poll(() => shown(page)).toBe(other(start));
  await expect(themeRadio(page, other(start) === 'light' ? 'Light' : 'Dark')).toBeChecked();
  // and a fresh Wayfinch page opens in it
  await page.reload({ waitUntil: 'load' });
  expect(await shown(page)).toBe(other(start));
  await bags.close();
});

test('[THEME-SYNC] a choice in You changes the bag planner too: an open tab at once, Automatic back to the phone\'s', async ({ page, context }) => {
  app = await loadApp(page, { launch: true, path: '/#/you' });
  const start = await phone(page);
  const bags = await context.newPage();
  await planner(bags);
  await you(page);
  await themeRadio(page, other(start) === 'light' ? 'Light' : 'Dark').check();
  await expect.poll(() => shown(bags)).toBe(other(start));
  await themeRadio(page, 'Automatic').check();
  await expect.poll(() => shown(bags)).toBe(start);
  // the bag planner opened afresh shows it, its own older choice and its working plan's notwithstanding
  await themeRadio(page, other(start) === 'light' ? 'Light' : 'Dark').check();
  await planner(bags);
  expect(await shown(bags)).toBe(other(start));
  await bags.close();
});

test('[THEME-SYNC] You, Edit, the theme button in the bag planner, the cross: back on You in the new theme, the choice shown', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/you' });
  await page.evaluate(() => { localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([{ id: 'b1', name: 'Tourer', look: { colour: '#f4f4f2', bars: 'drop', ebike: false } }])); });
  await page.reload({ waitUntil: 'load' });
  const start = await phone(page);
  await page.locator('li.you-bike', { hasText: 'Tourer' }).getByRole('link', { name: /Edit/ }).click();
  await page.waitForURL(/\/tools\/bags\//);
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  // the theme button sits behind the open dialog: the rider closes nothing, the page's own button is pressed
  await page.evaluate("document.getElementById('themeBtn').click()");
  expect(await shown(page)).toBe(other(start));
  await page.locator('#bikeDetailsClose').click();
  await page.waitForURL((u) => u.pathname === '/' && u.hash === '#/you');
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  expect(await shown(page)).toBe(other(start));
  await expect(themeRadio(page, other(start) === 'light' ? 'Light' : 'Dark')).toBeChecked();
  // the bike drawn in the new theme: white in the dark has the ground's casing, in the light the muted one
  const casing = await page.locator('li.you-bike .bk-casing').first().getAttribute('class');
  expect(casing).toBe(other(start) === 'dark' ? 'bk-casing bk-casing-ground' : 'bk-casing');
});

test('[THEME-ONE] an existing rider: the bag planner\'s older choice shows in Wayfinch; with an older choice in both, Wayfinch\'s', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/you' });
  const start = await phone(page);
  await page.evaluate((t) => { localStorage.clear(); localStorage.setItem('loadcheck:theme', JSON.stringify(t)); }, other(start));
  await page.reload({ waitUntil: 'load' });
  // an older choice of the bag planner alone is read by the rule, loaded right after the first screen (once, on the first launch)
  await expect.poll(() => shown(page)).toBe(other(start));
  await planner(page);
  expect(await shown(page)).toBe(other(start));
  await page.evaluate((t) => { localStorage.setItem('copilot:settings', JSON.stringify({ updatedAt: '2026-11-01T08:00:00.000Z', theme: t })); }, start);
  await you(page);
  expect(await shown(page)).toBe(start);
  await expect(themeRadio(page, start === 'light' ? 'Light' : 'Dark')).toBeChecked();
  await planner(page);
  expect(await shown(page)).toBe(start);
});

test('[THEME-SYNC] export and import carry the one theme: a choice made in the bag planner goes into Wayfinch\'s file, and arrives in both apps', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  const start = await phone(page);
  await planner(page);
  await page.locator('#themeBtn').click();
  await you(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();
  const body = JSON.parse(await readFile((await (await download).path())!, 'utf8')) as { settings: { theme: string } };
  expect(body.settings.theme).toBe(other(start));
  // a fresh phone
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  expect(await shown(page)).toBeNull();
  await page.getByLabel('Choose an export file').setInputFiles({ name: 'w.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(body)) });
  await page.getByRole('button', { name: /Import this file|Replace anyway/ }).click();
  await page.getByRole('button', { name: /Import this file|Replace anyway/ }).click({ timeout: 2000 }).catch(() => undefined);
  await expect.poll(() => shown(page)).toBe(other(start));
  await planner(page);
  expect(await shown(page)).toBe(other(start));
});

test('[THEME-SYNC] the bag planner\'s Apply imported settings is a choice: Wayfinch shows that theme', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  const start = await phone(page);
  await planner(page);
  await page.evaluate(`useSettings({ theme: ${JSON.stringify(other(start))} })`);
  await expect.poll(() => shown(page)).toBe(other(start));
  await you(page);
  expect(await shown(page)).toBe(other(start));
  await expect(themeRadio(page, other(start) === 'light' ? 'Light' : 'Dark')).toBeChecked();
});
