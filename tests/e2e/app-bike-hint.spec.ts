// The first-run bike hint in a real browser (wish 17, design of 9 Nov 2026): the card on a new rider's first screen at phone and laptop
// size in both themes (the four app projects), Later by keyboard, Make it yours and back, 320 px, and a "fits better" line.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds, withStore } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';
import type { StoreInPage } from './fixtures/store-page.ts';

declare const __store: StoreInPage;

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  return problems;
}
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('[HINT-NEW] a new rider\'s Trip: the card first, about 200 px, with the Route step\'s Choose a GPX file still on the first screen; no pop-up, nothing moves the focus', async ({ page }) => {
  const problems = watch(page);
  app = await loadApp(page);
  const card = page.getByRole('region', { name: 'Design your bike' });
  await expect(card).toBeVisible();
  await expect(card).toContainText("The app's answers are more accurate when it knows your bike's size and frame type.");
  await expect(page.locator('.trip-main > *').first()).toHaveClass(/bike-hint/);
  const box = (await card.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(230);
  const viewport = page.viewportSize()!;
  const gpx = page.getByText('Choose a GPX file').first();
  await expect(gpx).toBeVisible();
  expect((await gpx.boundingBox())!.y + 44).toBeLessThanOrEqual(viewport.height);
  for (const target of [card.getByRole('link', { name: 'Make it yours' }), card.getByRole('button', { name: 'Later: show this smaller' })]) {
    const t = (await target.boundingBox())!;
    expect(t.height).toBeGreaterThanOrEqual(44);
    expect(t.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.locator('[role=dialog], dialog[open]').count()).toBe(0);
  expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(true);
  expect(await noSideways(page)).toBe(true);
  const results = await new AxeBuilder({ page }).include('.bike-hint').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  expect(problems).toEqual([]);
});

test('[HINT-SMALL] Later by keyboard: today\'s line at once, the focus on its Add your bike; after a reload it stays small', async ({ page }) => {
  app = await loadApp(page);
  const later = page.getByRole('button', { name: 'Later: show this smaller' });
  await later.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.bike-hint')).toHaveCount(0);
  const add = page.locator('.trip-bike figcaption a');
  await expect(add).toHaveText('Add your bike');
  await expect(add).toBeFocused();
  expect((await page.locator('.trip-bike').boundingBox())!.height).toBeLessThanOrEqual(120);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.trip-bike figcaption')).toBeVisible();
  await expect(page.locator('.bike-hint')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('copilot:bikeHint:v1'))).toMatch(/^[atypcgsw]+$/);
});

test('[HINT-SMALL] Make it yours opens Bike details at Your frame (frame style and size); back on Trip without saving, the line is small', async ({ page }) => {
  app = await loadApp(page);
  await page.getByRole('region', { name: 'Design your bike' }).getByRole('link', { name: 'Make it yours' }).click();
  await expect(page).toHaveURL(`${app.origin}/tools/bags/`);
  // The owner's ruling of 9 Nov 2026: "Open it at size and frame type". Bike details opens at its top, Your frame, not at Look.
  await expect(page.locator('#bikeDetailsTitle')).toBeFocused();
  for (const part of [page.locator('#bikeQuickTitle'), page.getByRole('group', { name: 'Frame style' }), page.getByRole('group', { name: 'Frame size' })]) await expect(part).toBeInViewport();
  await expect(page.locator('#bikeLookTitle')).not.toBeFocused();
  await page.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.trip-bike figcaption')).toBeVisible();
  await expect(page.locator('.bike-hint')).toHaveCount(0);
});

test('[HINT-NEW] 320 px: the card fits with no sideways scroll; [FIT-LINE] Tyre pressure\'s line shows with its 44 px link', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  app = await loadApp(page);
  await expect(page.getByRole('region', { name: 'Design your bike' })).toBeVisible();
  expect(await noSideways(page)).toBe(true);
  await page.goto(`${app.origin}/#/tools/tyre`, { waitUntil: 'domcontentloaded' });
  const line = page.locator('[data-fit-line]');
  await expect(line).toHaveText('No saved bike, so nothing is filled in. Add your bike and its tyre sizes fill in here.');
  expect((await line.getByRole('link', { name: 'Add your bike' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await noSideways(page)).toBe(true);
});

test('[HINT-LOCAL] Delete co-pilot data with a second window on Trip: that window, its Trip, Tools and Later never write the hint key back', async ({ page }) => {
  app = await loadApp(page);
  const other = await page.context().newPage();
  await other.goto(app.origin, { waitUntil: 'domcontentloaded' });
  await expect(other.getByRole('region', { name: 'Design your bike' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('copilot:bikeHint:v1'))).not.toBeNull();
  await withStore(page);
  await page.evaluate(() => __store.deleteCopilotData());
  const copilot = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('copilot:')));
  expect(await copilot()).toEqual([]);
  // The second window goes on: Tools (a place seen), Trip again, Later.
  await other.evaluate(() => { location.hash = '#/tools'; });
  await expect(other.locator('[data-hint-line]')).toBeVisible();
  await other.evaluate(() => { location.hash = '#/trip'; });
  await other.getByRole('button', { name: 'Later: show this smaller' }).click();
  await expect(other.locator('.bike-hint')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await copilot()).toEqual([]);
  await other.close();
});

test('[HINT-LOCAL] Delete co-pilot data on You, then Tools, Tyre pressure, Bike care and Trip in the same window: no co-pilot key comes back', async ({ page }) => {
  app = await loadApp(page);
  await expect(page.getByRole('region', { name: 'Design your bike' })).toBeVisible();
  await page.evaluate(() => { location.hash = '#/tools'; });
  await expect(page.locator('[data-hint-line]')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/you'; });
  await page.getByRole('button', { name: 'Delete Wayfinch data from this phone' }).click();
  await page.getByRole('button', { name: 'Delete now' }).click();
  await expect(page.locator('[data-delete] [role=status]')).toBeVisible();
  const copilot = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('copilot:')));
  expect(await copilot()).toEqual([]);
  for (const [hash, mark] of [['#/tools', '[data-hint-line]'], ['#/tools/tyre', '[data-fit-line]'], ['#/tools/care', '[data-fit-line]'], ['#/trip', '.trip-bike']] as const) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await expect(page.locator(mark).first()).toBeVisible();
  }
  await page.waitForTimeout(300);
  expect(await copilot()).toEqual([]);
});

