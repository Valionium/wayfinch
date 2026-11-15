// The trip is entered once (the owner's ruling of 14 Nov 2026; sweep of 14 Nov, finding 28), in a real browser, launch build, in the four
// app projects: a trip handed over from Wayfinch folds step one (Ride) to one line, where, when and how many nights, with the GPX
// named, and Change opens today's fields with every value as it was; a plan without a trip from Wayfinch shows step one as today;
// Comfortable or Lightweight is chosen at the start of Kit and the Check follows it. Nothing stored changes by the fold.
// Nothing here prints the page: failures compare short texts, booleans and sizes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const ID = 'abcdef0123456789abcdef0123456789';
const ready = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');
const settled = (page: Page) => page.waitForFunction('!DRAFT_TIMER && !DRAFT_PENDING_SERIAL && DRAFT_SAVE_STATUS.state === "saved" && JSON.stringify(captureDraft()) === DRAFT_SIGNATURE', null, { timeout: 20_000 });
/**
 * The page has stopped scrolling: scrollY the same for half a second. A jump's smooth scroll can still move the page after the focus
 * has scrolled to the choice, so "in sight" is judged only once the page is still (re-check 3 of PR 166, m10).
 */
const scrollStill = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => {
  let last = scrollY;
  let since = performance.now();
  const id = setInterval(() => {
    if (scrollY !== last) { last = scrollY; since = performance.now(); } else if (performance.now() - since >= 500) { clearInterval(id); resolve(); }
  }, 50);
}));
/**
 * Check's jump to Kit's choice, tapped again with the page scrolled to each of `from`, judged once the page is still: the choice focused
 * and in sight. From a place where the choice is already in sight after the step change, the focus scrolls nothing, so only go()'s
 * smooth scroll to the top moves the page: on a phone that took the choice out of sight (review of PR 166, I4; re-check 3, m10).
 * `back` brings Check back with the pointer shown.
 */
async function jumpsLand(page: Page, back: () => Promise<void>, pointer: Locator, choice: Locator, from: number[]): Promise<void> {
  for (const y of from) {
    await back();
    await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y);
    await pointer.dispatchEvent('click');
    await scrollStill(page);
    await expect(choice, `from scrollY ${y}`).toBeFocused();
    await expect(choice, `from scrollY ${y}`).toBeInViewport();
  }
}
const toCheck = async (page: Page, open?: Locator): Promise<void> => {
  await page.evaluate('go(4)');
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click();   // the weight question, skipped
  if (open) await open.evaluate((el) => { const d = el.closest('details'); if (d) d.open = true; });
  await scrollStill(page);   // go()'s own smooth scroll to the top done, so the tap starts from a page at rest
};

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

async function tripPlanned(page: Page): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await page.evaluate(() => localStorage.setItem('loadcheck:walkthrough:v1', 'done'));
  await handOver(page, readFileSync(join(process.cwd(), 'contracts', 'handoff', 'heidelberg-strasbourg.gpx'), 'utf8'));
  await page.goto('about:blank');
  await page.goto(`${app.origin}/tools/bags/#copilot-handoff=${ID}`, { waitUntil: 'load' });
  await ready(page);
  await page.locator('#handoffPlan').click();
  await expect(page.locator('#handoffUndo')).toBeVisible({ timeout: 20_000 });
  await settled(page);
}

