// The Bag planner looks like Wayfinch (the owner's ruling of 14 Nov 2026, "yes, make the Bag planner look like Wayfinch"; sweep of
// 14 Nov, finding 27) in a real browser, launch build, in the four app projects: the phone ones at 320 and 360 px, the laptop ones at
// 1280 and 1440 px, each in both themes (the page's one theme button switches them). The header reads "Wayfinch · Bag planner", step
// one is Ride, Check's last button goes back to step one, the footer is English; the header and step labels are drawn in the app's own
// Source Sans 3, offline too, in Wayfinch's colours; nothing scrolls sideways. tests/unit/tools/planner-look.test.ts holds the build's
// side. Nothing here prints the page: failures compare short texts, booleans and sizes.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const ready = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');
const phone = () => test.info().project.use.viewport?.width === 360;
const WIDTHS = () => (phone() ? [320, 360] : [1280, 1440]);

/** The bag planner, past the walkthrough's invitation, as a rider who has been here before. */
async function openPlanner(page: Page): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/' });
  await page.evaluate(() => { localStorage.setItem('loadcheck:walkthrough:v1', 'done'); localStorage.setItem('copilot:moved-card', 'seen'); });
  await page.goto(`${app.origin}/tools/bags/`, { waitUntil: 'load' });
  await ready(page);
  await chooseStepOne(page);
}

/** A page that opens marks no step as the current one until a step is chosen (as on main); choosing step one marks it. */
async function chooseStepOne(page: Page): Promise<void> {
  await page.locator('#crumbs button[data-to="1"]').click();
  await expect(page.locator('#crumbs button[aria-current="step"]')).toHaveCount(1);
}

