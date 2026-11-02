// What several builds do to each other's caches: a further release arriving while one applies, a release that
// changes only the worker's code, and an old tab asking for its own build's files.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startCfLike } from './server/cf-like.mjs';
import type { CfLike } from './server/cf-like.mjs';
import { legacySite } from './fixtures/legacy-site.mjs';
import {
  applyWaiting, blockOutside, buildSite, cacheNames, cacheStamps, copyDir, goOffline, isLoadCheckPage, open,
  registerAndControl, removeTempDirs, stateOf, tempDir, updateAndSettle, waitActivated, waitForWorker,
} from './fixtures/sw-helpers.ts';

let server: CfLike;
test.beforeEach(async ({ context }) => { await blockOutside(context); });
test.afterEach(async () => {
  await server?.close();
  removeTempDirs();
});

const nameOf = (build: string) => `wayfinch-precache-${build}`;
const prompt = (page: Page) => page.getByRole('button', { name: 'Update ready — apply now', exact: true });
const draftReady = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');
const build = (name: string, more: Record<string, string> = {}) => buildSite({ extraFiles: { 'assets/v.txt': name, ...more } });

async function tap(page: Page): Promise<void> {
  await expect(prompt(page)).toBeVisible();
  const navigated = page.waitForEvent('framenavigated');
  await prompt(page).click();
  await navigated;
  await draftReady(page);
  await waitActivated(page);
}

/** The next release is out and still downloading: the browser has started it, and its last file is on the way. */
async function nextStillDownloading(page: Page, dir: string): Promise<() => void> {
  const release = server.hold('/assets/v.txt');
  server.swap(dir);
  await page.evaluate(async () => { void (await navigator.serviceWorker.getRegistration('/'))?.update(); });
  await expect.poll(async () => (await stateOf(page)).installing).toBe(true);
  return release;
}

const waitingAgain = (page: Page) => expect.poll(async () => (await stateOf(page)).waiting, { timeout: 20_000 }).toBe(true);
const fetchStatus = (page: Page, path: string) => page.evaluate((p) => fetch(p).then((r) => r.status, () => 'failed'), path);
const fetchText = (page: Page, path: string) => page.evaluate((p) => fetch(p).then((r) => r.text(), () => 'failed'), path);

/** The same build with different worker bytes: a release that changes only the worker's code. */
function workerOnly(dir: string, tag: string, prefix = ''): string {
  const out = join(tempDir(), `worker-only-${tag}`);
  copyDir(dir, out);
  writeFileSync(join(out, 'offline-worker.js'), `${prefix}// ${tag}\n${readFileSync(join(dir, 'offline-worker.js'), 'utf8')}`);
  return out;
}

