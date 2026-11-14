// How a bike is built in a real browser (design of 14 November 2026): opened from Tools, the rider's bike drawn in its own colour, a tap
// on the drawing or a label naming a part, its words and what it connects to, the parts list by keyboard, the type switch, zoom, 320 px
// and both themes (the projects give the size and the theme), offline, and nothing stored.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { goOffline, loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const ROAD = { id: 'bike_r', name: 'Red road', look: { colour: '#c0392b', bars: 'drop', ebike: false }, frontTyre: '28-622', rearTyre: '28-622', brakes: 'hydraulic-disc', drive: 'derailleur' };

async function seed(page: Page, bikes: unknown[]): Promise<void> {
  await page.evaluate((list) => {
    localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify(list));
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify((list as unknown[])[0]));
  }, bikes);
  await page.reload({ waitUntil: 'domcontentloaded' });
}
const errorsOf = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};
const storage = (page: Page) => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
const part = (page: Page, id: string) => page.locator(`.bl-part[data-part="${id}"]`);

/** Clicks the drawing at a part's point: where its label's leader ends. */
async function tapOnDrawing(page: Page, id: string): Promise<void> {
  const dot = page.locator(`.bl-leaders g[data-part="${id}"] circle`);
  const svg = (await page.locator('.bl-svg').boundingBox())!;
  const [cx, cy] = [Number(await dot.getAttribute('cx')), Number(await dot.getAttribute('cy'))];
  await page.mouse.click(svg.x + cx, svg.y + cy);
}

test('[BL-OPEN] Tools has a How a bike is built card; it opens the page, title focused, with the rider\'s bike in its colour, and writes nothing', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await seed(page, [ROAD]);
  await page.getByRole('link', { name: 'Open How a bike is built' }).click();
  await expect(page).toHaveURL(/#\/tools\?learn$/);
  // the Tools tab goes back to the cards
  await page.locator('nav.tabs a', { hasText: 'Tools' }).click();
  await expect(page.getByRole('link', { name: 'Open How a bike is built' })).toBeVisible();
  await page.goBack();
  const title = page.getByRole('heading', { name: 'How a bike is built', level: 2 });
  await expect(title).toBeFocused();
  const before = await storage(page);
  await expect(page.locator('nav.tabs a[aria-current="page"]')).toHaveText('Tools');
  await expect(page.getByLabel('Bike to show')).toHaveValue('own');
  await expect(page.locator('.bl-bike .bk-paint').first()).toHaveAttribute('stroke', '#c0392b');
  // a road bike: two chainrings, so a front derailleur; drop bars, so bar tape and no grips
  await expect(part(page, 'front-derailleur')).toBeVisible();
  await expect(part(page, 'bar-tape')).toBeVisible();
  await expect(part(page, 'grips')).toHaveCount(0);
  await part(page, 'chain').click();
  expect(await storage(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('[BL-TAP] a tap on the drawing names the part, says what it does and what it connects to; a tap on a connection jumps there', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools?learn' });
  await expect(page.getByRole('heading', { name: 'How a bike is built', level: 2 })).toBeVisible();
  // no bike saved: the typical gravel bike, and a way to add one
  await expect(page.getByLabel('Bike to show')).toHaveValue('gravel');
  await expect(page.getByRole('link', { name: 'Add your bike' })).toBeVisible();
  await tapOnDrawing(page, 'saddle');
  await expect(page.locator('.bl-name')).toHaveText('Saddle');
  await expect(page.locator('.bl-does')).toContainText('Where you sit.');
  await expect(part(page, 'saddle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.bl-label-hot')).toHaveAttribute('data-part', 'saddle');
  await expect(page.locator('.bl-layer .bl-hot').first()).toBeAttached();
  await page.locator('.bl-links').getByRole('button', { name: 'Seatpost' }).click();
  await expect(page.locator('.bl-name')).toHaveText('Seatpost');
  await expect(page.locator('.bl-links').getByRole('button', { name: 'Seat tube' })).toBeVisible();
  // a label is a target too
  await page.locator('.bl-tap[data-part="saddle"]').click({ force: true });
  await expect(page.locator('.bl-name')).toHaveText('Saddle');
  // empty ground far from the bike picks nothing new
  const box = (await page.locator('.bl-canvas').boundingBox())!;
  await page.mouse.click(box.x + 3, box.y + box.height - 3);
  await expect(page.locator('.bl-name')).toHaveText('Saddle');
});

test('[BL-LIST] every part is a button by group; the keyboard picks one, says it politely and keeps the focus; the drawing names it', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools?learn' });
  for (const g of ['Frame and fork', 'Wheels', 'Drivetrain', 'Brakes', 'Cockpit', 'Saddle']) await expect(page.getByRole('heading', { name: g, level: 4 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'E-bike', level: 4 })).toHaveCount(0);
  const hub = part(page, 'hub');
  await hub.focus();
  await page.keyboard.press('Enter');
  await expect(hub).toBeFocused();
  await expect(hub).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[aria-live="polite"]')).toHaveText(/^Hub: The middle of the wheel\./);
  await expect(page.locator('.bl-canvas')).toHaveAttribute('aria-label', /Marked: hub\./);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.locator('.bl-name')).toHaveText('Thru-axle');
  // the labels are pointer targets only
  await expect(page.locator('.bl-svg')).toHaveAttribute('aria-hidden', 'true');
});

test('[BL-SWITCH] the type switch draws a typical bike of each kind with its own parts; an e-bike adds the motor, a city bike hub gears', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools?learn' });
  const pick = page.getByLabel('Bike to show');
  await pick.selectOption('ebike');
  await expect(page.getByRole('heading', { name: 'E-bike', level: 4 })).toBeVisible();
  await part(page, 'motor').click();
  await expect(page.locator('.bl-tag')).toHaveText('Only on bikes with a motor.');
  await pick.selectOption('city');
  await expect(part(page, 'hub-gears')).toBeVisible();
  await expect(part(page, 'rim-brake')).toBeVisible();
  await expect(part(page, 'derailleur')).toHaveCount(0);
  await expect(part(page, 'motor')).toHaveCount(0);
  // the picked part is gone with the e-bike: nothing is picked
  await expect(page.locator('.bl-hint')).toBeVisible();
  await pick.selectOption('full');
  await expect(part(page, 'shock')).toBeVisible();
});

