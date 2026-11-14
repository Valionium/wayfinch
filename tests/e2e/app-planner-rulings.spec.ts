// The owner's small rulings of 14 Nov 2026 for the Bag planner (sweep of 14 Nov, #29, #32, #34, #37), in a real browser, launch build,
// in the four app projects (phone and laptop, both themes): what the rider sees and reaches by keyboard. The page's own cases are in
// tests/unit/tools/planner-rulings.test.ts and tests/unit/contracts/handoff.test.ts. Nothing here prints the page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const ID = '0f1e2d3c4b5a69780f1e2d3c4b5a6978';
const ready = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** The co-pilot's handoff as it writes it (src/store/db.ts and src/ui/trip/handoff.ts): the GPX in its database, the envelope. */
async function handOver(page: Page): Promise<void> {
  const gpx = readFileSync(join(process.cwd(), 'contracts', 'handoff', 'heidelberg-strasbourg.gpx'), 'utf8');
  await page.evaluate(async ({ gpx, id }) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('copilot', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('handoffs'); };
      req.onsuccess = () => {
        const tx = req.result.transaction('handoffs', 'readwrite');
        tx.objectStore('handoffs').put({ id, gpx, createdAt: new Date().toISOString() }, id);
        tx.oncomplete = () => { req.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    localStorage.setItem('copilot:handoff:v1', JSON.stringify({ app: 'copilot', kind: 'handoff', v: 1, id, createdAt: new Date().toISOString() }));
  }, { gpx, id: ID });
  await page.goto('about:blank');
  await page.goto(`${app!.origin}/tools/bags/#copilot-handoff=${ID}`, { waitUntil: 'load' });
  await ready(page);
}

test('[LC-HAND-ATONCE] a fresh planner opened by Plan bags for this trip plans at once: no ask, the plan and its Undo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await handOver(page);
  await expect(page.locator('#handoffUndo')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#handoffText')).toContainText('Planned for Heidelberg → Strasbourg');
  await expect(page.locator('#handoffPlan')).toBeHidden();
  await expect(page.locator('#handoffApply')).toBeHidden();
  await expect(page.locator('#handoffMore')).toBeHidden();
  await expect(page.locator('#s2')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:handoff-done')!).outcome)).toBe('applied');
  expect((await page.locator('#handoffUndo').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(errors).toEqual([]);
});

test('[LC-HAND-ASK] with the rider\'s own plan there: one line and its question, "What changes" opens by keyboard, nothing sideways', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await page.evaluate('(async () => { S.bags = [{ uid: 1, pos: "seat", L: 14 }]; S.nextUid = 2; await flushDraft(); })()');
  await handOver(page);
  await expect(page.locator('#handoffText')).toHaveText(/^A trip from Wayfinch: [^?]+\. Plan bags for this trip\?$/);
  const more = page.locator('#handoffMore'), summary = more.locator('summary');
  await expect(summary).toHaveText('What changes');
  await expect(page.locator('#handoffDetail')).toBeHidden();
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#handoffDetail')).toBeVisible();
  await expect(page.locator('#handoffDetail')).toContainText('A new trip setup gets the route');
  await expect(page.locator('#handoffDetail')).toContainText('Your plan now is kept as a setup.');
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 640 });
    expect(await sideways(page), `${width} px`).toBe(false);
  }
  await page.locator('#handoffPlan').click();
  await expect(page.locator('#handoffUndo')).toBeVisible({ timeout: 20_000 });
  await expect(more).toBeHidden();
});

test('[LC-NIGHTS-EMPTY] a fresh planner\'s Nights out is empty, with its hint and the one line that says the plan is a day ride until nights are entered', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await expect(page.locator('#nights')).toHaveValue('');
  await expect(page.locator('label[for="nights"]')).toHaveText('Nights out 0 for a day ride');
  await expect(page.locator('#nightsSuggestionHint')).toHaveText('Planned as a day ride until you enter nights.');
  await expect(page.locator('#sleepWrap')).toBeHidden();
  // a number entered is the rider's; the stay comes with it
  await page.locator('#nights').fill('3');
  expect(await page.evaluate('[S.nights, nightsOpenNow()]')).toEqual([3, false]);
  await expect(page.locator('#sleepWrap')).toBeVisible();
  await expect(page.locator('#nightsSuggestionHint')).toBeHidden();
  // emptied again: nights not entered, a day ride again
  await page.locator('#nights').fill('');
  expect(await page.evaluate('[S.nights, nightsOpenNow()]')).toEqual([0, true]);
  expect(await sideways(page)).toBe(false);
});

test('[LC-WT-NOPOP] the first visit to Check opens no maximum-weight box; the inline line stays and its button opens it', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await page.evaluate(() => localStorage.setItem('loadcheck:walkthrough:v1', 'done'));
  await page.evaluate('S.bags = [{ uid: 1, pos: "seat", L: 14 }]; S.nextUid = 2; renderBags();');
  await page.locator('#crumbs button[data-to="4"]').click();
  await expect(page.locator('#stepTitle4')).toBeFocused();
  await expect(page.locator('#maxWeightBox')).toBeHidden();
  const add = page.locator('#maxWeightChange');
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.locator('#maxWeightBox')).toBeVisible();
});

test('[LC-RESTORED-ONCE] the restored plan is said once in a tab\'s session, on one line; Start a new plan stays at the end of step one', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await page.evaluate('(async () => { S.bags = [{ uid: 1, pos: "seat", L: 14 }]; S.nextUid = 2; await flushDraft(); })()');
  await page.setViewportSize({ width: 320, height: 640 });
  await page.reload({ waitUntil: 'load' });
  await ready(page);
  const bar = page.locator('#draftBar');
  await expect(bar).toBeVisible();
  await expect(page.locator('#draftText')).toHaveText('Your working plan was restored from this browser.');
  const line = await page.locator('#draftText').evaluate((el) => [el.getBoundingClientRect().height, parseFloat(getComputedStyle(el).lineHeight)]);
  expect(line[0]!).toBeLessThanOrEqual(line[1]! * 1.5);   // one line at 320 px
  expect(await sideways(page)).toBe(false);
  // the next visit in this tab: nothing said
  await page.reload({ waitUntil: 'load' });
  await ready(page);
  await expect(bar).toBeHidden();
  // Start a new plan, at its fixed place, by keyboard: the question, and Keep this plan gives the focus back
  await page.locator('#crumbs button[data-to="1"]').click();
  const start = page.locator('#draftNewRide');
  expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(bar).toBeVisible();
  await expect(page.locator('#draftText')).toBeFocused();
  await expect(page.locator('#draftNew')).toHaveText('Yes, clear this plan');
  await page.locator('#draftKeep').click();
  await expect(bar).toBeHidden();
  await expect(start).toBeFocused();
});