/** What the header shows, as the browser draws it: fonts, colours against the page's own tokens, sizes and room. */
const headerFacts = (page: Page) => page.evaluate(async () => {
  await document.fonts.ready;
  const token = (name: string): string => {
    const probe = document.createElement('i');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  };
  const h1 = document.querySelector('header.mast h1')!;
  const line = document.querySelector('header.mast p')!;
  const steps = [...document.querySelectorAll<HTMLElement>('#crumbs button')];
  const current = steps.find((b) => b.getAttribute('aria-current') === 'step')!;
  const others = steps.filter((b) => b !== current);
  const theme = document.getElementById('themeBtn')!;
  const loaded = (weight: string) => [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Source Sans 3' && f.weight === weight && f.status === 'loaded');
  const font = (el: Element) => getComputedStyle(el).fontFamily.replace(/["']/g, '').split(',')[0]!.trim();
  const plain = (el: Element) => getComputedStyle(el).textTransform === 'none' && ['0px', 'normal'].includes(getComputedStyle(el).letterSpacing);
  const within = (el: Element) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= document.documentElement.clientWidth + 0.5; };
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    fonts: [font(h1), font(line), ...steps.map(font)],
    loaded: [loaded('400'), loaded('600'), loaded('700')],
    plain: [h1, line, ...steps].every(plain),
    colours: {
      h1: getComputedStyle(h1).color === token('--ink'),
      line: getComputedStyle(line).color === token('--muted'),
      current: getComputedStyle(current).color === token('--ink') && getComputedStyle(current).borderBottomColor === token('--blaze'),
      others: others.every((b) => getComputedStyle(b).color === token('--muted')),
      themeButton: getComputedStyle(theme).color === token('--ink') && getComputedStyle(theme).backgroundColor === (() => {
        const probe = document.createElement('i'); probe.style.backgroundColor = 'var(--panel)'; document.body.appendChild(probe);
        const c = getComputedStyle(probe).backgroundColor; probe.remove(); return c;
      })(),
    },
    targets: [...steps, theme].every((b) => { const r = b.getBoundingClientRect(); return r.height >= 44 && r.width >= 44; }),
    within: [h1, line, theme, ...steps].every(within),
    sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    themeButtons: [...document.querySelectorAll('button')].filter((b) => /\b(light|dark)\b/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`) && b.getClientRects().length > 0).length,
  };
});

test('[LC-WF-NAME] [LC-WF-STEPS] [LC-WF-FOOT] the header names "Wayfinch · Bag planner", step one is Ride, Check goes "Back to step one", the footer is English', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openPlanner(page);
  await expect(page.locator('header.mast h1')).toHaveText('Wayfinch · Bag planner');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Wayfinch Bag planner');
  await expect(page.locator('header.mast p')).toHaveText('What to take, where it goes, what to leave at home.');
  await expect(page.locator('#crumbs button')).toHaveText(['Ride', 'Bags', 'Kit', 'Check']);
  // Check's last button goes to step one, by keyboard too
  await page.locator('#crumbs button[data-to="4"]').click();
  const back = page.locator('#s4 .nav button[data-to="1"]');
  await expect(back).toHaveText('Back to step one');
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#s1')).toBeVisible();
  await expect(page.locator('#crumbs button[data-to="1"]')).toHaveAttribute('aria-current', 'step');
  // the footer's button opens the same dialog as before
  const legal = page.locator('#legalBtn');
  await expect(legal).toHaveText('Imprint and privacy');
  expect(await legal.getAttribute('lang')).toBeNull();
  await legal.click();
  await expect(page.locator('#legalBox .lgl-card')).toBeVisible();
  expect(errors).toEqual([]);
});

test('[LC-WF-TYPE] header and step labels in Source Sans 3 and Wayfinch\'s colours, 44 px targets, one theme button, no sideways scroll, at 320/360 px and wide in both themes', async ({ page }) => {
  await openPlanner(page);
  const height = page.viewportSize()!.height;
  for (const width of WIDTHS()) {
    await page.setViewportSize({ width, height });
    const seen: (string | null)[] = [];
    for (let pass = 0; pass < 2; pass += 1) {
      if (pass === 1) await page.locator('#themeBtn').click();
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).not.toBe(seen[0] ?? '');
      const facts = await headerFacts(page);
      seen.push(facts.theme);
      const where = `${width} px, ${facts.theme}`;
      expect(facts.fonts, where).toEqual(Array(6).fill('Source Sans 3'));
      expect(facts.loaded, where).toEqual([true, true, true]);
      expect(facts.plain, where).toBe(true);
      expect(facts.colours, where).toEqual({ h1: true, line: true, current: true, others: true, themeButton: true });
      expect(facts.targets, where).toBe(true);
      expect(facts.within, where).toBe(true);
      expect(facts.sideways, where).toBe(false);
      expect(facts.themeButtons, where).toBe(1);
    }
    expect(new Set(seen), `${width} px: both themes`).toEqual(new Set(['dark', 'light']));
  }
});

test("[LC-WF-OFFLINE] the header's font is the app's own precached file: offline the page still draws it", async ({ page, context }) => {
  await openPlanner(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.goto(`${app!.origin}/tools/bags/`, { waitUntil: 'load' });
  await ready(page);
  await chooseStepOne(page);
  const facts = await headerFacts(page);
  expect(facts.loaded).toEqual([true, true, true]);
  expect(facts.fonts).toEqual(Array(6).fill('Source Sans 3'));
  // the page's stylesheet names the app's three files, and the worker holds that stylesheet and each file
  const held = await page.evaluate(async () => {
    const css = await (await fetch('/tools/bags/font.css')).text();
    const urls = [...css.matchAll(/url\((\/assets\/[^)]+\.woff2)\)/g)].map((m) => m[1]!);
    const inCache = async (url: string) => (await caches.match(url)) !== undefined;
    return { names: urls.map((u) => u.replace(/-[A-Za-z0-9_-]{8}\.woff2$/, '.woff2')), all: (await Promise.all(['/tools/bags/font.css', ...urls].map(inCache))).every(Boolean) };
  });
  expect(held).toEqual({ names: ['/assets/source-sans-3-latin-400-normal.woff2', '/assets/source-sans-3-latin-600-normal.woff2', '/assets/source-sans-3-latin-700-normal.woff2'], all: true });
  await context.setOffline(false);
});
