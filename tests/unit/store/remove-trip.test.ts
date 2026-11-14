// Remove this trip (owner's wish, 9 November 2026): the route, the trip and everything En route keeps for it go; bikes, setups,
// Bag planner plans, settings, the rider's details, rides and tyre details stay, byte for byte. What is left is a fresh start with
// the same settings: the same store, and the same Trip and En route.
import { beforeEach, expect, test } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { anotherWindow, dumpStorage, freshStore, route, trip } from './helpers.ts';
import { clearCopies, RefusedError } from '../../../src/store/changed.ts';
import { closeDb, openDb, ROUTE_META_PREFIX, ROUTE_STORES, STORES } from '../../../src/store/db.ts';
import { readInputs } from '../../../src/store/inputs.ts';
import { addPosition, confirmWater, readPlanTomorrow, setPlanTomorrow } from '../../../src/store/positions.ts';
import { saveForecast, saveHours, savePrepared, saveZones } from '../../../src/store/prepared.ts';
import { PREP_TICKS_KEY, readTicks, setTick } from '../../../src/store/prep-ticks.ts';
import { NotPutBackError, removeTrip, TRIP_KEYS } from '../../../src/store/remove-trip.ts';
import { readSettings, writeSettings } from '../../../src/store/settings.ts';
import { DEFAULT_SETTINGS } from '../../../src/store/rules.ts';
import { saveStretch } from '../../../src/store/stretch.ts';
import { PLAN_TOMORROW_KEY, readTrip, replaceRoute, saveTrip } from '../../../src/store/trip.ts';
import { HANDOFF_KEY, HANDOFF_STORE } from '../../../src/ui/trip/handoff.ts';
import { HEIGHTS_FLAG } from '../../../src/ui/trip/services.ts';
import { browserTripServices } from '../../../src/ui/trip/services.ts';
import { prepareTrip } from '../../../src/data/prepare.ts';
import { W } from '../../../src/core/wording/en.ts';
import { pos } from '../../fixtures/build.ts';
import { fixtureBuild, fixtureTrip, PackServer } from '../data/pack-server.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

beforeEach(freshStore);

const NOW = new Date('2026-10-17T10:00:00Z');

type Dump = Record<string, [IDBValidKey, unknown][]>;

/** Every store's keys and values, in key order. */
async function dumpDb(): Promise<Dump> {
  const db = await openDb();
  const out: Dump = {};
  for (const name of [...db.objectStoreNames].sort()) {
    const keys = await db.getAllKeys(name);
    const values = await db.getAll(name);
    out[name] = keys.map((k, i) => [k, values[i]]);
  }
  return out;
}

const json = (x: unknown): string => JSON.stringify(x);

/** What the bag planner and the rest of the rider's phone keep: none of it is the trip's. */
const KEPT_LOCAL: Record<string, string> = {
  'loadcheck:draft': JSON.stringify({ bags: [1, 2, 3], 'ünï': 'ß' }),
  'loadcheck:bikeProfiles': JSON.stringify([{ id: 'bike_a', name: 'Red' }]),
  'loadcheck:setups': JSON.stringify([{ id: 'setup_1', name: 'Weekend' }]),
  'loadcheck:plans': JSON.stringify([{ id: 'plan_1' }]),
  'loadcheck:summary:v1': '{"v":1}',
  'loadcheck:theme:v1': JSON.stringify({ app: 'loadcheck', kind: 'theme', v: 1, theme: 'light', at: '2026-10-01T00:00:00.000Z' }),
  'copilot:theme:v1': JSON.stringify({ app: 'copilot', kind: 'theme', v: 1, theme: 'dark', at: '2026-10-02T00:00:00.000Z' }),
  'copilot:bikeChoice:v1': JSON.stringify({ app: 'copilot', kind: 'bike-choice', v: 1, bikeId: 'bike_a', at: '2026-10-02T00:00:00.000Z' }),
  'copilot:tyre:v1': JSON.stringify({ v: 1, entries: {} }),
  'copilot:share-progress': 'yes',
  'copilot:camp-water-before': '2',
  'copilot:moved-card': '{"seen":true}',
  'copilot:delete-request:v1': JSON.stringify({ app: 'copilot', kind: 'delete-request', v: 1 }),
  'someone-else': 'x',
};

