// From the old site to the new worker, the emergency switch, and back again. Plan Task 5.
// Decision 10: the tests register the worker themselves, with the arguments the old page uses, because the old page's
// offline code requires https. The old page's own button is covered on real phones in Task 9.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { buildDist } from '../../tools/build.mjs';
import { startCfLike } from './server/cf-like.mjs';
import type { CfLike } from './server/cf-like.mjs';
import { legacySite } from './fixtures/legacy-site.mjs';
import {
  activeWorkerKind, blockOutside, buildSite, cacheNames, goOffline, isControlled, isLoadCheckPage, open,
  registerAndControl, removeTempDirs, stateOf, tempDir, updateAndSettle, watchNavigations,
} from './fixtures/sw-helpers.ts';

let server: CfLike;
test.beforeEach(async ({ context }) => { await blockOutside(context); });
test.afterEach(async () => {
  await server?.close();
  removeTempDirs();
});

const SAVED_KEYS = ['loadcheck:draft', 'loadcheck:setups', 'loadcheck:bikeProfiles'];

/** Everything a rider has saved, as raw strings. */
const savedData = (page: Page) => page.evaluate(() => {
  const saved: Record<string, string | null> = {};
  for (const key of Object.keys(localStorage).sort()) {
    if (key.startsWith('loadcheck:') || key.startsWith('copilot:')) saved[key] = localStorage.getItem(key);
  }
  return saved;
});

const draftReady = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');

/** A plan, a saved setup and a bike, written by the page's own code, then a fresh load so everything has settled. */
async function makePlan(page: Page): Promise<Record<string, string | null>> {
  await draftReady(page);
  await page.evaluate(`(async () => {
    localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([normaliseBikeProfile({ id: 'bike-before', name: 'Before bike' })]));
    S.nights = 3;
    await saveSetup('Before', 'made before the handover');
    await flushDraft();
    localStorage.setItem('copilot:probe', 'a value from the co-pilot');
  })()`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await draftReady(page);
  await page.waitForTimeout(500); // past the page's 300 ms save timer
  const saved = await savedData(page);
  for (const key of SAVED_KEYS) expect(saved[key]?.length ?? 0, key).toBeGreaterThan(2);
  return saved;
}

/** A phone as it is today: the old site, its worker active with its cache, and a plan. */
async function legacyPhone(page: Page): Promise<Record<string, string | null>> {
  server = await startCfLike({ dir: legacySite(tempDir()) });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  expect(await activeWorkerKind(page)).toBe('legacy');
  expect(await cacheNames(page)).toEqual(['loadcheck-offline-v1']);
  return makePlan(page);
}

/** The new build's first visit: the page is reloaded once, and the browser looks for the new worker by itself. */
async function handOver(page: Page): Promise<string> {
  const next = await buildSite();
  server.swap(next.dir);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => activeWorkerKind(page), { timeout: 20_000 }).toBe('new');
  return next.build;
}

const registrationCount = (page: Page) => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);

test('[SW-HAND-TAKEOVER] the server swaps to the new build, the page reloads once: the new worker controls, with no second registration', async ({ page }) => {
  await legacyPhone(page);
  const navigations = await watchNavigations(page);
  await handOver(page);
  expect(await isControlled(page)).toBe(true);
  expect(await registrationCount(page)).toBe(1);
  expect((await navigations()).navigations).toBe(1); // the one reload, and nothing after it
});

test('[SW-HAND-LEGACY-GONE] the old cache is deleted and the new one exists', async ({ page }) => {
  await legacyPhone(page);
  const build = await handOver(page);
  await expect.poll(() => cacheNames(page)).toEqual([`wayfinch-precache-${build}`]);
});

