// Your bike in the bag planner, in a real browser, built with the launch switch on (sub-project 6, group 1): the rig drawn by bike.js.
// Nothing here prints the page: failures compare booleans, counts and short values.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

async function planner(page: Page, entries: Record<string, string> = {}): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, entries);
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#rigBike svg.bk')).toBeVisible();
}
/** Step two with no bags: every spot dashed and offered. */
async function bagsStep(page: Page): Promise<void> {
  await page.evaluate('S.bags = []; S.decks = { bar:false, rack:false }; go(2)');
}

test('[LC-RIG-TAPS] the rig drawn by bike.js: a tap on each dashed spot adds its bag, the keyboard does the same, and Remove takes it off', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  await bagsStep(page);
  const rig = page.locator('#rigSvg');
  for (const key of ['seat', 'bar', 'frame', 'top:front', 'bottle:dt']) {
    const before = await page.evaluate('S.bags.length');
    await rig.locator(`[data-add="${key}"]`).first().click();
    expect(await page.evaluate('S.bags.length'), key).toBe((before as number) + 1);
  }
  // the keyboard: each control is a labelled button; Enter on the fork spot adds a fork bag
  const fork = rig.locator('[data-add="fork"]');
  await expect(fork).toHaveAttribute('role', 'button');
  await expect(fork).toHaveAttribute('aria-label', /^Add /);
  await fork.focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate("S.bags.filter(b => b.pos === 'fork').length")).toBe(1);
  // the second of the pair, the frame shape numbers and a deck
  await rig.locator('.pairghost').first().click({ force: true }); // the bag in front shares its target: both add the second
  expect(await page.evaluate("S.bags.find(b => b.pos === 'fork').pair")).toBe(true);
  await rig.locator('[data-setshape$=":2"]').click();
  expect(await page.evaluate("frameShapeIdx(S.bags.find(b => b.pos === 'frame'))")).toBe(2);
  await rig.locator('[data-deck="bar"]').click();
  expect(await page.evaluate('S.decks.bar')).toBe(true);
  // Remove mode: a tap on the seat pack takes it off
  await page.locator('#rigMode').click();
  const seat = await page.evaluate("S.bags.find(b => b.pos === 'seat').uid");
  await rig.locator(`[data-del="${seat}"]`).click();
  expect(await page.evaluate("S.bags.some(b => b.pos === 'seat')")).toBe(false);
  expect(errors).toEqual([]);
});

test('[LC-RIG-TAPS] on the finished plan a tap opens the bag, everything else dims, the bike included, and closing brings it back', async ({ page }) => {
  await planner(page);
  await page.evaluate("S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'frame', L:6 }, { uid:3, pos:'bar', L:12 }]; S.nextUid = 4; go(2); go(3); go(4)");
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click(); // the weight question, skipped
  const bag = page.locator('#rigSvg [data-inspect]').first();
  await bag.click();
  await expect(page.locator('#bagPop')).toBeVisible();
  // wide enough, the bag is lifted beside its list and the rest dims; on a phone the bag opens as a sheet over the rig
  if (await page.locator('#rigBox').evaluate((el) => el.clientWidth >= 620)) {
    await expect(page.locator('#rigSvg')).toHaveClass(/focussed/);
    await expect.poll(() => page.locator('#rigBike svg.bk').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.3);
  } else {
    await expect(page.locator('#bagPop .sheetglyph svg')).toBeVisible();
  }
  await page.locator('#bagPop .popx').click();
  await expect(page.locator('#rigSvg')).not.toHaveClass(/focussed/);
  await expect.poll(() => page.locator('#rigBike svg.bk').evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
});

test('[LC-RIG-THUMB] a saved setup\'s thumbnail keeps the bike and its colour; a hostile thumbnail still shows nothing', async ({ page }) => {
  await planner(page, { 'loadcheck:bikeProfile': JSON.stringify({ id: 'bike_green', name: 'Green', look: { colour: '#2f7d4f', bars: 'flat', ebike: null } }) });
  await page.evaluate("S.bags = [{ uid:1, pos:'seat', L:14 }]; S.nextUid = 2; go(2)");
  const out = await page.evaluate(() => {
    const w = window as unknown as { buildThumb: (id: string) => string; safeDataThumb: (s: string) => string };
    const thumb = w.buildThumb('st1');
    const clean = w.safeDataThumb(thumb);
    const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
    const hostile = w.safeDataThumb('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path class="bk-paint" stroke="url(https://example.test/x)" onload="alert(1)" d="M0 0"/></svg>');
    return {
      paint: [...doc.querySelectorAll('.bk-paint')].map((p) => p.getAttribute('stroke')),
      tyres: doc.querySelectorAll('.bk-tyre').length,
      hits: doc.querySelectorAll('.hit').length,
      hostile: /script|onload|example\.test|url\(/.test(hostile),
    };
  });
  expect(out.paint.length).toBeGreaterThan(0);
  expect(new Set(out.paint)).toEqual(new Set(['#2f7d4f']));
  expect(out.tyres).toBe(2);
  expect(out.hits).toBe(0);
  expect(out.hostile).toBe(false);
});
