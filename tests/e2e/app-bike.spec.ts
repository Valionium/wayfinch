// Your bike in a real browser, built with the launch switch on (plan Task 19, and PERF-BIKE of Task 18).
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

const json = (path: string) => JSON.parse(readFileSync(new URL(`../../contracts/${path}`, import.meta.url), 'utf8'));
const sample = json('bike-library/sample.json') as Record<string, unknown>[];
const full = json('load-summary/full.json') as Record<string, unknown>;
const bagSets = json('drawing-set/bags.json') as { sets: Record<string, unknown> };

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const bike = sample[0]!;
const SEED: Record<string, string> = {
  'loadcheck:bikeProfile': JSON.stringify(bike),
  'loadcheck:bikeProfiles': JSON.stringify(sample),
  'loadcheck:summary:v1': JSON.stringify({ ...full, bikeId: bike.id }),
};

async function seeded(page: Page, entries: Record<string, string>, path = '/#/tools'): Promise<void> {
  await page.goto(`${app!.origin}${path}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, entries);
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test('[BK-WHERE] the Tools card shows the bike with its bags above "3 bags · 10.2 kg"; a tap goes straight to its Look', async ({ page }) => {
  app = await loadApp(page, { launch: true });
  await seeded(page, SEED);
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Bag planner' }) });
  await expect(card.locator('svg.bk')).toBeVisible();
  expect(await card.locator('.bk-bag').count()).toBeGreaterThan(0);
  await expect(card.getByText('3 bags · 10.2 kg')).toBeVisible();
  const link = card.getByRole('link', { name: /^Your bike: touring bike/ });
  await expect(link).toHaveAttribute('href', `/tools/bags/#bike-details=${bike.id as string}&back=tools&section=look`);
  await link.click();
  // The bag planner opens that bike at Look and then removes the fragment (LC-LOOK-DEEP, sub-project 6).
  await expect(page).toHaveURL(`${app.origin}/tools/bags/`);
  await expect(page.locator('#bikeLookTitle')).toBeFocused();
  expect(await page.evaluate('BIKE_PROFILE_EDITOR_ID')).toBe(bike.id);
  await expect(page.locator('#bikeDetailsBack')).toHaveAttribute('href', '/#/tools');
});

test('[BK-TAP-INSTANT] the bag planner saving a colour in another tab redraws this one before the next frame; the colour eases only with motion allowed', async ({ page, context }) => {
  app = await loadApp(page, { launch: true });
  await seeded(page, SEED);
  await expect(page.locator('.bk-paint').first()).toHaveAttribute('stroke', '#2563b8');
  // Listen after the app, so this runs once the app has had the event; one frame later the drawing must already show it.
  await page.evaluate(() => {
    window.addEventListener('storage', () => {
      requestAnimationFrame(() => {
        (window as unknown as { __seen: string | null }).__seen = document.querySelector('.bk-paint')?.getAttribute('stroke') ?? null;
      });
    });
  });
  const before = await page.locator('.bk-paint').first().elementHandle();
  const other = await context.newPage();
  await other.goto(`${app.origin}/build.json`, { waitUntil: 'domcontentloaded' }); // the same origin, not a page that writes keys itself
  await other.evaluate((b) => localStorage.setItem('loadcheck:bikeProfile', JSON.stringify({ ...b, look: { colour: '#c62f2a', bars: 'drop', ebike: false } })), bike);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __seen?: string | null }).__seen)).toBe('#c62f2a');
  expect(await before!.evaluate((el) => el.isConnected)).toBe(true); // painted in place, so the stroke can ease
  await other.close();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await page.locator('.bk-paint').first().evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.15s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.bk-paint').first().evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
});