/** A phone in the middle of a trip: everything Prepare this route and En route keep, the handoff, and all that is not the trip's. */
async function tripPhone(): Promise<void> {
  await readTrip();
  await saveTrip(trip({ pace: 'hard' }));
  await readSettings();
  await writeSettings({ theme: 'dark', nights: 2, flatKph: 27 });
  const t = (await readTrip())!;
  const id = t.route.id;
  await saveZones(id, [{ fromKm: 0, toKm: Infinity, timeZone: 'Europe/Berlin', country: 'DE', holidayZone: null }]);
  await saveHours(id, [{ placeId: 'node/1', windowStart: NOW, windowEnd: NOW, spans: [] } as never]);
  await saveForecast(id, { fetchedAt: NOW, runs: [], grid: [], has15: false }, NOW);
  await savePrepared(id, { at: NOW, steps: [], build: null, forecastFetchedAt: NOW, baselineYears: null });
  await addPosition(pos({ km: 10, at: '2026-10-17 11:00' }), NOW, id);
  await confirmWater(1.5, NOW);
  const db = await openDb();
  await db.add('matches', { placeId: 'node/1', km: 3 });
  await db.put('places', { id: 'node/1', kind: 'water' });
  await db.add('roofs', { lat: 49, lon: 8 });
  await db.add('rescuePoints', { lat: 49, lon: 8, name: 'R1' });
  await db.put('baseline', { years: '2021–2025', points: [] }, 'current');
  await db.put('dayStarts', { day: '2026-10-17', km: 3 });
  await db.put('savedTiles', { places: 1 }, '12/1/1');
  await db.put('meta', '2026-10-17', `${ROUTE_META_PREFIX}routeEnd`);
  await db.put('meta', { buildId: 'b1' }, `${ROUTE_META_PREFIX}packRun`);
  // The rider's own, which stay.
  await db.put('meta', { weightKg: 70, thirst: 'more', ebike: false, capacityL: 2, k: 1.1, sumW: 1, kDrink: 1, weighedRides: 1 }, 'profile');
  await db.put('meta', '2026-10-01T00:00:00.000Z', 'updatedAt:profile');
  await db.add('calibration', { at: new Date('2026-10-01T10:00:00Z'), predictedL: 2, intakeL: 2.5, feel: 'B' });
  await db.put('meta', '2026-10-02T11:00:00.000Z', 'updatedAt:calibration');
  await db.put('meta', { byBike: { bike_a: { front: 2.1, rear: 2.4 } } }, 'tyres');
  await db.put('meta', { granted: true, at: NOW }, 'storagePersist');
  await db.put('meta', { notBefore: NOW, busyUntil: null, owner: null }, 'overpass');
  // Plan bags for this trip's handoff: the route as GPX, and its envelope.
  await db.put(HANDOFF_STORE, { id: 'h1', gpx: '<gpx/>', createdAt: NOW.toISOString() }, 'h1');
  localStorage.setItem(HANDOFF_KEY, JSON.stringify({ id: 'h1' }));
  localStorage.setItem(HEIGHTS_FLAG, JSON.stringify({ n: 2, a: [0, 0], b: [1, 1] }));
  expect(setPlanTomorrow('2026-10-18')).toBe(true);
  for (const [k, v] of Object.entries(KEPT_LOCAL)) localStorage.setItem(k, v);
  sessionStorage.setItem('wf:toolsBike', JSON.stringify(['bike_a']));
}

const withoutChanged = (dump: string): string => JSON.stringify((JSON.parse(dump) as [string, string][]).filter(([k]) => k !== 'copilot:changed'));

/** The store as a fresh start with the same rider would have it: the trip's parts taken out of `before`, and nothing else. */
function freshOf(before: Dump): Dump {
  const out: Dump = {};
  for (const [name, rows] of Object.entries(before)) {
    if (ROUTE_STORES.includes(name) || name === 'trip' || name === HANDOFF_STORE) out[name] = [];
    else if (name === 'meta') out[name] = rows.filter(([k]) => !String(k).startsWith(ROUTE_META_PREFIX) && k !== 'updatedAt:trip');
    else out[name] = rows;
  }
  return out;
}

