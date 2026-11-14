// You and the legal pages in a real browser (plan Task 20): the screen works, the legal pages are two taps away from every tab and open
// in flight mode, and what the app does on its own sends nothing to an outside address. Every outside address is blocked by the helper.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { atPosition, goOffline, loadApp, preparedTrip, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';
import { forecastBody, metaBody } from '../fixtures/openmeteo.ts';

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

/**
 * Waits until the weight typed in You is kept: the store tells the other windows once the write is done. If it never is, the failure
 * says what the screen shows (the field, its problem line, where the focus is), what the field and the database did, and any error the
 * page threw. YOU-EXPORT-UI failed this way three times in CI (the field typed and left, no write reported in 30 s) and never in
 * 90 local runs, so a failure must carry its own evidence.
 */
async function savedWeight(page: Page): Promise<() => Promise<void>> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  // What the field and the database did, in the page's own order: whether the change fired, and how each open of the store ended.
  // Awaited, so the script is in place before the first load (review M2 of PR 47).
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __wfLog: string[] }).__wfLog = log;
    const say = (s: string): void => { if (log.length < 150) log.push(`${Math.round(performance.now())} ${s}`); };
    for (const type of ['focusin', 'focusout', 'input', 'change']) {
      document.addEventListener(type, (e) => {
        const el = e.target as HTMLInputElement | null;
        if (el?.id === 'you-weight') say(`${type} "${el.value}"${el.isConnected ? '' : ' detached'}`);
      }, true);
    }
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((name: string, version?: number) => {
      const request = version === undefined ? open(name) : open(name, version);
      say(`open ${name} ${version ?? '-'}`);
      request.addEventListener('upgradeneeded', (e) => say(`upgrade ${name} ${version ?? '-'} from ${(e as IDBVersionChangeEvent).oldVersion}`));
      request.addEventListener('blocked', () => say(`blocked ${name} ${version ?? '-'}`));
      request.addEventListener('success', () => say(`opened ${name} ${version ?? '-'} at ${request.result.version}`));
      request.addEventListener('error', () => say(`failed ${name} ${version ?? '-'} ${request.error?.name ?? ''}`));
      return request;
    }) as typeof indexedDB.open;
  });
  const look = async () => ({
    told: await page.evaluate(() => localStorage.getItem('copilot:changed') !== null),
    screen: await page.evaluate(() => ({
      field: (document.getElementById('you-weight') as HTMLInputElement | null)?.value ?? null,
      problem: document.getElementById('you-weight-problem')?.textContent ?? null,
      focus: document.activeElement?.id || document.activeElement?.tagName || null,
      hash: location.hash,
    })),
    errors: errors.slice(0, 3),
    log: await page.evaluate(() => (window as unknown as { __wfLog?: string[] }).__wfLog ?? []),
  });
  return async () => {
    try {
      await expect.poll(async () => (await look()).told, { timeout: 30_000 }).toBe(true);
    } catch (e) {
      // toMatchObject's diff shows only the keys it was asked for, so the evidence is printed whole.
      throw new Error(`the weight was not reported as kept: ${JSON.stringify(await look().catch(() => null))}`, { cause: e });
    }
  };
}

test('[YOU-RIDER] You opens as its own screen with the rider, water, learning, bikes, settings, data and legal cards, and a weight typed there is kept after a reload', async ({ page }) => {
  const saved = await savedWeight(page);
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
  await saved();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Your weight (kg)')).toHaveValue('82');
  // The tyre tool starts from it.
  await page.goto(`${app.origin}/#/tools/tyre`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('82 kg').first()).toBeVisible();
});

test('[YOU-EXPORT-UI] Export downloads a JSON file named by the day, with the rider details in it', async ({ page }) => {
  const saved = await savedWeight(page);
  app = await loadApp(page);
  await tab(page, 'You').click();
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  await page.getByLabel('Your weight (kg)').fill('82');
  await page.getByLabel('Your weight (kg)').blur();
  await saved();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^wayfinch-data-\d{4}-\d{2}-\d{2}\.json$/);
  const body = JSON.parse(await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8')) as { app: string; profile: { weightKg: number | null } };
  expect(body).toMatchObject({ app: 'copilot', profile: { weightKg: 82 } });
});

