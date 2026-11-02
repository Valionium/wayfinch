/* The emergency switch (spec 9.5 step 5): the same address as the offline worker, for a release that breaks
   offline use. It removes itself and the offline copies, so the site loads from the network. It reads and writes
   only caches: saved plans stay exactly as they are. It never navigates or reloads a page. */
'use strict';
const OWN_CACHES = ['wayfinch-precache-', 'loadcheck-offline-'];

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));

self.addEventListener('activate', (event) => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => OWN_CACHES.some((prefix) => name.startsWith(prefix))).map((name) => caches.delete(name)));
  await self.registration.unregister();
})()));

// Keeps the old page's offline panel honest: nothing is saved any more.
self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'LOADCHECK_OFFLINE_INFO' || type === 'LOADCHECK_SAVE_APP' || type === 'LOADCHECK_ACTIVATE') {
    if (event.ports[0]) event.ports[0].postMessage({ ok: false, cached: false });
  }
});
