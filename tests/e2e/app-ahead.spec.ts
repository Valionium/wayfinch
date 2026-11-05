// Ahead in a real browser on a prepared trip (plan Task 16): showing it, its cards, chips, Call and Website, and the share step
// send nothing; Emergency stands offline; the page passes the automatic accessibility checks and every control is 44 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { atPosition, goOffline, loadApp, preparedTrip, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';
import { sunOf } from '../gen/clocks.ts';
import { encodeCase } from '../sim/harness.ts';
import { ownersDay, rainyStop } from '../unit/ui/ahead-fixture.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const today = (): string => new Date().toISOString().slice(0, 10);

/** Every request the page makes from now on, but the app's own files, which the worker and the reload fetch. */
function sent(page: Page): string[] {
  const out: string[] = [];
  page.on('request', (r: Request) => { out.push(`${r.method()} ${r.url()}`); });
  return out;
}

async function ahead(page: Page): Promise<void> {
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: today(), places: true });
  await atPosition(page, 40, { accuracyM: 12 });
  await page.goto(`${app.origin}/#/ahead`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-ahead="answers"]')).toBeVisible();
  await expect(page.locator('[data-card]')).toHaveCount(6);
}

async function openEverything(page: Page): Promise<void> {
  const closed = page.locator('.ah-toggle[aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
  for (const chip of ['Bike shop', 'Pharmacy', 'Bail out by train', 'Toilets', 'Shelter', 'Emergency']) {
    await page.locator('.ah-chips').getByRole('button', { name: chip, exact: true }).click();
    await expect(page.locator('.ah-chip-panel')).toBeVisible();
  }
}

test('[AH-CALL] [AH-SHARE] showing the cards, the chips, Call and Website and the share step sends nothing; links are tel: and http(s): only', async ({ page }) => {
  await ahead(page);
  const log = sent(page);
  await openEverything(page);
  for (const chip of ['Bike shop', 'Shelter']) await page.locator('.ah-chips').getByRole('button', { name: chip, exact: true }).click();
  for (const href of await page.locator('a.ah-link').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))) {
    expect(href).toMatch(/^(tel:\+\d{7,15}|https?:\/\/)/);
  }
  await page.getByRole('button', { name: 'Share progress' }).click();
  const sheet = page.locator('[data-share="progress"]');
  await expect(sheet.locator('textarea')).not.toHaveValue('');
  await sheet.getByRole('checkbox').check();
  await expect(sheet.locator('textarea')).toHaveValue(/openstreetmap\.org/);
  await expect(sheet.getByRole('link', { name: 'SMS' })).toHaveAttribute('href', /^sms:\?&body=/);
  await sheet.getByRole('button', { name: 'Copy' }).click();
  await expect(sheet.getByRole('status')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Share progress' }).click();
  await expect(page.locator('[data-share="progress"] input[type=checkbox]')).toBeChecked(); // the choice is kept
  expect(await page.evaluate(() => localStorage.getItem('copilot:share-progress'))).toBe('yes');
  const own = new URL(app!.origin).origin;
  expect(log.filter((l) => !l.includes(own))).toEqual([]);
  expect(log.filter((l) => l.startsWith('POST'))).toEqual([]);
});

