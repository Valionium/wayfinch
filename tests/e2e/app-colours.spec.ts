// Our own colour picker (wish 4, design of 14 Nov 2026): Look's More colours opens the shade grid of colours.js, not the browser's own
// colour input, which looks different on every phone. Nothing here prints the page: failures compare booleans, counts and short values.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const BLUE = { id: 'bike_blue', name: 'Blue tourer', frontTyre: '40-622', rearTyre: '40-622', fit: { style: 'diamond-level', size: { kind: 'letter', value: 'M' } }, look: { colour: '#2563b8', bars: 'drop', ebike: false } };
const BIKES = { 'loadcheck:bikeProfile': JSON.stringify(BLUE), 'loadcheck:bikeProfiles': JSON.stringify([BLUE]) };
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!).look.colour as string | null);
const frame = (page: Page) => page.locator('#lookPreview .bk-paint').first();

async function look(page: Page, entries: Record<string, string> = BIKES): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, entries);
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#rigBike svg.bk')).toBeVisible();
  await page.evaluate("openBikeDetails(document.getElementById('rigBikeDetails'), 'look')");
  await expect(page.locator('#bikeLook')).toBeVisible();
}
const grid = (page: Page) => page.getByRole('radiogroup', { name: 'More colours' });
const chip = (page: Page) => page.locator('#lookPickerChip');

