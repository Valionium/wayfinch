import { beforeEach, expect, test } from 'vitest';
import { freshStore, route, trip } from './helpers.ts';
import type { Route } from '../../../src/core/types.ts';
import { openDb, ROUTE_META_PREFIX, ROUTE_STORES } from '../../../src/store/db.ts';
import { readSettings, writeSettings } from '../../../src/store/settings.ts';
import { readTrip, replaceRoute, saveTrip } from '../../../src/store/trip.ts';

beforeEach(freshStore);

/** A record in every store that belongs to the route, and things that do not. */
async function fill(): Promise<void> {
  const db = await openDb();
  await db.add('matches', { placeId: 'node/1', km: 3, offRouteM: 10 });
  await db.put('places', { id: 'node/1', kind: 'water' });
  await db.add('roofs', { kind: 'bus_stop', lat: 1, lon: 2, bench: false });
  await db.add('rescuePoints', { lat: 1, lon: 2, ref: 'R', kms: [3] });
  await db.put('hours', { placeId: 'node/1', windowStart: new Date(0), windowEnd: new Date(1), spans: [] });
  await db.put('forecast', { fetchedAt: new Date(0), runs: [], grid: [], has15: false }, 'current');
  await db.put('baseline', { years: '2020-2024', points: [] }, 'current');
  await db.add('positions', { lat: 1, lon: 2, accuracyM: 5, at: new Date(0), km: 3, offRouteM: 0, source: 'gps', approximate: false });
  await db.put('dayStarts', { day: '2026-10-17', km: 3 });
  await db.put('waterLeft', { litres: 1, at: new Date(0), confirmed: true }, 'current');
  await db.put('savedTiles', { saved: true }, '9/1/2');
  await db.put('meta', '2026-10-18', `${ROUTE_META_PREFIX}routeEnd`);
  await db.put('meta', [{ fromKm: 0, toKm: 5 }], `${ROUTE_META_PREFIX}savedKm`);
  await db.add('calibration', { at: new Date(0), predictedL: 1, intakeL: 1, feel: null });
  await db.put('handoffs', { id: 'h' }, 'h');
  await db.put('meta', { weightKg: 70 }, 'profile');
}

async function counts(): Promise<Record<string, number>> {
  const db = await openDb();
  const out: Record<string, number> = {};
  for (const name of ROUTE_STORES) out[name] = await db.count(name);
  return out;
}

const WITH_OLD = { matches: 1, places: 1, roofs: 1, rescuePoints: 1, hours: 1, forecast: 1, baseline: 1, positions: 1, dayStarts: 1, waterLeft: 1, savedTiles: 1 };

test("[ST-REPLACE] the list of stores cleared is exactly the rule's", () => {
  expect([...ROUTE_STORES].sort()).toEqual(Object.keys(WITH_OLD).sort());
});

test("[ST-REPLACE] replacing the route removes everything of the old route and nothing of the rider's", async () => {
  await saveTrip(trip());
  await readTrip();
  await fill();
  localStorage.setItem('copilot:plan-tomorrow', JSON.stringify({ date: '2026-10-17' }));
  expect(await counts()).toEqual(WITH_OLD);

  const next = route({ id: 'route-new', hash: 'new', name: 'New' }, 50);
  await replaceRoute(next);

  const db = await openDb();
  for (const [name, n] of Object.entries(await counts())) expect(n, name).toBe(0);
  expect(await db.get('meta', `${ROUTE_META_PREFIX}routeEnd`)).toBeUndefined();
  expect(await db.get('meta', `${ROUTE_META_PREFIX}savedKm`)).toBeUndefined();
  expect(localStorage.getItem('copilot:plan-tomorrow')).toBeNull();
  expect((await readTrip())?.route).toEqual(next);

  // The rider's own things stay.
  expect(await db.count('calibration')).toBe(1);
  expect(await db.count('handoffs')).toBe(1);
  expect(await db.get('meta', 'profile')).toEqual({ weightKg: 70 });
});

