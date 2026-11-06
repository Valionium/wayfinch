// The legal pages on a phone (owner's iPhone check, 6 November 2026): tables scroll sideways inside their own box, the page never
// does, and "Wayfinch" (the way back) stays on screen while reading. Nothing here prints a page.
import { expect, test } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const PAGES = ['/legal/imprint/', '/legal/privacy/', '/legal/licences/'];

for (const width of [320, 360]) {
  test(`[LEGAL-PHONE-FIT] at ${width} px no legal page scrolls sideways, and every table scrolls inside its own box`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    app = await loadApp(page);
    for (const path of PAGES) {
      await page.goto(`${app.origin}${path}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} page width`).toBe(true);
      const boxes = await page.evaluate(() => [...document.querySelectorAll('table')].map((t) => {
        const box = t.parentElement as HTMLElement;
        const before = box.scrollLeft;
        box.scrollLeft = 40;
        const moved = box.scrollLeft !== before;
        box.scrollLeft = before;
        const hint = getComputedStyle(box, '::before').content;
        return { own: box.classList.contains('lg-table-wrap'), overflows: box.scrollWidth > box.clientWidth, moved, hint, inside: box.getBoundingClientRect().right <= window.innerWidth + 0.5 };
      }));
      for (const b of boxes) {
        expect(b.own, `${path} table has its box`).toBe(true);
        expect(b.inside, `${path} box stays inside the page`).toBe(true);
        expect(b.overflows && b.moved, `${path} the table scrolls inside its box`).toBe(true);
        expect(b.hint !== 'none' && b.hint !== 'normal' && b.hint.length > 2, `${path} a visible hint says it scrolls`).toBe(true);
      }
      // Keyboard and screen readers: the box is a focusable named region, and its table keeps its header cells.
      const reach = await page.evaluate(() => [...document.querySelectorAll('.lg-table-wrap')].map((w) => ({
        focusable: w.getAttribute('tabindex') === '0', region: w.getAttribute('role') === 'region', named: (w.getAttribute('aria-label') ?? '').length > 0, heads: w.querySelectorAll('th').length > 0,
      })));
      for (const r of reach) expect(r).toEqual({ focusable: true, region: true, named: true, heads: true });
    }
  });
}

test('[LEGAL-PHONE-FIT] a table cell does not break words into pieces at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  app = await loadApp(page);
  await page.goto(`${app.origin}/legal/privacy/`, { waitUntil: 'domcontentloaded' });
  const narrowest = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.lg-table-wrap th')].map((c) => c.getBoundingClientRect().width)));
  expect(narrowest).toBeGreaterThanOrEqual(120);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`[LEGAL-PHONE-BACK] in the ${scheme} theme the way back stays on screen after scrolling to the bottom, covers no text, and works offline`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 360, height: 640 });
    app = await loadApp(page);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
    await page.evaluate(() => navigator.serviceWorker.ready);
    for (const path of PAGES) {
      await page.goto(`${app.origin}${path}`, { waitUntil: 'domcontentloaded' });
      const back = page.getByRole('link', { name: /Wayfinch/ }).first();
      await expect(back).toBeInViewport();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(() => page.evaluate(() => window.scrollY), `${path} scrolled`).toBeGreaterThan(300);
      await expect(back, `${path} after scrolling down`).toBeInViewport({ ratio: 1 });
      const box = (await back.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.height).toBeGreaterThanOrEqual(44);
      const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.lg-top')!).backgroundColor);
      expect(bg, 'the bar is solid, so text never shows through it').not.toMatch(/rgba\(.*, 0\)|transparent/);
    }
    await page.context().setOffline(true);
    await page.goto(`${app.origin}/legal/privacy/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByRole('link', { name: /Wayfinch/ }).first()).toBeInViewport({ ratio: 1 });
  });
}

test('[LEGAL-PHONE-BACK] on an iPhone the bar clears the notch (viewport-fit cover, the inset in its padding) and a jump to a heading lands below it', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  app = await loadApp(page);
  for (const path of PAGES) {
    const html = await (await page.request.get(`${app.origin}${path}`)).text();
    expect(html, path).toContain('viewport-fit=cover');
  }
  const css = await (await page.request.get(`${app.origin}/legal/legal.css`)).text();
  expect(css).toContain('env(safe-area-inset-top)');
  await page.goto(`${app.origin}/legal/privacy/#de`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const gap = await page.evaluate(() => document.getElementById('de')!.getBoundingClientRect().top - document.querySelector('.lg-top')!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(0);
});

for (const width of [320, 360, 640, 700, 720, 760, 1280]) {
  test(`[LEGAL-PHONE-FIT] at ${width} px the scroll hint shows exactly where a table does not fit its box`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    app = await loadApp(page);
    for (const path of ['/legal/privacy/', '/legal/licences/']) {
      await page.goto(`${app.origin}${path}`, { waitUntil: 'domcontentloaded' });
      const boxes = await page.evaluate(() => [...document.querySelectorAll('.lg-table-wrap')].map((b) => {
        const hint = getComputedStyle(b, '::before').content;
        return { overflows: b.scrollWidth > b.clientWidth, hint: hint !== 'none' && hint !== 'normal' && hint.length > 2 };
      }));
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) expect(b.hint, `${path} at ${width}`).toBe(b.overflows);
    }
  });
}

test('[LEGAL-PHONE-BACK] a jump to a heading and a focused link above the view land in text, not behind the bar', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  app = await loadApp(page);
  await page.goto(`${app.origin}/legal/privacy/#de`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const below = () => page.evaluate(() => {
    const bar = document.querySelector('.lg-top')!.getBoundingClientRect().bottom;
    const el = document.elementFromPoint(60, bar + 6);
    return { insideBar: !!el?.closest('.lg-top'), inMain: !!el?.closest('main') };
  });
  expect(await below()).toEqual({ insideBar: false, inMain: true });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.evaluate(() => (document.querySelector('.lg-nav a') as HTMLElement).focus());
  expect(await below()).toEqual({ insideBar: false, inMain: true });
  const linkTop = await page.evaluate(() => document.activeElement!.getBoundingClientRect().top - document.querySelector('.lg-top')!.getBoundingClientRect().bottom);
  expect(linkTop).toBeGreaterThanOrEqual(0);
});