test('[SW-HAND-OFFLINE] then offline: / is Load Check, with the marker', async ({ page }) => {
  await legacyPhone(page);
  await handOver(page);
  await expect.poll(async () => (await cacheNames(page)).length).toBe(1);
  goOffline(server);
  const response = await page.reload({ waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  expect(await isLoadCheckPage(page)).toBe(true);
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
});

test('[SW-HAND-PLANS] all saved keys are byte-identical before and after, online and offline', async ({ page }) => {
  const before = await legacyPhone(page);
  await handOver(page);
  await draftReady(page);
  await page.waitForTimeout(500);
  expect(await savedData(page)).toEqual(before);
  goOffline(server);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await draftReady(page);
  await page.waitForTimeout(500);
  expect(await savedData(page)).toEqual(before);
  expect(await page.evaluate('S.nights')).toBe(3);
  expect(await page.evaluate('SETUPS.map((s) => s.name)')).toEqual(['Before']);
});

test('[SW-OPEN-TAB] a tab open throughout, with a change just saved: nothing navigates it, its draft stays, and it keeps writing', async ({ context, page }) => {
  const before = await legacyPhone(page);
  const openTab = page;
  const navigations = await watchNavigations(openTab);

  // A change saved by the page's own 300 ms timer, moments before the takeover, and one still waiting for it.
  await openTab.evaluate('S.nights = 5; queueDraftSave();');
  await expect.poll(async () => (await savedData(openTab))['loadcheck:draft'] !== before['loadcheck:draft']).toBe(true);
  await openTab.evaluate('S.pendingSaveName = "not yet saved"; queueDraftSave();');

  // The rider opens the site in a second tab, which is what makes the browser look for the new worker.
  const next = await buildSite();
  server.swap(next.dir);
  const second = await context.newPage();
  await open(second, `${server.origin}/`);
  await expect.poll(() => activeWorkerKind(second), { timeout: 20_000 }).toBe('new');
  await expect.poll(() => isControlled(openTab)).toBe(true);
  await expect.poll(() => openTab.evaluate(async () => {
    const answer = await new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => resolve(event.data);
      navigator.serviceWorker.controller?.postMessage({ type: 'LOADCHECK_OFFLINE_INFO' }, [channel.port2]);
    });
    return 'version' in (answer as object) ? 'legacy' : 'new';
  })).toBe('new');

  expect(await navigations()).toEqual({ navigations: 0, mark: true });
  expect(await openTab.evaluate('S.nights')).toBe(5);
  await expect.poll(async () => (await savedData(openTab))['loadcheck:draft']?.includes('not yet saved')).toBe(true);

  // Still writing after the takeover.
  await openTab.evaluate('S.pendingSaveName = "written after the takeover"; queueDraftSave();');
  await expect.poll(async () => (await savedData(openTab))['loadcheck:draft']?.includes('written after the takeover')).toBe(true);
  expect(await navigations()).toEqual({ navigations: 0, mark: true });
  const tabNotice = await openTab.evaluate(() => document.getElementById('tabBar')?.classList.contains('hidden'));
  expect(tabNotice).toBe(true);

  // What the tab wrote is what the next load finds.
  await second.reload({ waitUntil: 'domcontentloaded' });
  await draftReady(second);
  expect(await second.evaluate('S.nights')).toBe(5);
});

async function emergencySite(): Promise<string> {
  const dir = tempDir();
  await buildDist({ out: dir, launch: false, emergency: true });
  return dir;
}

test('[SW-SWITCH] the new build active, the server swaps to the emergency build: no registration, no cache, / from the network, data intact, open page left alone', async ({ context, page }) => {
  await legacyPhone(page);
  await handOver(page);
  await expect.poll(async () => (await cacheNames(page)).length).toBe(1);
  await draftReady(page);
  await page.waitForTimeout(500);
  const before = await savedData(page);
  const navigations = await watchNavigations(page);

  server.swap(await emergencySite());
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration('/'))?.update();
  });
  await expect.poll(() => registrationCount(page), { timeout: 20_000 }).toBe(0);
  await expect.poll(() => cacheNames(page)).toEqual([]);
  expect(await navigations()).toEqual({ navigations: 0, mark: true });
  expect(await savedData(page)).toEqual(before);

  // The old page's panel stays honest: while the open page still talks to it, nothing claims to be saved.
  const answer = await page.evaluate(() => new Promise((resolve) => {
    const worker = navigator.serviceWorker.controller;
    if (!worker) { resolve('no controller'); return; }
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data);
    worker.postMessage({ type: 'LOADCHECK_SAVE_APP' }, [channel.port2]);
  }));
  expect(answer).toEqual({ ok: false, cached: false });

  // Every window closes; / comes from the network with nothing left of the worker.
  await page.close();
  const fresh = await context.newPage();
  const requests = server.count('GET', '/');
  const response = await fresh.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  expect(response?.fromServiceWorker()).toBe(false);
  expect(server.count('GET', '/')).toBe(requests + 1);
  expect(await isLoadCheckPage(fresh)).toBe(true);
  expect(await isControlled(fresh)).toBe(false);
  expect(await registrationCount(fresh)).toBe(0);
  await draftReady(fresh);
  await fresh.waitForTimeout(500);
  expect(await savedData(fresh)).toEqual(before);
});

test('[SW-SWITCH] a phone still on the old worker is switched too', async ({ page }) => {
  const before = await legacyPhone(page);
  server.swap(await emergencySite());
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration('/'))?.update();
  });
  await expect.poll(() => registrationCount(page), { timeout: 20_000 }).toBe(0);
  await expect.poll(() => cacheNames(page)).toEqual([]);
  expect(await savedData(page)).toEqual(before);
});

