// The new worker's rules, in Chromium against a server that redirects like the live host. Plan Task 4.
import { appendFileSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startCfLike } from './server/cf-like.mjs';
import type { CfLike } from './server/cf-like.mjs';
import { legacySite } from './fixtures/legacy-site.mjs';
import {
  activeWorkerKind, applyWaiting, ask, blockOutside, buildSite, cacheNames, cacheStamps, copyDir, goOffline, isControlled, isLoadCheckPage, loadedPageFacts, open,
  registerAndControl, removeTempDirs, stateOf, tempDir, updateAndSettle, waitActivated, watchNavigations,
} from './fixtures/sw-helpers.ts';

let server: CfLike;
test.beforeEach(async ({ context }) => { await blockOutside(context); });
test.afterEach(async () => {
  await server?.close();
  removeTempDirs();
});

async function start(dir: string, page: Page): Promise<void> {
  server = await startCfLike({ dir });
  await open(page, `${server.origin}/`);
}

/** A phone on the old worker with its cache, and the server now offering `next`, which isn't yet fetched. */
async function onLegacy(page: Page): Promise<void> {
  await start(legacySite(tempDir()), page);
  await registerAndControl(page);
  expect(await activeWorkerKind(page)).toBe('legacy');
}

test('[SW-PRECACHE] after install, offline: / serves the page with status 200, not redirected, type basic', async ({ page }) => {
  const site = await buildSite();
  await start(site.dir, page);
  await registerAndControl(page);
  goOffline(server);
  await open(page, `${server.origin}/`);
  const facts = await loadedPageFacts(page);
  expect(await isLoadCheckPage(page)).toBe(true);
  expect(facts).toEqual({ status: 200, redirected: false, type: 'basic', bodyHasMarker: true });
});

test('[SW-FIRST-TAKEOVER] no earlier worker: active and controlling after one load, with its cache', async ({ page }) => {
  const site = await buildSite();
  await start(site.dir, page);
  const navigations = await watchNavigations(page);
  await registerAndControl(page);
  expect(await isControlled(page)).toBe(true);
  expect(await navigations()).toEqual({ navigations: 0, mark: true });
  expect(await cacheNames(page)).toEqual([`wayfinch-precache-${site.build}`]);
});

test('[SW-LATER-WAITS] a second build waits with a tab open, no reload happens, and LOADCHECK_ACTIVATE applies it', async ({ page }) => {
  const one = await buildSite();
  const two = await buildSite({ extraFiles: { 'assets/changed.txt': 'a changed file' } });
  await start(one.dir, page);
  await registerAndControl(page);
  const navigations = await watchNavigations(page);

  server.swap(two.dir);
  expect(await updateAndSettle(page)).toBe('waiting');
  expect(await stateOf(page)).toEqual({ active: true, waiting: true, installing: false });
  expect(await navigations()).toEqual({ navigations: 0, mark: true });
  expect(server.count('GET', '/assets/changed.txt')).toBeGreaterThan(0);

  await page.evaluate(() => new Promise<void>((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    void navigator.serviceWorker.getRegistration('/').then((r) => r?.waiting?.postMessage({ type: 'LOADCHECK_ACTIVATE' }));
  }));
  expect(await stateOf(page)).toEqual({ active: true, waiting: false, installing: false });
  // The tab isn't reloaded even then: that's the prompt's job, after its own tap.
  expect(await navigations()).toEqual({ navigations: 0, mark: true });
  expect((await cacheNames(page)).sort()).toEqual([`wayfinch-precache-${one.build}`, `wayfinch-precache-${two.build}`].sort());
});

