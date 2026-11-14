// Bike care in a real browser (sub-project 12, group 1): opened from You with a bike chosen, a chosen bike deleted in another tab, and the
// screen at phone and laptop size in both themes (the projects give the size and the theme), at 200% text, offline, by keyboard.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { goOffline, loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const mk = (id: string, name: string, extra: Record<string, unknown>) => ({
  id, name, look: { colour: null, bars: 'drop', ebike: false }, frontTyre: '40-622', rearTyre: '40-622', pressure: { wheel: '700c' }, ...extra,
});
/** Every detail answered: rim brakes, tubes, a derailleur on cables, no suspension. */
const A = mk('bike_a', 'Gravel', { brakes: 'rim', tyres: 'tubes', drive: 'derailleur', shifting: 'cable', suspension: 'none' });
/** Disc brakes, tubeless, full suspension. */
const B = mk('bike_b', 'Trail', { brakes: 'hydraulic-disc', tyres: 'tubeless', drive: 'derailleur', shifting: 'cable', suspension: 'full' });
/** Nothing told: every detail Not sure. */
const U = { id: 'bike_u', name: 'Old one', frontTyre: '', rearTyre: '' };
const choice = (bikeId: string) => JSON.stringify({ app: 'copilot', kind: 'bike-choice', v: 1, bikeId, at: new Date(Date.now() - 60_000).toISOString() });

async function seed(page: Page, bikes: unknown[], chosen: string | null): Promise<void> {
  await page.evaluate(([list, record]) => {
    localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify(list));
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify((list as unknown[])[0]));
    if (record) localStorage.setItem('copilot:bikeChoice:v1', record as string);
  }, [bikes, chosen ? choice(chosen) : null] as const);
  await page.reload({ waitUntil: 'domcontentloaded' });
}
// Since the review of PR 72 (I4) a task or card in the list is one button that opens its full-screen step view at once.
const task = (page: Page, id: string) => page.locator(`.care-task[data-id="${id}"]`);
const errorsOf = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

test('[BC-FROM-YOU] Care for this bike in You opens Bike care with that bike chosen, even when another was chosen', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/you' });
  await seed(page, [A, B], 'bike_a');
  await page.getByRole('link', { name: 'Care for this bike Trail' }).click();
  await expect(page).toHaveURL(/#\/tools\/care$/);
  await expect(page.getByRole('heading', { name: 'Bike care', level: 2 })).toBeVisible();
  await expect(page.locator('#tools-bike')).toHaveValue('bike_b');
  await expect(task(page, 'brakes-pads-disc')).toBeVisible();
  await expect(task(page, 'tyres-sealant-topup')).toBeVisible();
  await expect(task(page, 'brakes-pads-rim')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('copilot:bikeChoice:v1')!).bikeId)).toBe('bike_b');
  // and back: Gravel's link chooses Gravel
  await page.goto(`${app.origin}/#/you`);
  await page.getByRole('link', { name: 'Care for this bike Gravel' }).click();
  await expect(page.locator('#tools-bike')).toHaveValue('bike_a');
  await expect(task(page, 'brakes-pads-rim')).toBeVisible();
  await expect(task(page, 'brakes-pads-disc')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('[BC-BIKE-GONE] the chosen bike deleted in another tab: the list refits to the fallback, no error in the console', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [A, B], 'bike_b');
  await expect(task(page, 'brakes-pads-disc')).toBeVisible();
  // The bag planner, in another tab, deletes Trail.
  const other = await page.context().newPage();
  await other.goto(`${app.origin}/build.json`);
  await other.evaluate((list) => localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify(list)), [A]);
  await other.close();
  await expect(task(page, 'brakes-pads-disc')).toHaveCount(0);
  await expect(task(page, 'brakes-pads-rim')).toBeVisible();
  await expect(page.locator('.bike-line')).toContainText('Gravel');
  expect(errors).toEqual([]);
});