test('[BL-ZOOM] the zoom buttons zoom in on the picked part and back to the whole bike', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools?learn' });
  await part(page, 'derailleur').click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('.bl-canvas')).toHaveAttribute('data-zoom', '2.25');
  await expect(page.locator('.bl-label-hot')).toHaveAttribute('data-part', 'derailleur');
  await page.getByRole('button', { name: 'Whole bike' }).click();
  await expect(page.locator('.bl-canvas')).toHaveAttribute('data-zoom', '1');
});

// Sweep 2 of 15 Nov 2026, #7: a zoom made in Explore does not carry into Build-up, where it cut the crank off the drivetrain step.
test('[BL-ZOOM] a zoom in Explore is not carried into Build-up, nor back: each mode opens on the whole bike', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools?learn' });
  await part(page, 'derailleur').click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('.bl-canvas')).toHaveAttribute('data-zoom', '2.25');
  await page.getByRole('button', { name: 'Build-up', exact: true }).click();
  await expect(page.locator('.bl-canvas')).toHaveAttribute('data-zoom', '1');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.locator('.bl-canvas')).toHaveAttribute('data-zoom', '1');
});

test('[BL-PHONE] at 320 px and in this project\'s size and theme: no sideways scroll, 44 px targets, nothing axe objects to; it opens offline', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.goto(`${app.origin}/#/tools?learn`);
  await expect(page.locator('.bl-canvas')).toBeVisible();
  await goOffline(page);
  await page.reload();
  await expect(page.locator('.bl-canvas')).toBeVisible();
  const phone = (page.viewportSize()?.width ?? 0) < 600;
  if (phone) await page.setViewportSize({ width: 320, height: 640 });
  await part(page, 'chainring').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const small = await page.evaluate(() => [...document.querySelectorAll('.bl button, .bl select, .bl a')]
    .filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect())
    .filter((r) => r.height < 44 || r.width < 44).length);
  expect(small).toBe(0);
  const results = await new AxeBuilder({ page }).include('.bl').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('[BL-FOCUS] the focus never falls to the page: after a Connects-to button, when the zoom turns its own button off, and back from the page to Tools', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await page.getByRole('link', { name: 'Open How a bike is built' }).click();
  await expect(page.getByRole('heading', { name: 'How a bike is built', level: 2 })).toBeFocused();
  const onBody = () => page.evaluate(() => document.activeElement === document.body || document.activeElement === null);
  await part(page, 'saddle').click();
  await page.locator('.bl-links').getByRole('button', { name: 'Seatpost' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.bl-name')).toHaveText('Seatpost');
  await expect(page.locator('.bl-name')).toBeFocused();
  expect(await onBody()).toBe(false);
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  await zoomIn.focus();
  await page.keyboard.press('Enter');
  await zoomOut.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.bl-canvas')).toHaveAttribute('data-zoom', '1');
  await expect(zoomIn).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Whole bike' }).focus();
  await page.keyboard.press('Enter');
  await expect(zoomIn).toBeFocused();
  for (let n = 0; n < 4; n += 1) await page.keyboard.press('Enter');
  await expect(page.locator('.bl-canvas')).toHaveAttribute('data-zoom', '4');
  await expect(zoomOut).toBeFocused();
  expect(await onBody()).toBe(false);
  await page.goBack();
  await expect(page.getByRole('link', { name: 'Open How a bike is built' })).toBeFocused();
});

test('[BL-OWN] a saved bike with no brakes or gears told is shown with disc brakes and derailleur gears, said plainly, with a way to set them', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools?learn' });
  await seed(page, [{ id: 'bike_n', name: 'Plain', frontTyre: '40-622', rearTyre: '40-622' }]);
  await expect(page.getByLabel('Bike to show')).toHaveValue('own');
  await expect(page.locator('.bl-shows')).toContainText('brakes aren\'t set, so this shows disc brakes');
  await expect(page.locator('.bl-shows')).toContainText('gears aren\'t set, so this shows derailleur gears');
  await expect(page.locator('.bl-shows').getByRole('link', { name: 'Set them in Bike details' })).toHaveAttribute('href', /bike-details=bike_n/);
  await expect(page.getByRole('heading', { name: 'Brakes', level: 4 })).toBeVisible();
  await expect(part(page, 'brake-lever')).toBeVisible();
  await expect(part(page, 'derailleur')).toBeVisible();
});

