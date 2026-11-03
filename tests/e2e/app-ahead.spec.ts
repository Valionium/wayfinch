// Ahead in a real browser on a prepared trip (plan Task 16): showing it, its cards, chips, Call and Website, and the share step
// send nothing; Emergency stands offline; the page passes the automatic accessibility checks and every control is 44 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { atPosition, goOffline, loadApp, preparedTrip, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const today = (): string => new Date().toISOString().slice(0, 10);

/** Every request the page makes from now on, but the app's own files, which the worker and the reload fetch. */
function sent(page: Page): string[] {
  const out: string[] = [];
  page.on('request', (r: Request) => { out.push(`${r.method()} ${r.url()}`); });
  return out;
}

async function ahead(page: Page): Promise<void> {
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: today(), places: true });
  await atPosition(page, 40, { accuracyM: 12 });
  await page.goto(`${app.origin}/#/ahead`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-ahead="answers"]')).toBeVisible();
  await expect(page.locator('[data-card]')).toHaveCount(6);
}

async function openEverything(page: Page): Promise<void> {
  for (const toggle of await page.locator('.ah-toggle').all()) if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  for (const chip of ['Bike shop', 'Pharmacy', 'Bail out by train', 'Toilets', 'Shelter', 'Emergency']) {
    await page.locator('.ah-chips').getByRole('button', { name: chip, exact: true }).click();
    await expect(page.locator('.ah-chip-panel')).toBeVisible();
  }
}

test('[AH-CALL] [AH-SHARE] showing the cards, the chips, Call and Website and the share step sends nothing; links are tel: and http(s): only', async ({ page }) => {
  await ahead(page);
  const log = sent(page);
  await openEverything(page);
  for (const chip of ['Bike shop', 'Shelter']) await page.locator('.ah-chips').getByRole('button', { name: chip, exact: true }).click();
  for (const href of await page.locator('a.ah-link').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))) {
    expect(href).toMatch(/^(tel:\+\d{7,15}|https?:\/\/)/);
  }
  await page.getByRole('button', { name: 'Share progress' }).click();
  const sheet = page.locator('[data-share="progress"]');
  await expect(sheet.locator('textarea')).not.toHaveValue('');
  await sheet.getByRole('checkbox').check();
  await expect(sheet.locator('textarea')).toHaveValue(/openstreetmap\.org/);
  await expect(sheet.getByRole('link', { name: 'SMS' })).toHaveAttribute('href', /^sms:\?&body=/);
  await sheet.getByRole('button', { name: 'Copy' }).click();
  await expect(sheet.getByRole('status')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Share progress' }).click();
  await expect(page.locator('[data-share="progress"] input[type=checkbox]')).toBeChecked(); // the choice is kept
  expect(await page.evaluate(() => localStorage.getItem('copilot:share-progress'))).toBe('yes');
  const own = new URL(app!.origin).origin;
  expect(log.filter((l) => !l.includes(own))).toEqual([]);
  expect(log.filter((l) => l.startsWith('POST'))).toEqual([]);
});

test('[AH-EMERGENCY] offline after a reload: 112, the fallback line and the coordinates; opening it sends nothing', async ({ page }) => {
  await ahead(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const log = sent(page);
  await page.goto(`${app!.origin}/#/ahead`, { waitUntil: 'domcontentloaded' });
  await page.locator('.ah-chips').getByRole('button', { name: 'Emergency', exact: true }).click();
  const card = page.locator('#chip-emergency');
  await expect(card.getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112');
  await expect(card).toContainText('112 — works across Europe and on many mobile networks; check the local number');
  await expect(card).toContainText(/\d+\.\d{5}, \d+\.\d{5}/);
  expect(log.filter((l) => !l.includes(new URL(app!.origin).origin))).toEqual([]);
});

test('Ahead has no automatic accessibility violations with everything open, and every control is at least 44 px', async ({ page }) => {
  await ahead(page);
  await openEverything(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`)).toEqual([]);
  for (const el of await page.locator('.ahead button, .ahead a.btn, .ahead select, .ahead input[type=number]').all()) {
    if (!(await el.isVisible())) continue;
    const box = (await el.boundingBox())!;
    expect(box.height, await el.innerText().catch(() => '')).toBeGreaterThanOrEqual(43.5);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
