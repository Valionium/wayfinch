// Free play without Trip's route (the owner's wish 3; design of 14 Nov 2026) in a real browser, built with the launch switch on: a
// real trip from Wayfinch planned with "Plan bags for this trip", then free play by keyboard. qa/free-play.cjs holds the detailed
// cases on the page's own code. Nothing here prints the page: failures compare booleans, counts and short values.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const ID = 'fedcba9876543210fedcba9876543210';
const ready = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');
/** Storage, not looks: the data tests run once per browser size, in the dark theme only, as app-contracts.spec.ts does. */
const lightProject = () => test.info().project.use.colorScheme === 'light';

async function openFresh(page: Page, path: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`${app!.origin}${path}`, { waitUntil: 'load' });
}

/** The bag planner with a saved plan of three bags, a saved bike, as a rider leaves it. */
async function plannerWithPlan(page: Page): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await page.evaluate(`(async () => {
    S.bags = [{ uid: 1, pos: 'seat', L: 14 }, { uid: 2, pos: 'frame', L: 6 }, { uid: 3, pos: 'bar', L: 12 }];
    S.nextUid = 4;
    S.bikeProfile = normaliseBikeProfile({ id: 'bike_e2e', name: 'Tourer' });
    await store.set('loadcheck:bikeProfile', S.bikeProfile);
    await flushDraft();
  })()`);
}

/** The co-pilot's handoff as it writes it (src/store/db.ts and src/ui/trip/handoff.ts): the GPX in its database, the envelope. */
async function handOver(page: Page, gpx: string): Promise<void> {
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
}
const handoffFixture = () => readFileSync(join(process.cwd(), 'contracts', 'handoff', 'heidelberg-strasbourg.gpx'), 'utf8');

/** A 2-night trip from Wayfinch, planned with Plan bags for this trip, and every save of it settled. */
async function tripPlanned(page: Page, nights = 2): Promise<void> {
  await plannerWithPlan(page);
  await handOver(page, handoffFixture().replace('nights="2"', `nights="${nights}"`));
  await openFresh(page, `/tools/bags/#copilot-handoff=${ID}`);
  await ready(page);
  await page.locator('#handoffPlan').click();
  await expect(page.locator('#handoffUndo')).toBeVisible({ timeout: 20_000 });
  await settled(page);
}
/** No save waiting: the draft in storage is the plan the tab holds. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction('!DRAFT_TIMER && !DRAFT_PENDING_SERIAL && DRAFT_SAVE_STATUS.state === "saved" && JSON.stringify(captureDraft()) === DRAFT_SIGNATURE', null, { timeout: 20_000 });
}
/** Every loadcheck:* value in storage as stored, except the climate and place caches and their stamps (no plan). */
const planStorage = (page: Page) => page.evaluate(() => {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith('loadcheck:') && !['loadcheck:climate', 'loadcheck:places', 'loadcheck:saved-at:v1'].includes(k)).sort();
  return JSON.stringify(keys.map((k) => [k, localStorage.getItem(k)]));
});

test('[FP-START] [FP-NO-WRITE] [FP-BACK] a trip planned from Wayfinch: free play by keyboard changes bags, kit and step and writes nothing; Back puts the trip\'s plan back byte for byte; a reload opens the trip\'s plan', async ({ page }) => {
  test.skip(lightProject(), 'storage, not the theme');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await tripPlanned(page);
  const before = await page.evaluate('JSON.stringify(captureDraft())') as string;
  const stored = await planStorage(page);
  expect(await page.evaluate('S.gpx && S.gpx.copilotRoute')).toMatch(/^[0-9a-f]{64}$/);
  await expect(page.locator('#freePlayText')).toHaveText('This is your trip\'s plan, with the route from Trip.');
  await page.locator('#freePlayStart').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#freePlayHead')).toHaveText('Free play — your trip\'s plan is not changed.');
  await expect(page.locator('#freePlayText')).toHaveText('Nothing here is kept unless you save it as a new setup.');
  await expect(page.locator('#freePlayBack')).toBeFocused();
  await expect(page.locator('#freePlayStart')).toBeHidden();
  await expect(page.locator('#handoffBar')).toBeHidden();
  expect(await page.evaluate('S.gpx')).toBeNull();
  await expect(page.locator('#gpxPick')).toHaveText('Upload a GPX instead');
  // the rider plays: a bigger seat pack, a fourth bag, a kit item off, then the packing check
  await page.evaluate(`(() => {
    S.bags[0].L = 10; S.bags[0].userL = true; S.bags.push({ uid: S.nextUid++, pos: 'top', slot: 'front', L: 1.5 });
    const id = Object.keys(S.kit).find((k) => S.kit[k]); S.kit[id] = false; S.kitTouched[id] = true;
    renderBags(); renderKit(); drawRig(); queueDraftSave();
  })()`);
  await page.locator('#crumbs button[data-to="4"]').click();
  await expect(page.locator('#s4')).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });   // as a closing tab does
  await page.waitForTimeout(600);
  expect(await planStorage(page)).toBe(stored);
  await page.locator('#freePlayBack').focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate('JSON.stringify(captureDraft())') === before).toBe(true);
  expect(await page.evaluate('S.step')).toBe(2);
  await expect(page.locator('#s2')).toBeVisible();
  await expect(page.locator('#freePlayStart')).toBeFocused();
  await expect(page.locator('#freePlayText')).toHaveText('Back to your trip\'s plan, as it was.');
  await expect(page.locator('#handoffUndo')).toBeVisible();   // the bar of Plan bags for this trip is back as it was
  await page.waitForTimeout(600);
  expect(await planStorage(page)).toBe(stored);
  // a reload, or the plain Bag planner card in Tools: the trip's plan, with the line
  await openFresh(page, '/tools/bags/');
  await ready(page);
  expect(await page.evaluate('S.bags.length')).toBe(JSON.parse(before).bags.length);
  expect(await page.evaluate('S.gpx && S.gpx.copilotRoute')).toBe(JSON.parse(before).gpx.copilotRoute);
  await expect(page.locator('#freePlayStart')).toBeVisible();
  expect(errors).toEqual([]);
});

