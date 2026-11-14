// Ahead in a real browser on a prepared trip (plan Task 16): showing it, its cards, chips, Call and Website, and the share step
// send nothing; Emergency stands offline; the page passes the automatic accessibility checks and every control is 44 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { atPosition, goOffline, loadApp, preparedTrip, removeBuilds, servePack } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';
import { sunOf } from '../gen/clocks.ts';
import { encodeCase } from '../sim/harness.ts';
import { ownersDay, rainyStop, SAT } from '../unit/ui/ahead-fixture.ts';
import { stamps } from '../unit/core/engines/weather-helpers.ts';

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
  // The fixture's Prepare this route had no weather service, so the top card names that step (review of PR 73, I2); its button is a
  // chunk of its own, loaded here, before a test watches what the page sends.
  if ((await page.locator('[data-need-ready]').count()) > 0) await expect(page.locator('[data-need-ready] button')).toBeVisible();
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
  // every call open now (the cards, and Emergency) asks first (AH-CALL-CONFIRM): its question's one link is a tel:
  const calls = page.locator('.ahead [data-call]');
  expect(await calls.count()).toBeGreaterThan(0);
  for (let i = 0; i < (await calls.count()); i += 1) {
    await calls.nth(i).click();
    const box = page.locator('[data-call-ask]');
    await expect(box.getByRole('link')).toHaveAttribute('href', /^tel:(\+\d{7,15}|1\d{1,3})$/);
    await box.getByRole('button', { name: 'Cancel' }).click();
    await expect(box).toHaveCount(0);
  }
  // and in each chip's panel: every number there is a callable one
  for (const chip of ['Bike shop', 'Pharmacy', 'Bail out by train', 'Toilets', 'Shelter']) {
    await page.locator('.ah-chips').getByRole('button', { name: chip, exact: true }).click();
    const inPanel = page.locator('.ah-chip-panel [data-call]');
    for (let i = 0; i < (await inPanel.count()); i += 1) {
      await inPanel.nth(i).click();
      const box = page.locator('[data-call-ask]');
      await expect(box.getByRole('link'), chip).toHaveAttribute('href', /^tel:\+\d{7,15}$/);
      await box.getByRole('button', { name: 'Cancel' }).click();
    }
  }
  for (const chip of ['Bike shop', 'Shelter']) await page.locator('.ah-chips').getByRole('button', { name: chip, exact: true }).click();
  for (const href of await page.locator('a.ah-link').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))) {
    expect(href).toMatch(/^https?:\/\//);   // a call is a button that asks first (AH-CALL-CONFIRM)
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
  await card.getByRole('button', { name: 'Call 112' }).click();   // it asks first (AH-CALL-CONFIRM), offline too
  await expect(card.getByRole('link', { name: 'Call 112 now' })).toHaveAttribute('href', 'tel:112');
  await expect(card).toContainText('112 — works across Europe and on many mobile networks; check the local number');
  await expect(card).toContainText(/\d+\.\d{5}, \d+\.\d{5}/);
  // Nothing leaves the phone: every request, the app's own fonts included, is the app's own address answered by its worker.
  for (const r of asked) {
    expect(new URL(r.url()).origin, r.url()).toBe(new URL(app!.origin).origin);
    expect((await r.response())?.fromServiceWorker(), r.url()).toBe(true);
  }
});

/** The opener's box and, once it is tapped, the call link's, both in page coordinates; and what lies under the old box now. */
async function openAndMeasure(page: Page, opener: ReturnType<Page['locator']>) {
  await opener.scrollIntoViewIfNeeded();
  const before = await opener.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left + scrollX, right: r.right + scrollX }; });
  await opener.click();
  const box = page.locator('[data-call-ask]');
  await expect(box).toBeVisible();
  return page.evaluate((old) => {
    const link = document.querySelector('[data-call-ask] a[href^="tel:"]')!.getBoundingClientRect();
    const linkTop = link.top + scrollY, linkBottom = link.bottom + scrollY;
    let under = 0;
    for (let fy = 0; fy <= 1; fy += 0.05) for (let fx = 0.02; fx <= 0.98; fx += 0.12) {
      const x = old.left + fx * (old.right - old.left) - scrollX, y = old.top + fy * (old.bottom - old.top) - scrollY;
      const hit = document.elementFromPoint(x, y);
      if (hit?.closest('a[href^="tel:"]')) under += 1;
    }
    return { clear: linkTop >= old.bottom + 16 || linkBottom <= old.top, under, height: link.height };
  }, before);
}