// The Bag planner's and the Gear advisor's "fits better" lines (design section 5): this page's own Bike details, so its way back is
// the planner or the advisor; a bike saved there hides the line, the focus stays on the page and the advisor answers for that bike.
test('[FIT-LINE] the Bag planner and the Gear advisor with no bike: a line under the drawing and above the results, each Add your bike 44 px into Bike details and back; a bike saved there, no line and an answer for it', async ({ page }) => {
  const problems = watch(page);
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY');
  const line = page.locator('#planFitLine');
  await expect(line).toHaveText('Drawn as a typical gravel bike, size M. Add your bike and the frame bag fits your frame.');
  const add = line.getByRole('button', { name: 'Add your bike' });
  const box = (await add.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  const drawing = (await page.locator('#rigSvg').boundingBox())!;
  // under the drawing on a phone; beside it when wide, as the weight map, so the sticky rig still fits the window
  if (page.viewportSize()!.width < 1100) expect(box.y).toBeGreaterThan(drawing.y + drawing.height - 1);
  else expect(box.x).toBeGreaterThan(drawing.x + drawing.width - 1);
  expect(await noSideways(page)).toBe(true);
  await add.click();
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await expect(page.locator('#bikeDetailsTitle')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#bikeDetailsBox')).toBeHidden();
  await expect(add).toBeFocused();
  // the Gear advisor on a plan with bags and no bike: no line until there are results, then one, above them
  await page.evaluate(`Object.assign(S, { nights: 2, sleep: 'camp', mode: 'comfort', decks: { bar: false, rack: false }, nextUid: 6,
      bags: [{ uid: 1, pos: 'seat', L: 14 }, { uid: 2, pos: 'bar', L: 12 }, { uid: 3, pos: 'top', slot: 'front', L: 1 }, { uid: 4, pos: 'bottle', slot: 'dt', L: 0.75 }, { uid: 5, pos: 'bottle', slot: 'st', L: 0.75 }] });
    applyTripKitDefaults(); openAdvisor(document.getElementById('rigBikeDetails'));`);
  const advisor = page.locator('#advisorBox');
  const fit = page.locator('#advisorFitLine');
  await expect(advisor.locator('#advisorAnswer')).toHaveText('Choose all three steps to see what to get.');
  await expect(fit).toBeHidden();
  await advisor.locator('label.adv-choice', { hasText: 'Bikepacking bags only' }).click();
  await advisor.locator('label.adv-choice', { hasText: 'Better handling' }).click();
  await expect(page.locator('#advisorAnswer h3')).toHaveText('What to get', { timeout: 30_000 });
  await expect(fit).toHaveText('Sizes for a typical frame. Add your bike for bag sizes that fit it.');
  await expect(line).toBeHidden();   // the planner's line is not on the advisor's page: one per screen
  const fitAdd = fit.getByRole('button', { name: 'Add your bike' });
  expect((await fitAdd.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await fitAdd.boundingBox())!.y).toBeLessThan((await page.locator('#advisorAnswer h3').boundingBox())!.y);
  expect(await noSideways(page)).toBe(true);
  await fitAdd.click();
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await page.evaluate(() => { (document.getElementById('bikeMoreDetails') as HTMLDetailsElement).open = true; (document.getElementById('bikeLibraryPanel') as HTMLDetailsElement).open = true; });
  await page.locator('#bikeName').fill('Mine');
  const runsBefore = await page.evaluate('ADVISOR_RUN') as number;
  await page.locator('#bikeSave').click();
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('loadcheck:bikeProfiles') ?? '[]') as { name: string }[]).map((b) => b.name))).toEqual(['Mine']);
  await page.keyboard.press('Escape');
  await expect(page.locator('#bikeDetailsBox')).toBeHidden();
  await expect(fit).toBeHidden();
  await expect(page.locator('#advisorTitle')).toBeFocused();
  await expect(page.locator('#advisorBikeSelect')).toHaveValue(/.+/);
  // the advisor searched again, on the saved bike (a newer run than before the save, an answer that has it), not the old answer kept
  expect(await page.evaluate('ADVISOR_RUN') as number).toBeGreaterThan(runsBefore);
  await expect(page.locator('#advisorAnswer h3')).toHaveText('What to get', { timeout: 30_000 });
  expect(await page.evaluate('S.bikeProfile && S.bikeProfile.name')).toBe('Mine');
  expect(await page.evaluate('ADVISOR.sig === planSignature()')).toBe(true);
  // the page wrote none of the co-pilot's keys
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('copilot:')))).toEqual([]);
  expect(problems).toEqual([]);
});

