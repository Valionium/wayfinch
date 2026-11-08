// Bike care in a real browser (sub-project 12, group 1): opened from You with a bike chosen, a chosen bike deleted in another tab, and the
// screen at phone and laptop size in both themes (the projects give the size and the theme), at 200% text, offline, by keyboard.
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
const task = (page: Page, id: string) => page.locator(`details.care-task[data-id="${id}"]`);
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

test('[BC-SCREEN] every task open, at the project size and at 200% text: no sideways scroll; steps stay a numbered list', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await expect(page.locator('details.care-task').first()).toBeVisible();
  for (const zoom of ['100%', '200%']) {
    await page.evaluate((z) => { document.documentElement.style.fontSize = z; for (const d of document.querySelectorAll('details')) d.open = true; }, zoom);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), zoom).toBe(true);
    for (const d of await page.locator('details.care-task').all()) {
      const box = (await d.boundingBox())!;
      expect(box.x + box.width, zoom).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
    }
  }
  expect(await page.locator('details.care-task ol > li').count()).toBeGreaterThan(30);
  // every task shows, the conditioned ones tagged, and the quiet line leads to the bike's details
  await expect(page.locator('details.care-task')).toHaveCount(48);
  await expect(page.getByRole('link', { name: "Tell us your brakes, tyres… to hide what doesn't apply" })).toHaveAttribute('href', '/tools/bags/#bike-details=bike_u&back=care');
  // the tablist and the filters have names
  await expect(page.getByRole('tablist', { name: 'Bike care' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Parts' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(7);
});

test('[BC-SCREEN] Tab reaches every tab, filter, task and link; each task opens with Enter and Space', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await expect(page.locator('details.care-task')).toHaveCount(48);
  await page.getByRole('link', { name: 'Tools', exact: true }).first().focus();
  const reached: string[] = [];
  for (let i = 0; i < 90; i += 1) {
    await page.keyboard.press('Tab');
    const here = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.closest('.care')) return null;
      const t = el.closest('details.care-task') as HTMLElement | null;
      return el.tagName === 'SUMMARY' && t ? `task:${t.dataset.id}` : `${el.getAttribute('role') ?? el.tagName.toLowerCase()}:${(el.textContent ?? '').trim() || el.id}`;
    });
    if (here) reached.push(here);
  }
  for (const want of ['tab:Care', 'tab:Roadside repairs', 'input:care-search', "a:Tell us your brakes, tyres… to hide what doesn't apply"]) expect(reached, want).toContain(want);
  for (const part of ['Chain', 'Brakes', 'Tyres', 'Gears', 'Wheels', 'Suspension', 'E-bike', 'Frame & bolts']) expect(reached, part).toContain(`button:${part}`);
  const ids = await page.locator('details.care-task').evaluateAll((ds) => ds.map((d) => (d as HTMLElement).dataset.id!));
  for (const id of ids) expect(reached, id).toContain(`task:${id}`);
  // Enter opens one task, Space another
  await task(page, ids[0]!).locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(task(page, ids[0]!)).toHaveAttribute('open', '');
  await task(page, ids[1]!).locator('summary').focus();
  await page.keyboard.press('Space');
  await expect(task(page, ids[1]!)).toHaveAttribute('open', '');
  // the arrow keys move between the tabs
  await page.getByRole('tab', { name: 'Care' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Roadside repairs' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Roadside repairs' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('details.care-road').first()).toBeVisible();
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
  await page.getByRole('button', { name: 'Brakes' }).click();
  await expect(page.locator('details.care-task')).toHaveCount(7);
  await page.getByLabel('Search').fill('lube');
  await expect(page.getByText('Nothing matches.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search and filter' }).click();
  await expect(page.locator('details.care-task')).toHaveCount(35);
  // the Roadside tab and the carry list work offline too
  await page.getByRole('tab', { name: 'Roadside repairs' }).click();
  await expect(page.locator('details.care-road[data-id="puncture-tubeless"]')).toBeVisible();
  await expect(page.locator('.care-carry li[data-id="carry-plug-kit"]')).toBeVisible();
});