test("[BC-BIKE-GONE] switching bike on the Care screen's own bike line refits the list at once (review of PR 58, I4)", async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [A, B], 'bike_a');
  await expect(task(page, 'brakes-pads-rim')).toBeVisible();
  await expect(task(page, 'brakes-pads-disc')).toHaveCount(0);
  await page.selectOption('#tools-bike', 'bike_b');
  await expect(task(page, 'brakes-pads-disc')).toBeVisible();
  await expect(task(page, 'brakes-pads-rim')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('[BC-SCREEN] every task, at the project size and at 200% text: no sideways scroll; a task opens its steps, numbered in All steps', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await expect(page.locator('.care-task').first()).toBeVisible();
  for (const zoom of ['100%', '200%']) {
    await page.evaluate((z) => { document.documentElement.style.fontSize = z; }, zoom);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), zoom).toBe(true);
    for (const d of await page.locator('.care-task').all()) {
      const box = (await d.boundingBox())!;
      expect(box.x + box.width, zoom).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
    }
  }
  await task(page, 'brakes-pads-disc').locator('.care-open').click();
  await page.getByRole('button', { name: 'All steps' }).click();
  await expect(page.getByRole('dialog').locator('.care-step-all')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // every task shows, the conditioned ones tagged, and the quiet line leads to the bike's details
  await expect(page.locator('.care-task')).toHaveCount(48);
  await expect(page.getByRole('link', { name: "Tell us your brakes, tyres… to hide what doesn't apply" })).toHaveAttribute('href', '/tools/bags/#bike-details=bike_u&back=care');
  // the tablist and the filters have names
  await expect(page.getByRole('tablist', { name: 'Bike care' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Parts' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(7);
});

test('[BC-SCREEN] Tab reaches every tab, filter, task and link; each task opens with Enter and Space', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await expect(page.locator('.care-task')).toHaveCount(48);
  await page.getByRole('link', { name: 'Tools', exact: true }).first().focus();
  const reached: string[] = [];
  for (let i = 0; i < 90; i += 1) {
    await page.keyboard.press('Tab');
    const here = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.closest('.care')) return null;
      const t = el.closest('.care-task') as HTMLElement | null;
      return el.classList.contains('care-open') && t ? `task:${t.dataset.id}` : `${el.getAttribute('role') ?? el.tagName.toLowerCase()}:${(el.textContent ?? '').trim() || el.id}`;
    });
    if (here) reached.push(here);
  }
  for (const want of ['tab:Care', 'tab:Roadside repairs', 'input:care-search', "a:Tell us your brakes, tyres… to hide what doesn't apply"]) expect(reached, want).toContain(want);
  for (const part of ['Chain', 'Brakes', 'Tyres', 'Gears', 'Wheels', 'Suspension', 'E-bike', 'Frame & bolts']) expect(reached, part).toContain(`button:${part}`);
  const ids = await page.locator('.care-task').evaluateAll((ds) => ds.map((d) => (d as HTMLElement).dataset.id!));
  for (const id of ids) expect(reached, id).toContain(`task:${id}`);
  // Enter opens one task's steps, Space another's; Escape closes and focus is back on the task
  await task(page, ids[0]!).locator('.care-open').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(task(page, ids[0]!).locator('.care-open')).toBeFocused();
  await task(page, ids[1]!).locator('.care-open').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // the arrow keys move between the tabs
  await page.getByRole('tab', { name: 'Care' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Roadside repairs' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Roadside repairs' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.care-road').first()).toBeVisible();
});

test('[BC-SCREEN] Bike care opens offline after one visit, and works there', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [A, B], 'bike_b');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Bike care', level: 2 })).toBeVisible();
  await expect(task(page, 'brakes-pads-disc')).toBeVisible();
  await page.getByRole('group', { name: 'Parts' }).getByRole('button', { name: 'Brakes' }).click(); // tasks are buttons now too
  await expect(page.locator('.care-task')).toHaveCount(7);
  await page.getByLabel('Search').fill('lube');
  await expect(page.getByText('Nothing matches.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filter' }).click();
  await expect(page.locator('.care-task')).toHaveCount(35);
  // the Roadside tab and the carry list work offline too
  await page.getByRole('tab', { name: 'Roadside repairs' }).click();
  await expect(page.locator('.care-road[data-id="puncture-tubeless"]')).toBeVisible();
  await expect(page.locator('.care-carry li[data-id="carry-plug-kit"]')).toBeVisible();
});

// ---- Roadside repairs and What to carry (sub-project 12, group 3) ----
const card = (page: Page, id: string) => page.locator(`.care-road[data-id="${id}"]`);
const roadTab = (page: Page) => page.getByRole('tab', { name: 'Roadside repairs' });