/** The same rider on a phone that never had a trip: the given store written into a new database, and the same keys. */
async function freshPhone(db: Dump, local: string): Promise<void> {
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  const opened = await openDb();
  for (const [name, rows] of Object.entries(db)) for (const [k, v] of rows) await opened.put(name, v, opened.transaction(name).store.keyPath === null ? k : undefined);
  for (const [k, v] of JSON.parse(local) as [string, string][]) localStorage.setItem(k, v);
}

// Before you leave's ticks are the trip's too (Trip prep; the coordinator's ruling on PR 155: Remove this trip clears them).
test('[TRIP-REMOVE] the trip keys are the ones the app writes: the plan for tomorrow, the looked-up heights mark, the handoff envelope and the prep ticks', () => {
  expect([...TRIP_KEYS].sort()).toEqual([HANDOFF_KEY, HEIGHTS_FLAG, PLAN_TOMORROW_KEY, PREP_TICKS_KEY].sort());
  // Every store is either the trip's or the rider's: a store added later must be put on one side.
  expect([...STORES].sort()).toEqual([...ROUTE_STORES, 'trip', 'calibration', 'meta', HANDOFF_STORE].sort());
});

test('[TRIP-REMOVE] the route, the trip and all En route keeps go; the rest of the phone is byte-identical, and it equals a fresh start', async () => {
  await tripPhone();
  const beforeDb = await dumpDb();
  const beforeLocal = dumpStorage();
  const settingsBefore = localStorage.getItem('copilot:settings');
  const beforeSession = sessionStorage.getItem('wf:toolsBike');
  // The trip's parts are really there before.
  for (const name of [...ROUTE_STORES, 'trip', HANDOFF_STORE]) expect(beforeDb[name]!.length, name).toBeGreaterThan(0);

  await removeTrip(trip().route);

  const afterDb = await dumpDb();
  expect(json(afterDb)).toBe(json(freshOf(beforeDb)));
  // The nights go back to a fresh start's (the owner's ruling of 9 Nov 2026, as a replaced route); every other setting stays as it was.
  expect(settingsBefore).toContain('"nights":2');
  const settingsAfter = JSON.parse(localStorage.getItem('copilot:settings')!) as Record<string, unknown>;
  const { nights: n0, updatedAt: u0, ...rest0 } = JSON.parse(settingsBefore!) as Record<string, unknown>;
  const { nights: n1, updatedAt: u1, ...rest1 } = settingsAfter;
  expect(n0).toBe(2);
  expect(n1).toBe(DEFAULT_SETTINGS.nights);
  expect(JSON.stringify(rest1)).toBe(JSON.stringify(rest0));
  expect(Object.keys(settingsAfter)).toEqual(Object.keys(JSON.parse(settingsBefore!) as object));
  // A new version, so another window reads the settings again before it writes over them.
  expect(Date.parse(u1 as string)).toBeGreaterThan(Date.parse(u0 as string));
  // The theme, the chosen bike, tyre details and every bag-planner key: untouched, byte for byte.
  for (const [k, v] of Object.entries(KEPT_LOCAL)) expect(localStorage.getItem(k), k).toBe(v);
  for (const k of TRIP_KEYS) expect(localStorage.getItem(k), k).toBeNull();
  const expectedLocal = (JSON.parse(beforeLocal) as [string, string][]).filter(([k]) => !TRIP_KEYS.includes(k) && k !== 'copilot:changed' && k !== 'copilot:settings');
  expect(JSON.stringify((JSON.parse(withoutChanged(dumpStorage())) as [string, string][]).filter(([k]) => k !== 'copilot:settings'))).toBe(JSON.stringify(expectedLocal));
  expect(sessionStorage.getItem('wf:toolsBike')).toBe(beforeSession);
  sessionStorage.clear();

  // Trip and En route read exactly what a phone that never had this trip reads.
  const services = browserTripServices(() => NOW);
  const removed = await services.load();
  expect(await readInputs(NOW)).toBeNull();
  const localNow = withoutChanged(dumpStorage());
  await freshPhone(freshOf(beforeDb), localNow);
  expect(json(await dumpDb())).toBe(json(afterDb));
  const fresh = await browserTripServices(() => NOW).load();
  expect(await readInputs(NOW)).toBeNull();
  expect({ ...removed, storageMb: null }).toEqual({ ...fresh, storageMb: null });
  expect(removed.trip).toBeNull();
});