test('[LC-COLOURS-PICK] More colours opens our grid, not the browser\'s input; a tap saves the colour in lower case and the bike shows it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await look(page);
  expect(await page.locator('input[type=color]').count()).toBe(0);
  await expect(chip(page)).toHaveAttribute('aria-expanded', 'false');
  await chip(page).click();
  await expect(chip(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(grid(page)).toBeVisible();
  // the bike's own colour, Blue, is the one marked, and named above the grid
  await expect(grid(page).getByRole('radio', { name: 'Blue', exact: true })).toBeChecked();
  await expect(page.locator('.wf-colours-name')).toHaveText('Blue');
  await grid(page).locator('label', { hasText: /^Burgundy$/ }).click();
  await expect(frame(page)).toHaveAttribute('stroke', '#6b1d2a');
  await expect.poll(() => stored(page)).toBe('#6b1d2a');
  await expect(grid(page).getByRole('radio', { name: 'Burgundy' })).toBeChecked();
  await expect(page.locator('.wf-colours-name')).toHaveText('Burgundy');
  await expect(chip(page)).toHaveClass(/\bon\b/);   // a colour beyond the swatches marks More colours
  expect(await page.locator('#lookSwatches input:checked').count()).toBe(0);
  // a swatch in the grid marks the swatch too
  await grid(page).locator('label', { hasText: /^Green$/ }).click();
  await expect.poll(() => stored(page)).toBe('#2f7d4f');
  await expect(page.locator('#lookSwatches').getByRole('radio', { name: 'Green' })).toBeChecked();
  await expect(chip(page)).not.toHaveClass(/\bon\b/);
  // Undo brings the opening colour back, as for any other Look choice
  await page.locator('#lookUndo').click();
  await expect.poll(() => stored(page)).toBe('#2563b8');
  await expect(grid(page).getByRole('radio', { name: 'Blue', exact: true })).toBeChecked();
  // Done closes the grid and returns to the chip
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(grid(page)).toBeHidden();
  await expect(chip(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test('[LC-COLOURS-PICK] a colour from before that is not in the grid loads unchanged, is named by the nearest swatch, and stays until a pick', async ({ page }) => {
  const own = { ...BLUE, look: { colour: '#a1b2c3', bars: 'drop', ebike: false } };
  await look(page, { 'loadcheck:bikeProfile': JSON.stringify(own), 'loadcheck:bikeProfiles': JSON.stringify([own]) });
  await expect(frame(page)).toHaveAttribute('stroke', '#a1b2c3');
  await expect(chip(page)).toHaveClass(/\bon\b/);
  await chip(page).click();
  // the owner's ruling of 14 Nov 2026: it is the one cell checked, Keep my colour, first; none of the 65
  await expect(grid(page).getByRole('radio', { name: 'Keep my colour' })).toBeChecked();
  expect(await grid(page).locator('input:checked').count()).toBe(1);
  await expect(page.locator('.wf-colours-name')).toHaveText('Your own colour, close to Silver');
  await page.keyboard.press('Escape');
  await expect(grid(page)).toBeHidden();
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();   // Escape closes the grid, not Bike details
  expect(await stored(page)).toBe('#a1b2c3');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfiles')!)[0].look.colour)).toBe('#a1b2c3');
});

test('[LC-COLOURS-KEYS] keyboard only: the chip opens the grid on the bike\'s colour, arrows move in two directions and the bike follows, Escape returns', async ({ page }) => {
  await look(page);
  await chip(page).focus();
  await page.keyboard.press('Enter');
  const blue = grid(page).getByRole('radio', { name: 'Blue', exact: true });
  await expect(blue).toBeFocused();
  await page.keyboard.press('ArrowDown');   // Blue's row is followed by Purple's: the same column
  await expect(grid(page).getByRole('radio', { name: 'Purple', exact: true })).toBeFocused();
  await expect(grid(page).getByRole('radio', { name: 'Purple', exact: true })).toBeChecked();
  await expect(frame(page)).toHaveAttribute('stroke', '#6b3fa0');
  await page.keyboard.press('ArrowRight');
  await expect(grid(page).getByRole('radio', { name: 'Deep purple' })).toBeFocused();
  await expect(frame(page)).toHaveAttribute('stroke', '#50277d');
  await page.keyboard.press('Home');
  await expect(grid(page).getByRole('radio', { name: 'Lavender' })).toBeFocused();
  await page.keyboard.press('PageUp');
  await expect(grid(page).getByRole('radio', { name: 'White' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');   // the first stays
  await expect(grid(page).getByRole('radio', { name: 'White' })).toBeFocused();
  // saved once the rider pauses
  await expect.poll(() => stored(page)).toBe('#f4f4f2');
  // Tab leaves the grid in one step, to Done
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Done' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(grid(page).getByRole('radio', { name: 'White' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(grid(page)).toBeHidden();
  await expect(chip(page)).toBeFocused();
  await expect(chip(page)).toHaveAttribute('aria-expanded', 'false');
});

test('[LC-COLOURS-A11Y] 65 radios each named by its colour; at 320 px every cell is 44 px or more, nothing scrolls sideways, the mark is seen in this theme', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await look(page);
  await chip(page).click();
  const radios = grid(page).getByRole('radio');
  await expect(radios).toHaveCount(65);
  const names = await radios.evaluateAll((els) => els.map((el) => ((el as HTMLInputElement).labels?.[0]?.textContent ?? '').trim()));
  expect(names.every((n) => n.length > 2)).toBe(true);
  expect(new Set(names).size).toBe(65);
  for (const name of ['Burgundy', 'Raw aluminium', 'Navy', 'Neon yellow']) await expect(grid(page).getByRole('radio', { name, exact: true })).toHaveCount(1);
  const boxes = await grid(page).locator('label').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }));
  expect(boxes).toHaveLength(65);
  for (const [w, h] of boxes) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
  const chipBox = (await chip(page).boundingBox())!;
  expect(chipBox.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator('#bikeDetailsBody').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // the colour in use is marked by more than its colour: an outline that stands out from the dialog, and a tick
  const mark = await grid(page).locator('label:has(input:checked)').evaluate((el) => {
    const css = getComputedStyle(el);
    const tick = getComputedStyle(el, '::after');
    let bg = 'rgba(0, 0, 0, 0)';
    for (let at: Element | null = el.parentElement; at && /rgba\(0, 0, 0, 0\)|transparent/.test(bg); at = at.parentElement) bg = getComputedStyle(at).backgroundColor;
    return { outline: css.outlineColor, width: parseFloat(css.outlineWidth), style: css.outlineStyle, bg, tick: tick.content !== 'none' && tick.content !== '' };
  });
  expect(mark.style).toBe('solid');
  expect(mark.width).toBeGreaterThanOrEqual(2);
  expect(mark.tick).toBe(true);
  const rgb = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
  const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
  const [a, b] = [lum(rgb(mark.outline)), lum(rgb(mark.bg))];
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(3);
});

test('[LC-COLOURS-LAZY] colours.js loads only on the first tap of More colours, is precached, and works in flight mode', async ({ page, context }) => {
  const asked: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('/colours.js')) asked.push(r.url()); });
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, BIKES);
  const build = await page.evaluate(async () => (await (await fetch('/build.json')).json()) as { files: Record<string, string> });
  expect(Object.keys(build.files)).toContain('/tools/bags/colours.js');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('/offline-worker.js', { scope: '/', updateViaCache: 'none' });
    const w = reg.installing ?? reg.waiting ?? reg.active;
    if (w && w.state !== 'activated') await new Promise<void>((res) => w.addEventListener('statechange', () => { if (w.state === 'activated') res(); }));
  });
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#rigBike svg.bk')).toBeVisible();
  await page.evaluate("openBikeDetails(document.getElementById('rigBikeDetails'), 'look')");
  expect(asked).toEqual([]);
  expect(await page.evaluate('typeof window.WayfinchColours')).toBe('undefined');
  const served: boolean[] = [];
  page.on('response', (r) => { if (r.url().endsWith('/colours.js')) served.push(r.fromServiceWorker()); });
  await chip(page).click();
  await expect(grid(page)).toBeVisible();
  expect(served).toEqual([true]);
  await grid(page).locator('label', { hasText: /^Mint$/ }).click();
  await expect.poll(() => stored(page)).toMatch(/^#[0-9a-f]{6}$/);
  await context.setOffline(false);
});

