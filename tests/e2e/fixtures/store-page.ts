// Bundled and put into a page by the browser tests only, so they can reach the real store on the real site's origin. The app
// itself has no such door: `window.__store` exists nowhere in any build.
import { flushWrites, onChanged } from '../../../src/store/changed.ts';
import { deleteCopilotData } from '../../../src/store/export.ts';
import { openDb } from '../../../src/store/db.ts';
import { readInputs } from '../../../src/store/inputs.ts';
import { addPosition } from '../../../src/store/positions.ts';
import { readSettings, writeSettings } from '../../../src/store/settings.ts';
import { readTrip, replaceRoute, saveTrip } from '../../../src/store/trip.ts';

export const store = { addPosition, deleteCopilotData, flushWrites, onChanged, openDb, readInputs, readSettings, readTrip, replaceRoute, saveTrip, writeSettings };
export type StoreInPage = typeof store;

(window as unknown as { __store: StoreInPage }).__store = store;
