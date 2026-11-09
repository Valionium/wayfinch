// After the launch, part 5 (owner's look at the preview, 9 November 2026), in a real browser: Bike care has no boxed "Tools" button at
// its top (the tab bar goes back; the focus lands on its title); Trip's Install button has the app's usual gap above the Your route
// card; the Route step's done row has Remove this trip next to Change (owner's correction, 9 November 2026: not beside the upload
// button), the one existing action and its confirm step.
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

for (const theme of ['light', 'dark'] as const) for (const width of [320, 360, 1280]) {
  test(`[AL5-REMOVE-BESIDE] ${theme} ${width} px: Remove this trip stands next to Change in the done Route row, both 44 px tall, wrapping without sideways scroll, and opens the one confirm step below the row`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.emulateMedia({ colorScheme: theme });
    await tripPage(page);
    const remove = page.getByRole('button', { name: 'Remove this trip', exact: true });
    const change = page.getByRole('button', { name: 'Change: Route', exact: true });
    await expect(remove).toHaveCount(1);
    await expect(change).toBeVisible();
    const head = page.locator('[data-step="route"] .trip-step-head');
    await expect(head.getByRole('button', { name: 'Remove this trip', exact: true })).toBeVisible();
    const [a, b, h] = [await change.boundingBox(), await remove.boundingBox(), await head.boundingBox()];
    expect(a!.height).toBeGreaterThanOrEqual(44);
    expect(b!.height).toBeGreaterThanOrEqual(44);
    expect(a!.width).toBeGreaterThanOrEqual(44);
    // next to Change: the same row, or directly below it when the two do not fit, never further apart than one gap
    const apart = b!.x >= a!.x + a!.width - 1 || a!.x >= b!.x + b!.width - 1 ? Math.abs(b!.y - a!.y) : Math.abs(b!.y - (a!.y + a!.height)) ;
    expect(apart).toBeLessThanOrEqual(12);
    // the row's summary line is still under it, and nothing leaves the row
    for (const box of [a!, b!]) { expect(box.x).toBeGreaterThanOrEqual(h!.x - 1); expect(box.x + box.width).toBeLessThanOrEqual(h!.x + h!.width + 1); }
    // a different action: not the same look as Change
    const look = await page.evaluate(() => {
      const [c, r] = ['Change: Route', 'Remove this trip'].map((n) => [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') ?? x.textContent) === n)!);
      return [getComputedStyle(c!).color, getComputedStyle(r!).color];
    });
    expect(look[0]).not.toBe(look[1]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await remove.click();
    const ask = page.getByRole('alertdialog', { name: 'Remove this trip?' });
    await expect(ask).toBeVisible();
    await expect(ask.getByRole('heading')).toBeFocused();
    await expect(ask.getByRole('button', { name: 'Remove trip', exact: true })).toBeVisible();
    // below the row, the width of the step's body
    const q = await ask.boundingBox();
    expect(q!.y).toBeGreaterThanOrEqual(Math.max(a!.y + a!.height, b!.y + b!.height) - 1);
    expect(q!.width).toBeGreaterThanOrEqual(h!.width - 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // Keep it closes the question and the focus is back on the button
    await ask.getByRole('button', { name: /Keep/ }).click();
    await expect(remove).toBeFocused();
    // keyboard: Change is reached first, Remove this trip next
    await change.focus();
    await page.keyboard.press('Tab');
    await expect(remove).toBeFocused();
  });
}

test('[AL5-REMOVE-OPEN] with the Route step open (Change), Remove this trip is not beside the upload button', async ({ page }) => {
  await tripPage(page);
  await page.getByRole('button', { name: 'Change: Route', exact: true }).click();
  await expect(page.locator('[data-add-route] label.file-pick')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove this trip', exact: true })).toHaveCount(0);
});

test('[AL5-REMOVE-NO-ROUTE] without a route there is no Remove this trip', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/trip' });
  await expect(page.locator('[data-add-route]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove this trip' })).toHaveCount(0);
});
