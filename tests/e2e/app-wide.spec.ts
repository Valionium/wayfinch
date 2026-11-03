// Laptop and wide screens (plan Task 22, spec section 3.8): the rail, the two panes, the keys and the drop zones, at 1280 x 720
// unless a test says another size. Runs in Chromium and in Firefox (WIDE-FIREFOX).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { fixtureGpx } from '../fixtures/gpx.ts';
import { atPosition, loadApp, preparedTrip, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const today = (): string => new Date().toISOString().slice(0, 10);

/** A window of this size, the app loaded with a prepared trip and a position at km 40, on `screen`. */
async function open(page: Page, width: number, height: number, screen = 'ahead', opts: { position?: boolean; trip?: boolean } = {}): Promise<void> {
  await page.setViewportSize({ width, height });
  app = await loadApp(page);
  if (opts.trip !== false) {
    await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: today(), places: true });
    if (opts.position !== false) await atPosition(page, 40);
  }
  await page.goto(`${app.origin}/#/${screen}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.screen')).toBeVisible();
  if (screen === 'ahead') await expect(page.locator(opts.trip === false ? '.ahead[data-ahead]' : '.ah-cards')).toBeVisible();
}

const box = async (l: Locator) => (await l.boundingBox())!;

test('[WIDE-UNDER-600] at 360 x 640 no rule of the wide layout applies: the screens look the same with those rules taken out', async ({ page }) => {
  await open(page, 360, 640);
  // Every element's place and every computed style, in one text. A picture of the page would do, but the drawing of the bike
  // is not the same pixel for pixel from one paint to the next; the geometry and the styles are what a picture is made of.
  const NL = String.fromCharCode(10);
  const look = (): Promise<string> => page.evaluate(() => [...document.querySelectorAll('body *')].map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const styles = [...cs].map((name) => `${name}:${cs.getPropertyValue(name)}`).join(';');
    return `${el.tagName}.${el.getAttribute('class') ?? ''} ${r.x.toFixed(2)} ${r.y.toFixed(2)} ${r.width.toFixed(2)} ${r.height.toFixed(2)} ${styles}`;
  }).join('\n'));
  // Once the page has stopped moving (fonts arriving): two looks in a row alike.
  const stable = async (): Promise<string> => {
    let last = await look();
    for (let i = 0; i < 20; i += 1) {
      await page.waitForTimeout(250);
      const next = await look();
      if (next === last) return next;
      last = next;
    }
    return last;
  };
  for (const screen of ['ahead', 'trip', 'tools']) {
    await page.goto(`${app!.origin}/#/${screen}`);
    await page.locator(`main[data-screen="${screen}"]`).waitFor();
    const withWide = await stable();
    // Delete every rule that sits inside a query of 600 px or more, then look again.
    const removed = await page.evaluate(() => {
      let n = 0;
      const wide = (cond: string): boolean => [...cond.matchAll(/min-width:\s*(\d+)px/g)].some((m) => Number(m[1]) >= 600);
      for (const sheet of [...document.styleSheets]) {
        const rules = sheet.cssRules;
        for (let i = rules.length - 1; i >= 0; i -= 1) {
          const r = rules[i]!;
          if (r instanceof CSSMediaRule && wide(r.conditionText)) { sheet.deleteRule(i); n += 1; }
        }
      }
      return n;
    });
    expect(removed).toBeGreaterThan(0);
    const without = await stable();
    if (without !== withWide) {
      const a = withWide.split(NL);
      const b = without.split(NL);
      const at = a.findIndex((line, i) => line !== b[i]);
      const [x, y] = [a[at] ?? '', b[at] ?? ''].map((l) => l.split(';'));
      const [p, q] = [x!, y!];
      const field = p.findIndex((v, i) => v !== q[i]);
      throw new Error(`${screen} differs at element ${at}: ${p[0]!.slice(0, 80)} | ${p[field]} vs ${q[field]}`);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
});

test('[WIDE-RAIL] up to 839 px one column and the bottom bar; from 840 px a labelled rail and two panes', async ({ page }) => {
  await open(page, 700, 800);
  const nav = page.locator('nav.tabs');
  let bar = await box(nav);
  expect(bar.y).toBeGreaterThan(400);
  expect(bar.width).toBeGreaterThan(600);
  expect((await box(page.locator('main.screen'))).width).toBeLessThanOrEqual(641);
  await page.setViewportSize({ width: 839, height: 800 });
  bar = await box(nav);
  expect(bar.width).toBeGreaterThan(800);
  await page.setViewportSize({ width: 840, height: 800 });
  bar = await box(nav);
  expect(bar.x).toBe(0);
  expect(bar.width).toBeLessThan(200);
  expect(bar.height).toBeGreaterThanOrEqual(790);
  for (const name of ['Ahead', 'Trip', 'Tools', 'You']) await expect(nav.getByRole('link', { name })).toBeVisible();
  const main = await box(page.locator('.ah-main'));
  const side = await box(page.locator('.ah-cards'));
  expect(side.x).toBeGreaterThan(main.x + main.width - 1);
});