test('[PRIV-LEGAL-REACH] the imprint, the privacy notice and the licences are two taps from every tab: the tab, You, the link', async ({ page }) => {
  app = await loadApp(page);
  for (const from of ['En route', 'Trip', 'Tools', 'You']) {
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
  for (const name of ['Trip', 'Tools', 'You', 'En route']) await tab(page, name).click();
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

const SETTINGS_OFF = JSON.stringify({ updatedAt: '2026-10-01T00:00:00.000Z', keepFresh: false });
const meteo = (log: string[]): string[] => log.filter((line) => line.includes('open-meteo.com'));

test('[WXR-AUTO-WIRED] in the browser: opening with a prepared trip and "Keep trip data fresh" on checks the five models, asks once for the forecast, and a reload within 3 hours asks nothing', async ({ page }) => {
  await ahead(page);
  // Prepare this route has just asked for the weather, which counts for the 3 hours; take that ask back, as if it were long ago.
  await page.evaluate(() => new Promise<void>((done) => {
    const q = indexedDB.open('copilot');
    q.onsuccess = () => { const t = q.result.transaction(['meta'], 'readwrite'); t.objectStore('meta').delete('route:weatherAttempt'); t.oncomplete = () => { q.result.close(); done(); }; };
  }));
  const log = sent(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => meteo(log).length, { timeout: 20_000 }).toBe(6);
  const calls = meteo(log).map((l) => l.split(' ')[1]!);
  expect(calls.slice(0, 5).every((u) => u.includes('/static/meta.json'))).toBe(true);
  expect(calls[5]).toContain('/v1/forecast');
  // Only Open-Meteo and the app's own address are contacted.
  expect(outside(log, app!.origin).every((l) => l.includes('open-meteo.com'))).toBe(true);
  const again = sent(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-ahead="answers"]')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(meteo(again)).toEqual([]);
  // Coming back to the foreground within the 3 hours asks nothing either.
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(500);
  expect(meteo(again)).toEqual([]);
});

test('[WXR-AUTO-WIRED] in the browser: with the setting off, opening and coming back to the foreground send nothing outside', async ({ page }) => {
  await ahead(page);
  await page.evaluate((v) => localStorage.setItem('copilot:settings', v), SETTINGS_OFF);
  const log = sent(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-ahead="answers"]')).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(1500);
  expect(outside(log, app!.origin)).toEqual([]);
});

test('[PRIV-NOTHING-SENT] with a prepared trip and the setting off: Call and Website shown, writing the share message, opening Emergency, and opening every card send nothing outside', async ({ page }) => {
  await ahead(page);
  await page.evaluate((v) => localStorage.setItem('copilot:settings', v), SETTINGS_OFF);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-ahead="answers"]')).toBeVisible();
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
  // The cards that hold wait or go and leave-by were open while all this ran, and said something.
  await expect(page.locator('[data-card="weather"]')).toBeVisible();
  await expect(page.locator('[data-card="daylight"]')).toContainText(/leave by/i);
});

test('[WXR-AUTO-WIRED] in the browser: the automatic forecast shows on the Weather card at once, without a reload', async ({ page }) => {
  await ahead(page);
  await page.evaluate(() => new Promise<void>((done) => {
    const q = indexedDB.open('copilot');
    q.onsuccess = () => { const t = q.result.transaction(['meta'], 'readwrite'); t.objectStore('meta').delete('route:weatherAttempt'); t.oncomplete = () => { q.result.close(); done(); }; };
  }));
  const trip = await page.evaluate(() => new Promise<{ grid: number }>((res) => {
    const q = indexedDB.open('copilot');
    q.onsuccess = () => { const r = q.result.transaction(['trip']).objectStore('trip').get('current'); r.onsuccess = () => res({ grid: r.result.route.sampleGrid.length }); };
  }));
  // A fake Open-Meteo: five model runs, and a calm forecast for today and the days after.
  const cors = { 'access-control-allow-origin': '*' };
  const dayStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) / 1000;
  await page.context().route(/^https:\/\/api\.open-meteo\.com\//, (route) => {
    const url = route.request().url();
    if (url.includes('/static/meta.json')) {
      const now = Date.now() / 1000;
      return route.fulfill({ headers: cors, json: metaBody({ run: now - 3 * 3600, available: now - 1.5 * 3600 }) });
    }
    return route.fulfill({ headers: cors, json: forecastBody(trip.grid, { from: dayStart, hours: 96 }) });
  });
  await page.goto(`${app!.origin}/#/ahead`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const card = page.locator('[data-card="weather"]');
  await expect(card).toBeVisible();
  // The forecast lands and the card changes by itself.
  await expect(card).not.toContainText(/unknown/i, { timeout: 20_000 });
  await expect(card).toContainText(/°C|rain/i);
});

test('[YOU-DELETE-UI] after Delete now and a reload, no empty database comes back, also with Keep trip data fresh on', async ({ page }) => {
  const saved = await savedWeight(page);
  app = await loadApp(page);
  await tab(page, 'You').click();
  await page.getByLabel('Your weight (kg)').fill('82');
  await page.getByLabel('Your weight (kg)').blur();
  await saved();
  await page.getByRole('button', { name: 'Delete Wayfinch data from this phone' }).click();
  await page.getByRole('button', { name: 'Delete now' }).click();
  await expect(page.getByText('Deleted from this phone.')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain('copilot');
});
