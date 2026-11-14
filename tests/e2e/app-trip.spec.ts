// The Trip tab in a real browser, built with the launch switch on (plan Tasks 12 to 14).
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fixtureGpx } from '../fixtures/gpx.ts';
import { goOffline, loadApp, preparedTrip, removeBuilds } from './helpers.ts';
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
  // A new rider gets the first-run card here (wish 17, owner's answers of 9 Nov 2026), as tall as HINT-NEW allows; Later gives today's
  // line, which the 120 px hold for.
  await page.getByRole('button', { name: 'Later: show this smaller' }).click();
  const first = page.locator('.trip-main').locator('> *').first();
  await expect(first).toHaveClass(/trip-bike/);
  await expect(first.locator('svg.bk')).toBeVisible();
  const box = (await first.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(120);
  const top = (await page.locator('.trip-bike').boundingBox())!.y;
  for (const card of await page.locator('.trip-main .card').all()) expect((await card.boundingBox())!.y).toBeGreaterThan(top);
  expect(problems).toEqual([]);
});

test('[TRIP-FIRST] with a running trip (prepared, departing today) the app opens on Ahead; an address of its own is kept', async ({ page }) => {
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: new Date().toISOString().slice(0, 10) });
  await page.evaluate(async () => {
    const db = await __store.openDb();
    await db.put('meta', { at: new Date(), steps: [], build: null, forecastFetchedAt: null, baselineYears: null }, 'route:preparedSteps');
  });
  await page.goto(`${app.origin}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('En route');
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
  const link = figure.getByRole('link', { name: /^Your bike: / });
  await expect(link).toHaveAttribute('href', `/tools/bags/#bike-details=${sample[0]!.id as string}&back=trip&section=look`);
  await link.click();
  // The bag planner opens that bike at Look and then removes the fragment (LC-LOOK-DEEP, sub-project 6).
  await expect(page).toHaveURL(`${app.origin}/tools/bags/`);
  await expect(page.locator('#bikeLookTitle')).toBeFocused();
  expect(await page.evaluate('BIKE_PROFILE_EDITOR_ID')).toBe(sample[0]!.id);
  await expect(page.locator('#bikeDetailsBack')).toHaveAttribute('href', '/#/trip');
});

test('[TRIP-GPX] a real GPX file becomes the route: figures, profile and days show, and they are still there after a reload', async ({ page }) => {
  const problems = watch(page);
  app = await loadApp(page);
  await page.locator('input[type=file]').setInputFiles(await gpx('heidelberg-strasbourg'));
  const summary = page.locator('[data-summary]');
  await expect(summary).toContainText('Fixture: Heidelberg to Strasbourg');
  await expect(summary).toContainText(/\d+(\.\d)? km · [\d,]+ m up/);
  await expect(summary.locator('svg[role=img]')).toBeVisible();
  expect(await summary.locator('ol li').count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByText('Day 1 ·').first()).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-summary]')).toContainText('Fixture: Heidelberg to Strasbourg');
  expect(problems).toEqual([]);
});

