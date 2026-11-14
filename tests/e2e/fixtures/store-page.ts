// Bundled and put into a page by the browser tests only, so they can reach the real store on the real site's origin. The app
// itself has no such door: `window.__store` exists nowhere in any build.
import { buildScreen, screen } from '../../../src/core/screen/screen.ts';
import { fetchForecast } from '../../../src/data/openmeteo.ts';
import { prepareTrip } from '../../../src/data/prepare.ts';
import { flushWrites, onChanged } from '../../../src/store/changed.ts';
import { deleteCopilotData } from '../../../src/store/export.ts';
import { openDb } from '../../../src/store/db.ts';
import { readInputs } from '../../../src/store/inputs.ts';
import { addPosition } from '../../../src/store/positions.ts';
import { savePrepared } from '../../../src/store/prepared.ts';
import { readSettings, writeSettings } from '../../../src/store/settings.ts';
import { readTrip, replaceRoute, saveTrip } from '../../../src/store/trip.ts';

/**
 * Prepare this route for real, on this page's own network. Without `weather` the weather service is left out (Task 10 has its
 * tests); with it, the forecast is asked for as the app asks, and the test answers it on the page's network.
 */
const prepare = (o: { sleepMs?: number; weather?: boolean; atMs?: number } = {}) => prepareTrip({
  fetch: (input, init) => fetch(input, init),
  fetchForecast: o.weather ? (grid, opts) => fetchForecast(grid, { ...opts, fetch: (input, init) => fetch(input, init) }) : () => Promise.reject(new Error('no weather in this test')),
  fetchBaseline: () => Promise.reject(new Error('no weather in this test')),
  fetchElevation: () => Promise.reject(new Error('no heights in this test')),
  // `atMs`: Get ready as if run at that instant (its clock moving on from there), without faking the page's own clock.
  now: o.atMs === undefined ? () => new Date() : ((shift) => () => new Date(Date.now() + shift))(o.atMs - Date.now()),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, o.sleepMs ?? ms)),
}, () => undefined);

export const store = { prepare, screen, buildScreen, addPosition, deleteCopilotData, flushWrites, onChanged, openDb, readInputs, readSettings, readTrip, replaceRoute, savePrepared, saveTrip, writeSettings };
export type StoreInPage = typeof store;

(window as unknown as { __store: StoreInPage }).__store = store;
