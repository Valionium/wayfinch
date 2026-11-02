import { beforeEach, expect, test, vi } from 'vitest';
import { anotherWindow, freshStore, route, trip } from './helpers.ts';
import { CHANGED_KEY, flushWrites, NewerDataError, onChanged, tracked } from '../../../src/store/changed.ts';
import type { Section } from '../../../src/store/changed.ts';
import { readSettings, writeSettings } from '../../../src/store/settings.ts';
import { readTrip, replaceRoute, saveTrip } from '../../../src/store/trip.ts';

beforeEach(freshStore);

test('[ST-NO-OVERWRITE] a window with an older trip writing leaves the newer one and tells the caller', async () => {
  await saveTrip(trip({ campWaterL: 1 }));
  const other = await anotherWindow();
  const seen = (await other.trip.readTrip())!;
  await other.trip.saveTrip({ ...seen, campWaterL: 4 });

  // This window still holds the version with 1 L.
  await expect(saveTrip(trip({ campWaterL: 2 }))).rejects.toBeInstanceOf(Error);
  await expect(saveTrip(trip({ campWaterL: 2 }))).rejects.toMatchObject({ name: 'NewerDataError', section: 'trip' });
  expect((await readTrip())?.campWaterL).toBe(4);

  // Having read it, it may write.
  await saveTrip({ ...(await readTrip())!, campWaterL: 3 });
  expect((await other.trip.readTrip())?.campWaterL).toBe(3);
});

test('[ST-NO-OVERWRITE] replacing the route from an older copy removes nothing', async () => {
  await saveTrip(trip());
  const other = await anotherWindow();
  await other.trip.saveTrip({ ...(await other.trip.readTrip())!, campWaterL: 4 });
  await expect(replaceRoute(route({ id: 'route-new' }, 50))).rejects.toMatchObject({ section: 'trip' });
  expect((await readTrip())?.route.id).toBe(trip().route.id);
});

test('[ST-NO-OVERWRITE] a window that never read a section does not write over what is there; on an empty store it may', async () => {
  const other = await anotherWindow();
  await saveTrip(trip());
  await expect(other.trip.saveTrip(trip({ campWaterL: 1 }))).rejects.toMatchObject({ section: 'trip' });
  expect((await readTrip())?.campWaterL).toBe(2);
});

test('[ST-NO-OVERWRITE] settings: the older window is told, the newer value stays, and a trip field stays too', async () => {
  await saveTrip(trip());
  await writeSettings({ theme: 'dark' });
  await readSettings();
  const other = await anotherWindow();
  await other.settings.readSettings();
  await other.settings.writeSettings({ theme: 'light', flatKph: 30 });

  const r = await writeSettings({ theme: 'auto', flatKph: 20 });
  expect(r.ok).toBe(false);
  expect(r.newer.sort()).toEqual(['settings', 'trip']);
  expect(r.newerReason).toBeTruthy();
  expect(r.settings).toMatchObject({ theme: 'light', flatKph: 30 });
  expect((await readTrip())?.flatKph).toBe(30);

  await readSettings();
  expect((await writeSettings({ theme: 'auto', flatKph: 20 })).ok).toBe(true);
});

test('[ST-NO-OVERWRITE] two writes in the same millisecond still tell versions apart', async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-17T10:00:00Z') });
  try {
    await saveTrip(trip());
    const other = await anotherWindow();
    await other.trip.saveTrip({ ...(await other.trip.readTrip())!, campWaterL: 4 });
    await expect(saveTrip(trip({ campWaterL: 1 }))).rejects.toMatchObject({ section: 'trip' });
    expect((await readTrip())?.campWaterL).toBe(4);
  } finally {
    vi.useRealTimers();
  }
});

test('[ST-NO-OVERWRITE] a clock moved back makes no older stamp: the other window still sees a change', async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-17T10:00:00Z') });
  try {
    await saveTrip(trip());
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
    const other = await anotherWindow();
    await other.trip.saveTrip({ ...(await other.trip.readTrip())!, campWaterL: 4 });
    await expect(saveTrip(trip({ campWaterL: 1 }))).rejects.toMatchObject({ section: 'trip' });
  } finally {
    vi.useRealTimers();
  }
});

test('[ST-NO-OVERWRITE] a write sets copilot:changed with the section, and each value differs so the event always fires', async () => {
  await saveTrip(trip());
  const first = localStorage.getItem(CHANGED_KEY);
  expect(JSON.parse(first!)).toMatchObject({ section: 'trip' });
  await saveTrip({ ...(await readTrip())!, campWaterL: 1 });
  expect(localStorage.getItem(CHANGED_KEY)).not.toBe(first);
});

test('[ST-TWO-WINDOWS] onChanged hands on the section of a storage event, and nothing else', () => {
  const target = new EventTarget();
  vi.stubGlobal('addEventListener', target.addEventListener.bind(target));
  vi.stubGlobal('removeEventListener', target.removeEventListener.bind(target));
  try {
    const seen: Section[] = [];
    const stop = onChanged((s) => seen.push(s));
    const fire = (key: string | null, newValue: string | null): void => {
      target.dispatchEvent(Object.assign(new Event('storage'), { key, newValue }));
    };
    fire(CHANGED_KEY, JSON.stringify({ at: 1, section: 'trip' }));
    fire(CHANGED_KEY, JSON.stringify({ at: 2, section: 'not-a-section' }));
    fire(CHANGED_KEY, '{no');
    fire(CHANGED_KEY, null);
    fire('loadcheck:draft', JSON.stringify({ at: 3, section: 'trip' }));
    expect(seen).toEqual(['trip']);
    stop();
    fire(CHANGED_KEY, JSON.stringify({ at: 4, section: 'settings' }));
    expect(seen).toEqual(['trip']);
  } finally {
    vi.unstubAllGlobals();
  }
});

test('[APP-UPDATE-PROMPT] saving before an update waits for writes under way, and says when one failed', async () => {
  let finish!: () => void;
  let done = false;
  void tracked(new Promise<void>((resolve) => { finish = resolve; })).then(() => { done = true; });
  const flushed = flushWrites().then((ok) => { expect(done).toBe(true); return ok; });
  finish();
  expect(await flushed).toBe(true);

  await tracked(Promise.reject(new Error('quota'))).catch(() => undefined);
  expect(await flushWrites()).toBe(false);
  expect(await flushWrites()).toBe(true);

  // Refused for newer data is not a failure to save: there is nothing left to save.
  await tracked(Promise.reject(new NewerDataError('trip'))).catch(() => undefined);
  expect(await flushWrites()).toBe(true);
});
