// The trip is entered once (the owner's ruling of 14 Nov 2026; sweep of 14 Nov, finding 28), in a real browser, launch build, in the four
// app projects: a trip handed over from Wayfinch folds step one (Ride) to one line, where, when and how many nights, with the GPX
// named, and Change opens today's fields with every value as it was; a plan without a trip from Wayfinch shows step one as today;
// Comfortable or Lightweight is chosen at the start of Kit and the Check follows it. Nothing stored changes by the fold.
// Nothing here prints the page: failures compare short texts, booleans and sizes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const ID = 'abcdef0123456789abcdef0123456789';
const ready = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');
const settled = (page: Page) => page.waitForFunction('!DRAFT_TIMER && !DRAFT_PENDING_SERIAL && DRAFT_SAVE_STATUS.state === "saved" && JSON.stringify(captureDraft()) === DRAFT_SIGNATURE', null, { timeout: 20_000 });

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