test('[AH-EMERGENCY] offline after a reload: 112, the fallback line and the coordinates; opening it sends nothing', async ({ page }) => {
  await ahead(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const asked: Request[] = [];
  page.on('request', (r) => { asked.push(r); });
  await page.goto(`${app!.origin}/#/ahead`, { waitUntil: 'domcontentloaded' });
  await page.locator('.ah-chips').getByRole('button', { name: 'Emergency', exact: true }).click();
  const card = page.locator('#chip-emergency');
  await expect(card.getByRole('link', { name: 'Call 112' })).toHaveAttribute('href', 'tel:112');
  await expect(card).toContainText('112 — works across Europe and on many mobile networks; check the local number');
  await expect(card).toContainText(/\d+\.\d{5}, \d+\.\d{5}/);
  // Nothing leaves the phone: every request, the app's own fonts included, is the app's own address answered by its worker.
  for (const r of asked) {
    expect(new URL(r.url()).origin, r.url()).toBe(new URL(app!.origin).origin);
    expect((await r.response())?.fromServiceWorker(), r.url()).toBe(true);
  }
});

test('Ahead has no automatic accessibility violations with everything open, and every control is at least 44 px', async ({ page }) => {
  await ahead(page);
  await openEverything(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`)).toEqual([]);
  for (const el of await page.locator('.ahead button, .ahead a.btn, .ahead select, .ahead input[type=number]').all()) {
    if (!(await el.isVisible())) continue;
    const box = (await el.boundingBox())!;
    expect(box.height, await el.innerText().catch(() => '')).toBeGreaterThanOrEqual(43.5);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// ---- The strip's icons on the line (the owner's device check of 5 November) -------------------------------------------------------

/** Draws a moment on Ahead through the test-hooks build's door, with the fixtures' sun in a form the case file can carry. */
async function drawCase(page: Page, inputs: ReturnType<typeof ownersDay>): Promise<void> {
  const sun = sunOf({ kind: 'stub', tz: 'Europe/Berlin', sunset: '18:42', dusk: '19:17' });
  const json = encodeCase({ id: 'AH-STRIP-LINE', seed: 0, replayPath: '', message: '', inputs: { ...inputs, sun } });
  await page.waitForFunction(() => '__wf' in window);
  await page.evaluate((text) => (window as unknown as { __wf: { loadCase: (t: string) => void } }).__wf.loadCase(text), json);
  await expect(page.locator('[data-strip] .ah-icon').first()).toBeVisible();
}

/** Where the strip's line, track, marker, icons and bands are on the page. */
const stripGeometry = (page: Page) => page.evaluate(() => {
  const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; };
  const strip = document.querySelector('[data-strip]')!;
  return {
    line: box(strip.querySelector('.ah-strip-line')!),
    marker: box(strip.querySelector('.bike-marker')!),
    icons: [...strip.querySelectorAll<HTMLElement>('.ah-icon')].map((b) => ({ ...box(b), km: Number(b.dataset.km), kind: b.className, disc: box(b.querySelector('svg')!) })),
    bands: [...strip.querySelectorAll<HTMLElement>('.ah-band')].map((b) => {
      const bar = box(b.querySelector('.ah-band-bar')!);
      // Is there a point of the band a finger can reach, and does the bar show above or below whatever covers it?
      const hits: boolean[] = [];
      const r = b.getBoundingClientRect();
      for (let fx = 0.05; fx < 1; fx += 0.1) for (let fy = 0.05; fy < 1; fy += 0.1) hits.push(document.elementFromPoint(r.left + fx * r.width, r.top + fy * r.height)?.closest('.ah-band') === b);
      return { bar, tappable: hits.some(Boolean) };
    }),
    scroll: document.documentElement.scrollWidth - window.innerWidth,
  };
});

test('[AH-STRIP-LINE] the owner\'s day at 360 and 1280 px: the icons on the line at their kilometre, spread along it, the stop\'s sleep place at the end', async ({ page }) => {
  test.skip(!['app-phone', 'app-laptop'].includes(test.info().project.name), 'both widths in the phone and laptop projects');
  const inputs = ownersDay();
  await page.clock.install({ time: inputs.now }); // the moment of the case, so the page draws that day
  app = await loadApp(page, { launch: true, testHooks: true });
  await drawCase(page, inputs);
  const g = await stripGeometry(page);
  const start = 14.6;
  const end = 57.5;
  expect(g.scroll).toBeLessThanOrEqual(0);
  expect(g.icons.length).toBeGreaterThanOrEqual(3);
  for (const icon of g.icons) {
    expect(Math.abs(icon.cy - g.line.cy), `${icon.kind} on the line`).toBeLessThanOrEqual(1);
    expect(Math.abs(icon.cx - (g.line.x + ((icon.km - start) / (end - start)) * g.line.w)), `${icon.kind} at km ${icon.km}`).toBeLessThanOrEqual(3);
    expect(icon.w).toBeGreaterThanOrEqual(44);
    expect(icon.h).toBeGreaterThanOrEqual(44);
    expect(icon.x, 'clear of the bike marker').toBeGreaterThanOrEqual(g.marker.x + g.marker.w);
  }
  const last = g.icons[g.icons.length - 1]!;
  expect(last.km).toBe(end);
  expect(last.kind).toContain('ah-icon-sleep');
  expect(Math.abs(last.cx - (g.line.x + g.line.w))).toBeLessThanOrEqual(3);
  // none covers another
  for (let n = 1; n < g.icons.length; n += 1) expect(g.icons[n]!.x).toBeGreaterThanOrEqual(g.icons[n - 1]!.x + g.icons[n - 1]!.w);
  // spread: the first place near the start, the last at the stop
  expect(last.cx - g.icons[0]!.cx).toBeGreaterThan(0.85 * g.line.w);
});

test('[AH-STRIP-LINE] an icon over a rain band: the band shows above and below it and can still be tapped', async ({ page }) => {
  test.skip(!['app-phone', 'app-laptop'].includes(test.info().project.name), 'both widths in the phone and laptop projects');
  const inputs = rainyStop();
  await page.clock.install({ time: inputs.now }); // the moment of the case, so its rain is the forecast's present
  app = await loadApp(page, { launch: true, testHooks: true });
  await drawCase(page, inputs);
  const g = await stripGeometry(page);
  expect(g.bands.length).toBeGreaterThan(0);
  for (const band of g.bands) {
    expect(band.tappable).toBe(true);
    for (const icon of g.icons.filter((i) => i.cx > band.bar.x && i.cx < band.bar.x + band.bar.w)) {
      expect(band.bar.y, 'the bar shows above the icon').toBeLessThan(icon.disc.y);
      expect(band.bar.y + band.bar.h, 'and below it').toBeGreaterThan(icon.disc.y + icon.disc.h);
    }
  }
  expect(g.scroll).toBeLessThanOrEqual(0);
});
