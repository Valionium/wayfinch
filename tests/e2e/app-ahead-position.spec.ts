// Ahead's position in a real browser (plan Task 15): the browser's own geolocation is replaced by an init script that counts and
// answers, so the test sees every call. Nothing asks for a position without a tap.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadFixtureRoute } from '../fixtures/packs/index.ts';
import { loadApp, preparedTrip, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

type GeoMode = { mode: 'count' } | { mode: 'deny' } | { mode: 'readings'; accuracies: number[]; lat: number; lon: number };

/** Before any script of the page: geolocation that counts its calls and answers as told. */
async function fakeGeolocation(page: Page, how: GeoMode): Promise<void> {
  await page.addInitScript((h: GeoMode) => {
    const w = window as unknown as { __geoCalls: string[] };
    w.__geoCalls = [];
    const geo = {
      watchPosition(ok: PositionCallback, bad?: PositionErrorCallback) {
        w.__geoCalls.push('watchPosition');
        if (h.mode === 'deny') setTimeout(() => bad?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError), 20);
        if (h.mode === 'readings') {
          h.accuracies.forEach((accuracy, i) => setTimeout(() => ok({ coords: { latitude: h.lat, longitude: h.lon, accuracy }, timestamp: Date.now() } as unknown as GeolocationPosition), 30 * (i + 1)));
        }
        return 1;
      },
      getCurrentPosition() { w.__geoCalls.push('getCurrentPosition'); },
      clearWatch() { /* nothing to clear */ },
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => geo });
  }, how);
}

const calls = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __geoCalls: string[] }).__geoCalls);
const today = (): string => new Date().toISOString().slice(0, 10);

async function onAhead(page: Page): Promise<void> {
  await page.goto(`${app!.origin}/#/ahead`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ahead[data-ahead]')).toBeVisible();
}

test('[AH-NO-AUTO-POS] no geolocation call at start-up or on tab changes; one after the tap', async ({ page }) => {
  await fakeGeolocation(page, { mode: 'count' });
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: today(), places: true });
  await onAhead(page);
  for (const tab of ['Trip', 'Tools', 'You', 'Ahead']) await page.locator('nav.tabs').getByRole('link', { name: tab }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ahead[data-ahead]')).toBeVisible();
  expect(await calls(page)).toEqual([]);
  await page.locator('[data-update-position]').click();
  await expect.poll(() => calls(page)).toEqual(['watchPosition']);
});

test('[AH-MANUAL] with watchPosition denied, the manual picker sets the position by kilometre and by town', async ({ page }) => {
  await fakeGeolocation(page, { mode: 'deny' });
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: today(), places: true });
  await onAhead(page);
  await page.locator('[data-update-position]').click();
  await expect(page.getByText('Location is off, or not allowed for Wayfinch.')).toBeVisible();
  const picker = page.locator('#ah-picker');
  if (!(await picker.isVisible())) await page.getByRole('button', { name: 'Set position by hand' }).click();
  await picker.getByLabel('Route kilometre').fill('40');
  await picker.getByRole('button', { name: 'Use this position' }).click();
  await expect(page.locator('[data-position-line]')).toContainText(/km 40 of [\d.]+/);
  await expect(page.locator('[data-position-line]')).toContainText('set by hand');
  // On a computer the picker stays open once a position is set (spec 9.2); on a phone it closed.
  if (!(await picker.isVisible())) await page.getByRole('button', { name: 'Set position by hand' }).click();
  const towns = page.locator('#ah-picker select');
  const options = await towns.locator('option').allTextContents();
  expect(options.length).toBeGreaterThan(1);
  await towns.selectOption({ index: 1 });
  const chosen = options[1]!.match(/km ([\d.]+)\)$/)![1]!;
  await page.locator('#ah-picker').getByRole('button', { name: 'Use this position' }).click();
  await expect(page.locator('[data-position-line]')).toContainText(`km ${chosen} of`);
});

test('[AH-ROUTINE] it keeps the reading within 50 m, and the accuracy is on the position line', async ({ page }) => {
  // A point of the fixture route itself, some way along it.
  const at = (await loadFixtureRoute('heidelberg-strasbourg')).points[200]!;
  await fakeGeolocation(page, { mode: 'readings', accuracies: [400, 30], lat: at.lat, lon: at.lon });
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: today(), places: true });
  await onAhead(page);
  await page.locator('[data-update-position]').click();
  await expect(page.locator('[data-position-line]')).toContainText('±30 m');
});

test('[AH-MANUAL] at 360 px a tap the moment Ahead shows opens the picker, and it keeps a slowly typed kilometre across minute ticks and a new fix', async ({ page }) => {
  // The review of PR 47: the picker closed at each minute tick, with what was typed in it, as the position line's age moved on.
  const at = (await loadFixtureRoute('heidelberg-strasbourg')).points[200]!;
  await fakeGeolocation(page, { mode: 'readings', accuracies: [20], lat: at.lat, lon: at.lon });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.clock.install(); // the real time, flowing, which the test moves on by whole minutes
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: today(), places: true });
  await onAhead(page);
  const line = page.locator('[data-position-line]');
  await page.locator('[data-update-position]').click();
  await expect(line).toContainText('±20 m');
  // Opened again, the screen has answers and the picker closed; the tap comes as soon as the button is there.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Set position by hand' }).click();
  const picker = page.locator('#ah-picker');
  await expect(picker).toBeVisible();
  const km = picker.getByLabel('Route kilometre');
  await km.fill('');
  for (const key of ['1', '2', '.', '5']) {
    await expect(picker, `the picker still open before "${key}"`).toBeVisible();
    await km.pressSequentially(key);
    await page.clock.runFor(61_000); // a minute between keys: the line's age moves on each time
  }
  await expect(line).toContainText('min ago');
  await expect(picker).toBeVisible();
  await expect(km).toHaveValue('12.5');
  // A new fix while the picker is open: it and the typing stay.
  const before = await line.textContent();
  await page.locator('[data-update-position]').click();
  await page.clock.runFor(1_000);
  await expect(line).not.toHaveText(before ?? '');
  await expect(picker).toBeVisible();
  await expect(km).toHaveValue('12.5');
  // Used, it sets the position and closes, as on a phone before.
  await picker.getByRole('button', { name: 'Use this position' }).click();
  await expect(line).toContainText(/km 12\.5 of [\d.]+/);
  await expect(picker).toBeHidden();
});
