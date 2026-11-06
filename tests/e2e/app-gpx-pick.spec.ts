// The GPX pickers on an iPhone (owner's check, 6 November 2026): iOS turns a file input's accept list into its own file types and
// has none for .gpx, so with ".gpx,application/gpx+xml,…" every GPX file was greyed out. Both pickers (Trip's and the bag planner's)
// now take any file, and the reading itself refuses what is not a GPX, with the same words as before. WebKit walks the Trip path in
// the smoke set (app-smoke.spec.ts). Nothing here prints the page: failures compare booleans, counts and short values.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fixtureGpx } from '../fixtures/gpx.ts';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const UNREADABLE = 'That did not read as a GPX track or route with valid coordinates.';
// A 1 x 1 PNG, as a photo from the camera roll would be.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const notGpx = [
  { name: 'export.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"loadcheck","v":1}') },
  { name: 'IMG_0001.png', mimeType: 'image/png', buffer: PNG },
  { name: 'empty.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.alloc(0) },
];
const asGpx = async (name: string, mimeType: string) => ({ name, mimeType, buffer: Buffer.from(await fixtureGpx('loop')) });
const draftReady = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true', undefined, { timeout: 30_000 });

test('[TRIP-GPX-IOS] Trip: the picker names no file types, so iOS lets the rider choose a .gpx; a JSON file, a photo and an empty file are refused in words; a GPX named .xml or with no extension is read', async ({ page }) => {
  app = await loadApp(page);
  const input = page.locator('[data-add-route] input[type=file]');
  expect(await input.getAttribute('accept')).toBeNull();
  for (const file of notGpx) {
    await input.setInputFiles(file);
    await expect(page.getByRole('alert').filter({ hasText: UNREADABLE }), file.name).toBeVisible();
    await expect(page.locator('[data-summary]')).toHaveCount(0);
  }
  await input.setInputFiles(await asGpx('route.xml', 'application/xml'));
  await expect(page.locator('[data-summary]')).toContainText('Heilbronn loop');
  // a second one with no extension and no type, as some apps hand files over, reads too (it asks before it replaces)
  await app.close();
  app = await loadApp(page);
  await page.locator('[data-add-route] input[type=file]').setInputFiles(await asGpx('route', ''));
  await expect(page.locator('[data-summary]')).toContainText('Heilbronn loop');
});

test('[TRIP-GPX-IOS] the bag planner: its GPX picker names no file types either; the same files are refused or read; its JSON import keeps its own types', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await draftReady(page);
  const input = page.locator('#gpxFile');
  expect(await input.getAttribute('accept')).toBeNull();
  // the JSON import: iOS knows .json (public.json), so its list stays and its files are not greyed out
  const source = await page.evaluate(() => fetch('/tools/bags/').then((r) => r.text()));   // only tested, never printed
  expect(/<input type="file" id="impFile"[^>]* accept="application\/json,\.json"/.test(source)).toBe(true);
  for (const file of notGpx) {
    await input.setInputFiles(file);
    await expect(page.locator('#gpxMsg'), file.name).toHaveText(UNREADABLE);
    expect(await page.evaluate('S.gpx === null || S.gpx === undefined'), file.name).toBe(true);
  }
  for (const file of [await asGpx('route.xml', 'text/xml'), await asGpx('route', '')]) {
    await page.evaluate('S.gpx && clearGPX()');
    await input.setInputFiles(file);
    await expect(page.locator('#gpxMsg'), file.name).toContainText('points');
    expect(await page.evaluate('Boolean(S.gpx)'), file.name).toBe(true);
  }
});
