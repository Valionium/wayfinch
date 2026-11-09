// Remove this trip in a real browser (owner's wish, 9 November 2026): Trip's Route step, its confirm step, the real store and the
// real worker; in flight mode, with a second window, with Get ready offline under way; compared with a phone that never had the trip.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { atPosition, goOffline, loadApp, preparedTrip, removeBuilds, servePack, withStore } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';
import type { StoreInPage } from './fixtures/store-page.ts';

declare const __store: StoreInPage;

const json = (path: string) => JSON.parse(readFileSync(new URL(`../../contracts/${path}`, import.meta.url), 'utf8'));
const sample = json('bike-library/sample.json') as Record<string, unknown>[];
const full = json('load-summary/full.json') as Record<string, unknown>;
// The bag planner's own: bikes, a setup, a working plan. None of it is the trip's.
const BAGS: Record<string, string> = {
  'loadcheck:bikeProfile': JSON.stringify(sample[0]),
  'loadcheck:bikeProfiles': JSON.stringify(sample),
  'loadcheck:summary:v1': JSON.stringify({ ...full, bikeId: sample[0]!.id }),
  'loadcheck:setups': JSON.stringify([{ id: 'setup_1', name: 'Weekend', updated: '2026-11-01T10:00:00.000Z' }]),
  'loadcheck:draft': JSON.stringify({ updatedAt: '2026-11-01T10:00:00.000Z', bags: [1, 2, 3], 'ünï': 'ß' }),
};
const ROUTE_NAME = 'Fixture: Heidelberg to Strasbourg';
const TRIP_STORES = ['matches', 'places', 'roofs', 'rescuePoints', 'hours', 'forecast', 'baseline', 'positions', 'dayStarts', 'waterLeft', 'savedTiles', 'trip', 'handoffs'];

const apps: LoadedApp[] = [];
test.afterEach(async () => { for (const a of apps.splice(0)) await a.close(); });
test.afterAll(() => removeBuilds());

