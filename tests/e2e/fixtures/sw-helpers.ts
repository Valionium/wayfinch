// Shared steps for the browser tests. Nothing here prints the page: failures compare booleans, never its text.
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { buildDist } from '../../../tools/build.mjs';
import type { BuildOptions } from '../../../tools/build.mjs';
import type { CfLike } from '../server/cf-like.mjs';

export const MARKER_SELECTOR = 'meta[name="loadcheck-offline-shell"]';
const roots: string[] = [];

export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-e2e-'));
  roots.push(dir);
  return dir;
}
export function removeTempDirs(): void {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}

/** A full real build in a fresh folder. */
export async function buildSite(options: BuildOptions = {}): Promise<{ dir: string; build: string }> {
  const dir = join(tempDir(), 'site');
  const { build } = await buildDist({ launch: false, ...options, out: dir });
  return { dir, build };
}

export function copyDir(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const source = join(from, name);
    if (statSync(source).isDirectory()) copyDir(source, join(to, name));
    else copyFileSync(source, join(to, name));
  }
}

/** Only the local server is reachable: the page's optional outside requests never leave the test. */
export async function blockOutside(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\//, (route) => route.abort());
}

export async function open(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}

/** Registers exactly as the old page's offline button does, and waits until the worker controls this tab. */
export async function registerAndControl(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/offline-worker.js', { scope: '/', updateViaCache: 'none' });
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    if (worker && worker.state !== 'activated') {
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if (worker.state === 'activated') resolve();
          if (worker.state === 'redundant') reject(new Error('The worker failed to install.'));
        };
        worker.addEventListener('statechange', check);
        check();
      });
    }
    await navigator.serviceWorker.ready;
  });
  // The old worker claims on activation and the new one on a first install, so a reload is only a fallback.
  if (!(await isControlled(page))) await page.reload({ waitUntil: 'domcontentloaded' });
}

export const isControlled = (page: Page) => page.evaluate(() => navigator.serviceWorker.controller !== null);

/**
 * Asks the browser to look for a new worker, as a visit does, and waits for the result:
 * 'none' nothing new, 'redundant' the install failed, 'waiting' installed and waiting, 'activated' took over.
 */
export function updateAndSettle(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return 'no registration';
    await registration.update();
    const worker = registration.installing;
    if (!worker) return registration.waiting ? 'waiting' : 'none';
    return new Promise<string>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const check = () => {
        clearTimeout(timer);
        if (worker.state === 'redundant' || worker.state === 'activated') resolve(worker.state);
        // A worker that skips waiting moves on at once: only one still installed later is really waiting.
        if (worker.state === 'installed') timer = setTimeout(() => resolve('waiting'), 700);
      };
      worker.addEventListener('statechange', check);
      check();
    });
  });
}

/** Sends a message to a worker of the registration, and returns the answer, or 'no answer'. */
export function ask(page: Page, which: 'active' | 'waiting' | 'installing', type: string): Promise<unknown> {
  return page.evaluate(async ([slot, messageType]) => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const worker = registration?.[slot as 'active'];
    if (!worker) return 'no worker';
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve('no answer'), 4000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data);
      };
      worker.postMessage({ type: messageType }, [channel.port2]);
    });
  }, [which, type]);
}

/** The old worker's answer names a version and the new one's doesn't, since both live at the same address. */
export async function activeWorkerKind(page: Page): Promise<string> {
  const info = await ask(page, 'active', 'LOADCHECK_OFFLINE_INFO');
  if (info && typeof info === 'object') return 'version' in info ? 'legacy' : 'new';
  return String(info);
}

/**
 * Waits until the handover has settled, then asks once. Don't poll with messages: Chromium can hold back an
 * activation while the old worker keeps receiving them, which no rider's page does.
 */
export async function waitForWorker(page: Page, kind: 'new' | 'legacy', timeout = 20_000): Promise<void> {
  await expect.poll(async () => {
    const state = await stateOf(page);
    if (!state.active || state.waiting || state.installing) return false;
    const hasLegacyCache = (await cacheNames(page)).includes('loadcheck-offline-v1');
    return kind === 'new' ? !hasLegacyCache : hasLegacyCache;
  }, { timeout }).toBe(true);
  expect(await activeWorkerKind(page)).toBe(kind);
}

/** Waits until the active worker has finished activating: controllerchange comes well before that. */
export const waitActivated = (page: Page) => expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/'))?.active?.state), { timeout: 20_000 }).toBe('activated');

/** Tells the waiting worker to apply, as a tap does, and waits for the tab's controller to change. */
export const applyWaiting = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => {
  navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
  void navigator.serviceWorker.getRegistration('/').then((r) => r?.waiting?.postMessage({ type: 'LOADCHECK_ACTIVATE' }));
}));

interface CacheFacts { entries: number; stamp: { first: boolean; order: number; activated: boolean } | null }
/** Each precache: how many entries it holds, and its stamp. */
export const cacheStamps = (page: Page): Promise<Record<string, CacheFacts>> => page.evaluate(async () => {
  const facts: Record<string, CacheFacts> = {};
  for (const name of await caches.keys()) {
    if (!name.startsWith('wayfinch-precache-')) continue;
    const cache = await caches.open(name);
    const entry = await cache.match('/__complete');
    facts[name] = { entries: (await cache.keys()).length, stamp: entry ? await entry.json() : null };
  }
  return facts;
});

export const cacheNames = (page: Page) => page.evaluate(() => caches.keys());

export const stateOf = (page: Page) => page.evaluate(async () => {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return { active: !!registration?.active, waiting: !!registration?.waiting, installing: !!registration?.installing };
});

/** Marks this tab so a reload or navigation is noticed, and counts navigations from here on. */
export async function watchNavigations(page: Page): Promise<() => Promise<{ navigations: number; mark: boolean }>> {
  let navigations = 0;
  const mainFrame = page.mainFrame();
  page.on('framenavigated', (frame) => {
    if (frame === mainFrame) navigations += 1;
  });
  await page.evaluate(() => {
    (window as unknown as { __stillThisPage: boolean }).__stillThisPage = true;
  });
  return async () => ({
    navigations,
    mark: await page.evaluate(() => (window as unknown as { __stillThisPage?: boolean }).__stillThisPage === true),
  });
}

/** Whether this tab shows Load Check, with the old worker's marker. Never its text. */
export function isLoadCheckPage(page: Page): Promise<boolean> {
  return page.evaluate((selector) => (document.querySelector('.mast h1')?.textContent ?? '').startsWith('Load') && !!document.querySelector(selector), MARKER_SELECTOR);
}

/** How the worker answers a request for / from this tab. Never its text. */
export function loadedPageFacts(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/');
    const body = await response.clone().text();
    return { status: response.status, redirected: response.redirected, type: response.type, bodyHasMarker: body.includes('loadcheck-offline-shell') };
  });
}

export function goOffline(server: CfLike): void {
  server.down(true);
}