test('[SW-SWITCH-BUILD] the emergency build passes the same build check: the file exists, is served as JavaScript, is a classic script', async ({ request }) => {
  const dir = await emergencySite();
  server = await startCfLike({ dir });
  const response = await request.get(`${server.origin}/offline-worker.js`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('javascript');
  expect(response.headers()['cache-control']).toBe('no-cache');
  const source = await response.text();
  expect(() => new vm.Script(source)).not.toThrow();
  expect(/^\s*(import|export)\b/m.test(source)).toBe(false);
  expect(source).toBe(readFileSync('tools/emergency-worker.js', 'utf8'));
  const page = await request.get(`${server.origin}/`);
  expect(page.status()).toBe(200);
  expect(page.headers()['content-type']).toContain('text/html');
});

test('[SW-DOWNGRADE] the new build active, the server swaps to the old site: after every window closes the old worker is back, with its own cache, offline and plans intact', async ({ context, page }) => {
  const before = await legacyPhone(page);
  await handOver(page);
  await expect.poll(async () => (await cacheNames(page)).length).toBe(1);

  const old = legacySite(tempDir());
  server.swap(old);
  // Installed, but it waits: the rollback never pulls a page out from under an open window.
  expect(await updateAndSettle(page)).toBe('waiting');
  expect(await activeWorkerKind(page)).toBe('new');
  expect(await cacheNames(page)).toContain('loadcheck-offline-v1');

  await page.close();
  const fresh = await context.newPage();
  await open(fresh, `${server.origin}/`);
  await expect.poll(() => activeWorkerKind(fresh), { timeout: 20_000 }).toBe('legacy');
  expect(await stateOf(fresh)).toEqual({ active: true, waiting: false, installing: false });
  expect(await cacheNames(fresh)).toContain('loadcheck-offline-v1');
  expect(await registrationCount(fresh)).toBe(1);

  goOffline(server);
  await fresh.reload({ waitUntil: 'domcontentloaded' });
  expect(await isLoadCheckPage(fresh)).toBe(true);
  await draftReady(fresh);
  await fresh.waitForTimeout(500);
  expect(await savedData(fresh)).toEqual(before);
});

test('[SW-DOWNGRADE] going forward again later: the new worker returns once windows close, and offline still works', async ({ context, page }) => {
  const before = await legacyPhone(page);
  await handOver(page);
  await expect.poll(async () => (await cacheNames(page)).length).toBe(1);

  server.swap(legacySite(tempDir()));
  expect(await updateAndSettle(page)).toBe('waiting');
  await page.close();
  let tab = await context.newPage();
  await open(tab, `${server.origin}/`);
  await expect.poll(() => activeWorkerKind(tab), { timeout: 20_000 }).toBe('legacy');

  const forward = await buildSite({ extraFiles: { 'assets/forward.txt': 'a later build' } });
  server.swap(forward.dir);
  expect(await updateAndSettle(tab)).toBe('waiting');
  await tab.close();
  tab = await context.newPage();
  await open(tab, `${server.origin}/`);
  await expect.poll(() => activeWorkerKind(tab), { timeout: 20_000 }).toBe('new');
  await expect.poll(async () => (await cacheNames(tab)).includes('loadcheck-offline-v1')).toBe(false);

  goOffline(server);
  await tab.reload({ waitUntil: 'domcontentloaded' });
  expect(await isLoadCheckPage(tab)).toBe(true);
  await draftReady(tab);
  await tab.waitForTimeout(500);
  expect(await savedData(tab)).toEqual(before);
});

test('[SW-NEVER-CLEAR] neither worker touches saved data or creates an old-style cache name', () => {
  for (const file of ['src/offline-worker.ts', 'tools/emergency-worker.js']) {
    const source = readFileSync(file, 'utf8');
    expect(source.includes('localStorage'), `${file}: localStorage`).toBe(false);
    expect(source.includes('sessionStorage'), `${file}: sessionStorage`).toBe(false);
    expect(source.includes('indexedDB'), `${file}: indexedDB`).toBe(false);
    // The old prefix only ever decides what to delete.
    for (const line of source.split('\n').filter((l) => l.includes('caches.open('))) {
      expect(/LEGACY|loadcheck-offline/.test(line), `${file}: ${line}`).toBe(false);
    }
  }
  const worker = readFileSync('src/offline-worker.ts', 'utf8');
  expect(/const CACHE_PREFIX = 'wayfinch-precache-'/.test(worker)).toBe(true);
  const uses = worker.split('\n').filter((l) => l.includes('LEGACY_PREFIX') && !l.startsWith('const LEGACY_PREFIX'));
  expect(uses.length).toBe(1);
  expect(uses[0]).toContain('startsWith(LEGACY_PREFIX)');
  expect(uses[0]).toContain('caches.delete');
});
