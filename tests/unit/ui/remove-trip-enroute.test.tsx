// @vitest-environment jsdom
// Remove this trip and En route (owner's wish, 9 November 2026): a position routine under way stops and keeps nothing, and what En
// route said for the old trip goes with it, so En route shows what a phone that never had the trip shows.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ScreenInputs } from '../../../src/core/types.ts';
import { announceHere, clearCopies } from '../../../src/store/changed.ts';
import { closeDb, openDb } from '../../../src/store/db.ts';
import { addPosition } from '../../../src/store/positions.ts';
import { saveForecast, saveHours, saveMatched, savePrepared, saveZones } from '../../../src/store/prepared.ts';
import { removeTrip } from '../../../src/store/remove-trip.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';
import { browserAhead } from '../../../src/ui/shell-actions.ts';
import type { AheadDeps } from '../../../src/ui/shell-actions.ts';
import { pointAtKm } from '../../fixtures/build.ts';
import { rainyStop } from './ahead-fixture.ts';

const fresh = (): void => {
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
};
beforeEach(fresh);
afterEach(() => { vi.useRealTimers(); });

async function until(check: () => boolean, what: string, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waited for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function seed(i: ScreenInputs): Promise<void> {
  await readTrip();
  await saveTrip(i.trip);
  const id = i.trip.route.id;
  await saveMatched(id, { places: i.places, roofs: i.roofs, rescuePoints: i.rescuePoints, matches: i.matches, savedKm: i.savedKm });
  await saveZones(id, i.routeZones);
  await saveHours(id, i.hours);
  if (i.forecast) await saveForecast(id, i.forecast, i.forecast.fetchedAt);
  for (const p of i.positions) await addPosition(p, p.at, id);
  await savePrepared(id, { at: i.now, steps: [], build: null, forecastFetchedAt: i.forecast?.fetchedAt ?? null, baselineYears: null });
}

function fakeGeo() {
  let success: PositionCallback | null = null;
  const geo = {
    watching: 0,
    watchPosition(ok: PositionCallback) { geo.watching += 1; success = ok; return 7; },
    clearWatch: vi.fn(() => { geo.watching -= 1; }),
    getCurrentPosition() { /* not used */ },
    emit(accuracy: number, km: number) {
      const { lat, lon } = pointAtKm(km);
      success?.({ coords: { latitude: lat, longitude: lon, accuracy }, timestamp: Date.now() } as unknown as GeolocationPosition);
    },
  };
  return geo;
}

const deps = (i: ScreenInputs, geo: ReturnType<typeof fakeGeo>): AheadDeps => ({
  now: () => i.now, geolocation: () => geo as unknown as Geolocation, online: () => false, fetch: () => Promise.reject(new Error('offline')),
  share: null, writeClipboard: null,
});

test('[TRIP-REMOVE-WINDOWS] a position routine under way when the trip goes stops at once, keeps nothing and says nothing; En route is as on a fresh phone', async () => {
  const i = rainyStop();
  await seed(i);
  const geo = fakeGeo();
  const shell = browserAhead(deps(i, geo));
  const stop = shell.start();
  await until(() => shell.view.value.kind === 'trip', 'the screen');
  const tapped = shell.actions.updatePosition();
  await until(() => geo.watching === 1, 'the watch');

  await removeTrip(i.trip.route);
  // The storage event of another window, or this window's own screens being told.
  announceHere('all');
  await until(() => shell.view.value.kind === 'no-route', 'En route with no route');
  // The watch is stopped, not left to run its 45 s.
  expect(geo.clearWatch).toHaveBeenCalledWith(7);
  expect(geo.watching).toBe(0);
  // A reading that arrives late counts for nothing.
  geo.emit(12, 126);
  expect(await tapped).toBe(false);
  expect(await (await openDb()).count('positions')).toBe(0);
  const removed = shell.view.value;
  stop();

  fresh();
  const other = browserAhead(deps(i, fakeGeo()));
  const stopOther = other.start();
  await until(() => other.view.value.kind === 'no-route', 'a fresh phone');
  expect(JSON.stringify(removed)).toBe(JSON.stringify(other.view.value));
  stopOther();
});

test('[TRIP-REMOVE-WINDOWS] what En route said for the old trip (a position not kept, the weather) is gone with it', async () => {
  const i = rainyStop();
  await seed(i);
  const shell = browserAhead(deps(i, fakeGeo()));
  const stop = shell.start();
  await until(() => shell.view.value.kind === 'trip', 'the screen');
  // A kilometre off the route: said, and not kept.
  await shell.actions.setManual(9999);
  await shell.actions.updateWeather();
  await until(() => { const v = shell.view.value; return v.kind === 'trip' && v.position.kind === 'said' && v.weatherSay !== null; }, 'the sentences');

  await removeTrip(i.trip.route);
  announceHere('all');
  await until(() => shell.view.value.kind === 'no-route', 'En route with no route');
  expect(shell.view.value.kind === 'no-route' && shell.view.value.position).toEqual({ kind: 'idle' });
  // A new route later starts with nothing said either.
  await seed(i);
  announceHere('trip');
  await until(() => shell.view.value.kind === 'trip', 'the new trip');
  const v = shell.view.value;
  expect(v.kind === 'trip' && [v.position, v.weatherSay, v.notice]).toEqual([{ kind: 'idle' }, null, null]);
  stop();
});
