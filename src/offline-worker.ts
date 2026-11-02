/// <reference lib="webworker" />
// The site's one service worker, served at /offline-worker.js for good (§9.5). Spec §9.1, §9.5; plan Task 4.
// Each block says which rule it keeps. It reads and writes only its own caches: no saved plan passes through here.
//
// Stays a classic script: old pages register it with no module type, so no top-level import or export.

declare const __BUILD__: string;
declare const __PRECACHE__: Record<string, string>;

const sw = self as unknown as ServiceWorkerGlobalScope;
const BUILD = __BUILD__;
const PRECACHE = __PRECACHE__;
const LISTED = new Map<string, string>(Object.entries(PRECACHE));

const CACHE_PREFIX = 'wayfinch-precache-';
const CACHE_NAME = CACHE_PREFIX + BUILD;
const COMPLETE = '/__complete'; // written last, so a cache without it is a cut-off install
const LEGACY_PREFIX = 'loadcheck-offline-'; // only ever deleted; no new cache has this name
const FETCH_TIMEOUT_MS = 60_000;

// Pages allowed to send messages: the two apps, under either spelling of their address.
const MESSAGE_PAGES = new Set(['/', '/index.html', '/tools/bags/', '/tools/bags/index.html']);
const CANONICAL = new Map([['/index.html', '/'], ['/tools/bags/index.html', '/tools/bags/']]);
const NEVER_A_PAGE = new Set(['/offline-worker.js', '/build.json']);

/** Kept in the COMPLETE entry, so it survives the browser stopping this worker between its events. */
interface Stamp {
  first: boolean; // this cache's install found no activated precache
  order: number; // activation count, from 1: the highest other than ours is the build before this one
  activated: boolean; // this build has been the active one. Until then its cache may belong to a build still on its way
}

async function readStamp(cache: Cache): Promise<Stamp | null> {
  const entry = await cache.match(COMPLETE);
  if (!entry) return null;
  try {
    return (await entry.json()) as Stamp;
  } catch {
    return { first: false, order: 0, activated: false };
  }
}

const writeStamp = (cache: Cache, stamp: Stamp) => cache.put(COMPLETE, new Response(JSON.stringify(stamp)));

const ownedCacheNames = async () => (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));

/** Rule: never store a redirected response, and never answer a page load with one. */
async function plainCopy(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  // The body below is already decoded, so these would describe something else.
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(await response.arrayBuffer(), { status: response.status, statusText: response.statusText, headers });
}

const hexOf = (digest: ArrayBuffer) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Rule: fetch past the HTTP cache; require ok, the listed sha256, and text/html for a page. Anything else throws. */
async function fetchChecked(path: string, sha256: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  let copy: Response;
  try {
    response = await fetch(path, { cache: 'no-cache', credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) throw new Error(`${path} answered ${response.status}.`);
    copy = await plainCopy(response);
  } finally {
    clearTimeout(timer);
  }
  if ((path.endsWith('/') || path.endsWith('.html')) && !(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
    throw new Error(`${path} is not a page.`);
  }
  const actual = hexOf(await crypto.subtle.digest('SHA-256', await copy.clone().arrayBuffer()));
  if (actual !== sha256) throw new Error(`${path} does not match its hash.`);
  return copy;
}

/**
 * Save first, then take over (§9.5 step 2). Any failure rejects, so the browser throws this worker away and the old
 * one keeps serving. A precache only counts as installed once it holds COMPLETE; a cache without it is deleted here,
 * or a cut-off install would make this phone wait for ever instead of taking over. Installs run one at a time, so
 * no other install owns such a cache. Only a build that has been active makes this one "not first".
 */
async function install(): Promise<void> {
  let first = true;
  for (const name of await ownedCacheNames()) {
    const stamp = await readStamp(await caches.open(name));
    if (!stamp) await caches.delete(name);
    else if (stamp.activated) first = false;
  }
  const ownWasComplete = await caches.has(CACHE_NAME);
  try {
    const cache = await caches.open(CACHE_NAME);
    // A release changing only the worker reuses this cache: it keeps its place in the order.
    const own = await readStamp(cache);
    for (const [path, sha256] of LISTED) await cache.put(path, await fetchChecked(path, sha256));
    await writeStamp(cache, { first, order: own?.order ?? 0, activated: own?.activated ?? false });
    // The handle above keeps working on a deleted cache, so a write succeeding proves nothing.
    if (!(await caches.has(CACHE_NAME))) throw new Error('The precache was removed during the install.');
  } catch (error) {
    // A cache the same build finished earlier holds only files with these same hashes, so it stays.
    if (!ownWasComplete) await caches.delete(CACHE_NAME).catch(() => false);
    throw error;
  }
  if (first) await sw.skipWaiting();
}

/**
 * Rule: delete every old-style cache and every precache except this build's and the one before it, which old tabs
 * may still need. A precache that was never active may belong to a newer build still installing or waiting: it goes
 * only when nothing is on its way. Claim open tabs only on the first install. Never navigates or reloads a tab.
 */
async function activate(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(LEGACY_PREFIX)).map((name) => caches.delete(name)));

  let previous: string | null = null;
  let previousOrder = 0;
  const leftOver: string[] = [];
  const unused: string[] = [];
  for (const name of names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)) {
    const stamp = await readStamp(await caches.open(name));
    if (!stamp?.activated) {
      unused.push(name);
    } else if (stamp.order > previousOrder) {
      if (previous) leftOver.push(previous);
      previous = name;
      previousOrder = stamp.order;
    } else {
      leftOver.push(name);
    }
  }
  // Checked after the list above was read, so anything in that list still on its way shows here.
  if (!sw.registration.installing && !sw.registration.waiting) leftOver.push(...unused);
  await Promise.all(leftOver.map((name) => caches.delete(name)));

  const cache = await caches.open(CACHE_NAME);
  const stamp = await readStamp(cache);
  if (!stamp) return; // no whole precache here (storage was cleared): never mark an empty cache as finished
  // Storage too full for this small write must not cost the takeover.
  await writeStamp(cache, { first: false, order: previousOrder + 1, activated: true }).catch(() => undefined);
  if (stamp.first) await sw.clients.claim();
}

