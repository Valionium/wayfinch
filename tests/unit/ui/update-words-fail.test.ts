// When the words chunk of the update notes cannot be fetched, a failed tap still tells the rider something (review of PR 105).
import { afterEach, expect, test, vi } from 'vitest';
import { UPDATE_APPLY_WAIT_MS, createUpdater } from '../../../src/ui/update.ts';

vi.mock('../../../src/core/wording/en-update.ts', () => { throw new Error('chunk could not be fetched'); });
afterEach(() => { vi.useRealTimers(); });

function world(postMessage: () => void) {
  const waiting = Object.assign(new EventTarget(), { postMessage });
  const registration = Object.assign(new EventTarget(), { waiting, installing: null, active: null, update: () => Promise.resolve() });
  const container = Object.assign(new EventTarget(), { getRegistration: () => Promise.resolve(registration) });
  return { registration, container };
}
function updaterFor(w: ReturnType<typeof world>, save: () => Promise<boolean>) {
  const updater = createUpdater({ serviceWorker: w.container as unknown as ServiceWorkerContainer, save, reload: () => {}, now: () => 0, onForeground: () => {} });
  updater.watch(w.registration as unknown as ServiceWorkerRegistration);
  return updater;
}

test('[APP-UPDATE-PROMPT] the note shows though the words chunk fails: data not saved', async () => {
  const updater = updaterFor(world(() => {}), () => Promise.resolve(false));
  await updater.apply();
  expect(updater.note.value).not.toBe('');
});

test('[APP-UPDATE-PROMPT] the note shows though the words chunk fails: the worker cannot be told', async () => {
  const updater = updaterFor(world(() => { throw new Error('gone'); }), () => Promise.resolve(true));
  await updater.apply();
  await vi.waitFor(() => expect(updater.note.value).not.toBe(''));
});

test('[APP-UPDATE-PROMPT] the note shows though the words chunk fails: the window does not reload', async () => {
  vi.useFakeTimers();
  const updater = updaterFor(world(() => {}), () => Promise.resolve(true));
  const done = updater.apply();
  await vi.advanceTimersByTimeAsync(UPDATE_APPLY_WAIT_MS + 1000);
  await done;
  expect(updater.note.value).not.toBe('');
});
