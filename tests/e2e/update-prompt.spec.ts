// The update prompt on the built page, in a real browser. Plan Task 6.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startCfLike } from './server/cf-like.mjs';
import type { CfLike } from './server/cf-like.mjs';
import { legacySite } from './fixtures/legacy-site.mjs';
import {
  blockOutside, buildSite, open, registerAndControl, removeTempDirs, stateOf, tempDir, updateAndSettle, waitForWorker, watchNavigations,
} from './fixtures/sw-helpers.ts';

const PROMPT = 'Update ready — apply now';
let server: CfLike;
test.beforeEach(async ({ context }) => { await blockOutside(context); });
test.afterEach(async () => {
  await server?.close();
  removeTempDirs();
});

const prompt = (page: Page) => page.getByRole('button', { name: PROMPT, exact: true });
const draftReady = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');

/** The first build active and controlling this tab, and a second one on the server. */
async function withNextBuildOnServer(page: Page): Promise<void> {
  const one = await buildSite();
  const two = await buildSite({ extraFiles: { 'assets/changed.txt': 'a changed file' } });
  server = await startCfLike({ dir: one.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  await draftReady(page);
  await expect(prompt(page)).toHaveCount(0);
  server.swap(two.dir);
}

test('[LC-UPDATE-PROMPT] a waiting worker shows exactly the prompt, in every window; with none there is no prompt', async ({ context, page }) => {
  await withNextBuildOnServer(page);
  const second = await context.newPage();
  await open(second, `${server.origin}/`);
  await draftReady(second);
  await expect.poll(() => stateOf(second)).toEqual({ active: true, waiting: true, installing: false });

  for (const tab of [page, second]) {
    await expect(prompt(tab)).toBeVisible();
    await expect(prompt(tab)).toHaveText(PROMPT);
    await expect(tab.locator('#updateBar button')).toHaveCount(1);
  }
  // A window opened while it waits sees it from the start.
  const third = await context.newPage();
  await open(third, `${server.origin}/`);
  await expect(prompt(third)).toBeVisible();
});

test('[LC-UPDATE-PROMPT] the first takeover from the old worker shows no prompt', async ({ page }) => {
  server = await startCfLike({ dir: legacySite(tempDir()) });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  const next = await buildSite();
  server.swap(next.dir);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForWorker(page, 'new');
  await page.waitForTimeout(500);
  await expect(prompt(page)).toHaveCount(0);
  await expect(page.locator('#updateBar')).toBeHidden();
});

test('[LC-UPDATE-FLUSH] a tap writes the pending draft first, applies, reloads only the tapped window, and the other window keeps working', async ({ context, page }) => {
  await withNextBuildOnServer(page);
  const other = await context.newPage();
  await open(other, `${server.origin}/`);
  await draftReady(other);
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(other)).toBeVisible();
  const otherNavigations = await watchNavigations(other);

  // Records what is stored at the moment the worker is told to apply. The tab reloads, so sessionStorage keeps it.
  await page.evaluate(() => {
    const send = ServiceWorker.prototype.postMessage as (message: unknown) => void;
    ServiceWorker.prototype.postMessage = function (this: ServiceWorker, message: unknown) {
      if ((message as { type?: string })?.type === 'LOADCHECK_ACTIVATE') {
        sessionStorage.setItem('qa:draftAtApply', localStorage.getItem('loadcheck:draft') ?? '');
      }
      send.call(this, message);
    } as typeof ServiceWorker.prototype.postMessage;
  });
  // Changed a moment ago: the 300 ms timer hasn't run.
  await page.evaluate('S.pendingSaveName = "changed just before the tap"; queueDraftSave();');
  const reloaded = page.waitForEvent('framenavigated');
  await prompt(page).click();
  await reloaded;
  await draftReady(page);

  expect(await page.evaluate(() => sessionStorage.getItem('qa:draftAtApply')?.includes('changed just before the tap'))).toBe(true);
  expect(await page.evaluate('S.pendingSaveName')).toBe('changed just before the tap');
  await expect(prompt(page)).toHaveCount(0);
  await expect.poll(() => stateOf(page)).toEqual({ active: true, waiting: false, installing: false });

  // The other window: never reloaded, prompt gone.
  await expect(prompt(other)).toHaveCount(0);
  expect(await otherNavigations()).toEqual({ navigations: 0, mark: true });
});

test('[LC-UPDATE-FLUSH] if the save fails the prompt says so and does not apply; once it works the tap applies', async ({ page }) => {
  await withNextBuildOnServer(page);
  expect(await updateAndSettle(page)).toBe('waiting');
  await expect(prompt(page)).toBeVisible();
  const navigations = await watchNavigations(page);

  await page.evaluate(() => {
    const realSet = Storage.prototype.setItem;
    (window as unknown as { qaRestore: () => void }).qaRestore = () => { Storage.prototype.setItem = realSet; };
    Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  });
  await page.evaluate('S.nights = 8; queueDraftSave();');
  await prompt(page).click();
  await expect(page.locator('#updateNote')).toContainText('could not be saved');
  await expect(prompt(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(await stateOf(page)).toEqual({ active: true, waiting: true, installing: false });
  expect(await navigations()).toEqual({ navigations: 0, mark: true });

  await page.evaluate(() => (window as unknown as { qaRestore: () => void }).qaRestore());
  const reloaded = page.waitForEvent('framenavigated');
  await prompt(page).click();
  await reloaded;
  await draftReady(page);
  expect(await page.evaluate('S.nights')).toBe(8);
});

test('[LC-UPDATE-HOURLY] the page looks at load and on return to the foreground, at most once an hour', async ({ page }) => {
  const site = await buildSite();
  server = await startCfLike({ dir: site.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);

  const start = new Date('2026-11-10T08:00:00Z').getTime();
  await page.clock.setFixedTime(start);
  await page.addInitScript(() => {
    const update = ServiceWorkerRegistration.prototype.update;
    (window as unknown as { qaUpdates: number }).qaUpdates = 0;
    ServiceWorkerRegistration.prototype.update = function (this: ServiceWorkerRegistration) {
      (window as unknown as { qaUpdates: number }).qaUpdates += 1;
      return update.call(this);
    };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const updates = () => page.evaluate(() => (window as unknown as { qaUpdates: number }).qaUpdates);
  await expect.poll(updates).toBe(1);

  const foreground = () => page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.setFixedTime(start + 59 * 60_000);
  await foreground();
  await page.waitForTimeout(200);
  expect(await updates()).toBe(1);

  await page.clock.setFixedTime(start + 60 * 60_000);
  await foreground();
  await expect.poll(updates).toBe(2);
});

test('[LC-UPDATE-PROMPT] the prompt also appears from a later look, with no reload', async ({ page }) => {
  await withNextBuildOnServer(page);
  const navigations = await watchNavigations(page);
  expect(await updateAndSettle(page)).toBe('waiting');
  await expect(prompt(page)).toBeVisible();
  expect(await navigations()).toEqual({ navigations: 0, mark: true });
});
