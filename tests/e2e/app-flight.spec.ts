// The whole app in flight mode (plan Task 23): a fresh phone adds a GPX on Trip, taps Prepare this route on a stub network, and
// opens the app again with no network. Then every screen, offline and as an installed app, both themes (the projects), with the
// automatic accessibility checks, 44 px targets and a name on every control; and opening_hours stays off the first screen.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fixtureGpx } from '../fixtures/gpx.ts';
import { loadFixtureRoute } from '../fixtures/packs/index.ts';
import { goOffline, loadApp, removeBuilds, serveRainyWeather, servePack } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());
// Get ready on a slowed phone, then every screen twice over.
test.setTimeout(240_000);

/** Every error the page says or throws. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  return problems;
}

/** The phone's location answers a tap with one good reading at a point of the route, some way along it. */
async function locationOnRoute(page: Page): Promise<void> {
  const at = (await loadFixtureRoute('heidelberg-strasbourg')).points[300]!;
  await page.addInitScript(([lat, lon]) => {
    const geo = {
      watchPosition(ok: PositionCallback) {
        setTimeout(() => ok({ coords: { latitude: lat, longitude: lon, accuracy: 15 }, timestamp: Date.now() } as unknown as GeolocationPosition), 0);
        return 1;
      },
      getCurrentPosition() { /* not used */ },
      clearWatch() { /* nothing to clear */ },
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => geo });
  }, [at.lat, at.lon] as const);
}

/** Ahead, and the rider's tap for a position: the six cards with their answers. */
async function aheadWithFix(page: Page): Promise<void> {
  await page.goto(`${app!.origin}/#/ahead`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-update-position]').click();
  await expect(page.locator('[data-position-line]')).toContainText('±15 m');
  await expect(page.locator('[data-card]')).toHaveCount(6);
}

