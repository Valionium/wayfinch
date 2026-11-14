// Other nights planned around the rider's own stops (the owner's rulings of 14 November 2026): a stop picked on Trip stays when the
// nights change, the line beside the nights names it and says where to change it, and the focus stays where the rider typed.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, preparedTrip, removeBuilds, withStore } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';
import type { StoreInPage } from './fixtures/store-page.ts';

declare const __store: StoreInPage;

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const later = (): string => new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

/** The stops as the store holds them (the real store, put into the page as the other app tests do). */
const stopsNow = (page: Page): Promise<{ name: string | null; by: string }[]> =>
  page.evaluate(async () => ((await __store.readTrip())?.stops?.days ?? []).map((d) => ({ name: d.name, by: d.by })));

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  return problems;
}

test('[TRIP-STOPS-KEEP] a stop the rider picked stays when the nights change: the line names it and where to change it, the focus stays on the nights', async ({ page }) => {
  const problems = watch(page);
  app = await loadApp(page);
  await page.evaluate(() => localStorage.setItem('copilot:settings', JSON.stringify({ nights: 2, pace: 'sporting', updatedAt: new Date(Date.now() - 60_000).toISOString() })));
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: later(), places: true, nights: 2 });
  await page.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const summary = page.locator('[data-summary]');
  await expect(summary).toBeVisible({ timeout: 20_000 });
  await withStore(page);

  // Day 1's stop, picked by the rider: another place near its end when there is one, else No stop.
  const change = summary.locator('[data-stop-change="1"]');
  await expect(change).toBeVisible({ timeout: 20_000 });
  await change.click();
  const choices = summary.locator('[data-stop-choices="1"] button');
  await expect(choices.last()).toBeVisible();
  const other = summary.locator('[data-stop-choices="1"] button:not([aria-current="true"])');
  await other.first().click();
  await expect(change).toBeFocused();
  // the rider's pick as the store holds it (the day's label follows once Trip has read the trip again)
  await expect.poll(async () => (await stopsNow(page)).filter((d) => d.by === 'rider').length, { timeout: 20_000 }).toBe(1);
  const name = (await stopsNow(page)).find((d) => d.by === 'rider')!.name ?? 'No stop';
  if (name !== 'No stop') await expect(change).toHaveAttribute('aria-label', `Change stop for day 1, now ${name}`);

  // The nights, by keyboard: 2 → 3.
  const nights = page.locator('#trip-nights');
  if (!(await nights.isVisible())) {
    await page.getByRole('button', { name: 'Change: Route', exact: true }).click();
    // the opened step's heading takes the focus first (review of PR 73, I4); only then does the rider move on to the nights
    await expect(page.locator('[data-step="route"] h2')).toBeFocused();
  }
  await nights.focus();
  await nights.fill('3');
  await nights.press('Enter');
  const line = page.locator('[data-nights-stops]');
  await expect(line).toHaveAttribute('role', 'status');
  await expect(line).toContainText(new RegExp(`^New stops for 3 nights, keeping yours: ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(night \\d\\)`));
  await expect(line).toContainText('To change a stop, use Change stop under its day in Your route.');
  await expect(nights).toBeFocused();

  // Trip's days are planned again around it: three nights, and the rider's stop is still one of them.
  await expect.poll(async () => (await stopsNow(page)).length, { timeout: 20_000 }).toBe(3);
  const after = await stopsNow(page);
  expect(after.filter((d) => d.by === 'rider').map((d) => d.name ?? 'No stop')).toEqual([name]);
  if (name !== 'No stop') await expect(summary.locator(`[data-stop-change][aria-label$="now ${name}"]`)).toHaveCount(1);
  expect(problems).toEqual([]);
});
