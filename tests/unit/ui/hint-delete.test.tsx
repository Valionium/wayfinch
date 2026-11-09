// @vitest-environment jsdom
// The keys the app writes without a rider's tap (the first-run bike hint, the moved card) after Delete co-pilot data (ST-DELETE,
// HINT-LOCAL, SW-MOVED-CARD): no window writes them back while it lives, as no window writes back any other co-pilot store a delete
// removed: the window that deleted, a window that heard it, and a page back from the back/forward cache, which hears nothing.
// A delete lasts for the page, as it does in the app, so every test loads the app's modules afresh (`fresh`).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const HINT_KEY = 'copilot:bikeHint:v1';
const MOVED_KEY = 'copilot:moved-card';
const host = document.createElement('div');
document.body.append(host);

/** The app's modules as a new page loads them: nothing remembered from another test. */
async function fresh() {
  vi.resetModules();
  const preact = await import('preact');
  const { act } = await import('preact/test-utils');
  const { TripBike } = await import('../../../src/ui/trip/bike-hint.tsx');
  const { noteSeen } = await import('../../../src/ui/bike/hint-seen.ts');
  const { deleteCopilotData, exportAll } = await import('../../../src/store/export.ts');
  const { movedCardDue } = await import('../../../src/ui/moved-due.ts');
  const { W } = await import('../../../src/core/wording/en.ts');
  const { refreshBikeSource } = await import('../../../src/ui/bike/live.ts');
  refreshBikeSource();
  const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
  type Source = Parameters<typeof TripBike>[0]['bike'];
  const trip = async (source: Source, hasTrip: boolean | null = false) => { await act(() => { preact.render(<TripBike bike={source} trip={hasTrip} />, host); }); await settle(); };
  const unmount = async () => { await act(() => { preact.render(null, host); }); };
  const later = () => [...host.querySelectorAll('button')].find((b) => b.textContent === W.bikeHintLater);
  return { act, trip, unmount, settle, later, noteSeen, deleteCopilotData, exportAll, movedCardDue };
}

let unmount: (() => Promise<void>) | null = null;
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});
afterEach(async () => { await unmount?.(); unmount = null; vi.restoreAllMocks(); });

const NO_BIKE = { bike: null, bikes: [], summary: null, known: [] };
const BIKE = { id: 'bike_a', name: 'Trail Bike', look: { colour: '#1f7a7a', bars: 'drop', ebike: null }, frontTyre: '40-622', rearTyre: '40-622', pressure: { wheel: '700c' } };
const WITH_BIKE = { bike: BIKE, bikes: [BIKE], summary: null, known: ['bike_a'] } as unknown as typeof NO_BIKE;
const key = () => localStorage.getItem(HINT_KEY);
const copilotKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('copilot:'));
/** Another window's Delete co-pilot data, as this window hears it. */
const deletedElsewhere = (k: string, old: string) => {
  localStorage.removeItem(k);
  window.dispatchEvent(new StorageEvent('storage', { key: k, oldValue: old, newValue: null, storageArea: localStorage }));
};

