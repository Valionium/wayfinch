// The bag planner's side of the contracts with the co-pilot, in a real browser, built with the launch switch on (sub-project 6, group 2).
// qa/contracts.cjs holds the detailed cases on the page's own code; here start-up, the fragment and the address are real.
// Nothing here prints the page: failures compare booleans, counts and short values.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const ID = 'fedcba9876543210fedcba9876543210';
const ready = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');

/** A new load of the page, as from another screen: a change of fragment alone would not load it again. */
async function openFresh(page: Page, path: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`${app!.origin}${path}`, { waitUntil: 'load' });
}

/** The bag planner with a saved plan of three bags, a saved setup and a bike, as a rider leaves it. */
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
  expect(await page.evaluate(() => localStorage.getItem('loadcheck:draft') !== null)).toBe(true);
}

test('[C-DELETE] opened from You with a stored request: the plan, bike and the rest are gone before the draft is restored, the fragment goes, an empty plan shows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await plannerWithPlan(page);
  await page.evaluate((id) => {
    localStorage.setItem('copilot:delete-request:v1', JSON.stringify({ app: 'copilot', kind: 'delete-request', v: 1, id, createdAt: new Date(Date.now() + 1000).toISOString() }));
    localStorage.setItem('copilot:other:v1', '"kept"');
  }, ID);
  await openFresh(page, `/tools/bags/#copilot-delete=${ID}`);
  await ready(page);
  expect(await page.evaluate(() => location.hash)).toBe('');
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('loadcheck:')).sort());
  expect(left).not.toContain('loadcheck:draft');
  expect(left).not.toContain('loadcheck:bikeProfile');
  expect(left).toContain('loadcheck:delete-applied');
  expect(await page.evaluate('S.bags.length')).toBe(0);
  expect(await page.evaluate('S.bikeProfile')).toBeNull();
  await expect(page.locator('#draftBar')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('copilot:other:v1'))).toBe('"kept"');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:delete-applied')!).id)).toBe(ID);

  // A new plan after that, and a reload with the same request still stored: the new plan stays.
  await page.evaluate(`(async () => { S.bags = [{ uid: 1, pos: 'seat', L: 10 }]; S.nextUid = 2; await flushDraft(); })()`);
  const draft = await page.evaluate(() => localStorage.getItem('loadcheck:draft'));
  expect(draft).not.toBeNull();
  await openFresh(page, `/tools/bags/#copilot-delete=${ID}`);
  await ready(page);
  expect(await page.evaluate(() => localStorage.getItem('loadcheck:draft'))).toBe(draft);
  expect(await page.evaluate('S.bags.length')).toBe(1);
  expect(errors).toEqual([]);
});

test('[C-DELETE-FRAGMENT] #copilot-delete= with no stored request deletes nothing; the plan is restored and the fragment goes', async ({ page }) => {
  await plannerWithPlan(page);
  const before = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]))));
  await openFresh(page, `/tools/bags/#copilot-delete=${ID}`);
  await ready(page);
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect(await page.evaluate('S.bags.length')).toBe(3);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:draft')!) as { bags: unknown[] });
  expect(after.bags.length).toBe(3);
  const kept = JSON.parse(before) as Record<string, string>;
  for (const [k, v] of Object.entries(kept)) if (!['loadcheck:summary:v1', 'loadcheck:saved-at:v1'].includes(k)) expect(await page.evaluate((key) => localStorage.getItem(key), k), k).toBe(v);
});