test('[SW-NEXT-BUILD] the prompt tapped while the next build downloads: that build keeps its cache and works offline', async ({ page }) => {
  const w = await build('w');
  const x = await build('x');
  const y = await build('y', { 'assets/only-y.txt': 'y file' });
  server = await startCfLike({ dir: w.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  await draftReady(page);
  server.swap(x.dir);
  expect(await updateAndSettle(page)).toBe('waiting');

  const release = await nextStillDownloading(page, y.dir);
  await tap(page);
  expect(Object.keys(await cacheStamps(page))).toContain(nameOf(y.build));
  release();
  await waitingAgain(page);

  await tap(page);
  const stamps = await cacheStamps(page);
  expect(stamps[nameOf(y.build)]?.entries).toBe(4); // /, its two files and the stamp
  expect(stamps[nameOf(y.build)]?.stamp?.activated).toBe(true);
  expect(Object.keys(stamps).sort()).toEqual([nameOf(x.build), nameOf(y.build)].sort());

  goOffline(server);
  expect(await fetchStatus(page, '/assets/only-y.txt')).toBe(200);
  await open(page, `${server.origin}/`);
  expect(await isLoadCheckPage(page)).toBe(true);
});

test('[SW-NEXT-BUILD] the same twice in a row: the phone still opens offline, from whole caches', async ({ page }) => {
  const v = await build('v');
  const x = await build('x');
  const y = await build('y');
  const z = await build('z');
  server = await startCfLike({ dir: v.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  await draftReady(page);
  server.swap(x.dir);
  expect(await updateAndSettle(page)).toBe('waiting');

  let release = await nextStillDownloading(page, y.dir);
  await tap(page);
  release();
  await waitingAgain(page);
  release = await nextStillDownloading(page, z.dir);
  await tap(page);
  release();
  await waitingAgain(page);
  await tap(page);

  const stamps = await cacheStamps(page);
  expect(Object.keys(stamps).sort()).toEqual([nameOf(y.build), nameOf(z.build)].sort());
  for (const name of Object.keys(stamps)) expect(stamps[name]?.entries, name).toBe(3);

  goOffline(server);
  const response = await page.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  expect(await isLoadCheckPage(page)).toBe(true);
  expect(await fetchText(page, '/assets/v.txt')).toBe('z');
});

test('[SW-NEXT-BUILD] a finished waiting build survives an activation still in progress', async ({ page }) => {
  const w = await build('w');
  const x = await build('x');
  const y = await build('y');
  server = await startCfLike({ dir: w.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  await draftReady(page);

  // Activation looks at the caches only after this pause, as a slow phone might.
  const slowKeys = `const qaKeys=CacheStorage.prototype.keys;CacheStorage.prototype.keys=function(){return new Promise((r)=>setTimeout(r,2500)).then(()=>qaKeys.call(this));};\n`;
  server.swap(workerOnly(x.dir, 'slow', slowKeys));
  expect(await updateAndSettle(page)).toBe('waiting');
  await page.evaluate(async () => {
    (await navigator.serviceWorker.getRegistration('/'))?.waiting?.postMessage({ type: 'LOADCHECK_ACTIVATE' });
  });
  await expect.poll(async () => (await stateOf(page)).waiting).toBe(false);

  server.swap(y.dir);
  await page.evaluate(async () => { void (await navigator.serviceWorker.getRegistration('/'))?.update(); });
  await waitingAgain(page);
  await waitActivated(page);
  await expect.poll(async () => (await cacheStamps(page))[nameOf(x.build)]?.stamp?.activated).toBe(true);

  const stamps = await cacheStamps(page);
  expect(stamps[nameOf(y.build)]?.entries).toBe(3);
  expect(stamps[nameOf(y.build)]?.stamp?.activated).toBe(false);
});

test('[SW-NEXT-BUILD] a cache that disappears during install fails the install', async ({ page }) => {
  const w = await build('w');
  const x = await build('x');
  server = await startCfLike({ dir: w.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);

  const release = await nextStillDownloading(page, x.dir);
  await page.evaluate((name) => caches.delete(name), nameOf(x.build));
  const finished = page.evaluate(() => new Promise<string>((resolve) => {
    void navigator.serviceWorker.getRegistration('/').then((registration) => {
      const worker = registration?.installing;
      if (!worker) { resolve('no worker'); return; }
      worker.addEventListener('statechange', () => {
        if (worker.state === 'redundant' || worker.state === 'installed') resolve(worker.state);
      });
    });
  }));
  await page.waitForTimeout(100);
  release();
  expect(await finished).toBe('redundant');
  expect(await cacheNames(page)).toEqual([nameOf(w.build)]);
});

test('[SW-NEXT-BUILD] a build whose cache has gone never marks an empty cache as finished, and the page still opens offline', async ({ page }) => {
  const w = await build('w');
  const x = await build('x');
  server = await startCfLike({ dir: w.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  server.swap(x.dir);
  expect(await updateAndSettle(page)).toBe('waiting');
  await page.evaluate((name) => caches.delete(name), nameOf(x.build));
  await applyWaiting(page);
  await waitActivated(page);
  await page.waitForTimeout(300);
  expect((await cacheStamps(page))[nameOf(x.build)]?.stamp ?? null).toBeNull();
  goOffline(server);
  await open(page, `${server.origin}/`);
  expect(await isLoadCheckPage(page)).toBe(true);
});

test('[SW-NEXT-BUILD] a build that finished but was replaced before activating is cleaned up once nothing is on its way', async ({ page }) => {
  const w = await build('w');
  const x = await build('x');
  const y = await build('y');
  server = await startCfLike({ dir: w.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  server.swap(x.dir);
  expect(await updateAndSettle(page)).toBe('waiting');
  server.swap(y.dir);
  expect(await updateAndSettle(page)).toBe('waiting');
  await applyWaiting(page);
  await waitActivated(page);
  await expect.poll(async () => (await cacheNames(page)).sort()).toEqual([nameOf(w.build), nameOf(y.build)].sort());
});

test('[SW-PARTIAL] a first install killed just after its last entry still takes over at once on the next attempt', async ({ page }) => {
  server = await startCfLike({ dir: legacySite(tempDir()) });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  const next = await buildSite();
  server.swap(next.dir);
  await page.evaluate(async (name) => {
    await (await caches.open(name)).put('/__complete', new Response(JSON.stringify({ first: true, order: 0, activated: false })));
  }, nameOf(next.build));
  expect(await updateAndSettle(page)).toBe('activated');
  await waitForWorker(page, 'new');
});

test('[SW-WORKER-ONLY] a release changing only the worker waits, applies, keeps its cache and works offline', async ({ page }) => {
  const a = await build('a');
  server = await startCfLike({ dir: a.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  await waitActivated(page);
  await expect.poll(async () => (await cacheStamps(page))[nameOf(a.build)]?.stamp?.order).toBe(1);

  server.swap(workerOnly(a.dir, 'a2'));
  expect(await updateAndSettle(page)).toBe('waiting');
  const stamp = (await cacheStamps(page))[nameOf(a.build)]?.stamp;
  expect(stamp?.activated).toBe(true);
  expect(stamp?.order).toBe(1);

  await applyWaiting(page);
  await waitActivated(page);
  goOffline(server);
  await open(page, `${server.origin}/`);
  expect(await isLoadCheckPage(page)).toBe(true);
  expect(await fetchText(page, '/assets/v.txt')).toBe('a');
});

test('[SW-WORKER-ONLY] it does not cost the build the rider is on: the next real build keeps that one as its previous', async ({ page }) => {
  const a = await build('a');
  const b = await build('b');
  const c = await build('c');
  server = await startCfLike({ dir: a.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  server.swap(b.dir);
  expect(await updateAndSettle(page)).toBe('waiting');
  await applyWaiting(page);
  await waitActivated(page);
  await expect.poll(async () => (await cacheStamps(page))[nameOf(b.build)]?.stamp?.order).toBe(2);

  server.swap(workerOnly(b.dir, 'b2'));
  expect(await updateAndSettle(page)).toBe('waiting');
  server.swap(c.dir);
  expect(await updateAndSettle(page)).toBe('waiting');
  await applyWaiting(page);
  await waitActivated(page);
  await expect.poll(async () => (await cacheNames(page)).sort()).toEqual([nameOf(b.build), nameOf(c.build)].sort());
});

test('[SW-WORKER-ONLY] a failed worker-only install leaves its cache whole and / served offline', async ({ page }) => {
  const a = await build('a');
  server = await startCfLike({ dir: a.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  await waitActivated(page);
  await expect.poll(async () => (await cacheStamps(page))[nameOf(a.build)]?.stamp?.activated).toBe(true);
  const before = (await cacheStamps(page))[nameOf(a.build)];

  server.swap(workerOnly(a.dir, 'a2'));
  server.failNext('/assets/v.txt');
  expect(await updateAndSettle(page)).toBe('redundant');
  expect((await cacheStamps(page))[nameOf(a.build)]).toEqual(before);

  goOffline(server);
  await open(page, `${server.origin}/`);
  expect(await isLoadCheckPage(page)).toBe(true);
});

/** Build `one` was active, `two` has now applied: a tab of `one` may still ask for `one`'s own files. */
async function afterAnUpdate(page: Page) {
  const one = await buildSite({ extraFiles: { 'assets/a.txt': 'old chunk' } });
  const two = await buildSite({ extraFiles: { 'assets/b.txt': 'new chunk' } });
  server = await startCfLike({ dir: one.dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  server.swap(two.dir);
  expect(await updateAndSettle(page)).toBe('waiting');
  await applyWaiting(page);
  await waitActivated(page);
  await expect.poll(async () => (await cacheStamps(page))[nameOf(two.build)]?.stamp?.activated).toBe(true);
  return { one, two };
}

test('[SW-PRECACHE] an old tab gets its own build\'s file from the previous cache, online and offline', async ({ page }) => {
  await afterAnUpdate(page);
  expect(await fetchText(page, '/assets/a.txt')).toBe('old chunk');
  expect(server.count('GET', '/assets/a.txt')).toBe(1); // only the old install's own fetch
  goOffline(server);
  expect(await fetchText(page, '/assets/a.txt')).toBe('old chunk');
  expect(await fetchText(page, '/assets/b.txt')).toBe('new chunk');
});

test('[SW-PRECACHE] a file in neither cache goes to the network, and the stamp is never answered', async ({ page }) => {
  await afterAnUpdate(page);
  expect(await fetchStatus(page, '/assets/nowhere.txt')).toBe(404);
  expect(server.count('GET', '/assets/nowhere.txt')).toBe(1);
  expect(await fetchStatus(page, '/__complete')).toBe(404);
  goOffline(server);
  expect(await fetchStatus(page, '/assets/nowhere.txt')).toBe('failed');
});

test('[SW-PRECACHE] / falls back to the previous cache when its own copy is missing', async ({ page }) => {
  const { two } = await afterAnUpdate(page);
  await page.evaluate(async (name) => { await (await caches.open(name)).delete('/'); }, nameOf(two.build));
  goOffline(server);
  await open(page, `${server.origin}/`);
  expect(await isLoadCheckPage(page)).toBe(true);
});

test('[SW-HEAD] /build.json and the worker reach the network even if the previous cache held them', async ({ page }) => {
  const { one } = await afterAnUpdate(page);
  await page.evaluate(async (name) => {
    const cache = await caches.open(name);
    for (const path of ['/build.json', '/offline-worker.js']) await cache.put(path, new Response('from the cache'));
  }, nameOf(one.build));
  for (const path of ['/build.json', '/offline-worker.js']) {
    const before = server.count('GET', path);
    expect(await fetchText(page, path) === 'from the cache', path).toBe(false);
    expect(server.count('GET', path), path).toBe(before + 1);
  }
});
