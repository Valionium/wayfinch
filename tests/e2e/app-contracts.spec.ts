// The bag planner's side of the contracts with the co-pilot, in a real browser, built with the launch switch on (sub-project 6, group 2).
// qa/contracts.cjs holds the detailed cases on the page's own code; here start-up, the fragment and the address are real.
// Nothing here prints the page: failures compare booleans, counts and short values.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());
// Storage, workers and contracts, not looks: once per browser size, in the dark theme only, so the run stays inside its time.
test.skip(({ colorScheme }) => colorScheme === 'light', 'storage, not the theme');

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

/** What the emergency switch leaves behind (tools/emergency-worker.js): no registration and none of the site's caches. Data stays. */
async function switchedOff(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const name of await caches.keys()) if (name.startsWith('wayfinch-precache-')) await caches.delete(name);
  });
}
const registrations = (page: Page) => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => [r.scope, (r.active ?? r.waiting ?? r.installing)?.scriptURL ?? '']));

test('[LC-OFFLINE-SITE] Make available offline at /tools/bags/ registers the site\'s /offline-worker.js at scope /, and the panel reports that copy', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  expect(await registrations(page)).toEqual([]);
  await page.evaluate('prepareOfflinePacking()');
  await page.waitForFunction('OFFLINE_PACKING.cacheReady === true && OFFLINE_PACKING.busy === false', undefined, { timeout: 30_000 });
  expect(await registrations(page)).toEqual([[`${app.origin}/`, `${app.origin}/offline-worker.js`]]);
  expect(await page.evaluate('OFFLINE_PACKING.error')).toBe('');
  await expect(page.locator('#offlinePackingPanel')).toContainText('Ready on this device');
});

test('[LC-OFFLINE-AGAIN] after the switch took the copy: one line, its tap brings the copy back and the line goes; Not now ends it for good; a rider who never had it never sees it', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await page.waitForFunction('OFFLINE_PACKING.checked === true');
  await expect(page.locator('#offlineAgainBar')).toBeHidden();   // never had it
  await page.evaluate('prepareOfflinePacking()');
  await page.waitForFunction('OFFLINE_PACKING.cacheReady === true && OFFLINE_PACKING.busy === false', undefined, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('loadcheck:offline-had'))).not.toBeNull();

  await switchedOff(page);
  await openFresh(page, '/tools/bags/');
  await ready(page);
  await expect(page.locator('#offlineAgainBar')).toBeVisible();
  await expect(page.locator('#offlineAgainText')).toContainText('Make available offline');
  await page.locator('#offlineAgainSave').click();
  await expect(page.locator('#offlineAgainBar')).toBeHidden({ timeout: 30_000 });
  expect(await registrations(page)).toEqual([[`${app.origin}/`, `${app.origin}/offline-worker.js`]]);

  await switchedOff(page);
  await openFresh(page, '/tools/bags/');
  await ready(page);
  await expect(page.locator('#offlineAgainBar')).toBeVisible();
  await page.locator('#offlineAgainLater').click();
  await expect(page.locator('#offlineAgainBar')).toBeHidden();
  await openFresh(page, '/tools/bags/');
  await ready(page);
  await page.waitForFunction('OFFLINE_PACKING.checked === true');
  await page.waitForTimeout(300);
  await expect(page.locator('#offlineAgainBar')).toBeHidden();
});

/** The home-screen app: no browser bar, so no Back button but the page's own. Chromium can't be put in an installed window here,
 *  so the page is told it is one before any script, as app-flight's FLOW-INSTALL-OFFLINE does. */
async function standalone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (/display-mode:\s*standalone/.test(q)
      ? ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList)
      : real(q));
  });
}

test('[LC-BACK] in the home-screen app, Back to Wayfinch is always at the top and goes to Tools; after Bike details from You, back to You', async ({ page }) => {
  await standalone(page);
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true);
  const back = page.locator('#backToWayfinch');
  await expect(back).toBeVisible();
  await expect(back).toHaveText(/Back to Wayfinch/);
  await expect(back).toHaveAttribute('href', '/#/tools');
  // still there, at the top, far down the page
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(back).toBeInViewport();
  // after Bike details opened from You, it goes back to You
  await openFresh(page, '/tools/bags/#bike-details=new&back=you');
  await ready(page);
  expect(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true);
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await expect(back).toHaveAttribute('href', '/#/you');
  // Bike details is open over the page: its own Back to You, at its top, goes there
  await expect(page.locator('#bikeDetailsBack')).toHaveAttribute('href', '/#/you');
  await page.locator('#bikeDetailsBack').click();
  await page.waitForURL(`${app.origin}/#/you`);
  expect(new URL(page.url()).pathname).toBe('/');
  // and closing Bike details itself goes back to You too (owner's try-out, 5 Nov 2026, BK-RETURN)
  await openFresh(page, '/tools/bags/#bike-details=new&back=you');
  await ready(page);
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await page.locator('#bikeDetailsClose').click();
  await page.waitForURL(`${app.origin}/#/you`);
  expect(new URL(page.url()).pathname).toBe('/');
});

