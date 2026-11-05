// The tyre tool in a real browser, built with the launch switch on. Plan Task 13 (and the walkthrough of Task 14).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { goOffline, loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const bike = {
  id: 'bike_m2k9x1_4f7a2c9d', name: 'Trail Bike', look: { colour: null, bars: 'flat', ebike: null }, tyres: 'tubeless', frontTyre: '40-584', rearTyre: '',
  pressure: { wheel: '650b', rim: 'hooked', rimMm: 23, frontMm: 42, rearMm: 42, bikeKg: 13 },
};
const summary = {
  app: 'load-check', kind: 'load-summary', v: 1, at: '2026-10-28T18:02:00Z', planUpdatedAt: '2026-10-28T18:02:00Z', nights: 2, month: 6, departureDate: null,
  mode: 'comfort', foodDays: 2, bikeId: bike.id, bags: { count: 3, positions: ['frame', 'rack', 'rack'], items: [] }, decks: { bar: null, rack: null },
  water: { bottles: [], cageL: 1.25, extraL: 0, totalL: 1.25 },
  weight: { kitKg: 8.95, cageWaterKg: 1.25, carriedKg: 10.2, bikeKg: 14, emptyLuggageKg: 2.4, byPositionKg: { fork: 0, bar: 0, top: 0, frame: 1.6, bottle: 1.25, seat: 0, rack: 7.35, pack: 0 }, unplacedKg: 0 },
  kit: { waterFilter: false },
};
const SEED: Record<string, string> = {
  'loadcheck:summary:v1': JSON.stringify(summary),
  'loadcheck:bikeProfiles': JSON.stringify([bike]),
  'loadcheck:bikeProfile': JSON.stringify(bike),
  'loadcheck:draft': '{"keep":"exactly this"}',
};

/** Load Check's records, written before the tool is opened (the page is on the app's origin). */
async function seed(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/#/tools`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((entries) => { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); }, SEED);
}
const loadcheckKeys = (page: Page) => page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('loadcheck:')).sort());

test('[TY-UI-STORE] #/tools/tyre opens inside Tools, and what was typed is still there after a reload', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/tyre' });
  await expect(page.getByRole('heading', { name: 'Tyre pressure', level: 2 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tools' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Enter the maximum pressure printed on your tyre')).toBeVisible();
  await page.getByRole('textbox', { name: /Tyre maximum/ }).fill('5');
  await expect(page.locator('.tyre-big')).toHaveCount(0); // rim type and width unknown: the lowest limits, which a tube cannot meet
  await page.getByLabel('Hooked').check();
  await expect(page.locator('.tyre-big')).toHaveCount(2);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: /Tyre maximum/ })).toHaveValue('5');
  await expect(page.locator('.tyre-big')).toHaveCount(2);
});

test('[TY-UI-NOWRITE] Load Check keys are the same, byte for byte, after using the tool', async ({ page }) => {
  app = await loadApp(page, { launch: true });
  await seed(page, app.origin);
  const before = await loadcheckKeys(page);
  expect(before.length).toBe(4);
  await page.goto(`${app.origin}/#/tools/tyre`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /Tyre maximum/ }).fill('4.5');
  await page.getByRole('textbox', { name: /Tyre minimum/ }).fill('2.5');
  await page.getByText('Tubeless', { exact: true }).click();
  await page.getByText('Unpaved', { exact: true }).click();
  await expect(page.locator('.tyre-big')).toHaveCount(2);
  await page.goto(`${app.origin}/#/tools`);
  expect(await loadcheckKeys(page)).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem('copilot:tyre:v1'))).toContain('"tyreMax"');
});

test('[TY-UI-LAST] the Tools tab shows the last tyre figures and the bag plan line, from a first visit to the tool', async ({ page }) => {
  app = await loadApp(page, { launch: true });
  await seed(page, app.origin);
  await page.goto(`${app.origin}/#/tools`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('3 bags · 10.2 kg')).toBeVisible();
  await expect(page.getByText('Not worked out yet')).toBeVisible();
  await page.getByRole('link', { name: /Open Tyre pressure/ }).click();
  await expect(page.locator('#tyre-bike')).toHaveValue(bike.id);
  await page.getByRole('textbox', { name: /Tyre maximum/ }).fill('6');
  await expect(page.locator('.tyre-big')).toHaveCount(2);
  const [front, rear] = (await page.locator('.tyre-big').allTextContents()).map((t) => String(Number(t.replace(' bar', ''))));
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tools' }).click();
  await expect(page.getByText(`front ${front} · rear ${rear} bar`)).toBeVisible();
});