/** A fresh phone: the GPX through Trip's own file input, then the Prepare this route button, on the stub network. */
async function riderPrepares(page: Page): Promise<void> {
  await locationOnRoute(page);
  app = await loadApp(page);
  await servePack(page, 'heidelberg-strasbourg');
  await serveRainyWeather(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
  await page.locator('[data-add-route] input[type=file]').setInputFiles({
    name: 'heidelberg-strasbourg.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(await fixtureGpx('heidelberg-strasbourg')),
  });
  await expect(page.locator('[data-summary]')).toBeVisible();
  await page.locator('[data-getready]').getByRole('button', { name: 'Prepare this route' }).click();
  await expect(page.locator('[data-getready]')).toContainText(/places/, { timeout: 180_000 });
  await expect(page.locator('[data-getready] [aria-busy="true"]')).toHaveCount(0, { timeout: 180_000 });
  // The worker holds the whole site before the network goes.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

const SCREENS = [
  { hash: '#/trip', h1: 'Trip' }, { hash: '#/ahead', h1: 'En route' }, { hash: '#/tools', h1: 'Tools' },
  { hash: '#/tools/tyre', h1: 'Tools' }, { hash: '#/you', h1: 'You' },
] as const;

/** A text only the opening_hours library holds (its parser's message for an unknown token): how its chunk is recognised. */
const HOURS_MARK = 'Unexpected token in month range';

async function open(page: Page, hash: string, h1: string): Promise<void> {
  await page.goto(`${app!.origin}/${hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  if (hash === '#/ahead') await expect(page.locator('.ahead[data-ahead]')).toBeVisible();
  if (hash === '#/trip') await expect(page.locator('[data-trip-loaded]')).toBeVisible();
  if (hash === '#/you') await expect(page.locator('main[data-screen="you"] input[type=file]')).toBeAttached();
}

/** Every closed card and fold open, so the checks see the whole screen. */
async function openAll(page: Page): Promise<void> {
  const closed = page.locator('.ah-toggle[aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
}

test('[FLOW-FLIGHT] load, GPX, Get ready on a stub network, reload offline: Ahead with six cards, each stating its basis and age; the bag planner opens offline', async ({ page }) => {
  const problems = watch(page);
  await riderPrepares(page);
  await goOffline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await aheadWithFix(page);
  await openAll(page);
  const bases = await page.locator('[data-card]').evaluateAll((cards) => cards.map((c) => ({
    card: c.getAttribute('data-card'), lines: [...c.querySelectorAll('.ah-basis li')].map((li) => li.textContent ?? ''),
  })));
  expect(bases).toHaveLength(6);
  // Each answer its basis and the age of what it rests on: the map data's date, the forecast's fetch time. Climbing rests on the
  // route file alone, which has no age to give; it names that file.
  const MAP = /[Mm]ap data (of|from) \d{1,2} [A-Z][a-z]{2}/;
  const FETCHED = /forecast fetched \d\d:\d\d/;
  const ages: Record<string, RegExp[]> = { water: [MAP, FETCHED], food: [MAP], daylight: [MAP], weather: [FETCHED], climbing: [/route file/], sleep: [MAP] };
  for (const b of bases) {
    const text = b.lines.join(' | ');
    expect(b.lines.filter((l) => l.trim() !== '').length, `${b.card} has a basis`).toBeGreaterThan(0);
    for (const age of ages[b.card!]!) expect(text, `${b.card}: ${age}`).toMatch(age);
  }
  // The bag planner, offline: its own page from the worker's copy, not an error page.
  await page.goto(`${app!.origin}/tools/bags/`, { waitUntil: 'domcontentloaded' });
  expect(await page.title()).toBe('Load Check — Bikepacking Load Planner');
  expect(problems.filter((p) => !/Failed to load resource/.test(p))).toEqual([]);
});

test('[FLOW-INSTALL-OFFLINE] as an installed app (standalone), offline: every tab works, Back stays in the app, and links stay in it or open outside', async ({ page }) => {
  // Chromium can't be put in an installed window here: the page is told it is one, as an installed app's page is, before any script.
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (/display-mode:\s*standalone/.test(q)
      ? ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList)
      : real(q));
  });
  await riderPrepares(page);
  expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true);
  await goOffline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const origin = new URL(app!.origin).origin;
  for (const tab of ['En route', 'Trip', 'Tools', 'You']) {
    await page.locator('nav.tabs').getByRole('link', { name: tab }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tab);
    // A link of the site stays in this window; one to anywhere else opens outside the app, never in its place.
    for (const link of await page.locator('main a[href]').evaluateAll((as) => as.map((a) => ({ href: (a as HTMLAnchorElement).href, target: a.getAttribute('target') })))) {
      if (!/^https?:/.test(link.href)) continue;
      if (new URL(link.href).origin === origin) expect(link.target, link.href).not.toBe('_blank');
      else expect(link.target, link.href).toBe('_blank');
    }
  }
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tools');
  expect(new URL(page.url()).origin).toBe(origin);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
  // The bag planner and back again, offline.
  await page.goto(`${app!.origin}/#/tools`, { waitUntil: 'domcontentloaded' });
  await page.locator('main a[href^="/tools/bags/"]').first().click();
  await expect(page).toHaveURL(/\/tools\/bags\//);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tools');
});

/** Every screen with no trip, then with a prepared trip offline and a position, everything open; `check` on each. */
async function everyScreen(page: Page, check: (where: string) => Promise<void>): Promise<void> {
  app = await loadApp(page);
  for (const s of SCREENS) {
    await open(page, s.hash, s.h1);
    await check(`no trip ${s.hash}`);
  }
  await app.close();
  await riderPrepares(page);
  await goOffline(page);
  await aheadWithFix(page);
  for (const s of SCREENS) {
    await open(page, s.hash, s.h1);
    if (s.hash === '#/ahead') await openAll(page);
    await check(`trip ${s.hash}`);
  }
}

test('[FLOW-AXE] every screen, with a trip and with none, in this project\'s theme: no automatic accessibility violation', async ({ page }) => {
  await everyScreen(page, async (where) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
});

test('[FLOW-CONTRAST] every screen, with a trip and with none: every control at least 44 px and named', async ({ page }) => {
  await everyScreen(page, async (where) => {
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const name = (el: Element): string => {
        const own = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '';
        const by = (el.getAttribute('aria-labelledby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
        const labels = 'labels' in el ? [...((el as HTMLInputElement).labels ?? [])].map((l) => l.textContent ?? '').join(' ') : '';
        const img = [...el.querySelectorAll('svg[aria-label], img[alt]')].map((i) => i.getAttribute('aria-label') ?? i.getAttribute('alt') ?? '').join(' ');
        return `${own} ${by} ${labels} ${el.textContent ?? ''} ${img} ${(el as HTMLInputElement).type === 'submit' ? (el as HTMLInputElement).value : ''}`.trim();
      };
      for (const el of document.querySelectorAll('main button, main a[href], main input:not([type=hidden]), main select, main textarea, nav a')) {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (box.width === 0 || style.visibility === 'hidden') continue;
        const what = `${el.tagName.toLowerCase()} "${name(el).slice(0, 40)}"`;
        if (name(el) === '') out.push(`${what}: no name`);
        // A link inside a sentence is exempt (WCAG 2.5.8); a checkbox counts with its label.
        if (el.tagName === 'A' && style.display === 'inline' && !el.classList.contains('btn')) continue;
        // A checkbox counts with its label; a file input hidden behind its label (the button a rider taps) is that label.
        const input = el as HTMLInputElement;
        const label = el.tagName === 'INPUT' ? (el.closest('label') ?? input.labels?.[0] ?? null) : null;
        const target = label && (input.type === 'checkbox' || input.type === 'radio' || (input.type === 'file' && box.width < 2)) ? label : el;
        const t = target.getBoundingClientRect();
        if (t.height < 43.5 || t.width < 43.5) out.push(`${what}: ${t.width.toFixed(0)} x ${t.height.toFixed(0)} px`);
      }
      return out;
    });
    expect(small.map((s) => `${where} ${s}`)).toEqual([]);
  });
});

test('[FLOW-CHUNKS] opening_hours is not loaded on the first screen, with no trip or with one; it is precached', async ({ page }) => {
  const scripts = () => page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.endsWith('.js')));
  // The library's chunks, found by what they hold, not by their names: the opening_hours parser's own error text.
  const libraryOf = async (): Promise<string[]> => {
    const built = JSON.parse(await page.evaluate(async () => (await fetch('/build.json')).text())) as { files: Record<string, string> };
    const chunks = Object.keys(built.files).filter((f) => /^\/assets\/.+\.js$/.test(f));
    const out: string[] = [];
    for (const c of chunks) if ((await page.evaluate(async (u) => (await fetch(u)).text(), c)).includes(HOURS_MARK)) out.push(c);
    return out;
  };
  // No trip: the first screen of a new rider.
  app = await loadApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trip');
  await page.waitForTimeout(500);
  const first = await scripts();
  const atFirst = await libraryOf();
  expect(atFirst.length).toBeGreaterThan(0);
  for (const l of atFirst) expect(first.some((u) => u.endsWith(l)), `the first screen loads ${l}`).toBe(false);
  await app.close();
  await riderPrepares(page);
  const library = await libraryOf();
  expect(library.length).toBeGreaterThan(0);
  // Get ready itself loaded it: each screen is now opened as a fresh page, as when the app is opened again.
  for (const hash of ['#/ahead', '#/trip']) {
    await page.goto(`${app!.origin}/${hash}`, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(500);
    const loaded = await scripts();
    for (const l of library) expect(loaded.some((u) => u.endsWith(l)), `${hash} loads ${l}`).toBe(false);
  }
  // Precached: in the worker's list, and served from its cache with no network.
  const worker = await page.evaluate(async () => (await fetch('/offline-worker.js')).text());
  for (const l of library) expect(worker).toContain(`"${l}"`);
  await goOffline(page);
  for (const l of library) expect(await page.evaluate(async (u) => (await fetch(u)).ok, l)).toBe(true);

});