// Keep my colour (the owner's ruling of 14 Nov 2026): a colour from before that is not in the grid has a cell of its own, first, so a rider
// who tries a grid colour can choose it again with a tap; the arrows reach it; nothing is stored by opening the grid.
test('[LC-COLOURS-KEEP] a colour from before: Keep my colour first, checked and focused; a grid tap saves, a tap on it saves it back; the arrows reach it; 44 px at 320 px', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 320, height: 640 });
  const own = { ...BLUE, look: { colour: '#a1b2c3', bars: 'drop', ebike: false } };
  await look(page, { 'loadcheck:bikeProfile': JSON.stringify(own), 'loadcheck:bikeProfiles': JSON.stringify([own]) });
  await chip(page).click();
  const keep = grid(page).getByRole('radio', { name: 'Keep my colour' });
  await expect(keep).toBeChecked();
  await expect(keep).toBeFocused();
  await expect(grid(page).getByRole('radio')).toHaveCount(66);
  expect(await grid(page).getByRole('radio').first().evaluate((el) => (el as HTMLInputElement).value)).toBe('#a1b2c3');
  // its cell: in the colour, 44 px or more, the mark an outline and a tick; nothing scrolls sideways
  const cell = grid(page).locator('label:has(input:checked) .wf-colour');
  const box = (await cell.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const label = (await grid(page).locator('label:has(input:checked)').boundingBox())!;
  expect(label.height).toBeGreaterThanOrEqual(44);
  const mark = await cell.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, outline: getComputedStyle(el).outlineStyle, tick: getComputedStyle(el, '::after').content }));
  expect(mark.bg).toBe('rgb(161, 178, 195)');
  expect(mark.outline).toBe('solid');
  expect(mark.tick).not.toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator('#bikeDetailsBody').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // opening stored nothing
  expect(await stored(page)).toBe('#a1b2c3');
  // a grid tap saves; the own colour stays offered; a tap on it saves it back, as every Look tap does
  await grid(page).locator('label', { hasText: /^Burgundy$/ }).click();
  await expect.poll(() => stored(page)).toBe('#6b1d2a');
  await expect(keep).not.toBeChecked();
  await expect(keep).toHaveCount(1);
  await grid(page).locator('label', { hasText: /^Keep my colour$/ }).click();
  await expect.poll(() => stored(page)).toBe('#a1b2c3');
  await expect(frame(page)).toHaveAttribute('stroke', '#a1b2c3');
  await expect(keep).toBeChecked();
  // the arrows: Right to White, Left back to it, each shown at once and stored once the rider pauses
  await keep.focus();
  await page.keyboard.press('ArrowRight');
  await expect(grid(page).getByRole('radio', { name: 'White' })).toBeFocused();
  await expect(frame(page)).toHaveAttribute('stroke', '#f4f4f2');
  await page.keyboard.press('ArrowLeft');
  await expect(keep).toBeFocused();
  await expect(keep).toBeChecked();
  await expect(frame(page)).toHaveAttribute('stroke', '#a1b2c3');
  await expect.poll(() => stored(page)).toBe('#a1b2c3');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfiles')!)[0].look.colour)).toBe('#a1b2c3');
  await page.keyboard.press('Escape');
  await expect(chip(page)).toBeFocused();
  expect(errors).toEqual([]);
});

// Review of PR 162, m1: another bike shown while the grid is open (another tab, a restored plan) starts Keep my colour again from that
// bike's colour, and a pending arrow move of the old bike is dropped: the old bike's colour is never stored on the new bike. The editor is
// moved here as renderBikeProfiles moves it when another tab changes the bikes.
test("[LC-COLOURS-KEEP] another bike shown while the grid is open: its own colour, never the old bike's; the old bike's pending arrow move stores nothing", async ({ page }) => {
  const own = { ...BLUE, id: 'bike_own', name: 'Own colour', look: { colour: '#a1b2c3', bars: 'drop', ebike: false } };
  const blue = { ...BLUE, id: 'bike_b', name: 'Blue one' };
  await look(page, { 'loadcheck:bikeProfile': JSON.stringify(own), 'loadcheck:bikeProfiles': JSON.stringify([own, blue]) });
  await chip(page).click();
  const keep = grid(page).getByRole('radio', { name: 'Keep my colour' });
  await expect(keep).toBeChecked();
  await expect(keep).toHaveAccessibleDescription('Your own colour, close to Silver');
  // an arrow paints White on the first bike, to be stored once the rider pauses; the shown bike changes before that
  await keep.focus();
  await page.keyboard.press('ArrowRight');
  await page.evaluate("BIKE_PROFILE_EDITOR_ID='bike_b';renderLook()");
  await expect(grid(page).getByRole('radio', { name: 'Blue', exact: true })).toBeChecked();
  await expect(keep).toHaveCount(0);
  await page.waitForTimeout(700);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfiles')!).map((b: { id: string; look: { colour: string } }) => [b.id, b.look.colour]));
  expect(saved).toEqual([['bike_own', '#a1b2c3'], ['bike_b', '#2563b8']]);
});
