// The world of the which-pass question for the tests that mock en-ask.ts's load (review of PR 65, I1): an out-and-back route in the
// real store (fake IndexedDB), a fake phone position, and the shell's deps. vi.mock is per file, so each mocked load has its own file.
import { vi } from 'vitest';
import type { Route, ScreenInputs } from '../../../src/core/types.ts';
import { closeDb } from '../../../src/store/db.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { addPosition } from '../../../src/store/positions.ts';
import { saveMatched, savePrepared, saveZones, saveHours } from '../../../src/store/prepared.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';
import type { AheadDeps } from '../../../src/ui/shell-actions.ts';
import { flatRoute, pointAtKm } from '../../fixtures/build.ts';
import { rainyStop } from './ahead-fixture.ts';

/** Out to km 75 and back along the same line: km 32 and km 118 are the same spot. */
export function outAndBack(): Route {
  const points = [];
  for (let k = 0; k <= 150; k++) points.push({ ...pointAtKm(k <= 75 ? k : 150 - k), ele: 100, km: k });
  return { ...flatRoute(150), points, lengthKm: 150 };
}

export async function freshStore(): Promise<void> {
  const { IDBFactory } = await import('fake-indexeddb');
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
}

/** The worked example on the out-and-back route, with no stored position, in the store as Get ready leaves it. */
export async function seedOutAndBack(): Promise<ScreenInputs> {
  const base = rainyStop({ positions: [] });
  const i = { ...base, trip: { ...base.trip, route: outAndBack() } };
  await readTrip();
  await saveTrip(i.trip);
  const id = i.trip.route.id;
  await saveMatched(id, { places: i.places, roofs: i.roofs, rescuePoints: i.rescuePoints, matches: i.matches, savedKm: i.savedKm });
  await saveZones(id, i.routeZones);
  await saveHours(id, i.hours);
  for (const p of i.positions) await addPosition(p, p.at, id);
  await savePrepared(id, { at: i.now, steps: [], build: null, forecastFetchedAt: null, baselineYears: null });
  return i;
}

export type Geo = Geolocation & { emit: (km: number) => void };
export function fakeGeo(): Geo {
  let success: PositionCallback | null = null;
  const geo = {
    watchPosition(ok: PositionCallback) { success = ok; return 7; },
    clearWatch: vi.fn(),
    getCurrentPosition() { /* not used */ },
    emit(km: number) {
      const { lat, lon } = pointAtKm(km);
      success?.({ coords: { latitude: lat, longitude: lon, accuracy: 12 }, timestamp: Date.now() } as unknown as GeolocationPosition);
    },
  };
  return geo as unknown as Geo;
}

export function deps(over: Partial<AheadDeps> = {}): AheadDeps {
  return {
    now: () => new Date(), geolocation: () => undefined, online: () => false, fetch: () => Promise.reject(new Error('offline')),
    share: null, writeClipboard: null, ...over,
  };
}

export async function until(check: () => boolean, what: string, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waited for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