test('[TRIP-REMOVE] after it, a new route starts clean: none of the old trip comes back with it', async () => {
  await tripPhone();
  await removeTrip(trip().route);
  await readTrip();
  await saveTrip(trip({ route: route({ id: 'next', hash: 'next' }, 60) }));
  const i = (await readInputs(NOW))!;
  expect(i.positions).toEqual([]);
  expect(i.waterLeft).toBeNull();
  expect(i.forecast).toBeNull();
  expect(i.places).toEqual([]);
  expect(i.trip.route.id).toBe('next');
  expect((await readSettings()).nights).toBeNull();
});

test('[TRIP-REMOVE] nights already left to the stage model: the settings are not written at all, byte for byte', async () => {
  await tripPhone();
  await readSettings();
  await writeSettings({ nights: null });
  const before = localStorage.getItem('copilot:settings');
  await removeTrip(trip().route);
  expect(localStorage.getItem('copilot:settings')).toBe(before);
});

test('[TRIP-REMOVE-WINDOWS] another window that read the nights before can not write them back without reading again', async () => {
  await tripPhone();
  const other = await anotherWindow();
  await other.settings.readSettings();
  await removeTrip(trip().route);
  const result = await other.settings.writeSettings({ nights: 2 });
  expect(result.newer).toContain('settings');
  expect((await readSettings()).nights).toBeNull();
  closeDb();
});

test('[TRIP-REMOVE] a phone with no trip (removed in another window already) still ends clean, and nothing else changes', async () => {
  for (const [k, v] of Object.entries(KEPT_LOCAL)) localStorage.setItem(k, v);
  const before = dumpStorage();
  await removeTrip(null);
  expect(withoutChanged(dumpStorage())).toBe(withoutChanged(before));
  expect(await readTrip()).toBeNull();
});

test('[TRIP-REMOVE-FAIL] the route changed in another window since the question: nothing is removed, and the rider is told why', async () => {
  await tripPhone();
  const other = await anotherWindow();
  await other.trip.readTrip();
  await other.trip.replaceRoute(route({ id: 'other', hash: 'other', points: route().points.map((p) => ({ ...p, lat: p.lat + 0.5 })) }));
  const beforeDb = json(await dumpDb());
  const beforeLocal = dumpStorage();
  const e = await removeTrip(trip().route).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(RefusedError);
  expect((e as Error).message).toBe(W.appStoreChangedElsewhere);
  expect(json(await dumpDb())).toBe(beforeDb);
  expect(dumpStorage()).toBe(beforeLocal);
  closeDb();
});

test('[TRIP-REMOVE-FAIL] the database refuses half-way: everything is as it was, the keys put back too, and the error reaches the caller', async () => {
  await tripPhone();
  const beforeDb = json(await dumpDb());
  const beforeLocal = dumpStorage();
  // The handoffs store is emptied last: it fails after the route's stores were cleared in the same transaction.
  const proto = Object.getPrototypeOf((await openDb()).transaction(HANDOFF_STORE).store) as { clear: () => unknown };
  const real = proto.clear;
  let cleared = 0;
  proto.clear = function (this: unknown) {
    cleared += 1;
    if ((this as { name?: string }).name === HANDOFF_STORE) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    return real.call(this);
  };
  try {
    await expect(removeTrip(trip().route)).rejects.toMatchObject({ name: 'QuotaExceededError' });
  } finally {
    proto.clear = real;
  }
  expect(cleared).toBeGreaterThan(1);
  expect(json(await dumpDb())).toBe(beforeDb);
  expect(dumpStorage()).toBe(beforeLocal);
  // Trip and En route still read the whole trip.
  expect((await readTrip())?.route.id).toBe(trip().route.id);
  expect((await readInputs(NOW))?.positions.length).toBe(1);
});