// Try a colour (wish 17, design of 9 Nov 2026, section 4.2; owner's answer 3): the card keeps the dots' row, so nothing moves when they
// arrive; a tap paints the frame at once; Make it yours carries the colour into Bike details, picked and not saved.
test('[HINT-COLOUR] five dots of 44 px in a row the card keeps, nothing moves when they load; a tap paints the bike; Make it yours opens Bike details with that colour picked and nothing saved', async ({ page }) => {
  const problems = watch(page);
  await page.addInitScript(() => { (window as unknown as { requestIdleCallback: unknown }).requestIdleCallback = (f: () => void) => setTimeout(f, 600); });
  app = await loadApp(page);
  const card = page.getByRole('region', { name: 'Design your bike' });
  await expect(card).toBeVisible();
  const first = (await card.boundingBox())!;
  const group = card.getByRole('group', { name: 'Try a colour' });
  await expect(group).toBeVisible();
  // the same height before and after the dots arrived: their row was kept
  const after = (await card.boundingBox())!;
  expect(Math.abs(after.height - first.height)).toBeLessThanOrEqual(0.5);
  expect(after.height).toBeLessThanOrEqual(230);
  const gpx = page.getByText('Choose a GPX file').first();
  expect((await gpx.boundingBox())!.y + 44).toBeLessThanOrEqual(page.viewportSize()!.height);
  // on a phone the whole Choose a GPX file button is above the tab bar
  if (page.viewportSize()!.width < 768) { const g = (await gpx.boundingBox())!; expect(g.y + g.height).toBeLessThanOrEqual((await page.locator('nav.tabs').boundingBox())!.y); }
  const names = ['Teal', 'Red', 'Blue', 'Yellow', 'Black'];
  for (const name of names) {
    const dot = group.getByRole('button', { name, exact: true });
    await expect(dot).toHaveAttribute('aria-pressed', 'false');
    const b = (await dot.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
  }
  expect(await noSideways(page)).toBe(true);
  const results = await new AxeBuilder({ page }).include('.bike-hint').analyze();
  expect(results.violations).toEqual([]);
  // by keyboard: Teal, pressed, paints the frame
  await group.getByRole('button', { name: 'Teal', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(group.getByRole('button', { name: 'Teal', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.bk-paint.bk-frame').first()).toHaveAttribute('stroke', '#1f7f80');
  const before = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  await card.getByRole('link', { name: 'Make it yours' }).click();
  await page.waitForURL(/\/tools\/bags\//);
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  // Teal is picked in Look, on the drawing there, and nothing is saved until the rider saves
  await expect(page.locator('#lookSwatches input:checked')).toHaveCount(1);
  expect(await page.locator('#lookSwatches label:has(input:checked)').innerText()).toMatch(/Teal/);
  expect(await page.evaluate(() => localStorage.getItem('loadcheck:bikeProfiles'))).toBeNull();
  // Wayfinch's own keys are as they were when Make it yours was tapped (the hint key's letters only grow by the tap, as before)
  const now = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('copilot:') && k !== 'copilot:bikeHint:v1'));
  expect(now).toEqual((JSON.parse(before) as [string, string][]).map(([k]) => k).filter((k) => k.startsWith('copilot:') && k !== 'copilot:bikeHint:v1'));
  expect(problems).toEqual([]);
});

// A bike saved in Bike details and then removed in the same dialog brings the line back: closing it puts the focus on Add your bike.
test('[FIT-LINE] a bike saved in Bike details and removed there again: the line is back and closing the dialog puts the focus on Add your bike', async ({ page }) => {
  const problems = watch(page);
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY');
  const line = page.locator('#planFitLine');
  const add = line.getByRole('button', { name: 'Add your bike' });
  await add.click();
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await page.evaluate(() => { (document.getElementById('bikeMoreDetails') as HTMLDetailsElement).open = true; (document.getElementById('bikeLibraryPanel') as HTMLDetailsElement).open = true; });
  await page.locator('#bikeName').fill('Mine');
  await page.locator('#bikeSave').click();
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('loadcheck:bikeProfiles') ?? '[]') as { name: string }[]).map((b) => b.name))).toEqual(['Mine']);
  await expect(line).toBeHidden();
  await page.locator('#bikeClear').click();   // the plan keeps its own copy of a removed bike, so the plan lets go of it too
  await page.locator('#bikeSavedSelect').selectOption({ label: 'Mine' });
  await page.locator('#bikeRemove').click();
  await page.locator('#bikeRemoveConfirm').click();
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('loadcheck:bikeProfiles') ?? '[]') as unknown[]).length)).toBe(0);
  await expect(line).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#bikeDetailsBox')).toBeHidden();
  await expect(add).toBeFocused();
  expect(problems).toEqual([]);
});

// Review of PR 111, I1: on a 320 px phone the Route step's Choose a GPX file stays as clear of the tab bar as before the dots; there the
// dots give way (the card's room goes to the Route step, design section 4.1), and at 360 px they show with the button still clear.
test('[HINT-COLOUR] 320 × 640 and 360 × 640: the whole Choose a GPX file button is above the tab bar; at 320 px the card has no dots', async ({ page }) => {
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 640 });
    app = await loadApp(page);
    const card = page.getByRole('region', { name: 'Design your bike' });
    await expect(card).toBeVisible();
    if (width === 360) await expect(card.getByRole('group', { name: 'Try a colour' })).toBeVisible();
    else { await page.waitForTimeout(800); await expect(card.getByRole('group', { name: 'Try a colour' })).toBeHidden(); }
    const g = (await page.getByText('Choose a GPX file').first().boundingBox())!;
    const bar = (await page.locator('nav.tabs').boundingBox())!;
    expect(g.y + g.height, `${width} px`).toBeLessThanOrEqual(bar.y);
    expect(await noSideways(page)).toBe(true);
    await app.close();
    app = undefined;
  }
});
