// You and the legal pages in a real browser (plan Task 20): the screen works, the legal pages are two taps away from every tab and open
// in flight mode, and what the app does on its own sends nothing to an outside address. Every outside address is blocked by the helper.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { atPosition, goOffline, loadApp, preparedTrip, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

// A busy machine can be slow to draw a page from the worker's cache.
test.use({ actionTimeout: 15_000 });
expect.configure({ timeout: 15_000 });

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const today = (): string => new Date().toISOString().slice(0, 10);

/** Every request the page makes from now on. */
function sent(page: Page): string[] {
  const out: string[] = [];
  page.on('request', (r: Request) => { out.push(`${r.method()} ${r.url()}`); });
  return out;
}
const outside = (log: string[], origin: string): string[] => log.filter((line) => !line.split(' ')[1]!.startsWith(origin) && !line.split(' ')[1]!.startsWith('data:') && !line.split(' ')[1]!.startsWith('blob:'));

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

test('[YOU-RIDER] You opens as its own screen with the rider, water, learning, bikes, settings, data and legal cards, and a weight typed there is kept after a reload', async ({ page }) => {
  app = await loadApp(page);
  await tab(page, 'You').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You');
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  for (const title of ['Rider', 'Water you can carry', 'Water learning', 'Your bikes', 'Tyre details', 'Settings', 'Your data', 'Legal']) {
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
  }
  await page.getByLabel('Your weight (kg)').fill('82');
  await page.getByLabel('Your weight (kg)').blur();
  await expect(page.getByLabel('Your weight (kg)')).toHaveValue('82');
  // The write is kept once the other windows are told; reload only after that.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('copilot:changed'))).not.toBeNull();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Your weight (kg)')).toHaveValue('82');
  // The tyre tool starts from it.
  await page.goto(`${app.origin}/#/tools/tyre`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('82 kg').first()).toBeVisible();
});

test('[YOU-EXPORT-UI] Export downloads a JSON file named by the day, with the rider details in it', async ({ page }) => {
  app = await loadApp(page);
  await tab(page, 'You').click();
  await page.getByLabel('Your weight (kg)').fill('82');
  await page.getByLabel('Your weight (kg)').blur();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('copilot:changed'))).not.toBeNull();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^wayfinch-data-\d{4}-\d{2}-\d{2}\.json$/);
  const body = JSON.parse(await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8')) as { app: string; profile: { weightKg: number | null } };
  expect(body).toMatchObject({ app: 'copilot', profile: { weightKg: 82 } });
});

test('[PRIV-LEGAL-REACH] the imprint, the privacy notice and the licences are two taps from every tab: the tab, You, the link', async ({ page }) => {
  app = await loadApp(page);
  for (const from of ['Ahead', 'Trip', 'Tools', 'You']) {
    for (const [name, heading] of [['Imprint', /Impressum/], ['Privacy notice', /Privacy notice/], ['Licences and data', /Licences and data/]] as const) {
      await page.goto(`${app.origin}/`, { waitUntil: 'domcontentloaded' });
      await tab(page, from).click(); // tap 0: being on that tab
      if (from !== 'You') await tab(page, 'You').click(); // tap 1
      await page.locator('[data-legal-links]').getByRole('link', { name, exact: true }).click(); // tap 2
      await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
      await expect(page.locator('main')).toContainText("Drafted by an AI from the project's spec. Not legal advice.");
    }
  }
  await page.getByRole('link', { name: /Wayfinch/ }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You');
});

test('[PRIV-LEGAL-OFFLINE] after the first visit, all three legal pages open in flight mode, from You and by address', async ({ page }) => {
  app = await loadApp(page);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await tab(page, 'You').click();
  await page.locator('[data-legal-links]').getByRole('link', { name: 'Privacy notice' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
  for (const path of ['/legal/imprint/', '/legal/privacy/', '/legal/licences/']) {
    await page.goto(`${app.origin}${path}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main')).toContainText("Drafted by an AI from the project's spec. Not legal advice.");
    await expect(page.locator('link[rel=stylesheet]')).toHaveCount(1);
  }
});

test('the legal pages have no automatic accessibility violations and no horizontal scroll', async ({ page }) => {
  app = await loadApp(page);
  for (const path of ['/legal/imprint/', '/legal/privacy/', '/legal/licences/']) {
    await page.goto(`${app.origin}${path}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id), path).toEqual([]);
  }
  await page.goto(`${app.origin}/#/you`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('[PRIV-NOTHING-SENT] opening the app without a prepared trip, and every tab of it, contacts only the app\'s own hosting', async ({ page }) => {
  app = await loadApp(page);
  const log = sent(page);
  for (const name of ['Trip', 'Tools', 'You', 'Ahead']) await tab(page, name).click();
  await page.goto(`${app.origin}/#/you`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  expect(outside(log, app.origin)).toEqual([]);
});

async function ahead(page: Page): Promise<void> {
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: today(), places: true });
  await atPosition(page, 40, { accuracyM: 12 });
  await page.goto(`${app.origin}/#/ahead`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-ahead="answers"]')).toBeVisible();
}

test('[PRIV-NOTHING-SENT] with a prepared trip: Call and Website shown, writing the share message, opening Emergency, and opening every card (wait or go, leave-by) send nothing outside', async ({ page }) => {
  await ahead(page);
  const log = sent(page);
  const closed = page.locator('.ah-toggle[aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
  for (const chip of ['Bike shop', 'Shelter', 'Emergency']) {
    await page.locator('.ah-chips').getByRole('button', { name: chip, exact: true }).click();
    await expect(page.locator('.ah-chip-panel')).toBeVisible();
  }
  await expect(page.locator('a.ah-link').first()).toBeVisible();
  await page.getByRole('button', { name: 'Share progress' }).click();
  await page.locator('[data-share="progress"] textarea').fill('Riding well, about 40 km in.');
  await expect(page.locator('[data-share="progress"] textarea')).toHaveValue('Riding well, about 40 km in.');
  expect(outside(log, app!.origin)).toEqual([]);
  // The card text that holds wait or go and leave-by was on the page while all this ran.
  await expect(page.locator('main')).toContainText(/leave|wait|go/i);
});
