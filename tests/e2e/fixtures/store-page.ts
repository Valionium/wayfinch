// Bundled and put into a page by the browser tests only, so they can reach the real store on the real site's origin. The app
// itself has no such door: `window.__store` exists nowhere in any build.
import { screen } from '../../../src/core/screen/screen.ts';
import { prepareTrip } from '../../../src/data/prepare.ts';
import { flushWrites, onChanged } from '../../../src/store/changed.ts';
import { deleteCopilotData } from '../../../src/store/export.ts';
import { openDb } from '../../../src/store/db.ts';
import { readInputs } from '../../../src/store/inputs.ts';
import { addPosition } from '../../../src/store/positions.ts';
import { readSettings, writeSettings } from '../../../src/store/settings.ts';
import { readTrip, replaceRoute, saveTrip } from '../../../src/store/trip.ts';

/** Get ready offline for real, on this page's own network, without the weather service (Task 10 has its tests). */
const prepare = (o: { sleepMs?: number } = {}) => prepareTrip({
  fetch: (input, init) => fetch(input, init),
  fetchForecast: () => Promise.reject(new Error('no weather in this test')),
  fetchBaseline: () => Promise.reject(new Error('no weather in this test')),
  fetchElevation: () => Promise.reject(new Error('no heights in this test')),
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, o.sleepMs ?? ms)),
}, () => undefined);

export const store = { prepare, screen, addPosition, deleteCopilotData, flushWrites, onChanged, openDb, readInputs, readSettings, readTrip, replaceRoute, saveTrip, writeSettings };
export type StoreInPage = typeof store;

(window as unknown as { __store: StoreInPage }).__store = store;