test('[SW-LATER-WAITS] a later build applies by itself once every window has closed, and the oldest cache goes', async ({ context, page }) => {
  const one = await buildSite();
  const two = await buildSite({ extraFiles: { 'assets/changed.txt': 'two' } });
  const three = await buildSite({ extraFiles: { 'assets/changed.txt': 'three' } });
  await start(one.dir, page);
  await registerAndControl(page);

  let tab = page;
  for (const next of [two, three]) {
    server.swap(next.dir);
    expect(await updateAndSettle(tab)).toBe('waiting');
    await tab.close();
    tab = await context.newPage();
    await open(tab, `${server.origin}/`);
    await expect.poll(() => stateOf(tab)).toEqual({ active: true, waiting: false, installing: false });
  }
  await expect.poll(async () => (await cacheNames(tab)).sort())
    .toEqual([`wayfinch-precache-${two.build}`, `wayfinch-precache-${three.build}`].sort());
});

test('[SW-PARTIAL] a file answers 500: install fails, the old worker serves, nothing half-filled stays, and the next visit takes over', async ({ page }) => {
  await onLegacy(page);
  const next = await buildSite({ extraFiles: { 'assets/z-last.txt': 'the last file' } });
  server.swap(next.dir);
  server.failNext('/assets/z-last.txt');

  expect(await updateAndSettle(page)).toBe('redundant');
  expect(await activeWorkerKind(page)).toBe('legacy');
  expect(await cacheNames(page)).toEqual(['loadcheck-offline-v1']);

  goOffline(server);
  await open(page, `${server.origin}/`);
  expect(await isLoadCheckPage(page)).toBe(true);
  server.down(false);

  // The file answers again. Takes over at once, without waiting for the windows to close.
  expect(await updateAndSettle(page)).toBe('activated');
  expect(await activeWorkerKind(page)).toBe('new');
  expect(await cacheNames(page)).toEqual([`wayfinch-precache-${next.build}`]);
});

test('[SW-PARTIAL] a cache left without its last entry, as a killed browser leaves it, does not count and is deleted', async ({ page }) => {
  await onLegacy(page);
  const next = await buildSite();
  server.swap(next.dir);
  await page.evaluate(async (names) => {
    for (const name of names) {
      await (await caches.open(name)).put('/', new Response('half-saved', { headers: { 'content-type': 'text/html' } }));
    }
  }, [`wayfinch-precache-${next.build}`, 'wayfinch-precache-000000000000']);

  // Gone by the next attempt, even one that fails too.
  server.failNext('/');
  expect(await updateAndSettle(page)).toBe('redundant');
  expect(await cacheNames(page)).toEqual(['loadcheck-offline-v1']);
  expect(await activeWorkerKind(page)).toBe('legacy');

  await page.evaluate(async (name) => {
    await (await caches.open(name)).put('/', new Response('half-saved', { headers: { 'content-type': 'text/html' } }));
  }, `wayfinch-precache-${next.build}`);
  expect(await updateAndSettle(page)).toBe('activated');
  expect(await activeWorkerKind(page)).toBe('new');
  expect(await cacheNames(page)).toEqual([`wayfinch-precache-${next.build}`]);
  goOffline(server);
  await open(page, `${server.origin}/`);
  expect(await isLoadCheckPage(page)).toBe(true);
});

test("[SW-VERIFY] a stale copy in the browser's HTTP cache does not fail the install: every file is fetched past it", async ({ context, page }) => {
  await context.unrouteAll(); // routing would turn the HTTP cache off, and this test needs it
  const one = await buildSite({ extraFiles: { 'assets/s.txt': 'old bytes' } });
  const two = await buildSite({ extraFiles: { 'assets/s.txt': 'new bytes' } });
  await start(one.dir, page); // /assets/* is immutable for a year, so the browser keeps this copy
  await registerAndControl(page);
  server.swap(two.dir);
  expect(await updateAndSettle(page)).toBe('waiting');
  expect((await cacheStamps(page))[`wayfinch-precache-${two.build}`]?.entries).toBe(3);
});