test('[BC-ROAD] the Roadside tab fits the chosen bike; every card open, at the project size and at 200% text: no sideways scroll; steps stay numbered; carry list at the bottom', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [A, B, U], 'bike_a');
  await roadTab(page).click();
  await expect(card(page, 'puncture-tube')).toBeVisible();
  await expect(card(page, 'puncture-tubeless')).toHaveCount(0);
  await expect(card(page, 'brake-rub-rim')).toBeVisible();
  await expect(card(page, 'brake-rub-disc')).toHaveCount(0);
  await expect(page.locator('.care-carry li[data-id="carry-patch-kit"]')).toBeVisible();
  await expect(page.locator('.care-carry li[data-id="carry-plug-kit"]')).toHaveCount(0);
  // the screen's own bike line refits the Roadside tab at once
  await page.selectOption('#tools-bike', 'bike_b');
  await expect(card(page, 'puncture-tubeless')).toBeVisible();
  await expect(card(page, 'brake-weak-disc')).toBeVisible();
  await expect(card(page, 'puncture-tube')).toHaveCount(0);
  await expect(page.locator('.care-carry li[data-id="carry-plug-kit"]')).toBeVisible();
  await expect(page.locator('.care-carry li[data-id="carry-patch-kit"]')).toHaveCount(0);
  // a bike with nothing told: every card, the conditioned ones tagged; the shop line only on brakes, wheels and bolts
  await page.selectOption('#tools-bike', 'bike_u');
  await expect(page.locator('.care-road')).toHaveCount(12);
  await expect(card(page, 'puncture-tube').locator('.care-open')).toContainText('if you have inner tubes');
  for (const zoom of ['100%', '200%']) {
    await page.evaluate((z) => { document.documentElement.style.fontSize = z; }, zoom);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), zoom).toBe(true);
    for (const d of await page.locator('.care-road').all()) {
      const box = (await d.boundingBox())!;
      expect(box.x + box.width, zoom).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
    }
  }
  // a critical card's steps end with the shop line, a puncture's do not
  await page.evaluate(() => { localStorage.setItem('copilot:careAllSteps:v1', '1'); });
  await card(page, 'brake-rub-rim').locator('.care-open').click();
  await expect(page.getByRole('dialog').locator('.care-step-all')).toHaveCount(6);
  await expect(page.getByRole('dialog').getByText('If unsure, a shop.')).toBeVisible();
  await page.keyboard.press('Escape');
  await card(page, 'puncture-tube').locator('.care-open').click();
  await expect(page.getByRole('dialog').getByText('Ride on?')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('If unsure, a shop.')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'What to carry', level: 3 })).toBeVisible();
  expect(await page.locator('.care-carry li').count()).toBe(14);
  const below = await page.evaluate(() => {
    const cards = document.querySelectorAll('.care-road');
    const list = document.querySelector('.care-carry')!;
    return !!(cards[cards.length - 1]!.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(below).toBe(true);
  expect(errors).toEqual([]);
});

test('[BC-ROAD-SEARCH] "puncture" in the Care tab lists the puncture cards under Roadside repairs; a tap opens the Roadside tab and that card\'s steps; closed, focus is on the card', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await page.getByLabel('Search').fill('Punctures');
  await expect(page.getByRole('heading', { name: 'Roadside repairs', level: 3 })).toBeVisible();
  await expect(page.locator('.care-road-hit')).toHaveCount(2);
  await page.getByRole('button', { name: 'Puncture (tubeless)' }).click();
  await expect(roadTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('dialog', { name: 'Puncture (tubeless)' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card(page, 'puncture-tubeless').locator('.care-open')).toBeFocused();
  expect(errors).toEqual([]);
});

test('[BC-ROAD] by keyboard: Tab reaches every card and the tabs; Enter and Space open a card', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await roadTab(page).click();
  await roadTab(page).focus();
  const reached: string[] = [];
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab');
    const here = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const c = el?.closest('.care-road') as HTMLElement | null;
      return el && el.classList.contains('care-open') && c ? c.dataset.id! : null;
    });
    if (here) reached.push(here);
  }
  const ids = await page.locator('.care-road').evaluateAll((ds) => ds.map((d) => (d as HTMLElement).dataset.id!));
  expect(ids.length).toBe(12);
  for (const id of ids) expect(reached, id).toContain(id);
  await card(page, ids[0]!).locator('.care-open').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await card(page, ids[1]!).locator('.care-open').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog')).toBeVisible();
});

