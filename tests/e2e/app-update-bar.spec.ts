// The update button is always whole and reachable, wherever the page is scrolled and however wide the window is (owner's report, 9 Nov:
// on a laptop the left rail covered it). A worker waiting is faked in the page, so no second build is needed.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const PROMPT = 'Update ready — apply now';

/** A registration with a worker waiting, put in place of the real one before the app starts. */
async function fakeWaitingWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const worker = Object.assign(new EventTarget(), { postMessage: () => undefined, state: 'installed' });
    const registration = Object.assign(new EventTarget(), { waiting: worker, installing: null, active: worker, update: () => Promise.resolve() });
    const sw = navigator.serviceWorker;
    Object.defineProperty(sw, 'ready', { get: () => Promise.resolve(registration) });
    Object.defineProperty(sw, 'getRegistration', { value: () => Promise.resolve(registration) });
    Object.defineProperty(sw, 'register', { value: () => Promise.resolve(registration) });
  });
}

const SIZES: [number, number][] = [[320, 640], [360, 640], [839, 700], [840, 700], [1280, 720], [1600, 900]];

for (const [width, height] of SIZES) {
  test(`[UPDATE-BAR-VISIBLE] ${width} x ${height}: the update button is whole, uncovered and 44 px, at the top and when the page is scrolled`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await fakeWaitingWorker(page);
    app = await loadApp(page);
    await page.goto(`${app.origin}/#/tools`);
    const button = page.getByRole('button', { name: PROMPT, exact: true });
    await expect(button).toBeVisible();

    const check = async (where: string): Promise<void> => {
      const result = await page.evaluate((name) => {
        const el = [...document.querySelectorAll('button')].find((b) => b.textContent === name)!;
        const r = el.getBoundingClientRect();
        const inset = 5;
        const points: [number, number][] = [[r.left + inset, r.top + inset], [r.right - inset, r.top + inset], [r.left + inset, r.bottom - inset], [r.right - inset, r.bottom - inset], [r.left + r.width / 2, r.top + r.height / 2]];
        const hits = points.map(([x, y]) => { const top = document.elementFromPoint(x, y); return top === el || el.contains(top); });
        return {
          rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, height: r.height, width: r.width },
          hits, vw: document.documentElement.clientWidth, vh: window.innerHeight, scrollW: document.documentElement.scrollWidth,
        };
      }, PROMPT);
      expect(result.rect.left, where).toBeGreaterThanOrEqual(0);
      expect(result.rect.top, where).toBeGreaterThanOrEqual(0);
      expect(result.rect.right, where).toBeLessThanOrEqual(result.vw);
      expect(result.rect.bottom, where).toBeLessThanOrEqual(result.vh);
      expect(result.rect.height, where).toBeGreaterThanOrEqual(44);
      expect(result.hits, `${where}: something covers the button`).toEqual([true, true, true, true, true]);
      expect(result.scrollW, `${where}: sideways scroll`).toBeLessThanOrEqual(result.vw);
    };

    await check('at the top');
    // Make the page long enough to scroll, then scroll well down.
    await page.evaluate(() => { const pad = document.createElement('div'); pad.style.height = '3000px'; document.querySelector('main.screen')!.append(pad); });
    await page.evaluate(() => window.scrollTo(0, 400));
    await check('scrolled');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await check('scrolled to the end');
  });
}

for (const [width, height] of [[360, 640], [1280, 720]] as [number, number][]) {
  test(`[UPDATE-BAR-VISIBLE] ${width} x ${height}: on a screen with the back bar the two do not overlap, and the tabs stay reachable`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await fakeWaitingWorker(page);
    app = await loadApp(page);
    await page.goto(`${app.origin}/#/tools/tyre`);
    await expect(page.getByRole('button', { name: PROMPT, exact: true })).toBeVisible();
    await page.evaluate(() => { const pad = document.createElement('div'); pad.style.height = '3000px'; document.querySelector('main.screen')!.append(pad); });
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(400);
    const r = await page.evaluate((name) => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === name)!.getBoundingClientRect();
      const bar = document.querySelector('.update-bar')!.getBoundingClientRect();
      const back = document.querySelector('.wf-bar')?.getBoundingClientRect();
      const tabs = [...document.querySelectorAll('.tab')].map((t) => {
        const b = t.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return t === hit || t.contains(hit);
      });
      return { btnTop: btn.top, barBottom: bar.bottom, backTop: back?.top ?? null, backBottom: back?.bottom ?? null, backAway: document.querySelector('.wf-bar')?.classList.contains('wf-bar-away'), tabs };
    }, PROMPT);
    expect(r.btnTop).toBeGreaterThanOrEqual(0);
    expect(r.tabs).toEqual([true, true, true, true]);
    // The back bar, when it shows, starts at or below the update bar's lower edge; when it has slid away it is hidden behind it.
    if (r.backTop !== null && !r.backAway) expect(r.backTop).toBeGreaterThanOrEqual(r.barBottom - 1);
  });
}