test('[LC-RIDE-FOLD] a trip from Wayfinch folds Ride to one line with Change; Change opens today\'s fields as they were; nothing stored changes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await tripPlanned(page);
  const nights = await page.evaluate('S.nights') as number;
  const gpxName = await page.evaluate('S.gpx.name || S.gpx.file') as string;
  await page.locator('#crumbs button[data-to="1"]').click();
  await settled(page);
  const before = await page.evaluate('JSON.stringify(captureDraft())') as string;   // at step one: the step is part of the plan
  const summary = page.locator('#rideSummary');
  await expect(summary).toBeVisible();
  await expect(page.locator('#rideFields')).toBeHidden();
  const line = await page.locator('#rideSummaryText').textContent() ?? '';
  expect(line).toContain(nights === 1 ? '1 night' : `${nights} nights`);
  expect(line).toContain(`GPX: ${gpxName}`);
  expect(line).toMatch(/→/);   // where: from one end to the other
  const change = page.locator('#rideChange');
  await expect(change).toHaveAttribute('aria-expanded', 'false');
  expect((await change.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // Change, by keyboard: today's fields, every value as it was
  await change.focus();
  await page.keyboard.press('Enter');
  await expect(change).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#rideFields')).toBeVisible();
  await expect(page.locator('#nights')).toHaveValue(String(nights));
  await expect(page.locator('#geoInput')).toBeVisible();
  // the fold and Change store nothing
  expect(await page.evaluate('JSON.stringify(captureDraft())')).toBe(before);
  // no sideways scroll at 320 px with the line
  await change.click();
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(summary).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test('[LC-RIDE-FOLD] a plan without a trip from Wayfinch shows Ride as today', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await expect(page.locator('#rideSummary')).toBeHidden();
  await expect(page.locator('#rideFields')).toBeVisible();
  await expect(page.locator('#geoInput')).toBeVisible();
  await expect(page.locator('#nights')).toBeVisible();
});

test('[LC-MODE-KIT] Comfortable or Lightweight is chosen at the start of Kit; Check follows it', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await page.evaluate(() => localStorage.setItem('loadcheck:walkthrough:v1', 'done'));
  await page.locator('#crumbs button[data-to="3"]').click();
  const bar = page.locator('#s3 #modeBar');
  await expect(bar).toBeVisible();
  const comfort = bar.locator('button[data-mode="comfort"]'), light = bar.locator('button[data-mode="light"]');
  await expect(comfort).toHaveAttribute('aria-pressed', 'true');
  await light.click();
  await expect(light).toHaveAttribute('aria-pressed', 'true');
  await expect(comfort).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate('S.mode')).toBe('light');
  await page.locator('#crumbs button[data-to="4"]').click();
  await expect(page.locator('#s4 #modeBar')).toHaveCount(0);
  expect(await page.evaluate('S.mode')).toBe('light');
});