// ---- The step view and its pictures (care pictures design of 7 November 2026, part 1) ----
const openSteps = async (page: Page, id: string, name: string) => {
  await roadTab(page).click();
  await card(page, id).locator('.care-open').click();
  await expect(page.getByRole('dialog', { name })).toBeVisible();
};

test('[BC-STEPS-LAYOUT] the step view fills the screen; on a phone the picture sits above the text, from 720 px beside it; the bottom bar never covers the text; no sideways scroll at 200% text', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  // a card with pictures (care pictures redo, batch 1: the puncture cards' pictures are not yet redrawn)
  await openSteps(page, 'brake-rub-disc', 'Disc brake rubbing');
  const dialog = page.getByRole('dialog');
  const box = (await dialog.boundingBox())!;
  const view = page.viewportSize()!;
  expect(Math.round(box.width)).toBe(view.width);
  expect(Math.round(box.height)).toBe(view.height);
  await page.getByRole('button', { name: 'Next' }).click();
  // step 1, the wheel seated: its kind follows the axle, the other kinds one tap away as 44 px buttons [BC-PIC-SWITCH]
  await expect(dialog.getByRole('img', { name: 'A thru-axle: push the wheel fully in, then tighten the axle firmly.' })).toBeVisible();
  const kinds = dialog.getByRole('group', { name: 'Other kinds' });
  await expect(kinds.getByRole('button')).toHaveCount(2);
  for (const b of await kinds.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await kinds.getByRole('button', { name: 'Show Quick release' }).click();
  await expect(dialog.getByRole('img', { name: 'A quick release: push the wheel fully in, then close the lever firmly.' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.locator('.care-steps-count')).toHaveText('Step 2 of 5');
  const img = dialog.getByRole('img', { name: 'A thin gap between each pad and the disc.' });
  await expect(img).toBeVisible();
  const pic = (await img.boundingBox())!;
  const words = (await dialog.locator('.care-step-t').boundingBox())!;
  if (view.width < 720) {
    expect(pic.y + pic.height).toBeLessThanOrEqual(words.y);
    expect(pic.width).toBeGreaterThan(view.width - 48);
    expect(pic.height).toBeLessThanOrEqual(view.height * 0.45 + 1);
  } else {
    expect(pic.x + pic.width).toBeLessThanOrEqual(words.x);
    expect(Math.abs(pic.y - words.y)).toBeLessThan(80);
  }
  for (const zoom of ['100%', '200%']) {
    await page.evaluate((z) => { document.documentElement.style.fontSize = z; }, zoom);
    expect(await page.evaluate(() => document.querySelector('.care-steps-body')!.scrollWidth <= window.innerWidth), zoom).toBe(true);
    // the text ends above the bottom bar once scrolled to the end
    await dialog.locator('.care-steps-body').evaluate((b) => { b.scrollTop = b.scrollHeight; });
    const text = (await dialog.locator('.care-step-t').boundingBox())!;
    const bar = (await dialog.locator('.care-steps-nav').boundingBox())!;
    expect(text.y + text.height, zoom).toBeLessThanOrEqual(bar.y + 0.5);
    for (const b of await dialog.locator('.care-steps-nav button').all()) expect((await b.boundingBox())!.height, zoom).toBeGreaterThanOrEqual(48);
  }
  expect(errors).toEqual([]);
});

test('[BC-STEPS-BACK] in a real browser the back gesture closes the step view in one go and Bike care stays; the picture loads offline after one visit', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openSteps(page, 'brake-rub-disc', 'Disc brake rubbing');
  for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Next' }).click();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/tools\/care$/);
  await expect(page.getByRole('heading', { name: 'Bike care', level: 2 })).toBeVisible();
  await expect(card(page, 'brake-rub-disc').locator('.care-open')).toBeFocused();
  // offline, the drawing still comes
  await card(page, 'brake-rub-disc').locator('.care-open').click();
  await expect(page.locator('.care-step-h')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.care-steps-count')).toHaveText('Step 1 of 5');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.care-steps-count')).toHaveText('Step 2 of 5');
  await expect(page.getByRole('dialog').getByRole('img', { name: 'A thin gap between each pad and the disc.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/tools\/care$/);
});

// ---- The parts guide (care pictures design of 7 November 2026, section 4) ----
test("[PG-SHEET-OPEN] a part's name opens the bike view: a bottom sheet on a phone, a side panel when wide; the part marked on a typical bike of the rider's type, its entry and close-ups; no sideways scroll at 200% text; Escape and the back gesture close it alone", async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [A], 'bike_a');
  await openSteps(page, 'brake-rub-rim', 'Brake rubbing');
  for (let i = 0; i < 5; i += 1) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.care-steps-count')).toHaveText('Step 5 of 6');
  const link = page.locator('.care-step .care-part', { hasText: "brake's quick release" });
  await link.click();
  const sheet = page.getByRole('dialog', { name: 'Where to find: Brake rubbing' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Brake rubbing', level: 2 })).toBeFocused();
  await expect(sheet.getByRole('heading', { name: "The brake's quick release", level: 3 })).toBeVisible();
  await expect(sheet.getByRole('img', { name: /^A typical gravel bike, greyed out\. .* Marked: brake quick release\./ })).toBeVisible();
  await expect(sheet.locator('.care-pic [role="img"]')).toHaveCount(2);
  const box = (await sheet.boundingBox())!;
  const view = page.viewportSize()!;
  if (view.width < 720) {
    expect(Math.round(box.width)).toBe(view.width);
    expect(Math.abs(box.y + box.height - view.height)).toBeLessThan(2);
  } else {
    expect(box.width).toBeLessThanOrEqual(561);
    expect(Math.abs(box.x + box.width - view.width)).toBeLessThan(2);
  }
  for (const zoom of ['100%', '200%']) {
    await page.evaluate((z) => { document.documentElement.style.fontSize = z; }, zoom);
    expect(await page.evaluate(() => { const s = document.querySelector('dialog.part-sheet')!; return s.scrollWidth <= s.clientWidth + 1; }), zoom).toBe(true);
    for (const b of await sheet.locator('.pg-swap, .care-steps-icon, .bv-part, .bv-zoom-btn').all()) expect((await b.boundingBox())!.height, zoom).toBeGreaterThanOrEqual(44);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.part-sheet')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Brake rubbing' })).toBeVisible();
  await expect(link).toBeFocused();
  // the back gesture: the view goes, the step view stays at its step
  await link.click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: "The wheel's quick release" }).click();
  await expect(sheet.getByRole('heading', { level: 3 })).toHaveText("The wheel's quick release");
  await page.goBack();
  await expect(page.locator('dialog.part-sheet')).toHaveCount(0);
  await expect(page.locator('.care-steps-count')).toHaveText('Step 5 of 6');
  await expect(page).toHaveURL(/#\/tools\/care$/);
  expect(errors).toEqual([]);
});