test('[C-HANDOFF] a trip from Wayfinch in a real browser: the bar asks, Apply loads the route and its settings, Undo brings the plan back, Back goes to Trip', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await plannerWithPlan(page);
  const gpx = readFileSync(join(process.cwd(), 'contracts', 'handoff', 'heidelberg-strasbourg.gpx'), 'utf8');
  // the co-pilot's database as it makes it (src/store/db.ts), with the handoff the co-pilot wrote
  await page.evaluate(async ({ gpx, id }) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('copilot', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('handoffs'); };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('handoffs', 'readwrite');
        tx.objectStore('handoffs').put({ id, gpx, createdAt: new Date().toISOString() }, id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    localStorage.setItem('copilot:handoff:v1', JSON.stringify({ app: 'copilot', kind: 'handoff', v: 1, id, createdAt: new Date().toISOString() }));
  }, { gpx, id: ID });
  const before = await page.evaluate('JSON.stringify(captureDraft())');
  await openFresh(page, `/tools/bags/#copilot-handoff=${ID}`);
  await ready(page);
  await expect(page.locator('#handoffBar')).toBeVisible();
  await expect(page.locator('#handoffText')).toContainText('A trip from Wayfinch');
  await expect(page.locator('#handoffUndo')).toBeHidden();
  await page.locator('#handoffApply').click();
  await expect(page.locator('#handoffUndo')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#handoffCancel')).toBeHidden();
  await expect(page.locator('#handoffApply')).toBeHidden();
  expect(await page.evaluate('[S.nights, S.pace, S.sleep, S.flatKph, S.departureDate, S.place && S.place.name]')).toEqual([2, 'hard', 'mixed', 22, '2026-06-12', 'Heidelberg']);
  expect(await page.evaluate('S.bags.length')).toBe(3);
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:handoff-done')!).outcome)).toBe('applied');
  await expect(page.locator('#backToWayfinch')).toHaveAttribute('href', '/#/trip');
  await page.locator('#handoffUndo').click();
  expect(await page.evaluate('JSON.stringify(captureDraft())')).toBe(before);
  expect(errors).toEqual([]);
});

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

test('[TRIP-BAGS-LONG] a 2-night trip from Wayfinch in a real browser: Plan bags for this trip opens Bags with a new trip setup and the plan before kept; Undo brings it all back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await plannerWithPlan(page);
  await handOver(page, handoffFixture());
  const before = await page.evaluate('JSON.stringify(captureDraft())');
  const setupsBefore = await page.evaluate(() => localStorage.getItem('loadcheck:setups'));
  await openFresh(page, `/tools/bags/#copilot-handoff=${ID}`);
  await ready(page);
  await expect(page.locator('#handoffText')).toContainText('Plan bags for this trip?');
  await expect(page.locator('#handoffApply')).toHaveText('Use only the route');
  await page.locator('#handoffPlan').click();
  await expect(page.locator('#handoffUndo')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#handoffText')).toContainText('Planned for Heidelberg → Strasbourg');
  await expect(page.locator('#handoffPlan')).toBeHidden();
  await expect(page.locator('#s2')).toBeVisible();
  expect(await page.evaluate('[S.step, S.nights, S.place && S.place.name]')).toEqual([2, 2, 'Heidelberg']);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:setups')!) as Array<{ name: string; forRoute?: { hash: string } }>);
  const [made, kept] = stored;
  expect(made!.name).toBe('Heidelberg → Strasbourg, 12 Jun');
  expect(made!.forRoute!.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(kept!.name).toMatch(/^Before Heidelberg → Strasbourg, /);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:handoff-done')!).outcome)).toBe('applied');
  await expect(page.locator('#backToWayfinch')).toHaveAttribute('href', '/#/trip');
  await page.locator('#handoffUndo').click();
  await expect(page.locator('#handoffText')).toContainText('Undone');
  expect(await page.evaluate('JSON.stringify(captureDraft())')).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem('loadcheck:setups'))).toBe(setupsBefore ?? '[]');
  expect(errors).toEqual([]);
});