const SIZES = [320, 360, 414, 768, 1280];

test('[AH-CALL-CONFIRM] the call link never lies under any part of the button that opened it: 320 to 1280 px, text at 100 % and 200 %; Call N now is at least 56 px', async ({ page }) => {
  await ahead(page);
  for (const width of SIZES) for (const text of ['100%', '200%']) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate((t) => { document.documentElement.style.fontSize = t; }, text);
    await openEverything(page);
    const openers = page.locator('.ahead [data-call]');
    const n = await openers.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i += 1) {
      const m = await openAndMeasure(page, openers.nth(i));
      const where = `${width} px, text ${text}, call ${i}`;
      expect(m.clear, where).toBe(true);
      expect(m.under, where).toBe(0);
      expect(m.height, where).toBeGreaterThanOrEqual(55.5);
      await page.locator('[data-call-ask]').getByRole('button', { name: 'Cancel' }).click();
    }
  }
});

test('[AH-CALL-CONFIRM] at 360 px a double tap on a call button never dials, low on it or high (50, 80, 90, 95, 99 %); nor a double Enter, nor Enter, Tab, Enter in a hurry', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await ahead(page);
  await openEverything(page);
  // every activation of a tel: link that was not held back, and none leaves the page
  await page.evaluate(() => {
    (window as unknown as { __dials: number }).__dials = 0;
    window.addEventListener('click', (e) => {
      if (!(e.target as Element | null)?.closest?.('a[href^="tel:"]')) return;
      if (!e.defaultPrevented) (window as unknown as { __dials: number }).__dials += 1;
      e.preventDefault();
    });
  });
  const dials = () => page.evaluate(() => (window as unknown as { __dials: number }).__dials);
  const cancel = async () => {
    const c = page.locator('[data-call-ask]').getByRole('button', { name: 'Cancel' });
    if (await c.count()) await c.click();
    await page.waitForTimeout(450);
  };
  const openers = page.locator('.ahead [data-call]');
  const n = await openers.count();
  for (let i = 0; i < n; i += 1) {
    for (const f of [0.5, 0.8, 0.9, 0.95, 0.99]) {
      const opener = openers.nth(i);
      await opener.scrollIntoViewIfNeeded();
      const b = (await opener.boundingBox())!;
      const x = b.x + b.width / 2, y = b.y + b.height * f;
      await page.mouse.click(x, y);
      await page.waitForTimeout(150);
      await page.mouse.click(x, y);
      expect(await dials(), `call ${i} at ${f * 100} %`).toBe(0);
      await cancel();
    }
    await openers.nth(i).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    expect(await dials(), `call ${i}, Enter Enter`).toBe(0);
    await cancel();
    await openers.nth(i).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    expect(await dials(), `call ${i}, Enter Tab Enter`).toBe(0);
    await cancel();
  }
  // and a deliberate call still goes: after the question has stood a moment
  await openers.first().click();
  await page.waitForTimeout(450);
  await page.locator('[data-call-ask]').getByRole('link').click();
  expect(await dials()).toBe(1);
});

/** Every tel: link on the page, whether shown or not. */
const telLinks = (page: Page) => page.evaluate(() => [...document.querySelectorAll('a[href]')].filter((a) => /^\s*tel:/i.test(a.getAttribute('href') ?? '')).length);

