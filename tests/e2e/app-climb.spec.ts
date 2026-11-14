// Climb check on Trip (the owner's idea of 14 November 2026): folded under the days, opened from the keyboard, offline.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fixtureGpx } from '../fixtures/gpx.ts';
import { goOffline, loadApp, preparedTrip, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  return problems;
}

const later = (): string => new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

async function openTrip(page: Page, id: string): Promise<void> {
  await preparedTrip(page, id, { departureDate: later() });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${app!.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-summary]')).toBeVisible({ timeout: 20_000 });
}

async function noSideways(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test('[CC-TRIP] a route with climbs: Climb check is folded under the days, opens and closes from the keyboard, offline, at 320 px', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  app = await loadApp(page);
  await openTrip(page, 'alpine-pass');
  // Offline after a reload: the worker holds the app and Climb check's chunk.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-summary]')).toBeVisible({ timeout: 20_000 });

  const box = page.locator('[data-summary] [data-climb-check]');
  const button = box.getByRole('button', { name: 'Climb check', exact: true });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(box).toContainText('The climbs of this route, the hardest first, with time estimates.');
  await expect(box.getByRole('list')).toHaveCount(0);
  // Under the days, not above them.
  const days = (await page.locator('[data-summary] .trip-days').boundingBox())!;
  expect((await button.boundingBox())!.y).toBeGreaterThan(days.y);
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(button).toBeFocused();
  const list = box.getByRole('list', { name: 'Climbs, the hardest first' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  const item = list.getByRole('listitem').first();
  await expect(item).toContainText(/^Day 1 · km 0 to 36\.2/);
  await expect(item).toContainText('36.2 km · 1,630 m up · average 4.5% · steepest 500 m 8.7%');
  await expect(item).toContainText(/About \d h( \d+ min)? of riding \(estimate\)/);
  await expect(item).toContainText('Steep in places: a slow climb in low gears with a loaded bike.');
  await expect(box).toContainText("Estimates from the route's heights and your flat speed of 25 km/h with a loaded bike. Short ramps can be steeper than these figures, and heights from a phone recording or a map can make a stretch look steeper than it is (bridges, tunnels).");
  await noSideways(page);
  const results = await new AxeBuilder({ page }).include('[data-climb-check]').analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`)).toEqual([]);

  await page.keyboard.press('Space');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(box.getByRole('list')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('[CC-NONE] a flat route: Climb check says plainly there is no climb', async ({ page }) => {
  const problems = watch(page);
  app = await loadApp(page);
  await openTrip(page, 'heidelberg-strasbourg');
  const box = page.locator('[data-summary] [data-climb-check]');
  await box.getByRole('button', { name: 'Climb check', exact: true }).click();
  await expect(box).toContainText('No climb on this route gains 100 m at 3% or more.');
  await expect(box.getByRole('list')).toHaveCount(0);
  await noSideways(page);
  expect(problems).toEqual([]);
});

test('[CC-NOHEIGHT] a route without heights: no guess, Climb check points to Prepare this route', async ({ page }) => {
  const problems = watch(page);
  app = await loadApp(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator('input[type=file]').setInputFiles({
    name: 'loop.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(await fixtureGpx('loop', { heights: false })),
  });
  const box = page.locator('[data-summary] [data-climb-check]');
  await box.getByRole('button', { name: 'Climb check', exact: true }).click();
  await expect(box).toContainText("Climb check needs the route's heights. Prepare this route looks them up.");
  await expect(box.getByRole('list')).toHaveCount(0);
  await expect(box).not.toContainText('estimate');
  expect(problems).toEqual([]);
});