test('[WIDE-PANES] Ahead: position, strip and chips in the main pane, the six cards in order in the supporting one; Trip, Tools and You as listed', async ({ page }) => {
  await open(page, 1280, 720);
  const side = await box(page.locator('.ah-cards'));
  for (const sel of ['[data-position-line]', '[data-strip]', '.ah-chips']) {
    const b = await box(page.locator(sel));
    expect(b.x + b.width, sel).toBeLessThanOrEqual(side.x + 1);
  }
  const names = await page.locator('.ah-cards [data-card]').evaluateAll((els) => els.map((e) => e.getAttribute('data-card')));
  expect(names).toEqual(['water', 'food', 'daylight', 'weather', 'climbing', 'sleep']);
  const tops = await page.locator('.ah-cards [data-card]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);

  await page.goto(`${app!.origin}/#/trip`);
  await page.locator('[data-trip-loaded]').waitFor();
  const summary = await box(page.locator('[data-summary]'));
  const settings = await box(page.locator('.trip-side .card').first());
  expect(settings.x).toBeGreaterThan(summary.x + summary.width - 1);
  expect((await box(page.locator('[data-add-route]'))).x).toBeLessThan(settings.x);

  await page.goto(`${app!.origin}/#/tools`);
  const cards = page.locator('main[data-screen="tools"] > .card');
  expect(await cards.count()).toBe(2);
  const [a, b] = [await box(cards.nth(0)), await box(cards.nth(1))];
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);

  await page.goto(`${app!.origin}/#/you`);
  await expect(page.locator('main[data-screen="you"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('[WIDE-ORDER] in each pane the elements are in the DOM in the order they are seen', async ({ page }) => {
  await open(page, 1280, 720);
  const inOrder = (sel: string): Promise<boolean> => page.evaluate((s) => {
    const tops = [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect().top);
    return tops.length > 0 && tops.every((t, i) => i === 0 || t >= tops[i - 1]! - 0.5);
  }, sel);
  expect(await inOrder('.ah-main > *')).toBe(true);
  expect(await inOrder('.ah-cards > *')).toBe(true);
  expect(await inOrder('.ah-below > *')).toBe(true);
  // The panes themselves: main before supporting in the DOM, left before right on the screen.
  expect(await page.evaluate(() => {
    const m = document.querySelector('.ah-main')!;
    const c = document.querySelector('.ah-cards')!;
    return Boolean(m.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) && m.getBoundingClientRect().left < c.getBoundingClientRect().left;
  })).toBe(true);
  await page.goto(`${app!.origin}/#/trip`);
  await page.locator('[data-trip-loaded]').waitFor();
  expect(await inOrder('.trip-main > *')).toBe(true);
  expect(await inOrder('.trip-side > *')).toBe(true);
  await page.goto(`${app!.origin}/#/tools`);
  expect(await page.evaluate(() => {
    const rects = [...document.querySelectorAll('main[data-screen="tools"] > .card')].map((e) => e.getBoundingClientRect());
    return rects.every((r, i) => i === 0 || r.left >= rects[i - 1]!.left);
  })).toBe(true);
});

test('[WIDE-FOLD] at 1280 x 720 the position line, the strip and the Water card show without scrolling', async ({ page }) => {
  await open(page, 1280, 720);
  for (const sel of ['[data-position-line]', '[data-strip]', '[data-card="water"]']) {
    const b = await box(page.locator(sel));
    expect(b.y, sel).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height, sel).toBeLessThanOrEqual(720);
  }
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('[WIDE-KEYS] arrows move along the strip, Enter sets a manual position, Esc collapses a card', async ({ page }) => {
  await open(page, 1280, 720);
  const ruler = page.getByRole('slider', { name: 'Choose a point along the strip' });
  await ruler.focus();
  const before = Number(await ruler.getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeCloseTo(before + 3, 5);
  await page.keyboard.press('ArrowLeft');
  expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeCloseTo(before + 2, 5);
  await page.keyboard.press('Shift+ArrowRight');
  const at = Number(await ruler.getAttribute('aria-valuenow'));
  expect(at).toBeCloseTo(before + 12, 5);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-position-line]')).toContainText(`km ${at} of`);
  await expect(page.locator('[data-position-line]')).toContainText('set by hand');

  const toggle = page.locator('[data-card="food"] .ah-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('[WIDE-FOCUS] the focus always shows and is never under the bottom bar; the manual position passes with the keyboard alone', async ({ page }) => {
  // The bottom bar is the one sticky bar left (600-839 px): a tab stop is never hidden under it.
  await open(page, 700, 520);
  const bar = await box(page.locator('nav.tabs'));
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    const state = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { bottom: r.bottom, nav: Boolean(el.closest('nav')), outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 };
    });
    if (!state) continue;
    expect(state.outline).toBe(true);
    if (!state.nav) expect(state.bottom).toBeLessThanOrEqual(bar.y + 1);
  }
  // Keyboard only at 1280: the kilometre, then Use this position.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const km = page.locator('#ah-picker').getByLabel('Route kilometre');
  await km.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('55');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('#ah-picker').getByRole('button', { name: 'Use this position' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-position-line]')).toContainText('km 55 of');
  // What can be dragged has a typed twin (WCAG 2.5.7): the kilometre box beside the picker's slider.
  expect(await page.locator('#ah-picker input[type="range"]').count()).toBe(1);
  expect(await page.locator('#ah-picker input[type="number"]').count()).toBe(1);
});

test('[WIDE-DROP] a GPX file dropped anywhere on Trip becomes the route; the file picker stays', async ({ page }) => {
  await open(page, 1280, 720, 'trip', { trip: false });
  await expect(page.locator('[data-add-route] input[type=file]')).toBeAttached();
  const gpx = await fixtureGpx('heidelberg-strasbourg', { heights: true });
  const data = await page.evaluateHandle((text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'heidelberg.gpx', { type: 'application/gpx+xml' }));
    return dt;
  }, gpx);
  await page.dispatchEvent('.trip-side', 'drop', { dataTransfer: data });
  await expect(page.locator('[data-summary]')).toBeVisible();
  await expect(page.locator('[data-summary]')).toContainText('km');
});