test("[ST-REPLACE] the trip's settings stay, while the old departure date and nights do not carry over to the new route", async () => {
  localStorage.setItem('copilot:settings', JSON.stringify({ updatedAt: '2026-01-01T00:00:00.000Z', nights: 3 }));
  await readSettings();
  await saveTrip(trip({ flatKph: 30, stay: 'mixed', campWaterL: 1, startTime: '07:00', pace: 'hard' }));
  await readTrip();
  await replaceRoute(route({ id: 'route-new', hash: 'new' }, 50));
  expect(await readTrip()).toMatchObject({ flatKph: 30, stay: 'mixed', campWaterL: 1, startTime: '07:00', pace: 'hard', departureDate: null });
  expect((await readSettings()).nights).toBeNull();
});

test("[ST-REPLACE] a first route needs no earlier trip, and takes the rider's settings", async () => {
  await replaceRoute(route({ id: 'route-first' }));
  expect(await readTrip()).toMatchObject({ departureDate: null, startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2 });
});

test('[ST-REPLACE] a failure inside the transaction keeps all of the old', async () => {
  await saveTrip(trip());
  await readTrip();
  await fill();
  localStorage.setItem('copilot:plan-tomorrow', JSON.stringify({ date: '2026-10-17' }));
  // A value that can't be stored: it passes the checks, and fails at the put, after the stores were cleared.
  const bad = { ...route({ id: 'route-new' }), extra: () => 1 } as unknown as Route;

  await expect(replaceRoute(bad)).rejects.toThrow();

  expect(await counts()).toEqual(WITH_OLD);
  const db = await openDb();
  expect(await db.get('meta', `${ROUTE_META_PREFIX}routeEnd`)).toBe('2026-10-18');
  expect(await readTrip()).toEqual(trip());
  expect(localStorage.getItem('copilot:plan-tomorrow')).not.toBeNull();
});

test('[ST-REPLACE] a broken route is refused and changes nothing', async () => {
  await saveTrip(trip());
  await readTrip();
  await fill();
  await expect(replaceRoute({ ...route(), points: 'nope' } as unknown as Route)).rejects.toThrow();
  await expect(replaceRoute({ ...route(), lengthKm: Number.NaN })).rejects.toThrow();
  expect(await counts()).toEqual(WITH_OLD);
});

test('[ST-REPLACE] saving a trip with a different line counts as replacing: no old data stays under the new route', async () => {
  await saveTrip(trip());
  await readTrip();
  await fill();
  localStorage.setItem('copilot:plan-tomorrow', JSON.stringify({ date: '2026-10-17' }));
  const other = trip({ route: route({ id: 'route-other', hash: 'other' }, 60) });
  await saveTrip(other);
  for (const [name, n] of Object.entries(await counts())) expect(n, name).toBe(0);
  expect(await readTrip()).toEqual(other);
  expect(localStorage.getItem('copilot:plan-tomorrow')).toBeNull();
});

test('[ST-REPLACE] final heights on the same line keep the prepared data (the hash and id change, the line does not)', async () => {
  await saveTrip(trip());
  const t = (await readTrip())!;
  await fill();
  await saveTrip({ ...t, route: { ...t.route, id: 'route-final', hash: 'final', points: t.route.points.map((p) => ({ ...p, ele: 300 })) } });
  expect(await counts()).toEqual(WITH_OLD);
});

test('[ST-REPLACE] after replacing the route this window can go on: it may write settings and the trip without reading again', async () => {
  await writeSettings({ nights: 3 });
  await saveTrip(trip());
  await readSettings();
  await replaceRoute(route({ id: 'route-new', hash: 'new' }, 50));
  const r = await writeSettings({ theme: 'dark', flatKph: 30 });
  expect(r).toMatchObject({ ok: true, newer: [] });
  expect((await readSettings()).nights).toBeNull();
});

test('[ST-REPLACE] replacing the route does not hide from a window that settings changed elsewhere', async () => {
  await saveTrip(trip());
  await readSettings();
  // Another window's settings write, this window not having read it.
  localStorage.setItem('copilot:settings', JSON.stringify({ updatedAt: '2030-01-01T00:00:00.000Z', theme: 'light', nights: 2 }));
  await replaceRoute(route({ id: 'route-new', hash: 'new' }, 50));
  expect((await writeSettings({ theme: 'dark' })).newer).toEqual(['settings']);
});

test('[ST-SCHEMA] a connection the browser closed behind our back (a phone waking from the background) is opened again', async () => {
  await saveTrip(trip());
  (await openDb()).close();
  expect((await readTrip())?.route.id).toBe(trip().route.id);
});