test('[TRIP-SMALL] a day ride from Wayfinch in a real browser: the small view shows the bike with its bags and what is in each bag, nothing else; the full planner is one tap away', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await plannerWithPlan(page);
  await handOver(page, handoffFixture().replace('nights="2"', 'nights="0"'));
  await openFresh(page, `/tools/bags/#copilot-handoff=${ID}`);
  await ready(page);
  await expect(page.locator('#handoffText')).toContainText('a day ride');
  await page.locator('#handoffPlan').click();
  await expect(page.locator('#handoffUndo')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#smallHead')).toBeVisible();
  await expect(page.locator('#smallTripLine')).toContainText('day ride');
  await expect(page.locator('#rigSvg')).toBeVisible();
  await expect(page.locator('#packingChecklist .packing-groups')).toBeVisible();
  for (const hidden of ['#crumbs', '#resultBox', '#modeBar', '#verdictBox', '.nightsbar', '#rigTools', '#packingUnpackedOnly', '#printPackingChecklist'])
    await expect(page.locator(hidden).first()).toBeHidden();
  await expect(page.locator('.wf-bar')).toBeVisible();   // the one top bar stays
  expect(await page.evaluate('[S.step, S.nights]')).toEqual([4, 0]);
  const plan = await page.evaluate('JSON.stringify(currentPlan())');
  await page.locator('#smallFull').click();
  await expect(page.locator('#smallHead')).toBeHidden();
  await expect(page.locator('#crumbs')).toBeVisible();
  await expect(page.locator('#resultBox')).toBeVisible();
  expect(await page.evaluate('JSON.stringify(currentPlan())')).toBe(plan);
  expect(errors).toEqual([]);
});

test('[BK-FORK-SAVE] the trip handoff leaves the bike alone: a fork\'s own two colours stay in the plan\'s bike, its saved copy and the draft', async ({ page }) => {
  await plannerWithPlan(page);
  const FORK = { kind: 'pattern', pattern: 'camo', pair: 2, colours: ['#2f7d4f', '#f1c232'] };
  await page.evaluate(`(async () => {
    S.bikeProfile = normaliseBikeProfile({ id: 'bike_e2e', name: 'Tourer', look: { colour: '#2563b8', paint: { fork: ${JSON.stringify(FORK)} } } });
    await store.set('loadcheck:bikeProfile', S.bikeProfile);
    await bikeStoreSet(BIKE_PROFILE_KEY, [S.bikeProfile]);
    await flushDraft();
  })()`);
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
  const stored = () => page.evaluate(() => ['loadcheck:bikeProfile', 'loadcheck:bikeProfiles', 'loadcheck:draft'].map((k) => localStorage.getItem(k)));
  const [bike, list] = await stored();
  expect(JSON.parse(bike!).look.paint.fork).toEqual(FORK);
  await openFresh(page, `/tools/bags/#copilot-handoff=${ID}`);
  await ready(page);
  await page.locator('#handoffApply').click();
  await expect(page.locator('#handoffUndo')).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate('S.place && S.place.name')).toBe('Heidelberg');   // the trip came in
  expect(await page.evaluate('JSON.stringify(S.bikeProfile.look.paint.fork)')).toBe(JSON.stringify(FORK));
  await page.evaluate('flushDraft()');
  expect(JSON.parse((await stored())[2]!).bikeProfile.look.paint.fork).toEqual(FORK);
  const [bikeAfter, listAfter] = await stored();
  expect(bikeAfter).toBe(bike);
  expect(listAfter).toBe(list);
});

test('[LC-OFFLINE-AGAIN] after the switch took the copy, opening Wayfinch at / brings it back by itself; the bag planner then has nothing to say (review M8)', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/' });
  await expect.poll(async () => (await registrations(page)).length, { timeout: 30_000 }).toBe(1);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((n) => n.startsWith('wayfinch-precache-'))), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => localStorage.setItem('loadcheck:offline-had', JSON.stringify({ app: 'load-check', kind: 'offline-had', v: 1 })));
  await switchedOff(page);
  expect(await registrations(page)).toEqual([]);
  // the co-pilot registers the site's worker at every start, with no tap (src/ui/register.ts, APP-REGISTER)
  await openFresh(page, '/');
  await expect.poll(async () => (await registrations(page)).map((r) => r[1]), { timeout: 30_000 }).toEqual([`${app.origin}/offline-worker.js`]);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((n) => n.startsWith('wayfinch-precache-'))), { timeout: 30_000 }).toBe(true);
  await openFresh(page, '/tools/bags/');
  await ready(page);
  await page.waitForFunction('OFFLINE_PACKING.checked === true', undefined, { timeout: 30_000 });
  await page.waitForTimeout(300);
  await expect(page.locator('#offlineAgainBar')).toBeHidden();
});
