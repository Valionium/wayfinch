// The Trip tab in a real browser, built with the launch switch on (plan Tasks 12 to 14).
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fixtureGpx } from '../fixtures/gpx.ts';
import { loadApp, preparedTrip, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';
import type { StoreInPage } from './fixtures/store-page.ts';

declare const __store: StoreInPage;

const json = (path: string) => JSON.parse(readFileSync(new URL(`../../contracts/${path}`, import.meta.url), 'utf8'));
const sample = json('bike-library/sample.json') as Record<string, unknown>[];
const full = json('load-summary/full.json') as Record<string, unknown>;
const SEED: Record<string, string> = {
  'loadcheck:bikeProfile': JSON.stringify(sample[0]),
  'loadcheck:bikeProfiles': JSON.stringify(sample),
  'loadcheck:summary:v1': JSON.stringify({ ...full, bikeId: sample[0]!.id }),
};

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

/** Everything the page says to its console as an error, or throws. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  return problems;
}

const gpx = async (id: 'heidelberg-strasbourg' | 'alpine-pass' | 'loop', heights = true) => ({
  name: `${id}.gpx`, mimeType: 'application/gpx+xml', buffer: Buffer.from(await fixtureGpx(id, { heights })),
});

test('[TRIP-FIRST] with no trip the app opens on Trip, and the bike is the first thing on it, at most 120 px tall', async ({ page }) => {
  const problems = watch(page);
  app = await loadApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
  const first = page.locator('.trip').locator('> *').first();
  await expect(first).toHaveClass(/trip-bike/);
  await expect(first.locator('svg.bk')).toBeVisible();
  const box = (await first.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(120);
  const top = (await page.locator('.trip-bike').boundingBox())!.y;
  for (const card of await page.locator('.trip .card').all()) expect((await card.boundingBox())!.y).toBeGreaterThan(top);
  expect(problems).toEqual([]);
});

test('[TRIP-FIRST] with a running trip (prepared, a month and no date) the app opens on Ahead; an address of its own is kept', async ({ page }) => {
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: null });
  await page.evaluate(async () => {
    const db = await __store.openDb();
    await db.put('meta', { at: new Date(), steps: [], build: null, forecastFetchedAt: null, baselineYears: null }, 'route:preparedSteps');
  });
  await page.goto(`${app.origin}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ahead');
  await page.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
});

test('[BK-WHERE-TRIP] Trip draws the bike with its bags and caption at its top, at most 120 px tall, and a tap goes to Look', async ({ page }) => {
  app = await loadApp(page);
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, SEED);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const figure = page.locator('.trip-bike figure');
  await expect(figure.locator('svg.bk')).toBeVisible();
  expect(await figure.locator('.bk-bag').count()).toBeGreaterThan(0);
  await expect(figure.locator('figcaption')).toBeVisible();
  expect((await figure.boundingBox())!.height).toBeLessThanOrEqual(120);
  await figure.getByRole('link', { name: /^Your bike: / }).click();
  await expect(page).toHaveURL(`${app.origin}/tools/bags/#bike-details=${sample[0]!.id as string}&back=trip&section=look`);
});

test('[TRIP-GPX] a real GPX file becomes the route: figures, profile and days show, and they are still there after a reload', async ({ page }) => {
  const problems = watch(page);
  app = await loadApp(page);
  await page.locator('input[type=file]').setInputFiles(await gpx('heidelberg-strasbourg'));
  const summary = page.locator('[data-summary]');
  await expect(summary).toContainText('Fixture: Heidelberg to Strasbourg');
  await expect(summary).toContainText(/\d+(\.\d)? km · [\d,]+ m climbing/);
  await expect(summary.locator('svg[role=img]')).toBeVisible();
  expect(await summary.locator('ol li').count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByText('Day 1 ·').first()).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-summary]')).toContainText('Fixture: Heidelberg to Strasbourg');
  expect(problems).toEqual([]);
});

test('[TRIP-GPX-BAD] a bad file is refused in words and the route stays; a second route asks first', async ({ page }) => {
  app = await loadApp(page);
  await page.locator('input[type=file]').setInputFiles(await gpx('loop'));
  await expect(page.locator('[data-summary]')).toContainText('Heilbronn loop');
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from('<gpx><oops') });
  await expect(page.getByRole('alert').filter({ hasText: 'did not read as a GPX' })).toContainText('Your current route is unchanged.');
  await expect(page.locator('[data-summary]')).toContainText('Heilbronn loop');
  await page.locator('input[type=file]').setInputFiles(await gpx('alpine-pass'));
  const ask = page.locator('[data-replace]');
  await expect(ask).toContainText('Replace your route?');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);
  await expect(page.locator('[data-summary]')).toContainText('Heilbronn loop');
  await page.locator('input[type=file]').setInputFiles(await gpx('alpine-pass'));
  await page.locator('[data-replace]').getByRole('button', { name: 'Replace route' }).click();
  await expect(page.locator('[data-summary]')).toContainText('Gotthard');
});

test('Trip has no automatic accessibility violations with a route, and every control is at least 44 px', async ({ page }) => {
  app = await loadApp(page);
  await page.locator('input[type=file]').setInputFiles(await gpx('loop'));
  await expect(page.locator('[data-summary]')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`)).toEqual([]);
  for (const el of await page.locator('.trip button, .trip .file-pick, .trip input[type=number], .trip input[type=time], .trip input[type=date], .trip .choice-option').all()) {
    const box = (await el.boundingBox())!;
    expect(box.height, await el.innerText().catch(() => '')).toBeGreaterThanOrEqual(43.5);
  }
});