// ---- Roadside repairs and What to carry (sub-project 12, group 3) ----
const card = (page: Page, id: string) => page.locator(`details.care-road[data-id="${id}"]`);
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
  await expect(page.locator('details.care-road')).toHaveCount(12);
  await expect(card(page, 'puncture-tube').locator('summary')).toContainText('if you have inner tubes');
  for (const zoom of ['100%', '200%']) {
    await page.evaluate((z) => { document.documentElement.style.fontSize = z; for (const d of document.querySelectorAll('details')) d.open = true; }, zoom);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), zoom).toBe(true);
    for (const d of await page.locator('details.care-road').all()) {
      const box = (await d.boundingBox())!;
      expect(box.x + box.width, zoom).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
    }
  }
  expect(await page.locator('details.care-road ol > li').count()).toBeGreaterThan(50);
  expect(await page.locator('details.care-road', { hasText: 'If unsure, a shop.' }).count()).toBe(6);
  await expect(page.getByRole('heading', { name: 'What to carry', level: 3 })).toBeVisible();
  expect(await page.locator('.care-carry li').count()).toBe(14);
  const below = await page.evaluate(() => {
    const cards = document.querySelectorAll('details.care-road');
    const list = document.querySelector('.care-carry')!;
    return !!(cards[cards.length - 1]!.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(below).toBe(true);
  expect(errors).toEqual([]);
});

test('[BC-ROAD-SEARCH] "puncture" in the Care tab lists the puncture cards under Roadside repairs; a tap opens the Roadside tab at that card, open and focused', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await page.getByLabel('Search').fill('Punctures');
  await expect(page.getByRole('heading', { name: 'Roadside repairs', level: 3 })).toBeVisible();
  await expect(page.locator('.care-road-hit')).toHaveCount(2);
  await page.getByRole('button', { name: 'Puncture (tubeless)' }).click();
  await expect(roadTab(page)).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, 'puncture-tubeless')).toHaveAttribute('open', '');
  await expect(card(page, 'puncture-tubeless').locator('summary')).toBeFocused();
  await expect(card(page, 'puncture-tube')).not.toHaveAttribute('open', '');
  await expect(card(page, 'puncture-tubeless').getByText('Ride on?')).toBeVisible();
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
      const c = el?.closest('details.care-road') as HTMLElement | null;
      return el && el.tagName === 'SUMMARY' && c ? c.dataset.id! : null;
    });
    if (here) reached.push(here);
  }
  const ids = await page.locator('details.care-road').evaluateAll((ds) => ds.map((d) => (d as HTMLElement).dataset.id!));
  expect(ids.length).toBe(12);
  for (const id of ids) expect(reached, id).toContain(id);
  await card(page, ids[0]!).locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(card(page, ids[0]!)).toHaveAttribute('open', '');
  await card(page, ids[1]!).locator('summary').focus();
  await page.keyboard.press('Space');
  await expect(card(page, ids[1]!)).toHaveAttribute('open', '');
});

// ---- The step view and its pictures (care pictures design of 7 November 2026, part 1) ----
const openSteps = async (page: Page, id: string) => {
  await roadTab(page).click();
  await card(page, id).locator('summary').click();
  await card(page, id).getByRole('button', { name: 'Step by step' }).click();
  await expect(page.getByRole('dialog', { name: 'Puncture (inner tube)' })).toBeVisible();
};

test('[BC-STEPS-LAYOUT] the step view fills the screen; on a phone the picture sits above the text, from 720 px beside it; the bottom bar never covers the text; no sideways scroll at 200% text', async ({ page }) => {
  const errors = errorsOf(page);
  app = await loadApp(page, { launch: true, path: '/#/tools/care' });
  await seed(page, [U], null);
  await openSteps(page, 'puncture-tube');
  const dialog = page.getByRole('dialog');
  const box = (await dialog.boundingBox())!;
  const view = page.viewportSize()!;
  expect(Math.round(box.width)).toBe(view.width);
  expect(Math.round(box.height)).toBe(view.height);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.locator('.care-steps-count')).toHaveText('Step 2 of 7');
  const img = dialog.getByRole('img', { name: 'Prying the tyre off the rim with two tyre levers.' });
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
  await openSteps(page, 'puncture-tube');
  for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Next' }).click();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/tools\/care$/);
  await expect(page.getByRole('heading', { name: 'Bike care', level: 2 })).toBeVisible();
  await expect(card(page, 'puncture-tube').getByRole('button', { name: 'Step by step' })).toBeFocused();
  // offline, the drawing still comes
  await card(page, 'puncture-tube').getByRole('button', { name: 'Step by step' }).click();
  await expect(page.locator('.care-step-h')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.care-steps-count')).toHaveText('Step 1 of 7');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.care-steps-count')).toHaveText('Step 2 of 7');
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Prying the tyre off the rim with two tyre levers.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/tools\/care$/);
});