test('[BL-OWN] a single speed is drawn and named as one; brakes set as Other are named so, with nothing to set', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools?learn' });
  await seed(page, [{ id: 'bike_s', name: 'Fixie', frontTyre: '28-622', rearTyre: '28-622', brakes: 'other', shifting: 'none' }]);
  await expect(page.getByLabel('Bike to show')).toHaveValue('own');
  await expect(page.locator('.bl-shows')).toContainText('single speed');
  await expect(page.locator('.bl-shows')).toContainText('set as Other');
  await expect(page.locator('.bl-shows')).not.toContainText('aren\'t set');
  await expect(page.locator('.bl-shows').getByRole('link')).toHaveCount(0);
  await expect(part(page, 'chain')).toBeVisible();
  for (const id of ['derailleur', 'cassette', 'shifter', 'gear-cable']) await expect(part(page, id)).toHaveCount(0);
  await expect(page.locator('.bl-bike .bk-mech')).toHaveCount(0);
});

test('[BL-FOCUS] the Tools tab from the page shows Tools from its top, the focus on the page\'s card, not the page\'s start', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await page.getByRole('link', { name: 'Open How a bike is built' }).click();
  await expect(page.getByRole('heading', { name: 'How a bike is built', level: 2 })).toBeFocused();
  await part(page, 'saddle').scrollIntoViewIfNeeded();
  await page.locator('nav.tabs a', { hasText: 'Tools' }).click();
  await expect(page.getByRole('link', { name: 'Open How a bike is built' })).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

// The owner's report of 14 Nov 2026: a tap on a part marked it, but the whole drawing flashed as one blue box for a moment. The drawing's
// hand cursor is inherited by all it holds, and a phone's tap highlight covers the outermost element showing it: the whole drawing.
const CLEAR = 'rgba(0, 0, 0, 0)';
test('[BL-NO-FLASH] a tap on the drawing flashes no box: no tap highlight on the drawing or anything in it; the keyboard\'s focus ring is on the part button, never the drawing', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools?learn' });
  await expect(page.locator('.bl-label').first()).toBeVisible();
  const flash = await page.evaluate(() => ['.bl-canvas', '.bl-svg', '.bl-art', '.bl-bike', '.bl-label', '.bl-tap', '.bl-label text']
    .map((s) => { const el = document.querySelector(s); return `${s} ${el ? getComputedStyle(el).getPropertyValue('-webkit-tap-highlight-color') : 'missing'}`; }));
  expect(flash).toEqual(['.bl-canvas', '.bl-svg', '.bl-art', '.bl-bike', '.bl-label', '.bl-tap', '.bl-label text'].map((s) => `${s} ${CLEAR}`));
  // a tap on the drawing marks the part and never takes the focus
  await tapOnDrawing(page, 'saddle');
  await expect(page.locator('.bl-name')).toHaveText('Saddle');
  expect(await page.evaluate(() => document.activeElement?.closest('.bl-canvas') ?? null)).toBeNull();
  // the keyboard: the part button shows the ring; the drawing has none and is never a stop
  await page.keyboard.press('Shift');
  await part(page, 'chain').focus();
  const ring = await page.evaluate(() => {
    const b = document.activeElement as HTMLElement;
    const c = document.querySelector<HTMLElement>('.bl-canvas')!;
    return { visible: b.matches(':focus-visible'), button: getComputedStyle(b).outlineStyle, canvas: getComputedStyle(c).outlineStyle, stop: c.tabIndex };
  });
  expect(ring).toEqual({ visible: true, button: 'solid', canvas: 'none', stop: -1 });
});