/** Everything the page says to its console as an error, or throws. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  return problems;
}

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

const allLocal = (page: Page): Promise<Record<string, string>> => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)!])));

/** The app with the bag planner's keys, a trip Get ready offline ran for, and what En route keeps: a position, water, a plan for tomorrow. */
async function tripPhone(page: Page, opts: { places?: boolean } = {}): Promise<LoadedApp> {
  const app = await loadApp(page);
  apps.push(app);
  await page.evaluate((e) => { for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, BAGS);
  await preparedTrip(page, 'heidelberg-strasbourg', { places: opts.places ?? true, departureDate: today() });
  await atPosition(page, 20);
  await page.evaluate(async () => {
    await __store.readSettings();
    await __store.writeSettings({ nights: 2, startTime: '08:00' });
    const db = await __store.openDb();
    await db.put('waterLeft', { litres: 1.5, at: new Date(), confirmed: true }, 'current');
    await db.put('handoffs', { id: 'h1', gpx: '<gpx/>', createdAt: new Date().toISOString() }, 'h1');
    localStorage.setItem('copilot:plan-tomorrow', JSON.stringify({ date: '2030-01-02' }));
    localStorage.setItem('copilot:handoff:v1', JSON.stringify({ id: 'h1' }));
  });
  return app;
}

/** A worker controls the page, so it opens in flight mode. */
async function underWorker(page: Page, origin: string, hash = '#/trip'): Promise<void> {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.goto(`${origin}/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

async function openTrip(page: Page, origin: string): Promise<void> {
  // A new load: a change of the address's hash alone would keep the screen that read the store before the trip was put in.
  await page.goto(`${origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-trip-line]')).toContainText(ROUTE_NAME);
}

/** Remove this trip stands in the folded Route step's row beside Change (owner, 9 Nov 2026): wait for its chunk. */
async function openRouteStep(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Remove this trip', exact: true })).toBeVisible();
}

async function removeIt(page: Page): Promise<void> {
  await openRouteStep(page);
  await page.getByRole('button', { name: 'Remove this trip', exact: true }).click();
  const ask = page.getByRole('alertdialog', { name: 'Remove this trip?' });
  await expect(ask).toContainText(`“${ROUTE_NAME}”`);
  await expect(ask).toContainText("its date, nights and days");
  await ask.getByRole('button', { name: 'Remove trip', exact: true }).click();
  await expect(page.locator('[data-trip-line]')).toHaveText('No trip yet');
}

/** What the store holds of the trip: every store of it empty, no route record and no trip stamp left. */
const tripLeft = (page: Page): Promise<{ stores: Record<string, number>; meta: string[] }> => page.evaluate(async (names) => {
  const db = await __store.openDb();
  const stores: Record<string, number> = {};
  for (const n of names) stores[n] = await db.count(n);
  const meta = ((await db.getAllKeys('meta')) as string[]).filter((k) => String(k).startsWith('route:') || k === 'updatedAt:trip');
  return { stores, meta };
}, TRIP_STORES);

const screenText = async (page: Page, origin: string, hash: string): Promise<string> => {
  await page.goto(`${origin}/${hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(`[data-screen="${hash.slice(2)}"]`)).toBeVisible();
  await page.waitForTimeout(800);
  return page.locator('main').innerText();
};

test('[TRIP-REMOVE] in flight mode: the trip and all En route keeps go, the bag planner, settings and the rest stay byte for byte, and Trip and En route read as on a phone that never had it', async ({ page }) => {
  test.setTimeout(180_000);
  const problems = watch(page);
  const app = await tripPhone(page);
  await underWorker(page, app.origin);
  const before = await allLocal(page);
  await goOffline(page);
  await openTrip(page, app.origin);
  // The first-run bike hint's key is written by Trip's own visits (wish 17, owner's answers of 9 Nov 2026): it is checked against its
  // value just before the removal, which must leave it as it is.
  await page.waitForTimeout(300);
  const hint = await page.evaluate(() => localStorage.getItem('copilot:bikeHint:v1'));
  expect(hint).not.toBeNull();

  await removeIt(page);
  await expect(page.locator('[data-step="route"] h2')).toBeFocused();
  await expect(page.locator('[data-step="route"]')).toHaveAttribute('data-open', 'true');

  await withStore(page);
  expect(await tripLeft(page)).toEqual({ stores: Object.fromEntries(TRIP_STORES.map((n) => [n, 0])), meta: [] });
  const after = await allLocal(page);
  const gone = ['copilot:plan-tomorrow', 'copilot:handoff:v1', 'copilot:heights-lookup', 'copilot:changed'];
  for (const [k, v] of Object.entries(before)) if (!gone.includes(k) && k !== 'copilot:settings') expect(after[k], k).toBe(k === 'copilot:bikeHint:v1' ? hint : v);
  expect(after['copilot:bikeHint:v1']).toBe(hint!);
  // The nights go back to a fresh start's; every other setting stays.
  const { nights: n0, updatedAt: u0, ...rest0 } = JSON.parse(before['copilot:settings']!) as Record<string, unknown>;
  const { nights: n1, updatedAt: u1, ...rest1 } = JSON.parse(after['copilot:settings']!) as Record<string, unknown>;
  expect([n0, n1]).toEqual([2, null]);
  expect(Date.parse(u1 as string)).toBeGreaterThan(Date.parse(u0 as string));
  expect(JSON.stringify(rest1)).toBe(JSON.stringify(rest0));
  for (const k of gone.slice(0, 3)) expect(after[k], k).toBeUndefined();
  for (const [k, v] of Object.entries(BAGS)) expect(after[k], k).toBe(v);
  const trip = await screenText(page, app.origin, '#/trip');
  const enRoute = await screenText(page, app.origin, '#/ahead');

  // The same rider on a phone that never had the trip: another origin, the keys left after the removal, in flight mode too.
  await page.context().setOffline(false);
  const fresh = await page.context().newPage();
  const other = await loadApp(fresh);
  apps.push(other);
  await fresh.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) if (k !== 'copilot:changed') localStorage.setItem(k, v); }, after);
  await underWorker(fresh, other.origin);
  await goOffline(fresh);
  expect(await screenText(fresh, other.origin, '#/trip')).toBe(trip);
  expect(await screenText(fresh, other.origin, '#/ahead')).toBe(enRoute);
  expect(problems).toEqual([]);
  await fresh.close();
});

test('[TRIP-REMOVE-WINDOWS] a second window follows at once, and can not write the old trip back', async ({ page }) => {
  const app = await tripPhone(page, { places: false });
  const other = await page.context().newPage();
  await openTrip(other, app.origin);
  await withStore(other);
  const seen = await other.evaluate(async () => (await __store.readTrip())!);
  await openTrip(page, app.origin);

  await removeIt(page);

  await expect(other.locator('[data-trip-line]')).toHaveText('No trip yet', { timeout: 2000 });
  const refused = await other.evaluate(async (t) => __store.saveTrip(t).then(() => 'saved', (e: { section?: string }) => e.section ?? 'refused'), seen);
  expect(refused).toBe('trip');
  await other.reload({ waitUntil: 'domcontentloaded' });
  await expect(other.locator('[data-trip-line]')).toHaveText('No trip yet');
  await withStore(other);
  expect(await tripLeft(other)).toEqual({ stores: Object.fromEntries(TRIP_STORES.map((n) => [n, 0])), meta: [] });
  await other.close();
});

test('[TRIP-REMOVE-WINDOWS] Get ready offline under way stops at its next step: nothing of it is kept, and Trip shows no trip and no "Working"', async ({ page }) => {
  test.setTimeout(120_000);
  const app = await loadApp(page);
  apps.push(app);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: today() });
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => { release = r; });
  let tiles = 0;
  await servePack(page, 'heidelberg-strasbourg', (path) => { if (/\/t\//.test(path)) { tiles += 1; return held; } return undefined; });
  await page.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-getready] button.btn-primary').first().click();
  await expect.poll(() => tiles).toBeGreaterThan(0);

  await openRouteStep(page);
  await page.getByRole('button', { name: 'Remove this trip', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove trip', exact: true }).click();
  await page.waitForTimeout(500);
  const asked = tiles;
  release();
  await expect(page.locator('[data-trip-line]')).toHaveText('No trip yet');
  await expect(page.locator('[data-step="getready"]')).not.toContainText('Working');
  await page.waitForTimeout(1000);
  // At most the batch that was on its way: no new request after the trip went.
  expect(tiles).toBe(asked);
  await withStore(page);
  expect(await tripLeft(page)).toEqual({ stores: Object.fromEntries(TRIP_STORES.map((n) => [n, 0])), meta: [] });
});

test('[TRIP-REMOVE-ASK] keyboard and screen reader reach the button and the confirm step; 44 px targets; no sideways scroll from 320 px to wide; no accessibility violations', async ({ page }) => {
  const app = await tripPhone(page, { places: false });
  await openTrip(page, app.origin);
  await openRouteStep(page);
  const opener = page.getByRole('button', { name: 'Remove this trip', exact: true });
  // From the keyboard: focus, Enter opens the question with the focus on its title.
  await opener.focus();
  await page.keyboard.press('Enter');
  const ask = page.getByRole('alertdialog', { name: 'Remove this trip?' });
  await expect(ask).toBeVisible();
  await expect(page.locator('#trip-remove-title')).toBeFocused();
  await expect(ask).toHaveAccessibleDescription(/Goes: the route .* Stays: your bikes, setups and Bag planner plans/);
  await page.keyboard.press('Tab');
  await expect(ask.getByRole('button', { name: 'Remove trip', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(ask.getByRole('button', { name: 'Keep it', exact: true })).toBeFocused();
  const results = await new AxeBuilder({ page }).include('[data-step="route"]').analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`)).toEqual([]);
  for (const width of [320, 360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await ask.scrollIntoViewIfNeeded();
    for (const el of await page.locator('[data-remove-trip] button').all()) {
      const box = (await el.boundingBox())!;
      expect(box.height, `${width}: ${await el.innerText()}`).toBeGreaterThanOrEqual(43.5);
      expect(box.width, `${width}: ${await el.innerText()}`).toBeGreaterThanOrEqual(43.5);
      expect(box.x + box.width, `${width}: ${await el.innerText()}`).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width} px`).toBe(true);
  }
  // Escape is Keep it: nothing changes, and the focus is back on the button.
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator('[data-trip-line]')).toContainText(ROUTE_NAME);
  await opener.click();
  await expect(page.locator('#trip-remove-title')).toBeFocused();
});