test('[TY-UI-OFFLINE] the tool works in flight mode and sends nothing', async ({ page }) => {
  const requests: string[] = [];
  const sent: { url: string; method: string; type: string }[] = [];
  page.on('request', (r) => { requests.push(r.url()); sent.push({ url: r.url(), method: r.method(), type: r.resourceType() }); });
  app = await loadApp(page, { launch: true, path: '/#/tools/tyre' });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Tyre pressure', level: 2 })).toBeVisible();
  const settled = requests.length;
  await page.getByLabel('Hooked').check();
  await page.getByRole('textbox', { name: /Tyre maximum/ }).fill('65');
  await page.getByRole('button', { name: 'Yes, 65 psi' }).click();
  await expect(page.locator('.tyre-big')).toHaveCount(2);
  // Using the tool sends no data: after it settled, at most the app's own precached files (a font) were read, and nothing was posted or fetched.
  const after = sent.slice(settled);
  expect(after.filter((r) => r.method !== 'GET' || ['fetch', 'xhr', 'websocket', 'ping', 'eventsource'].includes(r.type))).toEqual([]);
  expect(after.filter((r) => !r.url.startsWith(app!.origin))).toEqual([]);
  expect(requests.filter((u) => !u.startsWith(app!.origin) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
});

// The owner's device check of 5 November: the three things a figure needs were spread along the screen.
test('[TY-UI-NEEDED-FIRST] the three things a figure needs are at the top, in one card drawn apart from the others, each marked', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/tyre' });
  const needed = page.locator('section.tyre-needed');
  await expect(needed.getByRole('heading', { name: 'Needed for a figure', level: 2 })).toBeVisible();
  await expect(needed.locator('.tyre-needed-tag')).toHaveCount(4);
  for (const tag of await needed.locator('.tyre-needed-tag').all()) await expect(tag).toBeVisible();
  await expect(needed.getByRole('textbox', { name: /Tyre maximum/ })).toBeVisible();
  await expect(needed.getByRole('textbox', { name: /Front tyre width/ })).toBeVisible();
  await expect(needed.getByRole('textbox', { name: /Rear tyre width/ })).toBeVisible();
  await expect(needed.getByLabel('Hooked')).toBeVisible();
  // Drawn apart: a heavier edge than any other card.
  const edge = (sel: string) => page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).borderLeftWidth));
  expect(await edge('section.tyre-needed')).toBeGreaterThan(await edge('section.tyre-result'));
  // Every card below the needed one, the answer first.
  const tops = await page.locator('.tyre > section.card').evaluateAll((cards) => cards.map((c) => [c.className, c.getBoundingClientRect().top] as const));
  expect(tops[0]![0]).toContain('tyre-needed');
  expect(tops[1]![0]).toContain('tyre-result');
  for (const [, top] of tops.slice(1)) expect(top).toBeGreaterThan(tops[0]![1]);
});

test('the tyre screen has no accessibility violations, no sideways scroll, 44 px controls, and a clean console', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(String(e)));
  app = await loadApp(page, { launch: true });
  await seed(page, app.origin);
  await page.goto(`${app.origin}/#/tools/tyre`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: /Tyre maximum/ }).fill('5');
  await expect(page.locator('.tyre-big')).toHaveCount(2);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const control of await page.locator('main button, main a.btn, main .tyre-option, main input[type="text"], main select').all()) {
    const box = await control.boundingBox();
    if (box) expect(box.height, await control.evaluate((e) => e.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(43.5);
  }
  expect(problems).toEqual([]);
});

test('[TY-UI-STORE] switching bike in a real browser never writes one bike\'s details over another\'s', async ({ page }) => {
  app = await loadApp(page, { launch: true });
  const second = { ...bike, id: 'bike_b', name: 'Gravel hookless', look: { colour: null, bars: 'drop', ebike: null }, pressure: { wheel: '700c', rim: 'hookless', rimMm: 21 }, frontTyre: '30-622', rearTyre: '30-622' };
  await page.goto(`${app.origin}/#/tools`);
  await page.evaluate((entries) => { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); }, { ...SEED, 'loadcheck:bikeProfiles': JSON.stringify([bike, second]) });
  await page.goto(`${app.origin}/#/tools/tyre`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#tyre-bike').selectOption('default');
  await page.getByRole('textbox', { name: /Tyre maximum/ }).fill('8');
  await page.getByLabel('Hooked').check();
  await page.locator('#tyre-bike').selectOption('bike_b');
  await expect(page.getByRole('textbox', { name: /Tyre maximum/ })).toHaveValue('');
  await expect(page.getByText('Enter the maximum pressure printed on your tyre')).toBeVisible();
  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('copilot:tyre:v1') ?? '{}'));
  expect(store.entries.bike_b).toBeUndefined();
  expect(store.entries.default.details.tyreMax).toEqual({ value: 8, unit: 'bar' });
  await page.locator('#tyre-bike').selectOption('default');
  await expect(page.getByRole('textbox', { name: /Tyre maximum/ })).toHaveValue('8');
});
