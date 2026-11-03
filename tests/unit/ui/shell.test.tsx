// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/ui/app.tsx';
import { noteTripFacts } from '../../../src/ui/degraded.ts';
import { go, screenFromHash, screenSignal } from '../../../src/ui/nav.ts';
import { resetRegistration, startOfflineWorker } from '../../../src/ui/register.ts';
import { UPDATE_CHECK_MS, createUpdater } from '../../../src/ui/update.ts';
import type { UpdaterEnv } from '../../../src/ui/update.ts';

const host = document.createElement('div');
document.body.append(host);
afterEach(async () => {
  render(null, host);
  vi.useRealTimers();
});

/** A registration and a container that behave as far as the shell looks. */
function fakeWorkerWorld(options: { waiting?: boolean } = {}) {
  const container = Object.assign(new EventTarget(), {
    register: vi.fn<(url: string, options?: Record<string, unknown>) => Promise<unknown>>(() => Promise.resolve(registration)),
    getRegistration: vi.fn(() => Promise.resolve(registration)),
  });
  const waitingWorker = Object.assign(new EventTarget(), { postMessage: vi.fn() });
  const registration = Object.assign(new EventTarget(), {
    waiting: options.waiting === false ? null : waitingWorker,
    installing: null,
    active: null,
    update: vi.fn(() => Promise.resolve()),
  });
  Object.defineProperty(container, 'ready', { get: () => Promise.resolve(registration) });
  return { container, registration, waitingWorker };
}

function updaterWith(world: ReturnType<typeof fakeWorkerWorld>, extra: Partial<UpdaterEnv> = {}) {
  const calls: string[] = [];
  const env: UpdaterEnv = {
    serviceWorker: world.container as unknown as ServiceWorkerContainer,
    save: () => { calls.push('save'); return Promise.resolve(true); },
    reload: () => { calls.push('reload'); },
    now: () => 0,
    onForeground: () => {},
    ...extra,
  };
  world.waitingWorker.postMessage.mockImplementation((message: unknown) => { calls.push(`post:${(message as { type: string }).type}`); });
  return { updater: createUpdater(env), calls };
}

const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

beforeEach(() => resetRegistration());

test('[APP-REGISTER] the shell registers the worker once with scope / and no module type, and a second start does nothing', async () => {
  const world = fakeWorkerWorld();
  const env = { serviceWorker: world.container as unknown as ServiceWorkerContainer, isSecureContext: true, updater: null };
  await startOfflineWorker(env);
  await startOfflineWorker(env);
  expect(world.container.register).toHaveBeenCalledTimes(1);
  expect(world.container.register).toHaveBeenCalledWith('/offline-worker.js', { scope: '/', updateViaCache: 'none' });
  const options = world.container.register.mock.calls[0]![1] as Record<string, unknown>;
  expect(options).not.toHaveProperty('type');
});

test('[APP-REGISTER] it registers after the first render, never before, and not outside a secure context', async () => {
  vi.resetModules();
  const world = fakeWorkerWorld();
  let sawShellAtRegister = false;
  world.container.register.mockImplementation(() => {
    sawShellAtRegister = document.querySelector('nav.tabs') !== null;
    return Promise.resolve(world.registration);
  });
  Object.defineProperty(navigator, 'serviceWorker', { value: world.container, configurable: true });
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
  const app = document.createElement('div');
  app.id = 'app';
  document.body.append(app);
  await import('../../../src/ui/main.tsx');
  await flush();
  expect(world.container.register).toHaveBeenCalledTimes(1);
  expect(sawShellAtRegister).toBe(true);
  // main.tsx mounted the whole app here: unmount it, or it re-renders after the file's last test, when jsdom is gone.
  render(null, app);
  app.remove();

  // an insecure page registers nothing
  const other = fakeWorkerWorld();
  resetRegistration();
  await startOfflineWorker({ serviceWorker: other.container as unknown as ServiceWorkerContainer, isSecureContext: false, updater: null });
  expect(other.container.register).not.toHaveBeenCalled();
});

test('[APP-UPDATE-PROMPT] a waiting worker shows exactly "Update ready — apply now"; with none there is no prompt', async () => {
  const waiting = fakeWorkerWorld();
  const a = updaterWith(waiting);
  vi.useFakeTimers();
  a.updater.watch(waiting.registration as unknown as ServiceWorkerRegistration);
  render(<App updater={a.updater} />, host);
  expect(host.querySelector('.update-bar button')?.textContent).toBe('Update ready — apply now');

  const none = fakeWorkerWorld({ waiting: false });
  const b = updaterWith(none);
  b.updater.watch(none.registration as unknown as ServiceWorkerRegistration);
  render(<App updater={b.updater} />, host);
  expect(host.querySelector('.update-bar')).toBeNull();
});