test('[FP-SAVE] in a real browser, only Save as a new setup keeps free play: one new setup with no trip link; the trip\'s plan and setups stay', async ({ page }) => {
  test.skip(lightProject(), 'storage, not the theme');
  await tripPlanned(page);
  const draft = await page.evaluate(() => localStorage.getItem('loadcheck:draft'));
  const setups = await page.evaluate('JSON.stringify(storedSetupsLocal())') as string;
  await page.locator('#freePlayStart').click();
  await page.evaluate('S.bags.push({ uid: S.nextUid++, pos: "top", slot: "front", L: 1.5 }); renderBags(); queueDraftSave();');
  await page.waitForTimeout(500);
  expect(await page.evaluate('JSON.stringify(storedSetupsLocal())')).toBe(setups);
  await page.locator('#freePlaySave').click();
  await expect(page.locator('#freePlayText')).toContainText('Saved as a new setup: Free play, ');
  const now = await page.evaluate('storedSetupsLocal()') as Array<{ name: string; forRoute?: unknown; bags: unknown[] }>;
  expect(now.length).toBe(JSON.parse(setups).length + 1);
  expect(now[0]!.name).toMatch(/^Free play, \d{1,2} [A-Z][a-z]{2}$/);
  expect(now[0]!.forRoute).toBeUndefined();
  expect(now[0]!.bags.length).toBe(JSON.parse(draft!).bags.length + 1);
  expect(JSON.stringify(now.slice(1))).toBe(setups);
  expect(await page.evaluate(() => localStorage.getItem('loadcheck:draft'))).toBe(draft);
  await page.locator('#freePlayBack').click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => localStorage.getItem('loadcheck:draft'))).toBe(draft);
});

test('[FP-OFFER] no line on a plan that never came from Trip, nor in a day ride\'s small view; Open the full Bag planner shows it', async ({ page }) => {
  test.skip(lightProject(), 'storage, not the theme');
  await plannerWithPlan(page);
  await expect(page.locator('#freePlayBar')).toBeHidden();
  await handOver(page, handoffFixture().replace('nights="2"', 'nights="0"'));
  await openFresh(page, `/tools/bags/#copilot-handoff=${ID}`);
  await ready(page);
  await page.locator('#handoffPlan').click();
  await expect(page.locator('#smallHead')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#freePlayBar')).toBeHidden();
  await page.locator('#smallFull').click();
  await expect(page.locator('#freePlayStart')).toBeVisible();
});

test('[FP-A11Y] at 320 px, in this project\'s theme: the free-play bar fits without sideways scroll, its buttons are 44 px targets with their names, reached by keyboard', async ({ page }) => {
  test.skip(test.info().project.name.startsWith('app-laptop'), 'the 320 px check runs in the two phone projects, one per theme');
  await page.setViewportSize({ width: 320, height: 640 });
  await tripPlanned(page);
  const start = page.getByRole('button', { name: 'Try other bags freely' });
  await expect(start).toBeVisible();
  await start.focus();
  await page.keyboard.press('Enter');
  const back = page.getByRole('button', { name: 'Back to the trip\'s plan' });
  const save = page.getByRole('button', { name: 'Save as a new setup' });
  await expect(back).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(save).toBeFocused();
  await expect(page.locator('#freePlayBar')).toHaveAttribute('role', 'status');
  for (const b of [back, save]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = (await page.locator('#freePlayBar').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  // the words read against the bar in both themes: the text is not the bar's own colour
  const [ink, bg] = await page.locator('#freePlayText').evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.closest('.draftbar')!).backgroundColor]);
  expect(ink).not.toBe(bg);
  await back.press('Enter');
  await expect(start).toBeFocused();
});
