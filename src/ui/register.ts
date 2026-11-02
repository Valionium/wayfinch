// Registers the site's one service worker, once, after the first render (spec sections 9.1 and 9.5).
// A classic script: no module type, scope the whole site, and the browser always asks the server for a new copy.
import { createUpdater } from './update.ts';
import type { Updater } from './update.ts';
import { flushWrites } from '../store/changed.ts';

let registered = false;

export const WORKER_URL = '/offline-worker.js';


export function startOfflineWorker(env: {
  serviceWorker: ServiceWorkerContainer | undefined;
  isSecureContext: boolean;
  updater: Updater | null;
}): Promise<void> {
  if (registered || !env.serviceWorker || !env.isSecureContext) return Promise.resolve();
  registered = true;
  const { serviceWorker, updater } = env;
  return serviceWorker
    .register(WORKER_URL, { scope: '/', updateViaCache: 'none' })
    .then((registration) => {
      updater?.watch(registration);
    })
    .catch(() => {
      // No worker in this window: the app still works online (spec section 8).
    });
}

export const makeUpdater = (): Updater | null =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? createUpdater({
        serviceWorker: navigator.serviceWorker,
        save: flushWrites,
        reload: () => location.reload(),
        now: () => Date.now(),
        onForeground: (callback) => document.addEventListener('visibilitychange', () => { if (!document.hidden) callback(); }),
      })
    : null;

/** For tests only: lets a second start be attempted. */
export const resetRegistration = (): void => { registered = false; };