test('[SW-QUOTA] storage full during precache: install fails, the old worker stays, offline still served', async ({ page }) => {
  await onLegacy(page);
  const next = await buildSite();
  const full = join(tempDir(), 'full');
  copyDir(next.dir, full);
  // The browser's real Cache.put, throwing as a full disk does.
  const stub = `Cache.prototype.put=function(){return Promise.reject(new DOMException('full','QuotaExceededError'));};\n`;
  writeFileSync(join(full, 'offline-worker.js'), stub + readFileSync(join(next.dir, 'offline-worker.js'), 'utf8'));
  server.swap(full);

  expect(await updateAndSettle(page)).toBe('redundant');
  expect(await activeWorkerKind(page)).toBe('legacy');
  expect(await cacheNames(page)).toEqual(['loadcheck-offline-v1']);
  goOffline(server);
  await open(page, `${server.origin}/`);
  expect(await isLoadCheckPage(page)).toBe(true);
});

test('[SW-VERIFY] a file whose bytes differ from its hash: install fails and nothing is served from the new cache', async ({ page }) => {
  await onLegacy(page);
  const next = await buildSite();
  const tampered = join(tempDir(), 'tampered');
  copyDir(next.dir, tampered);
  appendFileSync(join(tampered, 'index.html'), '<!-- one byte too many -->');
  server.swap(tampered);

  expect(await updateAndSettle(page)).toBe('redundant');
  expect(await activeWorkerKind(page)).toBe('legacy');
  expect(await cacheNames(page)).toEqual(['loadcheck-offline-v1']);
});

test('[SW-VERIFY] a page answered as something other than HTML fails the install', async ({ page }) => {
  await onLegacy(page);
  const next = await buildSite();
  const wrongType = join(tempDir(), 'wrong-type');
  copyDir(next.dir, wrongType);
  appendFileSync(join(wrongType, '_headers'), '/\n  Content-Type: text/plain\n');
  server.swap(wrongType);
  expect(await updateAndSettle(page)).toBe('redundant');
  expect(await activeWorkerKind(page)).toBe('legacy');
});

test('[SW-VERIFY] another listed .html file answered as something else fails the install too', async ({ page }) => {
  await onLegacy(page);
  const next = await buildSite({ extraFiles: { 'legal/notice.html': '<!doctype html><title>Notice</title>' } });
  appendFileSync(join(next.dir, '_headers'), '/legal/notice.html\n  Content-Type: text/plain\n');
  server.swap(next.dir);
  expect(await updateAndSettle(page)).toBe('redundant');
  expect(await activeWorkerKind(page)).toBe('legacy');
});

test('[SW-NO-REDIRECT] /index.html online and offline returns the page plainly; no stored entry is redirected', async ({ page }) => {
  const site = await buildSite();
  await start(site.dir, page);
  await registerAndControl(page);
  for (const offline of [false, true]) {
    if (offline) goOffline(server);
    const response = await page.goto(`${server.origin}/index.html`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    expect(response?.request().redirectedFrom()).toBeNull();
    expect(new URL(page.url()).pathname).toBe('/index.html');
    expect(await isLoadCheckPage(page)).toBe(true);
  }
  const anyRedirected = await page.evaluate(async () => {
    const found: boolean[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) found.push((await cache.match(request))?.redirected === true);
    }
    return found;
  });
  expect(anyRedirected.length).toBeGreaterThan(0);
  expect(anyRedirected.includes(true)).toBe(false);
});

test('[SW-NO-REDIRECT] a host that redirects / during install: stored as a plain copy, and the page still loads offline', async ({ page }) => {
  await onLegacy(page);
  const next = await buildSite();
  copyFileSync(join(next.dir, 'index.html'), join(next.dir, 'moved.html'));
  server.swap(next.dir);
  server.redirect('/', '/moved.html');
  expect(await updateAndSettle(page)).toBe('activated');
  expect(server.count('GET', '/moved.html')).toBeGreaterThan(0);
  const stored = await page.evaluate(async (name) => {
    const entry = await (await caches.open(name)).match('/');
    return { found: !!entry, redirected: entry?.redirected };
  }, `wayfinch-precache-${next.build}`);
  expect(stored).toEqual({ found: true, redirected: false });
  goOffline(server);
  await open(page, `${server.origin}/`);
  expect(await isLoadCheckPage(page)).toBe(true);
});