test('[TRIP-REMOVE-FAIL] the browser refuses to remove a key: nothing is removed, and the error reaches the caller', async () => {
  await tripPhone();
  const beforeDb = json(await dumpDb());
  const beforeLocal = dumpStorage();
  const realRemove = localStorage.removeItem.bind(localStorage);
  let removed = 0;
  localStorage.removeItem = (k: string) => {
    if (removed++ === 1) throw new DOMException('refused', 'SecurityError');
    realRemove(k);
  };
  try {
    await expect(removeTrip(trip().route)).rejects.toMatchObject({ name: 'SecurityError' });
  } finally {
    localStorage.removeItem = realRemove;
  }
  expect(json(await dumpDb())).toBe(beforeDb);
  expect(dumpStorage()).toBe(beforeLocal);
});

test('[TRIP-REMOVE-WINDOWS] another window is told, reads no trip, and can not write the old trip or anything of it back', async () => {
  await tripPhone();
  const other = await anotherWindow();
  const seen = (await other.trip.readTrip())!;
  const events: string[] = [];
  const realSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k: string, v: string) => { if (k === 'copilot:changed') events.push(v); realSet(k, v); };
  try {
    await removeTrip(trip().route);
  } finally {
    localStorage.setItem = realSet;
  }
  expect(events.some((v) => v.includes('"all"'))).toBe(true);

  // Its whole old trip, written back: refused, as a version it has not read.
  await expect(other.trip.saveTrip(seen)).rejects.toMatchObject({ section: 'trip' });
  // Its settings write keeps to the settings: no trip comes with it.
  await other.settings.readSettings();
  await other.settings.writeSettings({ startTime: '09:00' });
  expect(await other.trip.readTrip()).toBeNull();
  // Whatever was still on its way for the old route is refused or kept out.
  const id = seen.route.id;
  expect((await addPosition(pos({ km: 12, at: '2026-10-17 11:30' }), NOW, id)).kept).toBe(false);
  await expect(saveForecast(id, { fetchedAt: NOW, runs: [], grid: [], has15: false }, NOW)).rejects.toThrow();
  await expect(saveHours(id, [])).rejects.toThrow();
  await expect(savePrepared(id, { at: NOW, steps: [], build: null, forecastFetchedAt: null, baselineYears: null })).rejects.toThrow();
  expect(await saveStretch(id, { places: [], roofs: [], rescuePoints: [], matches: [], hours: [], fromKm: 0, toKm: 10 } as never)).toBe(false);
  const db = await dumpDb();
  for (const name of [...ROUTE_STORES, 'trip', HANDOFF_STORE]) expect(db[name], name).toEqual([]);
  expect(db.meta!.filter(([k]) => String(k).startsWith(ROUTE_META_PREFIX) || k === 'updatedAt:trip')).toEqual([]);
  closeDb();
});

const boundaryText = readFileSync(fileURLToPath(new URL('../../../public/data/boundaries.v1.json', import.meta.url)), 'utf8');

test('[TRIP-REMOVE-WINDOWS] Prepare this route under way when the trip is removed: it stops at its next step and leaves nothing behind', async () => {
  const t = await fixtureTrip('heidelberg-strasbourg');
  await readTrip();
  await saveTrip(t);
  const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
  let removing: Promise<void> | null = null;
  let tilesAfter = 0;
  server.intercept = (url) => {
    if (!url.includes('/t/')) return null;
    if (removing) tilesAfter += 1;
    else removing = removeTrip(t.route);
    return null;
  };
  const reports = await prepareTrip({
    fetch: async (input, init) => {
      const url = String(input);
      if (url === '/') return new Response(null, { status: 200 });
      if (url === '/data/boundaries.v1.json') return new Response(boundaryText);
      return server.fetch(input, init);
    },
    now: () => NOW, sleep: async () => undefined, nav: {},
    fetchForecast: async () => { throw new Error('not asked'); },
    fetchBaseline: async () => { throw new Error('not asked'); },
    fetchElevation: async (points) => points.map(() => 200),
  }, () => undefined);
  await removing;
  expect(removing).not.toBeNull();
  expect(reports.at(-1)?.note).toBe(W.appPrepRouteReplaced);
  // No more than the batch that was on its way when the trip went.
  expect(tilesAfter).toBeLessThan(8);
  const db = await dumpDb();
  for (const name of [...ROUTE_STORES, 'trip', HANDOFF_STORE]) expect(db[name], name).toEqual([]);
  expect(db.meta!.filter(([k]) => String(k).startsWith(ROUTE_META_PREFIX) || k === 'updatedAt:trip')).toEqual([]);
});