describe('the first-run bike hint', () => {
  // Moved from bike-hint.test.tsx unchanged: Delete now lasts for the page, so it runs on modules of its own.
  test('[HINT-LOCAL] one copilot: key of a few letters; Delete co-pilot data removes it (a fresh start shows the card), the export leaves it out, nothing is sent', async () => {
    const app = await fresh();
    unmount = app.unmount;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('no network in this test')));
    await app.trip(NO_BIKE);
    await app.act(() => { app.later()!.click(); });
    app.noteSeen('t');
    expect(key()).toMatch(/^[atypcgsw]+$/);
    const hintKeys = Object.keys(localStorage).filter((k) => /hint/i.test(k));
    expect(hintKeys).toEqual([HINT_KEY]);
    expect(JSON.stringify(await app.exportAll())).not.toContain('bikeHint');
    await app.deleteCopilotData();
    expect(key()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('[HINT-LOCAL] Trip open in the window that deletes: a redraw after the delete never writes the key back', async () => {
    const app = await fresh();
    unmount = app.unmount;
    await app.trip(NO_BIKE);
    expect(key()).toBe('a');
    await app.deleteCopilotData();
    expect(copilotKeys()).toEqual([]);
    await app.trip(WITH_BIKE, false);
    await app.trip(NO_BIKE, false);
    expect(copilotKeys()).toEqual([]);
  });

  test('[HINT-LOCAL] the window that deletes (You), then Tools, Tyre pressure, Bike care, You and Trip: the key is never written back', async () => {
    const app = await fresh();
    unmount = app.unmount;
    app.noteSeen('y');
    expect(key()).toBe('y');
    await app.deleteCopilotData();
    for (const place of ['t', 'p', 'c', 'y', 'g'] as const) app.noteSeen(place);
    await app.trip(NO_BIKE, false);
    expect(key()).toBeNull();
    expect(copilotKeys()).toEqual([]);
  });

  test('[HINT-LOCAL] another window deletes: this window\'s Trip, its places seen and Later never write the key back while the page lives', async () => {
    const app = await fresh();
    unmount = app.unmount;
    await app.trip(NO_BIKE);
    expect(key()).toBe('a');
    deletedElsewhere(HINT_KEY, 'a');
    await app.trip(NO_BIKE, false);
    expect(key()).toBeNull();
    await app.unmount();
    await app.trip(NO_BIKE, false);
    app.noteSeen('t');
    expect(key()).toBeNull();
    expect(app.later()).toBeDefined();
    await app.act(() => { app.later()!.click(); });
    await app.settle();
    expect(host.querySelector('section.bike-hint')).toBeNull();
    expect(key()).toBeNull();
  });

  test('[HINT-LOCAL] a page back from the back/forward cache after a delete elsewhere (no storage event): its next places seen write nothing', async () => {
    const app = await fresh();
    unmount = app.unmount;
    await import('../../../src/ui/page-return.ts');
    app.noteSeen('t');
    expect(key()).toBe('t');
    // Deleted while the page was frozen: no event reaches it.
    localStorage.removeItem(HINT_KEY);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    app.noteSeen('y');
    app.noteSeen('c');
    expect(key()).toBeNull();
  });

  test('[HINT-LOCAL] a fresh start after the delete writes the key again, as a new rider\'s phone does', async () => {
    let app = await fresh();
    app.noteSeen('t');
    await app.deleteCopilotData();
    app = await fresh();
    unmount = app.unmount;
    await app.trip(NO_BIKE, false);
    expect(key()).toBe('a');
  });
});

describe('the moved card', () => {
  test('[SW-MOVED-CARD] the window that deletes: asking whether the card is due afterwards writes nothing back', async () => {
    const app = await fresh();
    expect(app.movedCardDue()).toBe(false);
    expect(localStorage.getItem(MOVED_KEY)).toBe('not-due');
    await app.deleteCopilotData();
    expect(app.movedCardDue()).toBe(false);
    expect(copilotKeys()).toEqual([]);
  });

  test('[SW-MOVED-CARD] another window deletes: asking afterwards writes nothing back', async () => {
    const app = await fresh();
    expect(app.movedCardDue()).toBe(false);
    deletedElsewhere(MOVED_KEY, 'not-due');
    expect(app.movedCardDue()).toBe(false);
    expect(localStorage.getItem(MOVED_KEY)).toBeNull();
  });

  test('[SW-MOVED-CARD] a page back from the back/forward cache after a delete elsewhere: asking afterwards writes nothing back', async () => {
    const app = await fresh();
    await import('../../../src/ui/page-return.ts');
    expect(app.movedCardDue()).toBe(false);
    localStorage.removeItem(MOVED_KEY);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(app.movedCardDue()).toBe(false);
    expect(localStorage.getItem(MOVED_KEY)).toBeNull();
  });

  test('[SW-MOVED-CARD] a fresh start after the delete marks it not due again, as before', async () => {
    let app = await fresh();
    app.movedCardDue();
    await app.deleteCopilotData();
    app = await fresh();
    expect(app.movedCardDue()).toBe(false);
    expect(localStorage.getItem(MOVED_KEY)).toBe('not-due');
  });
});