/** The labels as the browser draws them: each text inside its pill, no two pills overlapping, every pill inside the drawing's box. */
async function labelsDrawn(page: Page): Promise<{ id: string; text: DOMRect; pill: DOMRect }[]> {
  return page.evaluate(() => [...document.querySelectorAll<SVGGElement>('dialog.part-sheet .bv-label')].map((g) => ({
    id: g.dataset.part!,
    text: g.querySelector('text')!.getBoundingClientRect().toJSON() as DOMRect,
    pill: g.querySelector('.bv-pill')!.getBoundingClientRect().toJSON() as DOMRect,
  })));
}

test('[BV-LABELS] in a real browser, on every roadside card at the project size and theme: every label\'s words fit its pill, no two labels overlap, nothing scrolls sideways; no automatic accessibility violations', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await roadTab(page).click();
  const ids = await page.locator('.care-road').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id!));
  expect(ids.length).toBeGreaterThan(8);
  for (const id of ids) {
    await card(page, id).locator('.care-open').click();
    await expect(page.locator('dialog.care-steps')).toBeVisible();
    const where = page.locator('.care-where');
    if (await where.count() === 0) {
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog.care-steps')).toHaveCount(0);
      continue;
    }
    await where.click();
    const sheet = page.locator('dialog.part-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.bv-label').first()).toBeVisible();
    const drawn = await labelsDrawn(page);
    const svg = (await sheet.locator('.bv-svg').boundingBox())!;
    // the labels' size (review of PR 107, M1): capitals of at least 12 px, "(other side)" at least 11 px
    const sizes = await page.evaluate(() => [...document.querySelectorAll('dialog.part-sheet .bv-label text, dialog.part-sheet .bv-side')]
      .map((t) => [t.classList.contains('bv-side') ? 11 : 12, parseFloat(getComputedStyle(t).fontSize)]));
    for (const [least, got] of sizes) expect(got, id).toBeGreaterThanOrEqual(least!);
    for (const l of drawn) {
      expect(l.text.left, `${id} ${l.id}`).toBeGreaterThanOrEqual(l.pill.left - 0.5);
      expect(l.text.right, `${id} ${l.id}: words wider than the pill`).toBeLessThanOrEqual(l.pill.right + 0.5);
      expect(l.pill.left, `${id} ${l.id}`).toBeGreaterThanOrEqual(svg.x - 0.5);
      expect(l.pill.right, `${id} ${l.id}`).toBeLessThanOrEqual(svg.x + svg.width + 0.5);
      for (const m of drawn) {
        if (m === l) continue;
        const apart = l.pill.right <= m.pill.left || m.pill.right <= l.pill.left || l.pill.bottom <= m.pill.top || m.pill.bottom <= l.pill.top;
        expect(apart, `${id}: ${l.id} and ${m.id}`).toBe(true);
      }
    }
    expect(await page.evaluate(() => { const s = document.querySelector('dialog.part-sheet')!; return s.scrollWidth <= s.clientWidth + 1; }), id).toBe(true);
    if (id === 'brake-rub-disc') {
      // one part tapped: the arrow and the pressed button
      await sheet.getByRole('button', { name: 'Disc caliper', exact: true }).click();
      await expect(sheet.locator('.bv-arrow')).toHaveCount(1);
      const results = await new AxeBuilder({ page }).include('dialog.part-sheet').analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`)).toEqual([]);
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.care-steps')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('[BV-BUTTON] by keyboard: "What is it, where is it?" opens the view, focus on its title; Tab reaches the zoom buttons and every part, Enter presses one; Escape gives the focus back to the button', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await openSteps(page, 'chain-broken', 'Broken chain');
  const where = page.locator('.care-where');
  await expect(where).toContainText('What is it, where is it?');
  await where.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Where to find: Broken chain' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { level: 2 })).toBeFocused();
  // the drawing opens zoomed in on the drive (the owner's answer 2); Whole bike, then Zoom in by keyboard
  await expect(sheet.getByRole('img', { name: /Zoomed in\.$/ })).toBeVisible();
  const reached: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    reached.push(await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('aria-label') ?? document.activeElement!.textContent ?? ''));
  }
  expect(reached).toEqual(expect.arrayContaining(['Zoom out', 'Whole bike', 'Quick link', 'Chain', 'Rear gears']));
  await sheet.getByRole('button', { name: 'Whole bike' }).focus();
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('img', { name: /greyed out\. Standing out: [^.]*\.$/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Zoom in' }).focus();
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('img', { name: /Zoomed in\.$/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Quick link', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('button', { name: 'Quick link', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('heading', { name: 'Quick link', level: 3 })).toBeVisible();
  // a tap on a label on the drawing does the same
  await sheet.locator('.bv-label[data-part="chain"]').click();
  await expect(sheet.getByRole('button', { name: 'Chain', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.part-sheet')).toHaveCount(0);
  await expect(where).toBeFocused();
  expect(errors).toEqual([]);
});

test('[BV-ZOOM] a pinch (two pointers) and Ctrl with the wheel zoom the drawing; a drag moves a zoomed view; the page never scrolls sideways', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await openSteps(page, 'brake-rub-disc', 'Disc brake rubbing');
  await page.locator('.care-where').click();
  const sheet = page.locator('dialog.part-sheet');
  await expect(sheet).toBeVisible();
  const canvas = sheet.locator('.bv-canvas');
  // it opens on its front wheel (its far-off brake lever left out of the focus: review of PR 107, M3); from the whole bike
  await expect(canvas).toHaveClass(/bv-zoomed/);
  await sheet.getByRole('button', { name: 'Whole bike' }).click();
  await expect(canvas).not.toHaveClass(/bv-zoomed/);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect(canvas).toHaveClass(/bv-zoomed/);
  const before = await sheet.locator('.bv-art').getAttribute('viewBox');
  await canvas.dispatchEvent('pointerdown', { pointerId: 1, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, isPrimary: true });
  await canvas.dispatchEvent('pointermove', { pointerId: 1, clientX: box.x + box.width / 2 - 40, clientY: box.y + box.height / 2, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 1 });
  expect(await sheet.locator('.bv-art').getAttribute('viewBox')).not.toBe(before);
  await sheet.getByRole('button', { name: 'Whole bike' }).click();
  await expect(canvas).not.toHaveClass(/bv-zoomed/);
  // two fingers moving apart
  const c = [box.x + box.width / 2, box.y + box.height / 2];
  await canvas.dispatchEvent('pointerdown', { pointerId: 1, clientX: c[0]! - 20, clientY: c[1], isPrimary: true });
  await canvas.dispatchEvent('pointerdown', { pointerId: 2, clientX: c[0]! + 20, clientY: c[1] });
  await canvas.dispatchEvent('pointermove', { pointerId: 2, clientX: c[0]! + 80, clientY: c[1] });
  await canvas.dispatchEvent('pointerup', { pointerId: 1 });
  await canvas.dispatchEvent('pointerup', { pointerId: 2 });
  await expect(canvas).toHaveClass(/bv-zoomed/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

// Review of PR 107, I1: a tap anywhere on a label's pill picks that label's part, never a neighbour's (stacked labels sit 5 px apart).
test("[BV-VIEW] a tap at the top, middle or bottom of any label's pill picks that label's own part, on the busiest cards", async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  for (const [id, name] of [['puncture-tube', 'Puncture (inner tube)'], ['brake-rub-disc', 'Disc brake rubbing']] as const) {
    await openSteps(page, id, name);
    await page.locator('.care-where').click();
    const sheet = page.locator('dialog.part-sheet');
    await expect(sheet.locator('.bv-label').first()).toBeVisible();
    const hits = await page.evaluate(() => [...document.querySelectorAll<SVGGElement>('dialog.part-sheet .bv-label')].flatMap((g) => {
      const r = g.querySelector('.bv-pill')!.getBoundingClientRect();
      return [r.top + 2, r.top + r.height / 2, r.bottom - 2].map((y) => {
        const el = document.elementFromPoint(r.left + r.width / 2, y);
        return `${g.dataset.part} -> ${el?.closest('[data-part]')?.getAttribute('data-part') ?? 'none'}`;
      });
    }));
    expect(hits.filter((h) => { const [a, b] = h.split(' -> '); return a !== b; }), id).toEqual([]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.care-steps')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

// Review of PR 107, I2: a mouse drag that ends outside the drawing ends the drag: the labels come back and a hover does not pan.
test('[BV-ZOOM] a mouse drag of a zoomed drawing let go outside it ends there: the labels come back, and a hover after it moves nothing', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await openSteps(page, 'chain-broken', 'Broken chain');
  await page.locator('.care-where').click();
  const sheet = page.locator('dialog.part-sheet');
  const canvas = sheet.locator('.bv-canvas');
  await expect(canvas).toHaveClass(/bv-zoomed/);
  const box = (await canvas.boundingBox())!;
  // a short drag from near the drawing's foot, let go below it: the view moves a little, and the labels of the parts still in view return
  const start = await page.evaluate(() => {
    const art = document.querySelector('dialog.part-sheet .bv-art')!.getBoundingClientRect();
    for (let y = art.bottom - 4; y > art.top; y -= 4) for (let x = art.left + 10; x < art.right - 10; x += 8) {
      const el = document.elementFromPoint(x, y);
      if (el?.closest('.bv-canvas') && !el.closest('.bv-label, .bv-tap')) return { x, y, el: el.getAttribute('class') };
    }
    return null;
  });
  await page.mouse.move(start!.x, start!.y);
  await page.mouse.down();
  await expect(canvas).toHaveClass(/bv-moving/);
  await page.mouse.move(start!.x + 4, box.y + box.height + 30, { steps: 4 });
  await page.mouse.up();
  await expect(canvas).not.toHaveClass(/bv-moving/);
  await expect(sheet.locator('.bv-label').first()).toBeVisible();
  const before = await sheet.locator('.bv-art').getAttribute('viewBox');
  await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 4 });
  expect(await sheet.locator('.bv-art').getAttribute('viewBox')).toBe(before);
  expect(errors).toEqual([]);
});

// The owner's wish of 14 November 2026: the brakes with their fluid and the gear shifting told in You's bike details fit Bike care, which
// says so at the top; Show all lifts the fit and Fit to my bike brings it back, by keyboard too.
test('[BC-FIT-LINE] brakes, brake fluid and shifting set in You\'s bike details fit Bike care, which names them; Show all, then Fit to my bike', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/you' });
  await seed(page, [U], 'bike_u');
  // nothing told: no line, every task
  await page.goto(`${app.origin}/#/tools/care`);
  await expect(page.getByRole('heading', { name: 'Bike care', level: 2 })).toBeVisible();
  await expect(page.locator('.care-fit')).toHaveCount(0);
  await expect(task(page, 'brakes-pads-rim')).toBeVisible();
  // You, Edit: the bag planner's Bike details, More details, Repair kit details
  await page.goto(`${app.origin}/#/you`);
  await page.locator('li.you-bike', { hasText: 'Old one' }).getByRole('link', { name: /Edit/ }).click();
  await page.waitForURL(/\/tools\/bags\//);
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await page.locator('#bikeMoreDetails > summary').click();
  await page.locator('#bikeRepairFields > summary').click();
  await expect(page.locator('#bikeBrakeFluidField')).toBeHidden();
  await page.getByRole('combobox', { name: /^Brake type/ }).selectOption('hydraulic-disc');
  const fluid = page.getByRole('combobox', { name: /^Brake fluid/ });
  await expect(fluid).toBeVisible();
  await expect(fluid).toHaveValue('unknown');
  await expect(page.locator('#bikeBrakeFluidHint')).toHaveText("It is printed on the brake lever's cap or in the manual. Never mix them.");
  await fluid.selectOption('mineral');
  await page.getByRole('combobox', { name: /^Shifting/ }).selectOption('electronic');
  await page.evaluate(() => { (document.getElementById('bikeLibraryPanel') as HTMLDetailsElement).open = true; });
  await page.locator('#bikeSave').click();
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('loadcheck:bikeProfiles')!) as { id: string; brakeFluid?: string; shifting: string }[]).find((b) => b.id === 'bike_u'))).toMatchObject({ brakes: 'hydraulic-disc', brakeFluid: 'mineral', shifting: 'electronic' });
  await page.locator('#bikeDetailsClose').click();
  await page.waitForURL((u) => u.pathname === '/' && u.hash === '#/you');
  await page.getByRole('link', { name: 'Care for this bike Old one' }).click();
  await expect(page).toHaveURL(/#\/tools\/care$/);
  const line = page.locator('.care-fit');
  await expect(line).toContainText('Showing what fits your bike: hydraulic disc brakes (mineral oil), electronic gears.');
  await expect(task(page, 'brakes-hydraulic-bleed')).toBeVisible();
  await expect(task(page, 'gears-electronic-battery')).toBeVisible();
  await expect(task(page, 'brakes-pads-rim')).toHaveCount(0);
  await expect(task(page, 'gears-cables-look')).toHaveCount(0);
  // no sideways scroll at 320 px with the line
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const showAll = line.getByRole('button', { name: 'Show all' });
  expect((await showAll.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // by keyboard: the button takes Enter, keeps the focus, and the line says what is shown
  await showAll.focus();
  await page.keyboard.press('Enter');
  await expect(line).toContainText('Showing everything, for every bike.');
  const mine = line.getByRole('button', { name: 'Fit to my bike' });
  await expect(mine).toBeFocused();
  await expect(task(page, 'brakes-pads-rim')).toBeVisible();
  await expect(task(page, 'gears-cables-look')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(line).toContainText('Showing what fits your bike:');
  await expect(line.getByRole('button', { name: 'Show all' })).toBeFocused();
  await expect(task(page, 'brakes-pads-rim')).toHaveCount(0);
  // the bleed names the bike's fluid
  await task(page, 'brakes-hydraulic-bleed').locator('.care-open').click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('dialog')).toContainText('mineral oil, never DOT fluid');
  expect(errors).toEqual([]);
});