test('[TRIP-REMOVE] it waits for writes under way in this window, so none lands after it', async () => {
  await tripPhone();
  const t = (await readTrip())!;
  const late = replaceRoute({ ...t.route, name: 'renamed' });
  await removeTrip(t.route);
  await late;
  // The replace finished first, so it was removed with the rest.
  expect(await readTrip()).toBeNull();
});

test('[TRIP-REMOVE-FAIL] the browser refuses the settings without the nights: nothing is removed, the nights stay, and the rider is told', async () => {
  await tripPhone();
  const beforeDb = json(await dumpDb());
  const beforeLocal = dumpStorage();
  const realSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k: string, v: string) => {
    if (k === 'copilot:settings') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    realSet(k, v);
  };
  try {
    await expect(removeTrip(trip().route)).rejects.toThrow(W.appStoreNotKept);
  } finally {
    localStorage.setItem = realSet;
  }
  expect(json(await dumpDb())).toBe(beforeDb);
  expect(withoutChanged(dumpStorage())).toBe(withoutChanged(beforeLocal));
  expect((await readSettings()).nights).toBe(2);
});

// Review of PR 86, M1: a tap in another window that had not yet heard of the removal.
test('[TRIP-REMOVE-WINDOWS] a late Plan tomorrow or water amount from another window never reaches the next route', async () => {
  await tripPhone();
  await removeTrip(trip().route);
  expect(setPlanTomorrow('2026-10-18')).toBe(true);
  // No trip, no water amount to keep: refused, and nothing is written.
  expect((await confirmWater(1, NOW)).ok).toBe(false);
  expect(await (await openDb()).count('waterLeft')).toBe(0);
  await readTrip();
  await saveTrip(trip({ route: route({ id: 'next', hash: 'next' }, 60) }));
  expect(readPlanTomorrow()).toBeNull();
  expect((await readInputs(NOW))!.waterLeft).toBeNull();
});

// Review of PR 86, M4: what can not be put back is said, never "nothing was changed".
test('[TRIP-REMOVE-FAIL] the database refuses and the nights can not be put back: the error says so', async () => {
  await tripPhone();
  const proto = Object.getPrototypeOf((await openDb()).transaction(HANDOFF_STORE).store) as { clear: () => unknown };
  const real = proto.clear;
  proto.clear = function (this: { name?: string }) {
    if (this.name === HANDOFF_STORE) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    return real.call(this);
  };
  const realSet = localStorage.setItem.bind(localStorage);
  let writes = 0;
  localStorage.setItem = (k: string, v: string) => {
    // The first write of the settings (the nights cleared) goes through; putting them back is refused.
    if (k === 'copilot:settings' && writes++ > 0) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    realSet(k, v);
  };
  try {
    const e = await removeTrip(trip().route).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(NotPutBackError);
  } finally {
    proto.clear = real;
    localStorage.setItem = realSet;
  }
  // The trip itself is whole.
  expect((await readTrip())?.route.id).toBe(trip().route.id);
});

test("[TRIP-PREP-TICKS] [TRIP-REMOVE] Remove this trip clears Before you leave's ticks, so the same route added again starts unticked; refused, they are put back", async () => {
  await tripPhone();
  const id = trip().route.id;
  expect(setTick(id, 'kit', true)).toEqual(['kit']);
  // the database refuses half-way: the ticks are put back with the other keys
  const proto = Object.getPrototypeOf((await openDb()).transaction(HANDOFF_STORE).store) as { clear: () => unknown };
  const real = proto.clear;
  proto.clear = function (this: unknown) {
    if ((this as { name?: string }).name === HANDOFF_STORE) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    return real.call(this);
  };
  try {
    await expect(removeTrip(trip().route)).rejects.toMatchObject({ name: 'QuotaExceededError' });
  } finally {
    proto.clear = real;
  }
  expect(readTicks(id)).toEqual(['kit']);
  // removed: the key is gone, and the very same route saved again has no ticks
  await removeTrip(trip().route);
  expect(localStorage.getItem(PREP_TICKS_KEY)).toBeNull();
  await saveTrip(trip());
  expect((await readTrip())?.route.id).toBe(id);
  expect(readTicks(id)).toEqual([]);
});