test('[APP-UPDATE-PROMPT] the tap saves first, sends WF_APPLY, and reloads only when the new worker has taken control', async () => {
  const world = fakeWorkerWorld();
  const { updater, calls } = updaterWith(world);
  updater.watch(world.registration as unknown as ServiceWorkerRegistration);
  render(<App updater={updater} />, host);
  expect(calls).toEqual([]); // the page never reloads, saves or applies by itself
  await act(async () => { host.querySelector<HTMLButtonElement>('.update-bar button')!.click(); await flush(); });
  expect(calls).toEqual(['save', 'post:WF_APPLY']);
  world.container.dispatchEvent(new Event('controllerchange'));
  expect(calls).toEqual(['save', 'post:WF_APPLY', 'reload']);
});

test('[APP-UPDATE-PROMPT] a save that fails stops the update: nothing is sent, nothing reloads, and the rider is told', async () => {
  const world = fakeWorkerWorld();
  const { updater, calls } = updaterWith(world, { save: () => Promise.resolve(false) });
  updater.watch(world.registration as unknown as ServiceWorkerRegistration);
  await updater.apply();
  expect(calls).toEqual([]);
  expect(updater.note.value).toContain('was not applied');
  world.container.dispatchEvent(new Event('controllerchange'));
  expect(calls).toEqual([]);
});

test('[APP-UPDATE-PROMPT] without a controller change the window does not reload; it says the update waits for the windows to close', async () => {
  vi.useFakeTimers();
  const world = fakeWorkerWorld();
  const { updater, calls } = updaterWith(world);
  updater.watch(world.registration as unknown as ServiceWorkerRegistration);
  const done = updater.apply();
  await vi.advanceTimersByTimeAsync(11_000);
  await done;
  expect(calls).toEqual(['save', 'post:WF_APPLY']);
  expect(updater.note.value).toContain('every window');
});

test('[APP-UPDATE-PROMPT] it checks at launch and on return to the foreground, at most once an hour', async () => {
  let clock = 1_000_000;
  let foreground = () => {};
  const world = fakeWorkerWorld({ waiting: false });
  const { updater } = updaterWith(world, { now: () => clock, onForeground: (callback) => { foreground = callback; } });
  updater.start();
  await flush();
  expect(world.registration.update).toHaveBeenCalledTimes(1); // at launch
  foreground();
  await flush();
  expect(world.registration.update).toHaveBeenCalledTimes(1); // too soon
  clock += UPDATE_CHECK_MS - 1;
  foreground();
  await flush();
  expect(world.registration.update).toHaveBeenCalledTimes(1);
  clock += 1;
  foreground();
  await flush();
  expect(world.registration.update).toHaveBeenCalledTimes(2); // an hour on
});

test('the shell opens on Trip with no trip, shows four labelled tabs, and follows the address', async () => {
  window.location.hash = '';
  go('trip');
  render(<App />, host);
  expect(host.querySelector('h1')?.textContent).toBe('Trip');
  const tabs = [...host.querySelectorAll('nav.tabs a')].map((a) => a.textContent);
  expect(tabs).toEqual(['Ahead', 'Trip', 'Tools', 'You']);
  expect(host.querySelector('nav.tabs a[aria-current="page"]')?.textContent).toBe('Trip');
  await act(async () => { go('tools/tyre'); });
  expect(host.querySelector('nav.tabs a[aria-current="page"]')?.textContent).toBe('Tools');
  expect(screenFromHash('#/you/legal', 'trip')).toBe('you/legal');
  expect(screenFromHash('#/nonsense', 'trip')).toBe('trip');
  expect(screenFromHash('', 'trip')).toBe('trip');
  expect(screenSignal.value).toBe('tools/tyre');
});

test('[APP-DEGRADED] the shell shows "Add a route" on Trip and Ahead, never on Tools or You', async () => {
  noteTripFacts(false, false);
  go('tools');
  render(<App />, host);
  const notices = () => [...host.querySelectorAll('main > .notice')].map((n) => n.textContent);
  expect(notices()).not.toContain("Add a route to see what's ahead");
  await act(async () => { go('you'); });
  expect(notices()).not.toContain("Add a route to see what's ahead");
  await act(async () => { go('trip'); });
  expect(notices()).toContain("Add a route to see what's ahead");
  // a failed read says nothing about the route
  await act(async () => { noteTripFacts(null, null); });
  expect(notices()).not.toContain("Add a route to see what's ahead");
});

// The teardown race of 3 November ("requestAnimationFrame is not defined"): a tree left mounted after the last test re-renders when
// its store reads settle, and Preact asks for the next frame after jsdom has gone. Every tree here is unmounted, so after the last
// test nothing renders: a render now would ask for a frame.
afterAll(async () => {
  let asked = 0;
  const real = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => { asked += 1; return real(cb); };
  await new Promise((done) => setTimeout(done, 300));
  globalThis.requestAnimationFrame = real;
  expect(asked).toBe(0);
});
