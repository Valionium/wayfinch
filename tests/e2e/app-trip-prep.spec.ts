// Trip prep in a real browser (design of 15 November 2026): "Before you leave" in Trip's Go step, on the real store and the real build.
// The list fits the bike and the trip, each item links where the app does it, and the ticks stay on this phone for this route.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, preparedTrip, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';
import type { StoreInPage } from './fixtures/store-page.ts';

declare const __store: StoreInPage;

const json = (path: string) => JSON.parse(readFileSync(new URL(`../../contracts/${path}`, import.meta.url), 'utf8'));
const sample = json('bike-library/sample.json') as Record<string, unknown>[];
const full = json('load-summary/full.json') as Record<string, unknown>;
// The sample's first bike: hydraulic discs, tubeless, a derailleur and a chain, cable shifting.
const SEED: Record<string, string> = {
  'loadcheck:bikeProfile': JSON.stringify(sample[0]),
  'loadcheck:bikeProfiles': JSON.stringify(sample),
  'loadcheck:summary:v1': JSON.stringify({ ...full, bikeId: sample[0]!.id }),
};
const ROUTE_NAME = 'Fixture: Heidelberg to Strasbourg';
const KEY = 'copilot:tripPrep:v1';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const inDays = (n: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(Date.now() + n * 86_400_000));

/** The app with the sample bike and a trip of `nights` nights leaving in three days, on Trip with the Go step open. */
async function goStep(page: Page, opts: { nights?: number; places?: boolean } = {}): Promise<void> {
  app = await loadApp(page);
  await page.evaluate((e) => { for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, SEED);
  await preparedTrip(page, 'heidelberg-strasbourg', { nights: opts.nights ?? 2, places: opts.places ?? false, departureDate: inDays(3) });
  // A new load: a change of the address's hash alone would keep the screen that read the store before the trip was put in.
  await page.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-trip-line]')).toContainText(ROUTE_NAME);
  await page.locator('[data-step="go"]').getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.locator('[data-prep]')).toBeVisible();
}

const items = (page: Page) => page.locator('[data-prep-item]');
const ids = async (page: Page): Promise<string[]> => items(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['prepItem']!));
const box = (page: Page, id: string) => page.locator(`[data-prep-item="${id}"] input[type=checkbox]`);
const allLocal = (page: Page): Promise<Record<string, string>> => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)!])));

test("[TRIP-PREP-ITEMS] [TRIP-PREP-LINKS] a three-day trip on the sample bike: Bike care's checks for it by name, the rest of the list, and each link goes where it is done", async ({ page }) => {
  await goStep(page);
  const prep = page.locator('[data-prep]');
  await expect(prep.getByRole('heading', { name: 'Before you leave', level: 3 })).toBeVisible();
  expect(await ids(page)).toEqual(['brakes-lever-test', 'tyres-pressure', 'chain-wear-check', 'brakes-pads-disc', 'frame-bolts-check', 'kit', 'charge', 'forecast', 'tell', 'night']);
  // the bike checks by Bike care's names, as tick boxes named by their words
  for (const name of ['Test both brakes', 'Check the tyre pressure and look the tyres over', 'Check the chain for wear', 'Check the disc brake pads and replace if worn', 'Check the main bolts']) {
    await expect(prep.getByRole('checkbox', { name, exact: true })).toBeVisible();
  }
  await expect(prep.getByRole('checkbox', { name: /rim brake pads/ })).toHaveCount(0);
  await expect(prep).not.toContainText(/\bready\b|\bsafe\b|\d+ of \d+/i);
  // Not prepared yet: En route has no Share progress, so telling someone links nowhere
  await expect(page.locator('[data-prep-item="tell"] a')).toHaveCount(0);
  // the forecast: Open Prepare this route opens step 2, its heading takes the focus
  await prep.getByRole('button', { name: 'Open Prepare this route', exact: true }).click();
  await expect(page.locator('[data-step="getready"][data-open]')).toBeVisible();
  await expect(page.locator('[data-step="getready"] h2')).toBeFocused();
  // a bike check: Bike care opens with this trip's bike chosen
  await page.locator('[data-step="go"]').getByRole('button', { name: 'Go', exact: true }).click();
  await page.getByRole('link', { name: 'In Bike care: Test both brakes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bike care', level: 2 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/tools/care');
  await expect(page.locator('.care')).toContainText(String(sample[0]!['name']));
});

test('[TRIP-PREP-ITEMS] a day ride has the two every-ride checks and no night', async ({ page }) => {
  await goStep(page, { nights: 0 });
  expect(await ids(page)).toEqual(['brakes-lever-test', 'tyres-pressure', 'kit', 'charge', 'forecast', 'tell']);
});

test('[TRIP-PREP-TICKS] a tick, by tap or by keyboard, stays after a reload for this route; only its one key is written', async ({ page }) => {
  await goStep(page);
  const before = await allLocal(page);
  expect(before[KEY]).toBeUndefined();
  await page.locator('[data-prep-item="kit"] label').click();
  await expect(box(page, 'kit')).toBeChecked();
  await box(page, 'charge').focus();
  await page.keyboard.press('Space');
  await expect(box(page, 'charge')).toBeChecked();
  await page.keyboard.press('Space');
  await expect(box(page, 'charge')).not.toBeChecked();
  await box(page, 'brakes-lever-test').check();
  const after = await allLocal(page);
  const route = await page.evaluate(async () => (await __store.readTrip())!.route.id);
  expect(JSON.parse(after[KEY]!)).toEqual({ route, ticked: ['kit', 'brakes-lever-test'] });
  expect(Object.fromEntries(Object.entries(after).filter(([k]) => k !== KEY))).toEqual(before);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-step="go"]').getByRole('button', { name: 'Go', exact: true }).click();
  await expect(box(page, 'kit')).toBeChecked();
  await expect(box(page, 'brakes-lever-test')).toBeChecked();
  await expect(box(page, 'charge')).not.toBeChecked();
});

test('[TRIP-PREP-LINKS] once Prepare this route has run, telling someone links to En route, where Share progress is', async ({ page }) => {
  await goStep(page, { places: true });
  await page.getByRole('link', { name: 'Share progress on En route', exact: true }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/ahead');
  await expect(page.getByRole('button', { name: 'Share progress', exact: true }).first()).toBeVisible();
});

test('[TRIP-PREP-FIT] keyboard and screen reader reach every box and link; 44 px targets; 320 px to wide, both themes, no sideways scroll, no accessibility violations', async ({ page }) => {
  await goStep(page);
  // Tab goes box, then its link, then the next box
  await box(page, 'brakes-lever-test').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'In Bike care: Test both brakes', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(box(page, 'tyres-pressure')).toBeFocused();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 360, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.locator('[data-prep]').scrollIntoViewIfNeeded();
      for (const el of await page.locator('[data-prep] label, [data-prep] a, [data-prep] button').all()) {
        const b = (await el.boundingBox())!;
        const what = `${scheme} ${width}: ${await el.innerText()}`;
        expect(b.height, what).toBeGreaterThanOrEqual(43.5);
        expect(b.width, what).toBeGreaterThanOrEqual(43.5);
        expect(b.x + b.width, what).toBeLessThanOrEqual(width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${scheme} ${width} px`).toBe(true);
      const results = await new AxeBuilder({ page }).include('[data-prep]').analyze();
      expect(results.violations.map((v) => `${scheme} ${width} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`)).toEqual([]);
    }
  }
});
