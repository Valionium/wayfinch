// Bike details as tiles (the owner's wish of 14 Nov 2026) in a real browser, launch build, in the four app projects (phone and laptop,
// both themes; the phone ones also at 320 px): under More details, eight tiles of a word or two, all on screen at once; a tap opens
// only that group's fields and moves the focus into it; Back to all details (or the tile again) closes it and the focus goes back to
// the tile. An old bike loads unchanged and saves unchanged. qa/bike-tiles.cjs holds the grouping on the page's own code.
// Nothing here prints the page: failures compare short texts, booleans and sizes.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const TILES = ['Brakes and gears', 'Wheels and tyres', 'Frame and fork', 'Bolts and mounts', 'Measurements', 'Weights', 'Repair kit', 'Saved bikes'];
const OLD = {
  id: 'bike_old', name: 'Old tourer', brakes: 'hydraulic-disc', brakeFluid: 'mineral', tyres: 'tubeless', valve: 'presta',
  frontTyre: '40-622', rearTyre: '42-622', drive: 'derailleur', shifting: 'cable', suspension: 'front', rackMounts: 'yes', axle: 'thru',
  padType: 'Resin pads B05S', chainType: 'KMC X11 link', hangerType: 'Hanger 38', notes: 'Long valves',
  fit: { style: 'diamond-level', size: { kind: 'letter', value: 'M' }, bolts: { st: 'yes', dt: 'yes', un: 'no' }, topTubeBag: 'yes',
    triangleCm: { top: 50, seat: 45, down: 60 }, seatGapCm: 20, barWidthCm: 40 },
  maxWeight: { v: 120, u: 'kg', includes: 'bike' }, pressure: { bikeKg: 11.5 },
};

const tile = (page: Page, name: string) => page.locator('#bikeTiles .bd-tile', { has: page.locator('.bd-name', { hasText: new RegExp(`^${name}$`) }) });
/** The ids of the form fields a rider can see now inside More details. */
const shownFields = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#bikeMoreDetails input, #bikeMoreDetails select, #bikeMoreDetails textarea')]
  .filter((el) => el.checkVisibility()).map((el) => el.id));
const sideways = (page: Page) => page.evaluate(() => [document.documentElement, document.getElementById('bikeDetailsBody')!, document.getElementById('bikeTiles')!]
  .some((el) => el.scrollWidth > el.clientWidth + 1));

async function openDetails(page: Page, hash: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`${app!.origin}/tools/bags/${hash}`, { waitUntil: 'load' });
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  // the tiles show as soon as Bike details opens (the owner, 14 Nov 2026): nothing to open first, nothing around them that can stay closed
  await expect(page.locator('#bikeTiles')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('bikeTiles')!.closest('details') === null)).toBe(true);
}

test('[BK-TILES-OPEN] the tiles open one group at a time, its fields only, the focus inside; Back to all details and the tile itself close it, the focus on the tile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  app = await loadApp(page, { launch: true, path: '/' });
  await page.evaluate(() => localStorage.setItem('loadcheck:walkthrough:v1', 'done'));
  await openDetails(page, '#bike-details=new&back=you');
  const tiles = page.locator('#bikeTiles .bd-tile');
  await expect(tiles.locator('.bd-name')).toHaveText(TILES);
  await expect(tiles.locator('.bd-state')).toHaveText([...Array(7).fill('Not set'), 'None saved']);
  for (const t of await tiles.all()) await expect(t).toHaveAttribute('aria-expanded', 'false');
  expect(await shownFields(page)).toEqual([]);   // nothing but the tiles until one is opened
  // by keyboard: Bolts and mounts opens its five questions only, the focus on the first
  const bolts = tile(page, 'Bolts and mounts');
  await bolts.focus();
  await page.keyboard.press('Enter');
  await expect(bolts).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#bikeBoltsSection')).toBeVisible();
  expect(await shownFields(page)).toEqual(['fitBoltSt', 'fitBoltDt', 'fitBoltUn', 'fitTopTube', 'bikeRackMounts']);
  await expect(page.locator('#fitBoltSt')).toBeFocused();
  for (const name of TILES.filter((n) => n !== 'Bolts and mounts')) await expect(tile(page, name)).toBeHidden();
  await page.locator('#fitBoltSt').selectOption('yes');
  // Back to all details: every tile again, the focus back on this one, which now says what is set
  await page.locator('#bikeBoltsSection .bd-back').click();
  await expect(page.locator('#bikeBoltsSection')).toBeHidden();
  await expect(bolts).toBeFocused();
  await expect(bolts).toHaveAttribute('aria-expanded', 'false');
  await expect(bolts.locator('.bd-state')).toHaveText('1 of 5 set');
  for (const name of TILES) await expect(tile(page, name)).toBeVisible();
  // Brakes and gears: the brake type, and the brake fluid with hydraulic brakes, are here, not under the repair kit
  const brakes = tile(page, 'Brakes and gears');
  await brakes.click();
  expect(await shownFields(page)).toEqual(['bikeBrakes', 'bikeDrive', 'bikeShifting']);
  await page.getByRole('combobox', { name: /^Brake type/ }).selectOption('hydraulic-disc');
  expect(await shownFields(page)).toEqual(['bikeBrakes', 'bikeBrakeFluid', 'bikeDrive', 'bikeShifting']);
  // the tile itself closes it again
  await brakes.click();
  await expect(page.locator('#bikeBrakesSection')).toBeHidden();
  await expect(brakes).toBeFocused();
  await expect(brakes.locator('.bd-state')).toHaveText('1 of 4 set');
  // a group opened by the page's own code (Kit's "Review bike details" goes to More details) keeps the tiles in step
  await page.evaluate(() => { (document.getElementById('bikeLibraryPanel') as HTMLDetailsElement).open = true; });
  await expect(tile(page, 'Saved bikes')).toHaveAttribute('aria-expanded', 'true');
  await expect(tile(page, 'Weights')).toBeHidden();
  await expect(page.locator('#bikeName')).toBeVisible();
  expect(errors).toEqual([]);
});

