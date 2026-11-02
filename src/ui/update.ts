// The update prompt (spec section 9.1). A new version applies only at the rider's tap, or by the browser's own rule once
// every window has closed; the page never reloads by itself. The tap saves first, then asks the waiting worker to take over,
// and the window reloads only when the new worker has taken control.
import { signal } from '@preact/signals';
import { W } from '../core/wording/en.ts';

export const UPDATE_CHECK_MS = 3_600_000; // at most hourly
export const UPDATE_APPLY_WAIT_MS = 10_000;
const SETTLE_MS = 250; // a worker that takes over at once passes through "installed" for a moment: only one still waiting counts

export interface UpdaterEnv {
  serviceWorker: ServiceWorkerContainer;
  /** Saves everything unsaved. Resolves false when it could not; the update is then not applied. */
  save: () => Promise<boolean>;
  reload: () => void;
  now: () => number;
  /** Calls back whenever the page returns to the foreground. */
  onForeground: (callback: () => void) => void;
}

export function createUpdater(env: UpdaterEnv) {
  const ready = signal(false);
  const note = signal('');
  let registration: ServiceWorkerRegistration | null = null;
  let lastCheck: number | null = null;
  let applying = false;
  let settle: ReturnType<typeof setTimeout> | undefined;

  const show = () => {
    ready.value = !!registration?.waiting;
    if (!ready.value) note.value = '';
  };
  const queueShow = () => {
    clearTimeout(settle);
    settle = setTimeout(show, SETTLE_MS);
  };
  const watchWorker = (worker: ServiceWorker | null) => worker?.addEventListener('statechange', queueShow);

  function watch(next: ServiceWorkerRegistration): void {
    if (registration === next) return;
    registration = next;
    next.addEventListener('updatefound', () => watchWorker(next.installing));
    watchWorker(next.installing);
    watchWorker(next.waiting);
    show();
  }

  async function check(): Promise<void> {
    const t = env.now();
    if (lastCheck !== null && t - lastCheck < UPDATE_CHECK_MS) return;
    lastCheck = t;
    try {
      const found = await env.serviceWorker.getRegistration('/');
      if (!found) return;
      watch(found);
      await found.update();
    } catch {
      // offline or blocked: the next look tries again
    }
  }

  async function apply(): Promise<void> {
    if (applying || !registration?.waiting) {
      show();
      return;
    }
    applying = true;
    note.value = '';
    const finish = (message: string) => {
      applying = false;
      note.value = message;
    };
    let saved = false;
    try {
      saved = await env.save();
    } catch {
      saved = false;
    }
    if (!saved) return finish(W.appUpdateNotSaved);
    const waiting = registration?.waiting;
    if (!waiting) return finish('');
    const timer = setTimeout(() => {
      env.serviceWorker.removeEventListener('controllerchange', reload);
      finish(W.appUpdateNotYet);
    }, UPDATE_APPLY_WAIT_MS);
    const reload = () => {
      clearTimeout(timer);
      env.reload();
    };
    env.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    try {
      waiting.postMessage({ type: 'WF_APPLY' });
    } catch {
      clearTimeout(timer);
      env.serviceWorker.removeEventListener('controllerchange', reload);
      finish(W.appUpdateFailed);
    }
  }

  /** At launch and whenever the page returns to the foreground. */
  function start(): void {
    env.onForeground(() => void check());
    void check();
    // A rider whose first visit is still installing gets the prompt too, without waiting for the next look.
    env.serviceWorker.ready.then((found) => watch(found), () => {});
  }

  return { ready, note, check, apply, watch, start };
}

export type Updater = ReturnType<typeof createUpdater>;