test('[LC-MODE-KIT] Check says where Comfortable is now: at the start of Kit, one tap away, never a switch that is not on the screen (review of PR 166, I1)', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await page.evaluate(() => localStorage.setItem('loadcheck:walkthrough:v1', 'done'));
  await page.evaluate('S.nights = 4; S.sleep = "camp"; S.nightsOpen = null; applyTripKitDefaults(); go(3);');
  await page.locator('#s3 #modeBar button[data-mode="light"]').click();
  await page.locator('#crumbs button[data-to="4"]').click();
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click();   // the weight question, skipped
  const leave = page.locator('#resultBox details.sec', { hasText: 'Leave it behind' });
  await leave.evaluate((d) => { (d as HTMLDetailsElement).open = true; });
  const note = leave.locator('.finding.cut', { hasText: 'Lightweight has left' });
  await expect(note).toBeVisible();
  await expect(note).toContainText('Choose Comfortable at the start of Kit to bring them back.');
  expect(await page.locator('#s4').textContent()).not.toMatch(/Switch to (Comfortable|Lightweight)/);
  const go = note.getByRole('button', { name: 'Go to Comfortable in Kit' });
  expect((await go.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await go.click();
  await expect(page.locator('#s3')).toBeVisible();
  await expect(page.locator('#s3 #modeBar button[data-mode="comfort"]')).toBeFocused();
  await scrollStill(page);
  await expect(page.locator('#s3 #modeBar button[data-mode="comfort"]')).toBeInViewport();   // in sight, on a phone too (review of PR 166, I4)
  await jumpsLand(page, () => toCheck(page, note), go, page.locator('#s3 #modeBar button[data-mode="comfort"]'), [0, 500, 600, 700, 800, 900, 1500]);
});

test('[LC-RIDE-FOLD] Check\'s Review ride opens Ride\'s fields, folded or not, with the focus on Retry weather when the weather failed (review of PR 166, I2)', async ({ page }) => {
  await tripPlanned(page);   // the e2e helpers block the climate requests: the trip's measured weather fails
  await page.locator('#crumbs button[data-to="4"]').click();
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click();   // the weight question, skipped
  const review = page.locator('#verdictBox [data-result-jump="trip"]');
  await expect(review).toHaveText('Review ride');
  await review.click();
  await expect(page.locator('#s1')).toBeVisible();
  await expect(page.locator('#rideFields')).toBeVisible();
  await expect(page.locator('#rideChange')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#retryWeather')).toBeVisible();
  await expect(page.locator('#retryWeather')).toBeFocused();
});

test('[LC-MODE-KIT] nothing on Check points to a switch that is not there: each pointer to Comfortable or Lightweight names Kit and goes there, the focus on the choice (review of PR 166, I3)', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await page.evaluate(() => localStorage.setItem('loadcheck:walkthrough:v1', 'done'));
  const stale = /switch to (comfortable|lightweight)|(comfortable|lightweight)(<\/b>)? above/i;
  // Comfortable with bags mounted and empty: "Leave them at home … choose Lightweight at the start of Kit"
  await page.evaluate(`S.nights = 1; S.sleep = 'indoor'; S.mode = 'comfort'; S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'bar', L:13 }, { uid:3, pos:'frame', L:6 },
    { uid:4, pos:'pack', L:30 }, { uid:5, pos:'fork', L:3, pair:true }]; S.nextUid = 6; S.decks = { bar:false, rack:false }; applyTripKitDefaults(); go(2); go(3); go(4);`);
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click();   // the weight question, skipped
  await page.setViewportSize({ width: 320, height: 640 });   // the narrowest phone; the verdict's jump below at 360 px (review of PR 166, I4)
  const empty = page.locator('#resultBox .finding.note', { hasText: 'Two honest answers here' });
  await empty.evaluate((el) => { const d = el.closest('details'); if (d) d.open = true; });
  await expect(empty).toContainText('choose Lightweight at the start of Kit and the check will do exactly that');
  expect(await page.locator('#s4').innerHTML()).not.toMatch(stale);
  await empty.getByRole('button', { name: 'Go to Lightweight in Kit' }).click();
  await expect(page.locator('#s3')).toBeVisible();
  await expect(page.locator('#s3 #modeBar button[data-mode="light"]')).toBeFocused();
  await scrollStill(page);
  await expect(page.locator('#s3 #modeBar button[data-mode="light"]')).toBeInViewport();   // in sight, on a phone too (review of PR 166, I4)
  await jumpsLand(page, () => toCheck(page, empty), empty.getByRole('button', { name: 'Go to Lightweight in Kit' }), page.locator('#s3 #modeBar button[data-mode="light"]'), [0, 500, 600, 700, 800, 900, 1500]);
  // Lightweight, only just fitting: the verdict names Kit for Comfortable
  const tight = await page.evaluate(`(() => { S.mode = 'light'; S.bags = [{ uid:1, pos:'seat', L:6 }]; S.nextUid = 2; go(4);
    for (let L = 6; L <= 30; L += 0.5) { S.bags[0].L = L; S.bags[0].userL = true; renderResult();
      if (/minimum setup/.test(document.getElementById('verdictBox').textContent)) return L; } return null; })()`);
  expect(tight, 'a Lightweight plan that only just fits').not.toBeNull();
  await expect(page.locator('#verdictBox')).toContainText('choose Comfortable at the start of Kit');
  expect(await page.locator('#s4').innerHTML()).not.toMatch(stale);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.locator('#verdictBox').getByRole('button', { name: 'Go to Comfortable in Kit' }).click();
  await expect(page.locator('#s3 #modeBar button[data-mode="comfort"]')).toBeFocused();
  await scrollStill(page);
  await expect(page.locator('#s3 #modeBar button[data-mode="comfort"]')).toBeInViewport();   // in sight, on a phone too (review of PR 166, I4)
  await jumpsLand(page, () => toCheck(page), page.locator('#verdictBox').getByRole('button', { name: 'Go to Comfortable in Kit' }), page.locator('#s3 #modeBar button[data-mode="comfort"]'), [0, 500, 600, 700, 800, 900, 1500]);
});