// The owner's device check of 5 November: the link opened #/you/legal, which showed only the heading "You".
test('[TRIP-ATTRIBUTION] Licences under the route opens the licences page, in flight mode too; #/you/legal shows You at its legal links', async ({ page }) => {
  const problems = watch(page);
  app = await loadApp(page);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.locator('input[type=file]').setInputFiles(await gpx('loop'));
  await goOffline(page);
  await page.locator('[data-summary]').getByRole('link', { name: 'Licences', exact: true }).click();
  await expect(page).toHaveURL(`${app.origin}/legal/licences/`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Licences and data/);
  await expect(page.locator('main')).toContainText("Drafted by an AI from the project's spec. Not legal advice.");
  await page.goto(`${app.origin}/#/you/legal`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You');
  await expect(page.locator('[data-legal-links]').getByRole('link', { name: 'Licences and data', exact: true })).toBeInViewport();
  expect(problems).toEqual([]);
});

test('[TRIP-GPX-BAD] a bad file is refused in words and the route stays; a second route asks first', async ({ page }) => {
  app = await loadApp(page);
  await page.locator('input[type=file]').setInputFiles(await gpx('loop'));
  await expect(page.locator('[data-summary]')).toContainText('Heilbronn loop');
  // With a route, the file picker is in the Route step, which its Change opens (TRIP-STEPS).
  await page.locator('[data-step="route"]').getByRole('button', { name: 'Change: Route' }).click();
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

test('[TRIP-FIRST] a prepared trip with no date and no month does not count as running: the app opens on Trip, not on an empty Ahead', async ({ page }) => {
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: null });
  await page.evaluate(async () => {
    const db = await __store.openDb();
    await db.put('meta', { at: new Date(), steps: [], build: null, forecastFetchedAt: null, baselineYears: null }, 'route:preparedSteps');
  });
  await page.goto(`${app.origin}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
  await expect(page.locator('[data-summary]')).toBeVisible();
});

// The owner's screenshots of 8 Nov 2026 (finding L): the stops and their "+2" hung below the profile over "Day 1 · 38.7 km" and the
// first line of the opened list. Each project runs this in its own theme; the widths are walked here.
test('[TRIP-STOPS-ROOM] the stops on the height profile never cover the text below it, at every width from 320 px, with the list open', async ({ page }) => {
  test.setTimeout(180_000);
  app = await loadApp(page);
  const later = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  // Two routes with stops at low points of the line, where the icons hung below the profile on main.
  for (const [id, width] of [['loop', 320], ['loop', 360], ['loop', 600], ['loop', 840], ['sunday-holiday', 1024], ['sunday-holiday', 1280], ['sunday-holiday', 360]] as const) {
    await preparedTrip(page, id, { departureDate: later, places: true });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const icons = page.locator('[data-profile-stops] button');
    await expect(icons.first()).toBeVisible({ timeout: 20_000 });
    for (const open of [false, true]) {
      if (open) {
        await icons.first().click();
        await expect(page.locator('[data-stop-list]')).toBeVisible();
      }
      const found = await page.evaluate(() => {
        const box = document.querySelector('.trip-profile-box')!.getBoundingClientRect();
        const marks = [...document.querySelectorAll('[data-profile-stops] button, [data-profile-stops] .ah-icon-n, [data-profile-stops] svg')].map((e) => e.getBoundingClientRect());
        const lowest = Math.max(...marks.map((r) => r.bottom));
        const highest = Math.min(...marks.map((r) => r.top));
        // Every bit of text after the profile in the summary: the opened list, the notes, the days.
        const after: { text: string; top: number }[] = [];
        let el = document.querySelector('.trip-profile-box')!.nextElementSibling;
        while (el) {
          for (const t of [el, ...el.querySelectorAll('*')]) {
            if ((t.textContent ?? '').trim() === '' || t.closest('.visually-hidden')) continue;
            const r = t.getBoundingClientRect();
            if (r.height > 0) after.push({ text: (t.textContent ?? '').trim().slice(0, 30), top: r.top });
          }
          el = el.nextElementSibling;
        }
        return { boxTop: box.top, boxBottom: box.bottom, lowest, highest, after };
      });
      expect(found.after.length, `${id}, ${width} px`).toBeGreaterThan(0);
      expect(found.lowest, `${id}, ${width} px, list ${open}: icons inside the profile's box`).toBeLessThanOrEqual(found.boxBottom + 0.5);
      expect(found.highest, `${id}, ${width} px, list ${open}: icons inside the profile's box`).toBeGreaterThanOrEqual(found.boxTop - 0.5);
      for (const t of found.after) expect(t.top, `${id}, ${width} px, list ${open}: "${t.text}" under the icons`).toBeGreaterThanOrEqual(found.lowest - 0.5);
    }
  }
});