test('[AH-CALL-CONFIRM] no tel: link is ever the first tap: on every screen, with everything open on Ahead, and Emergency with no route', async ({ page }) => {
  await ahead(page);
  await openEverything(page);
  for (const chip of ['Bike shop', 'Pharmacy', 'Bail out by train', 'Toilets', 'Shelter', 'Emergency']) {
    await page.locator('.ah-chips').getByRole('button', { name: chip, exact: true }).click();
    const more = page.locator('.ahead button', { hasText: /^Show \d+ more$/ });
    while ((await more.count()) > 0) await more.first().click();
    expect(await telLinks(page), chip).toBe(0);
  }
  for (const hash of ['#/trip', '#/tools', '#/you', '#/tools/tyre']) {
    await page.goto(`${app!.origin}/${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app .shell');
    await page.waitForTimeout(300);
    expect(await telLinks(page), hash).toBe(0);
  }
  // a rider with no route: a fresh address, so nothing is stored
  await app!.close();
  app = await loadApp(page, { launch: true, path: '/#/ahead' });
  await expect(page.locator('[data-ahead="no-route"]')).toBeVisible();
  await page.locator('.ah-chips').getByRole('button', { name: 'Emergency', exact: true }).click();
  await expect(page.locator('#chip-emergency [data-call]').first()).toBeVisible();
  expect(await telLinks(page)).toBe(0);
});

test('[AH-CALL-CONFIRM] offline at 360 px: Call 112 asks with the number and who it is, Call 112 now is the exact tel:112, Cancel changes nothing; 44 px targets', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await ahead(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  // The screen as the stored trip draws it, not its first frame: a card opened before that is drawn again, and the question with it.
  await expect(page.locator('[data-ahead="answers"]')).toBeVisible();
  await expect(page.locator('[data-card]')).toHaveCount(6);
  const asked = sent(page);
  await page.locator('.ah-chips').getByRole('button', { name: 'Emergency', exact: true }).click();
  const card = page.locator('#chip-emergency');
  const before = await card.innerHTML();
  await card.getByRole('button', { name: 'Call 112' }).click();
  const box = card.getByRole('alertdialog');
  await expect(box).toContainText('Call 112?');
  await expect(box).toContainText('All emergencies');
  const now = box.getByRole('link', { name: 'Call 112 now' });
  await expect(now).toHaveAttribute('href', 'tel:112');
  expect(await telLinks(page)).toBe(1);
  for (const el of [now, box.getByRole('button', { name: 'Cancel' })]) {
    const b = (await el.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(43.5);
    expect(b.width).toBeGreaterThanOrEqual(43.5);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // a scroll does not close it; Cancel does, and leaves the card as it was
  await page.mouse.wheel(0, 400);
  await expect(box).toBeVisible();
  await box.getByRole('button', { name: 'Cancel' }).click();
  await expect(box).toHaveCount(0);
  expect(await card.innerHTML()).toBe(before);
  expect(await telLinks(page)).toBe(0);
  expect(asked.filter((l) => !l.includes(new URL(app!.origin).host))).toEqual([]);
});

test('[AH-CALL-CONFIRM] a text message only opens the messaging app with the words to change: SMS stays a plain sms: link, and nothing is sent', async ({ page }) => {
  await ahead(page);
  const log = sent(page);
  await page.getByRole('button', { name: 'Share progress' }).click();
  const sms = page.locator('[data-share="progress"]').getByRole('link', { name: 'SMS' });
  await expect(sms).toHaveAttribute('href', /^sms:\?&body=[^&]+$/);   // no number: the rider picks one in the messaging app
  expect(await sms.getAttribute('target')).toBeNull();
  expect(log).toEqual([]);
});

test('[AH-EMERGENCY-POSITION] no route, offline, 360 px: Emergency’s own Update position shows the coordinates and their age; denied says what to do', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  app = await loadApp(page, { launch: true, path: '/#/ahead' });
  await expect(page.locator('[data-ahead="no-route"]')).toBeVisible();
  const emergency = page.locator('#chip-emergency');
  const open = async () => {
    await page.locator('.ah-chips').getByRole('button', { name: 'Emergency', exact: true }).click();
    await expect(emergency).toBeVisible();
  };
  // no permission: the browser says no
  await open();
  await emergency.getByRole('button', { name: 'Update position' }).click();
  await expect(emergency.getByRole('status')).toContainText('Allow it in the phone settings');
  // allowed, and offline: the phone's own position, with no request
  await context.grantPermissions(['geolocation'], { origin: app.origin });
  await context.setGeolocation({ latitude: 48.85837, longitude: 2.29448, accuracy: 9 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const asked = sent(page);
  await open();
  await emergency.getByRole('button', { name: 'Update position' }).click();
  await expect(emergency).toContainText('48.85837, 2.29448');
  await expect(emergency).toContainText(/Last position at \d{2}:\d{2} \((just now|1 min ago)\)/);
  await expect(emergency).not.toContainText('No position yet');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const el of await emergency.locator('button, a.btn').all()) {
    if (!(await el.isVisible())) continue;
    expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  }
  // 112 still asks first
  await emergency.getByRole('button', { name: 'Call 112' }).click();
  await expect(emergency.getByRole('link', { name: 'Call 112 now' })).toHaveAttribute('href', 'tel:112');
  expect(asked.filter((l) => !l.includes(new URL(app!.origin).host))).toEqual([]);
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

// Review I1 of PR 45: a shelter icon over a thunder band hid the band's bolt, leaving the warning to colour alone (AH-STRIP).
// Wider: thunder from before the rider to km 137, its shelter (Café Lindenhof, km 131, open, seats inside) at the middle. Narrower: a
// band of 0.8 km around the water and food icons at km 131.
for (const [name, range, what] of [['wider than the icon', [100, 137], 'Cover'], ['narrower than the icon', [130.6, 131.4], 'Water']] as const) {
  test(`[AH-STRIP] a thunder band ${name} keeps its bolt in sight with an icon (${what}) at its middle`, async ({ page }) => {
    test.skip(!['app-phone', 'app-laptop'].includes(test.info().project.name), 'both widths in the phone and laptop projects');
    const inputs = rainyStop({
      spells: [{ range: [...range], stamps: stamps(SAT, 13, 15), pp: 80, code: 95, mm: 2 }],
      opts: { from: '2026-10-16 01:00', extraKms: [125, range[0], 131, range[1], 137] },
    });
    await page.clock.install({ time: inputs.now });
    app = await loadApp(page, { launch: true, testHooks: true });
    await drawCase(page, inputs);
    const seen = await page.evaluate((kind) => {
      const strip = document.querySelector('[data-strip]')!;
      const band = strip.querySelector<HTMLElement>('.ah-band-thunder')!;
      const bolt = band.querySelector('.ah-bolt')!.getBoundingClientRect();
      const bar = band.querySelector('.ah-band-bar')!.getBoundingClientRect();
      const marks = [...strip.querySelectorAll('.ah-icon > svg, .ah-icon-n')].map((d) => d.getBoundingClientRect());
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const over = [...strip.querySelectorAll<HTMLElement>('.ah-icon')].filter((i) => {
        const r = i.getBoundingClientRect();
        return r.left + r.width / 2 >= bar.left - 1 && r.left + r.width / 2 <= bar.right + 1 && (i.getAttribute('aria-label') ?? '').includes(kind);
      });
      const top = document.elementFromPoint(bolt.left + bolt.width / 2, bolt.top + bolt.height / 2);
      return { iconOver: over.length, covered: marks.some((d) => overlaps(d, bolt)), boltOnTop: top?.closest('.ah-bolt') !== null, barW: bar.width };
    }, what);
    expect(seen.iconOver, `the ${what} icon lies over the thunder band`).toBeGreaterThan(0);
    expect(seen.covered, 'no icon covers the bolt').toBe(false);
    expect(seen.boltOnTop, 'the bolt is what shows at its place').toBe(true);
    if (name === 'narrower than the icon') expect(seen.barW).toBeLessThan(44);
    if (name === 'wider than the icon') expect(seen.barW).toBeGreaterThan(44);
  });
}

// Review of PR 73, M3: Ahead's own Prepare this route button is wired to Trip's very prepare, not a stand-in: on the fixture route
// with nothing saved it saves the places, and the cards that waited for them answer.
test('[AH-BEFORE-READY] on the real site, Ahead’s Prepare this route saves the places and the waiting cards answer', async ({ page }) => {
  app = await loadApp(page);
  const later = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: later });
  await servePack(page, 'heidelberg-strasbourg');
  await page.goto(`${app.origin}/#/ahead`);
  const card = page.locator('[data-need-ready]');
  await expect(card).toContainText('En route needs Prepare this route');
  await expect(page.locator('[data-card="water"]')).toContainText('After Prepare this route');
  await card.getByRole('button', { name: 'Prepare this route' }).click();
  await expect(page.locator('[data-card="water"] .ah-toggle')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-card="food"] .ah-toggle')).toBeVisible();
  // No forecast here (the weather service is unreachable in the test): the card names that step, with Try again.
  await expect(page.locator('[data-need-ready]')).toContainText('Not saved');
  await expect(page.locator('[data-need-ready]').getByRole('button', { name: 'Try again' })).toBeVisible();
});