test('[WIDE-STRAY] a file dropped where there is no zone is cancelled at window level: nothing opens or downloads', async ({ page }) => {
  await open(page, 1280, 720);
  const url = page.url();
  const result = await page.evaluate(() => {
    const out: Record<string, boolean> = {};
    for (const [where, el] of [['ahead', document.querySelector('.ah-cards')!], ['body', document.body], ['rail', document.querySelector('nav.tabs')!]] as const) {
      for (const type of ['dragenter', 'dragover', 'drop']) {
        const dt = new DataTransfer();
        dt.items.add(new File(['x'], 'photo.png', { type: 'image/png' }));
        const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
        el.dispatchEvent(e);
        out[`${where}:${type}`] = e.defaultPrevented;
      }
    }
    return out;
  });
  expect(Object.values(result).every(Boolean), JSON.stringify(result)).toBe(true);
  expect(page.url()).toBe(url);
  // A drag that carries no file (text, a link) is left alone.
  expect(await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'hello');
    const e = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  })).toBe(false);
});

test('[WIDE-ZOOM] 1280 px at 400 % (320 CSS px wide) works on every screen, with no sideways scroll', async ({ page }) => {
  await open(page, 320, 180);
  for (const screen of ['ahead', 'trip', 'tools', 'tools/tyre', 'you']) {
    await page.goto(`${app!.origin}/#/${screen}`);
    await page.locator(`main[data-screen="${screen}"]`).waitFor();
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, screen).toBeLessThanOrEqual(0);
    await expect(page.locator('nav.tabs')).toBeVisible();
  }
});

test('[WIDE-COMPUTER-POS] in the rail layout Ahead opens with the picker open, asks for no position, and says a computer is approximate', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __geo: string[] };
    w.__geo = [];
    const geo = { watchPosition() { w.__geo.push('watch'); return 1; }, getCurrentPosition() { w.__geo.push('get'); }, clearWatch() { /* none */ } };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => geo });
  });
  await open(page, 1280, 720, 'ahead', { position: false });
  await expect(page.locator('#ah-picker')).toBeVisible();
  await expect(page.getByText('On a computer, this is usually approximate.')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __geo: string[] }).__geo)).toEqual([]);
  // On a phone-sized window none of it is added.
  await page.setViewportSize({ width: 360, height: 640 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('On a computer, this is usually approximate.')).toHaveCount(0);
});

test('[WIDE-FIREFOX] the same layout in desktop Firefox at 1280 x 720', async ({ page, browserName }) => {
  test.skip(browserName !== 'firefox', 'this one is about the Firefox project');
  await open(page, 1280, 720);
  expect(await page.evaluate(() => navigator.userAgent)).toContain('Firefox');
  expect((await box(page.locator('nav.tabs'))).x).toBe(0);
  const b = await box(page.locator('[data-card="water"]'));
  expect(b.y + b.height).toBeLessThanOrEqual(720);
});
