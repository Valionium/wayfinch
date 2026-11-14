// The Bike finder in a real browser (design of 14 November 2026): opened from Tools, five questions by keyboard, the list with the focus on
// it, a changed answer, Start again, each type's link into How a bike is built and back, the answers kept on the phone under their one key
// and nothing else written, offline, 320 px and both themes (the projects give the size and the theme).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { goOffline, loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const KEY = 'copilot:bikeFinder:v1';
const BIKE = { id: 'bike_g', name: 'Green gravel', look: { colour: '#2e7d32', bars: 'drop', ebike: false }, frontTyre: '45-622', rearTyre: '45-622' };
const QUESTIONS = ['What will you mostly ride?', 'On what ground?', 'How much will you carry?', 'Speed or comfort?', 'Would you like a motor (an e-bike)?'];

const errorsOf = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};
const storage = (page: Page) => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
const others = (page: Page, key: string) => page.evaluate((k) => JSON.stringify(Object.keys(localStorage).filter((x) => x !== k).sort().map((x) => [x, localStorage.getItem(x)])), key);
const radio = (page: Page, q: number, name: string) => page.getByRole('group', { name: QUESTIONS[q] }).getByRole('radio', { name, exact: true });
const types = (page: Page) => page.locator('[data-finder-type]');

async function answer(page: Page, picks: [string, string, string, string, string]): Promise<void> {
  for (const [i, name] of picks.entries()) await radio(page, i, name).check();
}

test('[BF-OPEN] Tools has a Find a bike type card before How a bike is built; it opens the finder, title focused; the Tools tab goes back to its card', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  const cards = page.locator('main[data-screen="tools"] > .card');
  await expect(cards).toHaveCount(6);
  await expect(cards.nth(4).locator('h2')).toHaveText('Find a bike type');
  await expect(cards.nth(5).locator('h2')).toHaveText('How a bike is built');
  const before = await storage(page);
  await page.getByRole('link', { name: 'Open Find a bike type' }).click();
  await expect(page).toHaveURL(/#\/tools\?finder$/);
  await expect(page.getByRole('heading', { name: 'Find a bike type', level: 2 })).toBeFocused();
  await expect(page.locator('nav.tabs a[aria-current="page"]')).toHaveText('Tools');
  for (const q of QUESTIONS) await expect(page.getByRole('group', { name: q })).toBeVisible();
  expect(await storage(page)).toBe(before);
  await page.locator('nav.tabs a', { hasText: 'Tools' }).click();
  await expect(page.getByRole('link', { name: 'Open Find a bike type' })).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(errors).toEqual([]);
});

test('[BF-FLOW] questions left: said, the focus on the first; all answered: the list, best first, the focus on its heading; a change updates it; Start again', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools?finder' });
  const show = page.getByRole('button', { name: 'Show bike types' });
  const said = () => page.locator('.bf-said').evaluate((e) => e.textContent);
  await show.click();
  await expect(page.locator('.bf-left')).toHaveText(/^5 questions left/);
  await expect(radio(page, 0, 'Day rides for fun or fitness')).toBeFocused();
  // a second Show with the same count is said again: its text changes, so a screen reader hears it (review of PR 158, M2)
  const once = await said();
  await show.click();
  await expect.poll(said).not.toBe(once);
  await expect(page.locator('.bf-said')).toHaveText('5 questions left.');
  await radio(page, 0, 'Day rides for fun or fitness').focus();
  // by keyboard: the arrows move along a question's answers and pick
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(radio(page, 0, 'Bikepacking off-road')).toBeChecked();
  await radio(page, 1, 'Gravel and easy trails').check();
  await show.click();
  await expect(page.locator('.bf-left')).toHaveText(/^3 questions left/);
  await expect(radio(page, 2, 'Little: a phone, a jacket')).toBeFocused();
  await radio(page, 2, 'Kit for several days').check();
  await radio(page, 3, 'A balance').check();
  await radio(page, 4, 'No').check();
  await expect(types(page)).toHaveCount(0);
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Bike types for your answers', level: 3 })).toBeFocused();
  await expect(page.locator('.bf-left')).toHaveCount(0);
  await expect(types(page).locator('h4')).toHaveText(['Gravel bike', 'Mountain bike, hardtail', 'Touring bike']);
  const gravel = types(page).first();
  await expect(gravel.locator('.bf-why li')).toHaveCount(3);
  await expect(gravel.locator('.bf-why li').first()).toContainText('gravel');
  await expect(gravel.locator('.bf-look li')).toHaveText([/^Tyres: .*mm/, /^Mounts: /, /^Gears: /, /^Brakes: /]);
  await expect(page.locator('.bf-frame')).toContainText('size chart');
  // a changed answer: the list follows in place, said politely, the focus stays
  await radio(page, 4, 'Yes').check();
  await expect(radio(page, 4, 'Yes')).toBeFocused();
  await expect(page.locator('.bf-said')).toHaveText('The bike types are updated for your answers.');
  await expect(gravel.locator('.bf-look li').last()).toHaveText(/^Motor: /);
  // a second change is said again (review of PR 158, M2)
  const first = await said();
  await radio(page, 4, 'Not sure').check();
  await expect.poll(said).not.toBe(first);
  await expect(page.locator('.bf-said')).toHaveText('The bike types are updated for your answers.');
  // Start again: every answer cleared, the list gone, the focus on the first question
  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(types(page)).toHaveCount(0);
  for (let q = 0; q < QUESTIONS.length; q += 1) await expect(page.getByRole('group', { name: QUESTIONS[q] }).getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(radio(page, 0, 'Day rides for fun or fitness')).toBeFocused();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
});