test('[BK-NO-REQUEST] drawing and redrawing the bike sends nothing', async ({ page }) => {
  const sent: string[] = [];
  app = await loadApp(page, { launch: true });
  await seeded(page, SEED);
  await expect(page.locator('svg.bk')).toBeVisible();
  page.on('request', (r) => sent.push(`${r.method()} ${r.url()}`));
  for (const colour of ['#c62f2a', '#1d1d1f', '#f4f4f2']) {
    await page.evaluate((c) => {
      const b = JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!);
      localStorage.setItem('loadcheck:bikeProfile', JSON.stringify({ ...b, look: { ...b.look, colour: c } }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'loadcheck:bikeProfile' }));
    }, colour);
    await expect(page.locator('.bk-paint').first()).toHaveAttribute('stroke', colour);
  }
  await page.evaluate(() => { localStorage.clear(); window.dispatchEvent(new StorageEvent('storage', { key: null })); });
  await expect(page.locator('svg.bk')).toHaveAttribute('aria-label', 'Your bike: gravel bike, 700 × 40 mm tyres, drop bars.');
  expect(sent).toEqual([]);
});

test('[BK-NOTHING-REQUIRED] broken bike and plan data: every screen opens, the typical bike shows, the console stays clean', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(String(e)));
  app = await loadApp(page, { launch: true });
  await seeded(page, { 'loadcheck:bikeProfile': '{"id": 7, "look": "red"', 'loadcheck:bikeProfiles': '[null, 3, {"fit": {}}]', 'loadcheck:summary:v1': '{"v": 9}' });
  for (const screen of ['trip', 'ahead', 'you', 'tools']) {
    await page.goto(`${app.origin}/#/${screen}`);
    await expect(page.locator(`main[data-screen="${screen}"]`)).toBeVisible();
  }
  await expect(page.locator('svg.bk')).toHaveAttribute('aria-label', 'Your bike: gravel bike, 700 × 40 mm tyres, drop bars.');
  await expect(page.locator('a.bike-tap')).toHaveAttribute('href', '/tools/bags/#bike-details=new&back=tools&section=look');
  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(problems).toEqual([]);
});

test('[PERF-BIKE] one bike with a full bikepacking rig is drawn within 20 ms on the phone stand-in, in the page (median of three)', async ({ page }) => {
  // Drawn: the spec, the drawing, the DOM and its layout, as on each tap once the bike is on screen. The first, cold drawing is
  // reported beside it; it belongs to the screen's first paint, which PERF-OFFLINE-2S covers.
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  // A quiet page, as when a rider taps: the offline worker has finished copying the site.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForLoadState('networkidle');
  await page.addScriptTag({ url: '/tools/bags/bike.js' });
  const times = await page.evaluate(({ record, bags }) => {
    const B = (window as unknown as { WayfinchBike: Record<string, (...a: unknown[]) => { svg: string }> }).WayfinchBike;
    const host = document.createElement('div');
    host.style.width = '360px';
    document.body.append(host);
    const out: number[] = [];
    // Each draw a new bike (handlebar, e-bike), so none is a repaint of the one before.
    for (const [colour, bars, ebike] of [['#1d1d1f', 'drop', false], ['#4b4f54', 'flat', false], ['#2f7d4f', 'other', false], ['#c62f2a', 'drop', true], ['#2563b8', 'flat', true]]) {
      const bikeRecord = B.normaliseBike!(JSON.parse(JSON.stringify({ ...record, look: { colour, bars, ebike } })));
      const t0 = performance.now();
      host.innerHTML = B.bikeArt!(B.resolveBikeSpec!(bikeRecord, bags), bags).svg;
      (host.querySelector('svg') as SVGSVGElement).getBBox(); // style and layout, as a drawing on screen needs
      out.push(performance.now() - t0);
    }
    host.remove();
    return out;
  }, { record: bike, bags: bagSets.sets.bikepacking });
  const [cold, , ...taps] = times; // the first two draws are the screen's own: one cold, one as it settles
  const median = [...taps].sort((a, b) => a! - b!)[1]!;
  test.info().annotations.push({ type: 'PERF-BIKE', description: `first ${cold!.toFixed(1)} ms; then ${taps.map((t) => t!.toFixed(1)).join(', ')} ms, median ${median.toFixed(1)} ms` });
  console.log(`PERF-BIKE ${test.info().project.name}: first ${cold!.toFixed(1)} ms; then ${taps.map((t) => t!.toFixed(1)).join(', ')} ms, median ${median.toFixed(1)} ms`);
  expect(median).toBeLessThanOrEqual(20);
});
