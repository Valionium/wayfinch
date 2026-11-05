// The way back from the bag planner's Bike details (owner's try-out, 5 November 2026): opened from Wayfinch's You (or Trip, or Tools),
// whatever the rider does there, the cross, Escape and the browser's own Back return to the place they came from, with the bike's
// changes showing, and leave no extra step in the history. Real links and real history, online and offline, in the four app projects.
// Nothing here prints the page: failures compare booleans, counts and short values.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const BLUE = { id: 'bike_blue', name: 'Blue tourer', frontTyre: '40-622', rearTyre: '40-622', fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' } }, look: { colour: '#2563b8', bars: 'drop', ebike: false } };
const TOWN = { id: 'bike_town', name: 'Town bike', frontTyre: '37-622', rearTyre: '37-622', fit: { style: 'step-through', size: { kind: 'letter', value: 'M' } }, look: { colour: '#2f7d4f', bars: 'flat', ebike: false } };
const BIKES = { 'loadcheck:bikeProfile': JSON.stringify(BLUE), 'loadcheck:bikeProfiles': JSON.stringify([BLUE, TOWN]) };

/** Wayfinch at `hash` with the plan's bike and a second saved one, as a rider has them. */
async function wayfinch(page: Page, hash: string): Promise<void> {
  app = await loadApp(page, { launch: true, path: `/${hash}` });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, BIKES);
  await page.reload({ waitUntil: 'load' });
}
const youBike = (page: Page, name: string) => page.locator('li.you-bike', { hasText: name });
/** The bag planner's Bike details, opened by a real tap on a link in Wayfinch. */
async function tapInto(page: Page, link: ReturnType<Page['locator']>): Promise<void> {
  await link.click();
  await page.waitForURL(/\/tools\/bags\//);
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await expect(page.locator('#lookSwatches')).toBeVisible();
}
/** More details, where the name and Save bike for next time / Update saved bike are. */
async function moreDetails(page: Page): Promise<void> {
  await page.evaluate(() => { (document.getElementById('bikeMoreDetails') as HTMLDetailsElement).open = true; (document.getElementById('bikeLibraryPanel') as HTMLDetailsElement).open = true; });
}
const swatch = (page: Page, name: string) => page.locator('#lookSwatches label', { hasText: new RegExp(`^${name}$`) });
/** Back on You, at the bikes: the Bikes card is on screen. */
async function onYouAtBikes(page: Page): Promise<void> {
  await page.waitForURL((u) => u.pathname === '/' && u.hash === '#/you');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You');
  await expect(page.locator('[data-bikes]')).toBeInViewport();
}

test('[BK-RETURN] from You: Edit, a new colour, Use this bike for this plan, Update saved bike, then the cross: You at the bikes, the change shown, no extra step back', async ({ page }) => {
  await wayfinch(page, '#/you');
  await expect(youBike(page, 'Town bike')).toBeVisible();
  const before = await page.evaluate(() => history.length);
  await tapInto(page, youBike(page, 'Town bike').getByRole('link', { name: /Edit/ }));
  await swatch(page, 'Red').click();
  await page.locator('#bikeUseShown').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!).id)).toBe('bike_town');
  await moreDetails(page);
  await page.locator('#bikeSave').click();
  await expect(page.locator('#bikeSave')).toHaveText('Update saved bike');
  await page.locator('#bikeDetailsClose').click();
  await onYouAtBikes(page);
  const town = youBike(page, 'Town bike');
  await expect(town.locator('.bk-paint.bk-frame').first()).toHaveAttribute('stroke', '#c62f2a');
  await expect(town).toContainText('In your plan');
  // the bag planner is ahead in the history, not behind: one step back does not open it again
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  await page.goBack();
  expect(new URL(page.url()).pathname).not.toBe('/tools/bags/');
});

test('[BK-RETURN] from You: Add a bike, named and saved, then Escape: You at the bikes lists it in its colour', async ({ page }) => {
  await wayfinch(page, '#/you');
  await tapInto(page, page.getByRole('link', { name: 'Add a bike' }));
  await moreDetails(page);
  await page.locator('#bikeName').fill('Gravel');
  await swatch(page, 'Orange').click();
  await page.locator('#bikeSave').click();
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('loadcheck:bikeProfiles')!) as { name: string }[]).map((b) => b.name))).toContain('Gravel');
  await page.keyboard.press('Escape');
  await onYouAtBikes(page);
  await expect(youBike(page, 'Gravel').locator('.bk-paint.bk-frame').first()).toHaveAttribute('stroke', '#e46b1f');
});

test('[BK-RETURN] from You: a new colour, then the browser\'s Back: You at the bikes, the change shown', async ({ page }) => {
  await wayfinch(page, '#/you');
  await tapInto(page, youBike(page, 'Blue tourer').getByRole('link', { name: /Edit/ }));
  await swatch(page, 'Purple').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!).look.colour)).toBe('#6b3fa0');
  await page.goBack();
  await onYouAtBikes(page);
  await expect(youBike(page, 'Blue tourer').locator('.bk-paint.bk-frame').first()).toHaveAttribute('stroke', '#6b3fa0');
});

test('[BK-RETURN] from Trip: Make it yours, a new colour, the cross: Trip, its drawing in the new colour; from Tools the same', async ({ page }) => {
  await wayfinch(page, '#/trip');
  await tapInto(page, page.locator('a.bike-tap').first());
  await swatch(page, 'Yellow').click();
  await page.locator('#bikeDetailsClose').click();
  await page.waitForURL((u) => u.pathname === '/' && u.hash === '#/trip');
  await expect(page.locator('.bike-large svg.bk .bk-paint.bk-frame').first()).toHaveAttribute('stroke', '#f1c232');
  await page.goto(`${app!.origin}/#/tools`, { waitUntil: 'load' });
  await tapInto(page, page.locator('a.bike-tap').first());
  await swatch(page, 'Teal').click();
  await page.locator('#bikeDetailsClose').click();
  await page.waitForURL((u) => u.pathname === '/' && u.hash === '#/tools');
  await expect(page.locator('a.bike-tap svg.bk .bk-paint.bk-frame').first()).toHaveAttribute('stroke', '#1f7f80');
});

test('[BK-RETURN] offline, as the installed app: Edit, a new colour, the cross, then Back from another visit: You each time, never the bag planner', async ({ page, context }) => {
  // the home-screen app, as the browser reports it
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (/display-mode:\s*standalone/.test(q)
      ? ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList)
      : real(q));
  });
  await wayfinch(page, '#/you');
  expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await tapInto(page, youBike(page, 'Town bike').getByRole('link', { name: /Edit/ }));
  await swatch(page, 'Pink').click();
  await page.locator('#bikeDetailsClose').click();
  await onYouAtBikes(page);
  await expect(youBike(page, 'Town bike').locator('.bk-paint.bk-frame').first()).toHaveAttribute('stroke', '#d6619b');
  // a second visit, left by the browser's Back this time
  await tapInto(page, youBike(page, 'Town bike').getByRole('link', { name: /Edit/ }));
  await swatch(page, 'Navy').click();
  await page.goBack();
  await onYouAtBikes(page);
  await expect(youBike(page, 'Town bike').locator('.bk-paint.bk-frame').first()).toHaveAttribute('stroke', '#1f2f55');
});