/** The precache of the build before this one, if there is one. */
async function previousCache(): Promise<Cache | null> {
  let best: Cache | null = null;
  let bestOrder = 0;
  for (const name of await ownedCacheNames()) {
    if (name === CACHE_NAME) continue;
    const cache = await caches.open(name);
    const stamp = await readStamp(cache);
    if (stamp?.activated && stamp.order > bestOrder) {
      best = cache;
      bestOrder = stamp.order;
    }
  }
  return best;
}

/** Rule: this build's copy first, then the previous build's. Only if both are gone (storage cleared), the network. */
async function answerFromCache(path: string): Promise<Response> {
  try {
    const hit = (await (await caches.open(CACHE_NAME)).match(path)) ?? (await (await previousCache())?.match(path));
    if (hit) return hit;
  } catch {
    // A broken cache must not stop an online visit: fall through to the network.
  }
  try {
    return await plainCopy(await fetch(path, { credentials: 'same-origin' }));
  } catch {
    return new Response('Load Check is not saved on this device yet. Connect to the internet and open it again.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

/** A file this build doesn't list: an old tab's own file comes from the build before, anything else from the network. */
async function answerForOldTab(request: Request, path: string): Promise<Response> {
  try {
    const hit = await (await previousCache())?.match(path);
    if (hit) return hit;
  } catch {
    // A broken cache must not stop an online visit: fall through to the network.
  }
  return fetch(request);
}

/** Which cached file answers this request, or null if it isn't one of this build's pages or files. */
function cachedPathFor(url: URL, isNavigation: boolean): string | null {
  const path = CANONICAL.get(url.pathname) ?? url.pathname;
  if (LISTED.has(path)) return path;
  if (!isNavigation || NEVER_A_PAGE.has(url.pathname)) return null;
  // A page load falls back to the app, except under /tools/bags/, which has its own page once it is listed.
  if (path === '/tools/bags' || path.startsWith('/tools/bags/')) return LISTED.has('/tools/bags/') ? '/tools/bags/' : null;
  return '/';
}

sw.addEventListener('install', (event) => event.waitUntil(install()));
sw.addEventListener('activate', (event) => event.waitUntil(activate()));

// Rule: only same-origin GET. HEAD checks, map tiles and other origins are never touched.
sw.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== sw.location.origin) return;
  const isNavigation = request.mode === 'navigate';
  const path = cachedPathFor(url, isNavigation);
  if (path !== null) event.respondWith(answerFromCache(path));
  else if (!isNavigation && !NEVER_A_PAGE.has(url.pathname) && url.pathname !== COMPLETE) event.respondWith(answerForOldTab(request, url.pathname));
});

// Rule: old pages keep working (§9.5 step 4). Answers from an installing or waiting worker too.
// Only a rider's tap reaches LOADCHECK_ACTIVATE or WF_APPLY: the old page's offline button or the update prompt.
sw.addEventListener('message', (event) => {
  const sourceUrl = (event.source as Client | null)?.url;
  if (!sourceUrl) return;
  const source = new URL(sourceUrl);
  if (source.origin !== sw.location.origin || !MESSAGE_PAGES.has(source.pathname)) return;
  const type = (event.data as { type?: unknown } | null)?.type;
  if (type === 'LOADCHECK_ACTIVATE' || type === 'WF_APPLY') {
    event.waitUntil(sw.skipWaiting());
  } else if (type === 'LOADCHECK_OFFLINE_INFO' || type === 'LOADCHECK_SAVE_APP') {
    event.ports[0]?.postMessage({ ok: true, cached: true });
  }
});
