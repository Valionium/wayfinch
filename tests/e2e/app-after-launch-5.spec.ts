// After the launch, part 5 (owner's look at the preview, 9 November 2026), in a real browser: Bike care has no boxed "Tools" button at
// its top (the tab bar goes back; the focus lands on its title); Trip's Install button has the app's usual gap above the Your route
// card; the Route step has Remove this trip beside the upload button, the one existing action and its confirm step.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, preparedTrip, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

async function tripPage(page: Page): Promise<void> {
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg');
  await page.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-trip-line]')).toContainText('Fixture');
}

test('[AL5-CARE-TOP] Bike care has no boxed Tools button above its title; the tab bar is the way back and the title takes the focus', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  const main = page.locator('main[data-screen="tools/care"]');
  await expect(main.getByRole('heading', { name: 'Bike care', level: 2 })).toBeVisible();
  await expect(main.locator('a[href="#/tools"]')).toHaveCount(0);
  await expect(main.getByRole('link', { name: 'Tools', exact: true })).toHaveCount(0);
  // the first thing in the screen is the title, and it has the focus: a screen reader says where it is
  await expect(main.getByRole('heading', { name: 'Bike care', level: 2 })).toBeFocused();
  // the tab bar's Tools goes back
  await page.getByRole('navigation').getByRole('link', { name: 'Tools', exact: true }).click();
  await expect(page.locator('main[data-screen="tools"]')).toBeVisible();
});

test('[AL5-INSTALL-GAP] the Install button has the gap of a block above the Your route card, as every card has below it', async ({ page }) => {
  await tripPage(page);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
  const install = page.getByRole('button', { name: 'Install Wayfinch' });
  await expect(install).toBeVisible();
  const gap = await install.evaluate((el) => {
    const card = document.querySelector('.trip-side .card') as HTMLElement | null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { margin: parseFloat(cs.marginBottom), cardMargin: card ? parseFloat(getComputedStyle(card).marginBottom) : -1, below: card ? card.getBoundingClientRect().top - r.bottom : null, sameColumn: card ? card.getBoundingClientRect().left < r.right : false };
  });
  expect(gap.cardMargin).toBe(12);
  expect(gap.margin).toBeGreaterThanOrEqual(gap.cardMargin);
  // stacked (a phone): the card begins at least that far below the button
  if (gap.sameColumn && gap.below !== null) expect(gap.below).toBeGreaterThanOrEqual(12);
});

for (const width of [320, 360]) {
  test(`[AL5-REMOVE-BESIDE] ${width} px: Remove this trip stands by the upload button, both 44 px tall and wrapping without sideways scroll, and opens the one confirm step`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await tripPage(page);
    await page.getByRole('button', { name: 'Change: Route', exact: true }).click();
    const remove = page.getByRole('button', { name: 'Remove this trip', exact: true });
    await expect(remove).toHaveCount(1);
    const pick = page.locator('[data-add-route] label.file-pick');
    const [a, b] = [await pick.boundingBox(), await remove.boundingBox()];
    expect(a!.height).toBeGreaterThanOrEqual(44);
    expect(b!.height).toBeGreaterThanOrEqual(44);
    // beside it: the same row, or directly below it when the two do not fit, never further apart than one gap
    const apart = b!.x >= a!.x + a!.width - 1 ? Math.abs(b!.y - a!.y) : b!.y - (a!.y + a!.height);
    expect(apart).toBeLessThanOrEqual(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await remove.click();
    const ask = page.getByRole('alertdialog', { name: 'Remove this trip?' });
    await expect(ask).toBeVisible();
    await expect(ask.getByRole('heading')).toBeFocused();
    await expect(ask.getByRole('button', { name: 'Remove trip', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // Keep it closes the question and the focus is back on the button
    await ask.getByRole('button', { name: /Keep/ }).click();
    await expect(remove).toBeFocused();
  });
}

test('[AL5-REMOVE-NO-ROUTE] without a route there is no Remove this trip', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/trip' });
  await expect(page.locator('[data-add-route]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove this trip' })).toHaveCount(0);
});