test('[BK-TILES-A11Y] all eight tiles on one screen at once, 44 px targets, no sideways scroll, closed and open, at each width', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/' });
  await page.evaluate(() => localStorage.setItem('loadcheck:walkthrough:v1', 'done'));
  const size = page.viewportSize()!;
  const widths = size.width === 360 ? [320, 360] : [size.width];
  for (const width of widths) {
    await page.setViewportSize({ width, height: size.height });
    await openDetails(page, '#bike-details=new&back=you');
    const tiles = page.locator('#bikeTiles .bd-tile');
    await page.locator('#bikeTiles').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const grid = (await page.locator('#bikeTiles').boundingBox())!;
    expect(grid.height, `${width} px: the grid fits one screen`).toBeLessThanOrEqual(size.height - 80);
    for (const t of await tiles.all()) {
      await expect(t, `${width} px`).toBeInViewport({ ratio: 1 });
      const box = (await t.boundingBox())!;
      expect(box.height >= 44 && box.width >= 44, `${width} px: a 44 px target`).toBe(true);
    }
    expect(await sideways(page), `${width} px: no sideways scroll`).toBe(false);
    for (const name of TILES) {
      await tile(page, name).click();
      const panel = page.locator('details.bd-group[open]');
      await expect(panel, `${width} px: ${name} open`).toHaveCount(1);
      expect(await sideways(page), `${width} px: ${name} open, no sideways scroll`).toBe(false);
      await expect(page.locator('details.bd-group[open] .bd-back')).toBeVisible();
      await page.locator('details.bd-group[open] .bd-back').click();
      await expect(tile(page, name)).toBeFocused();
    }
  }
});

test('[BK-TILES-SAME] an old bike loads unchanged into the tiles and saves unchanged', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/' });
  await page.evaluate((bike) => {
    localStorage.setItem('loadcheck:walkthrough:v1', 'done');
    localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([bike]));
  }, OLD);
  await openDetails(page, '#bike-details=bike_old&back=you');
  const before = await page.evaluate('JSON.stringify(readBikeProfileEditor())') as string;
  expect(JSON.parse(before)).toMatchObject({ brakes: 'hydraulic-disc', brakeFluid: 'mineral', tyres: 'tubeless', suspension: 'front', axle: 'thru' });
  await expect(page.locator('#bikeTiles .bd-state')).toHaveText(['4 of 4 set', '5 of 5 set', '2 of 2 set', '5 of 5 set', '5 of 5 set', '3 of 3 set', '4 of 4 set', '1 saved']);
  // every group shows the bike's own answers
  await tile(page, 'Brakes and gears').click();
  await expect(page.locator('#bikeBrakeFluid')).toHaveValue('mineral');
  await tile(page, 'Brakes and gears').click();
  await tile(page, 'Wheels and tyres').click();
  await expect(page.locator('#bikeRearTyre')).toHaveValue('42-622');
  await tile(page, 'Wheels and tyres').click();
  await tile(page, 'Bolts and mounts').click();
  await expect(page.locator('#fitBoltUn')).toHaveValue('no');
  await tile(page, 'Bolts and mounts').click();
  // opening and closing changes nothing; Update saved bike stores the same answers
  expect(await page.evaluate('JSON.stringify(readBikeProfileEditor())')).toBe(before);
  await page.locator('#bikeSave').click();
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('loadcheck:bikeProfiles') ?? '[]') as { id: string }[]).find((b) => b.id === 'bike_old'))).toEqual(JSON.parse(before));
  const stored = await page.evaluate(() => (JSON.parse(localStorage.getItem('loadcheck:bikeProfiles') ?? '[]') as Record<string, unknown>[])[0]);
  expect(stored).toMatchObject({ brakes: 'hydraulic-disc', brakeFluid: 'mineral', tyres: 'tubeless', valve: 'presta', suspension: 'front', rackMounts: 'yes', axle: 'thru', notes: 'Long valves' });
});
