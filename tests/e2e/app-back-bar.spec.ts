// The one top bar "← Back to Wayfinch" (owner's list of 7 Nov 2026, items 8 and 9) in a real browser, launch build, in the four app
// projects (phone and laptop, both themes): the tyre tool, a legal page and the bag planner have the same bar; it slides away while the
// rider scrolls down and is back as soon as they scroll up; the keyboard always reaches it; it never covers what is below it; no sideways
// scroll; offline too. Nothing here prints a page.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const PAGES = [
  { path: '/#/tools/tyre', back: '#/tools', ready: '.tyre' },
  { path: '/legal/privacy/', back: '/#/you', ready: '.lg-main' },
  { path: '/tools/bags/', back: '/#/tools', ready: '#rigBox' },
] as const;

/** The bar's place on screen: how much of it is in the window (0 to 1). */
const shown = (bar: Locator) => bar.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height;
});
/** Scrolls by the rider's own wheel, in steps, and waits for the page to settle. */
async function wheel(page: Page, dy: number): Promise<void> {
  const steps = Math.ceil(Math.abs(dy) / 120);
  for (let i = 0; i < steps; i += 1) await page.mouse.wheel(0, Math.sign(dy) * 120);
  await page.waitForTimeout(400);
}

for (const where of PAGES) {
  test(`[WF-BAR] ${where.path}: the one "← Back to Wayfinch" bar slides away while scrolling down, comes back on scroll up and with the keyboard, offline too`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    app = await loadApp(page, { launch: true, path: '/' });
    await page.evaluate(() => { localStorage.setItem('loadcheck:walkthrough:v1', 'done'); localStorage.setItem('copilot:moved-card', 'seen'); });
    // a short window on the laptop too, so every page scrolls
    const size = page.viewportSize()!;
    if (size.height > 640) await page.setViewportSize({ width: size.width, height: 480 });
    for (const offline of [false, true]) {
      if (offline) {
        await page.evaluate(async () => { await navigator.serviceWorker.ready; });
        await page.reload({ waitUntil: 'load' });
        await context.setOffline(true);
      }
      await page.goto(`${app.origin}${where.path}`, { waitUntil: 'load' });
      await expect(page.locator(where.ready).first()).toBeVisible({ timeout: 20_000 });
      const bar = page.locator('.wf-bar');
      await expect(bar).toHaveCount(1);
      const link = bar.locator('a').first();
      await expect(link).toHaveText('← Back to Wayfinch');
      expect(await link.getAttribute('href')).toBe(where.back);
      await expect(link).toBeInViewport({ ratio: 1 });
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      // the rider scrolls down, mid-page: the bar slides away
      // (short of the page's end, where it comes back: nothing more to read there)
      const room = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      expect(room, `${where.path} scrolls`).toBeGreaterThan(700);
      await page.mouse.move(size.width / 2, 300);
      await wheel(page, Math.min(900, room - 360));
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(300);
      await expect.poll(() => shown(bar), `${where.path} away`).toBe(0);
      // still in the page for a screen reader: not hidden, the link a link
      await expect(page.getByRole('link', { name: 'Back to Wayfinch' })).toHaveCount(1);
      // a little scroll up: back at once, whole
      await wheel(page, -120);
      await expect.poll(() => shown(bar), `${where.path} back`).toBe(1);
      // never over the text: what is just below the bar is the page, and the bar is solid
      const below = await bar.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + 40, r.bottom + 4);
        return { outside: !!hit && !el.contains(hit), bg: getComputedStyle(el).backgroundColor };
      });
      expect(below.outside).toBe(true);
      expect(below.bg).not.toMatch(/rgba\(.*, 0\)|transparent/);
      // down again, then the keyboard: the focus brings it back
      await wheel(page, 240);
      await expect.poll(() => shown(bar)).toBe(0);
      await link.focus();
      await expect.poll(() => shown(bar), `${where.path} focused`).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });
}

test('[WF-BAR] the bar clears the notch on Wayfinch\'s own screens (viewport-fit cover, the inset in its padding), as on the legal pages', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/tyre' });
  await expect(page.locator('.wf-bar-app')).toBeVisible();
  const css = await page.evaluate(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } }).filter((t) => t.includes('.wf-bar-app')).join(' '));
  expect(css).toContain('env(safe-area-inset-top)');
});