test('[BF-LEARN] each type opens its own drawing in How a bike is built (Explore); back comes to the list, the focus on that link', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools?finder' });
  await answer(page, ['Touring with a rack and panniers', 'Paved and gravel', 'Kit for several days', 'A balance', 'No']);
  await page.getByRole('button', { name: 'Show bike types' }).click();
  await expect(types(page).first().locator('h4')).toHaveText('Touring bike');
  const link = page.getByRole('link', { name: 'See its parts in How a bike is built (Touring bike)' });
  await expect(link).toHaveAttribute('href', '#/tools?learn=touring');
  await link.click();
  await expect(page).toHaveURL(/#\/tools\?learn=touring$/);
  await expect(page.getByRole('heading', { name: 'How a bike is built', level: 2 })).toBeFocused();
  await expect(page.getByLabel('Bike to show')).toHaveValue('touring');
  await expect(page.getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/#\/tools\?finder$/);
  await expect(types(page).first().locator('h4')).toHaveText('Touring bike');
  await expect(link).toBeFocused();
  // to its drawing again, then Tools and the card: the finder opens at its title, not at a link followed earlier
  await link.click();
  await expect(page.getByLabel('Bike to show')).toHaveValue('touring');
  await page.locator('nav.tabs a', { hasText: 'Tools' }).click();
  await expect(page.getByRole('link', { name: 'Open How a bike is built' })).toBeFocused();
  await page.getByRole('link', { name: 'Open Find a bike type' }).click();
  await expect(page.getByRole('heading', { name: 'Find a bike type', level: 2 })).toBeFocused();
  await expect(types(page).first().locator('h4')).toHaveText('Touring bike');
  // the plain address still opens How a bike is built as before
  await page.goto(`${app.origin}/#/tools?learn`);
  await expect(page.getByLabel('Bike to show')).toHaveValue('gravel');
});

test('[BF-STORE] the answers are kept under their one key and come back with the list; the bikes and every other key stay; Bike details only by a link', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools?finder' });
  await page.evaluate((b) => {
    localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([b]));
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify(b));
  }, BIKE);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Find a bike type', level: 2 })).toBeVisible();
  const before = await others(page, KEY);
  await answer(page, ['Commuting and errands', 'Paved roads', "A day's kit", 'Comfort first', 'Not sure']);
  await page.getByRole('button', { name: 'Show bike types' }).click();
  await expect(types(page).first().locator('h4')).toHaveText('City bike');
  expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!)).toEqual({ v: 1, answers: { rides: 'commute', ground: 'paved', carry: 'day', pace: 'comfort', motor: 'unsure' } });
  expect(await others(page, KEY)).toBe(before);
  await expect(page.getByRole('link', { name: 'Add your bike in Bike details' })).toHaveAttribute('href', '/tools/bags/#bike-details=new&back=tools');
  await page.reload();
  await expect(radio(page, 0, 'Commuting and errands')).toBeChecked();
  await expect(radio(page, 4, 'Not sure')).toBeChecked();
  await expect(types(page).first().locator('h4')).toHaveText('City bike');
  // stored values it does not know read as unanswered: no list until they are answered
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ v: 1, answers: { rides: 'commute', ground: 'moon' } })), KEY);
  await page.reload();
  await expect(radio(page, 0, 'Commuting and errands')).toBeChecked();
  await expect(page.getByRole('group', { name: QUESTIONS[1] }).getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(types(page)).toHaveCount(0);
  expect(await others(page, KEY)).toBe(before);
});

test('[BF-PHONE] at 320 px and in this project\'s size and theme: no sideways scroll, 44 px targets, nothing axe objects to; it opens offline', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.goto(`${app.origin}/#/tools?finder`);
  await expect(page.getByRole('heading', { name: 'Find a bike type', level: 2 })).toBeVisible();
  await goOffline(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Find a bike type', level: 2 })).toBeVisible();
  const phone = (page.viewportSize()?.width ?? 0) < 600;
  if (phone) await page.setViewportSize({ width: 320, height: 640 });
  await answer(page, ['Day rides for fun or fitness', 'Rough trails', 'Little: a phone, a jacket', 'Comfort first', 'Yes']);
  await page.getByRole('button', { name: 'Show bike types' }).click();
  await expect(types(page).first().locator('h4')).toHaveText('Mountain bike, full suspension');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const small = await page.evaluate(() => [...document.querySelectorAll('.bf button, .bf a, .bf label')]
    .filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect())
    .filter((r) => r.height < 44 || r.width < 44).length);
  expect(small).toBe(0);
  const results = await new AxeBuilder({ page }).include('.bf').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
