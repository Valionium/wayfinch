// The bike line at the top of Tools in a real browser (sub-project 11, group 2): a long bike name never widens the page, and the select is
// a real touch target, at 320 and 360 px, in both themes (the projects give the theme).
import { expect, test } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const LONG = 'My very long touring bicycle with the Rohloff hub and the dynamo lights and a name that goes on and on and on';
const mk = (id: string, name: string) => ({ id, name, look: { colour: null, bars: 'drop', ebike: null }, tyres: 'tubeless', frontTyre: '40-622', rearTyre: '40-622', pressure: { wheel: '700c', rim: 'hooked', rimMm: 23 } });
const BIKES = [mk('bike_a', LONG), mk('bike_b', 'Gravel'), mk('bike_c', 'Commuter')];

for (const width of [320, 360]) {
  test(`[TB-LINE-FIT] ${width} px: a 100-character bike name leaves no sideways scroll, and the Bike select is at least 44 px tall and inside the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    app = await loadApp(page, { launch: true, path: '/#/tools' });
    await page.evaluate((b) => { localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify(b)); localStorage.setItem('loadcheck:bikeProfile', JSON.stringify(b[0])); }, BIKES);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const select = page.locator('#tools-bike');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('bike_a');
    const box = (await select.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // One saved bike with that name, as text: it wraps.
    await page.evaluate((b) => { localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([b])); }, BIKES[0]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.bike-line').first()).toContainText('Bike:');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