test('[SW-NO-REDIRECT] a stored page has no encoding or length headers describing a body it no longer has', async ({ page }) => {
  const site = await buildSite();
  await start(site.dir, page);
  await registerAndControl(page);
  const stored = await page.evaluate(async (name) => {
    const entry = await (await caches.open(name)).match('/');
    return { encoding: entry?.headers.get('content-encoding'), length: entry?.headers.get('content-length'), type: entry?.headers.get('content-type') };
  }, `wayfinch-precache-${site.build}`);
  expect(stored).toEqual({ encoding: null, length: null, type: 'text/html; charset=utf-8' });
  // Otherwise this test proves nothing: the server does compress the page.
  const onTheWire = await page.request.get(`${server.origin}/`, { headers: { 'Accept-Encoding': 'gzip' } });
  expect(onTheWire.headers()['content-encoding']).toBe('gzip');
});

test('[SW-LATER-WAITS] a later activation claims nothing: a tab the worker does not control stays that way', async ({ context, page }) => {
  const one = await buildSite();
  const two = await buildSite({ extraFiles: { 'assets/changed.txt': 'changed' } });
  await start(one.dir, page);
  await registerAndControl(page);

  const uncontrolled = await context.newPage();
  await open(uncontrolled, `${server.origin}/`);
  const session = await context.newCDPSession(uncontrolled);
  const loaded = uncontrolled.waitForEvent('domcontentloaded');
  await session.send('Page.reload', { ignoreCache: true }); // a hard reload is never controlled
  await loaded;
  expect(await isControlled(uncontrolled)).toBe(false);

  server.swap(two.dir);
  expect(await updateAndSettle(page)).toBe('waiting');
  await applyWaiting(page);
  await waitActivated(page);
  await expect.poll(async () => (await cacheStamps(page))[`wayfinch-precache-${two.build}`]?.stamp?.activated).toBe(true);
  await page.waitForTimeout(300);
  expect(await isControlled(page)).toBe(true);
  expect(await isControlled(uncontrolled)).toBe(false);
});

test('[SW-MESSAGES] all three messages to an active, a waiting and an installing worker: two answered exactly, the third activates', async ({ page }) => {
  const one = await buildSite();
  const two = await buildSite({ extraFiles: { 'assets/changed.txt': 'two' } });
  const three = await buildSite({ extraFiles: { 'assets/changed.txt': 'three' } });
  await start(one.dir, page);
  await registerAndControl(page);
  const exact = { ok: true, cached: true };

  expect(await ask(page, 'active', 'LOADCHECK_OFFLINE_INFO')).toEqual(exact);
  expect(await ask(page, 'active', 'LOADCHECK_SAVE_APP')).toEqual(exact);
  await page.evaluate(async () => {
    (await navigator.serviceWorker.getRegistration('/'))?.active?.postMessage({ type: 'LOADCHECK_ACTIVATE' });
  });
  expect(await stateOf(page)).toEqual({ active: true, waiting: false, installing: false });

  server.swap(two.dir);
  expect(await updateAndSettle(page)).toBe('waiting');
  expect(await ask(page, 'waiting', 'LOADCHECK_OFFLINE_INFO')).toEqual(exact);
  expect(await ask(page, 'waiting', 'LOADCHECK_SAVE_APP')).toEqual(exact);

  for (const type of ['LOADCHECK_ACTIVATE', 'WF_APPLY']) {
    await page.evaluate((messageType) => new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
      void navigator.serviceWorker.getRegistration('/').then((r) => r?.waiting?.postMessage({ type: messageType }));
    }), type);
    expect(await stateOf(page)).toEqual({ active: true, waiting: false, installing: false });
    if (type === 'LOADCHECK_ACTIVATE') {
      server.swap(three.dir);
      expect(await updateAndSettle(page)).toBe('waiting');
    }
  }

  // Still installing: the last file is on a slow connection.
  const four = await buildSite({ extraFiles: { 'assets/changed.txt': 'four' } });
  const release = server.hold('/assets/changed.txt');
  server.swap(four.dir);
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration('/'))?.update(); });
  await expect.poll(async () => (await stateOf(page)).installing).toBe(true);
  expect(await ask(page, 'installing', 'LOADCHECK_OFFLINE_INFO')).toEqual(exact);
  expect(await ask(page, 'installing', 'LOADCHECK_SAVE_APP')).toEqual(exact);
  // Told to apply while installing: once its files are in, it doesn't wait, though it isn't a first install.
  await page.evaluate(async () => {
    (await navigator.serviceWorker.getRegistration('/'))?.installing?.postMessage({ type: 'LOADCHECK_ACTIVATE' });
  });
  await page.waitForTimeout(200);
  expect(await stateOf(page)).toEqual({ active: true, waiting: false, installing: true });
  release();
  await expect.poll(() => stateOf(page)).toEqual({ active: true, waiting: false, installing: false });
  await waitActivated(page);
  await expect.poll(async () => (await cacheStamps(page))[`wayfinch-precache-${four.build}`]?.stamp?.activated).toBe(true);
});

