// Small shell polish from the sweep of 14 Nov 2026: a skip link, plain links in the accent, the subtitle that keeps its room.
import { expect, test } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());
test.use({ serviceWorkers: 'block' });

test('[SHELL-SKIP] the first Tab stop is Skip to the tabs; Enter puts the focus on the current tab and leaves the address alone; a tap on plain text never moves the page', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/trip' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
  const skip = page.getByRole('link', { name: 'Skip to the tabs' });
  await expect(skip).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  const box = (await skip.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  await page.keyboard.press('Enter');
  await expect(page.locator('nav.tabs [aria-current="page"]')).toBeFocused();
  expect(page.url()).toBe(`${app.origin}/#/trip`);
});

for (const width of [360, 700, 1280]) {
  test(`[SHELL-SKIP] ${width} px: a click on plain text keeps the scroll and puts no focus on the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    app = await loadApp(page, { launch: true, path: '/#/you' });
    await expect(page.locator('[data-you-loaded]')).toBeVisible();
    await page.locator('main p.muted').first().click();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.id !== 'main')).toBe(true);
  });
}

test('[SHELL-LINK] a plain link takes the accent colour of the theme, visited or not', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/you' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You');
  const colours = await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = '#/you';
    a.textContent = 'plain';
    document.querySelector('main')!.append(a);
    return { link: getComputedStyle(a).color, accent: getComputedStyle(document.documentElement).getPropertyValue('--blaze').trim() };
  });
  const probe = await page.evaluate((accent) => { const d = document.createElement('i'); d.style.color = accent; document.body.append(d); return getComputedStyle(d).color; }, colours.accent);
  expect(colours.link).toBe(probe);
});

for (const tab of ['trip', 'ahead']) {
  test(`[SHELL-SUB-STILL] ${tab}: what is below the subtitle does not move when its words arrive, at 320 to 1280 px`, async ({ page }) => {
    let gate: Promise<void> = Promise.resolve();
    await page.route(/\/assets\/tab-top[^/]*\.js$/, async (route) => { await gate; await route.continue(); });
    app = await loadApp(page, { launch: true, path: `/#/${tab}` });
    const below = (): Promise<number> => page.evaluate(() => (document.querySelector('.tab-sub')!.nextElementSibling as HTMLElement).getBoundingClientRect().top);
    for (const width of [320, 360, 380, 382, 384, 386, 388, 390, 392, 394, 396, 398, 400, 404, 408, 412, 416, 420, 480, 598, 600, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      let open!: () => void;
      gate = new Promise<void>((resolve) => { open = resolve; });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const hold = page.locator(`.tab-sub[data-tab-sub="${tab}"]:empty`);
      await expect(hold).toHaveCount(1);
      expect(await hold.textContent()).toBe('');
      const held = await below();
      open();
      await expect(page.locator(`.tab-sub[data-tab-sub="${tab}"]`)).toHaveText(/\S/);
      expect(Math.abs((await below()) - held), `${tab} at ${width}: under half a pixel`).toBeLessThan(0.5);
    }
  });
}
