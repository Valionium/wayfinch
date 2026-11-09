// @vitest-environment jsdom
// The first-run bike hint's key after Delete co-pilot data (ST-DELETE, HINT-LOCAL): no window writes it back, as no window writes back
// any other co-pilot store a delete removed. Its own file: a delete heard from another window lasts for the page, as it does in the app.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb } from '../../../src/store/db.ts';
import { deleteCopilotData } from '../../../src/store/export.ts';
import { HINT_KEY } from '../../../src/ui/bike/hint-key.ts';
import { noteSeen } from '../../../src/ui/bike/hint-seen.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import type { BikeSource } from '../../../src/ui/bike/live.ts';
import { TripBike } from '../../../src/ui/trip/bike-hint.tsx';

const host = document.createElement('div');
document.body.append(host);
beforeEach(() => {
  render(null, host);
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  refreshBikeSource();
});
afterEach(() => { act(() => render(null, host)); });

const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const NO_BIKE: BikeSource = { bike: null, bikes: [], summary: null, known: [] };
const BIKE = { id: 'bike_a', name: 'Trail Bike', look: { colour: '#1f7a7a', bars: 'drop', ebike: null }, frontTyre: '40-622', rearTyre: '40-622', pressure: { wheel: '700c' } };
const withBike: BikeSource = { bike: BIKE as unknown as BikeSource['bike'], bikes: [BIKE as unknown as BikeSource['bikes'][number]], summary: null, known: ['bike_a'] };
const trip = async (source: BikeSource, hasTrip: boolean | null = false) => { await act(() => { render(<TripBike bike={source} trip={hasTrip} />, host); }); await settle(); };
const key = () => localStorage.getItem(HINT_KEY);
const copilotKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('copilot:'));

describe('Delete co-pilot data and the hint key', () => {
  test('[HINT-LOCAL] Trip open in the window that deletes: a redraw after the delete never writes the key back', async () => {
    await trip(NO_BIKE);
    expect(key()).toBe('a');
    await deleteCopilotData();
    expect(copilotKeys()).toEqual([]);
    // Anything that redraws Trip afterwards (a bike saved in the bag planner, a re-read): the key stays deleted.
    await trip(withBike, false);
    await trip(NO_BIKE, false);
    expect(copilotKeys()).toEqual([]);
  });

  test('[HINT-LOCAL] another window deletes: this window\'s Trip, its places seen and Later never write the key back while the page lives', async () => {
    await trip(NO_BIKE);
    expect(key()).toBe('a');
    // The other window's Delete co-pilot data: the key goes, and this window hears of it.
    localStorage.removeItem(HINT_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: HINT_KEY, oldValue: 'a', newValue: null, storageArea: localStorage }));
    await trip(NO_BIKE, false);
    expect(key()).toBeNull();
    // Trip opened again in this window, a place seen, Later: still nothing written; the card follows its rules from memory.
    render(null, host);
    await trip(NO_BIKE, false);
    noteSeen('t');
    expect(key()).toBeNull();
    const later = [...host.querySelectorAll('button')].find((b) => b.textContent === W.bikeHintLater);
    expect(later).toBeDefined();
    await act(() => { later!.click(); });
    await settle();
    expect(host.querySelector('section.bike-hint')).toBeNull();
    expect(key()).toBeNull();
  });
});