test('[SW-MESSAGES] a page at another address gets no answer', async ({ page }) => {
  const site = await buildSite();
  await start(site.dir, page);
  await registerAndControl(page);
  await open(page, `${server.origin}/somewhere/else`);
  expect(await ask(page, 'active', 'LOADCHECK_OFFLINE_INFO')).toBe('no answer');
});

test('[SW-NO-STRAY] exactly one registration, scope /, script /offline-worker.js', async ({ page }) => {
  const site = await buildSite();
  await start(site.dir, page);
  await registerAndControl(page);
  const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations())
    .map((r) => ({ scope: new URL(r.scope).pathname, script: new URL((r.active ?? r.waiting ?? r.installing)?.scriptURL ?? 'http://x/').pathname })));
  expect(registrations).toEqual([{ scope: '/', script: '/offline-worker.js' }]);
});

test('[SW-HEAD] HEAD / and /build.json reach the server, and a request to another origin is not touched', async ({ page }) => {
  const site = await buildSite();
  await start(site.dir, page);
  await registerAndControl(page);
  const elsewhere = await startCfLike({ dir: site.dir });
  try {
    const before = server.count('HEAD', '/');
    const beforeJson = server.count('GET', '/build.json');
    const beforeWorker = server.count('GET', '/offline-worker.js');
    const beforeOther = elsewhere.count('GET', '/');
    const results = await page.evaluate(async (other) => {
      const head = await fetch('/', { method: 'HEAD', cache: 'no-store' });
      const json = await fetch('/build.json', { cache: 'no-store' });
      const worker = await fetch('/offline-worker.js', { cache: 'no-store' });
      // / is listed here, so only the origin check keeps the worker from answering it.
      const foreign = await fetch(`${other}/`, { mode: 'no-cors', cache: 'no-store' });
      return { head: head.status, json: json.status, worker: worker.status, foreign: foreign.type };
    }, elsewhere.origin);
    expect(results).toEqual({ head: 200, json: 200, worker: 200, foreign: 'opaque' });
    expect(server.count('HEAD', '/')).toBe(before + 1);
    expect(server.count('GET', '/build.json')).toBe(beforeJson + 1);
    expect(server.count('GET', '/offline-worker.js')).toBe(beforeWorker + 1);
    expect(elsewhere.count('GET', '/')).toBe(beforeOther + 1);
  } finally {
    await elsewhere.close();
  }
});

test('[SW-HEAD] a page load of /build.json or the worker script gets the file, never the app', async ({ page }) => {
  const site = await buildSite();
  await start(site.dir, page);
  await registerAndControl(page);
  for (const path of ['/build.json', '/offline-worker.js']) {
    const response = await page.goto(`${server.origin}${path}`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']?.includes('text/html')).toBe(false);
  }
});

test('[SW-PRECACHE] a page load of an unlisted address falls back to the app, offline too', async ({ page }) => {
  const site = await buildSite();
  await start(site.dir, page);
  await registerAndControl(page);
  goOffline(server);
  await open(page, `${server.origin}/some/old/link`);
  expect(await isLoadCheckPage(page)).toBe(true);
});
