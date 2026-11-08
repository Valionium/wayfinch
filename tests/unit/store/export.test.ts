import { beforeEach, expect, test } from 'vitest';
import { anotherWindow, dumpStorage, freshStore, generatedTrip, route, trip } from './helpers.ts';
import fc from 'fast-check';
import { closeDb, DB_NAME, openDb, ROUTE_META_PREFIX, ROUTE_STORES } from '../../../src/store/db.ts';
import { deleteCopilotData, exportAll, importAll } from '../../../src/store/export.ts';
import type { ExportFile } from '../../../src/store/export.ts';
import { HOLIDAYS_META, readInputs } from '../../../src/store/inputs.ts';
import { addPosition, confirmWater, setPlanTomorrow } from '../../../src/store/positions.ts';
import { readProfile } from '../../../src/store/profile.ts';
import { readSettings, writeSettings } from '../../../src/store/settings.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';
import { pos } from '../../fixtures/build.ts';

beforeEach(freshStore);

const NOW = new Date('2026-10-17T10:00:00Z');
const SECTIONS = ['profile', 'trip', 'settings', 'calibration', 'tyres'] as const;

/** Everything a rider's phone can hold, the things that may not travel among them. */
async function fullPhone(): Promise<void> {
  await saveTrip(trip({ pace: 'hard' }));
  await readSettings();
  await writeSettings({ theme: 'dark', nights: 2, flatKph: 27 });
  const db = await openDb();
  await db.put('meta', { weightKg: 70, thirst: 'more', ebike: false, capacityL: 2, k: 1.1, sumW: 1, kDrink: 1, weighedRides: 1 }, 'profile');
  await db.put('meta', '2026-10-01T00:00:00.000Z', 'updatedAt:profile');
  await db.add('calibration', { at: new Date('2026-10-01T10:00:00Z'), predictedL: 2, intakeL: 2.5, feel: 'B' });
  await db.add('calibration', { at: new Date('2026-10-02T10:00:00Z'), predictedL: 1, intakeL: null, feel: null, massLossKg: 1, toiletStops: 2 });
  await db.put('meta', '2026-10-02T11:00:00.000Z', 'updatedAt:calibration');
  await db.put('meta', { byBike: { bike_a: { front: 2.1, rear: 2.4 } } }, 'tyres');
  await db.put('meta', '2026-10-03T00:00:00.000Z', 'updatedAt:tyres');
  await addPosition(pos({ km: 10, at: '2026-10-17 11:00' }), NOW, 'test-route');
  await confirmWater(1.5, NOW);
  await db.put('dayStarts', { day: '2026-10-17', km: 3 });
  await db.put('meta', '2026-10-17', `${ROUTE_META_PREFIX}routeEnd`);
  await db.put('places', { id: 'node/1', kind: 'water' });
  setPlanTomorrow('2026-10-17');
}

const hasKey = (value: unknown, names: string[]): string | null => {
  if (Array.isArray(value)) { for (const v of value) { const f = hasKey(v, names); if (f) return f; } return null; }
  if (typeof value !== 'object' || value === null) return null;
  for (const [k, v] of Object.entries(value)) {
    if (names.includes(k)) return k;
    const f = hasKey(v, names);
    if (f) return f;
  }
  return null;
};

const FORBIDDEN = ['positions', 'checkIns', 'dayStarts', 'routeEndDate', 'routeEnd', 'waterLeft', 'litres', 'planTomorrow', 'plan-tomorrow', 'places', 'matches', 'hours', 'forecast', 'baseline', 'savedTiles', 'savedKm', 'handoffs', 'accuracyM'];

test('[ST-EXPORT] the file names the app, the kind and the version, and each section has its updatedAt', async () => {
  await fullPhone();
  const file = await exportAll();
  expect(file).toMatchObject({ app: 'copilot', kind: 'export', v: 1 });
  for (const s of SECTIONS) expect(typeof file[s]?.updatedAt, s).toBe('string');
  expect(file.trip).toMatchObject({ pace: 'hard', flatKph: 27, route: { id: trip().route.id } });
  expect(file.settings).toMatchObject({ theme: 'dark', nights: 2 });
  expect(file.calibration.rides).toHaveLength(2);
  expect(file.tyres.byBike).toEqual({ bike_a: { front: 2.1, rear: 2.4 } });
});

test('[ST-EXPORT] export then import on empty storage is byte-identical in its sections', async () => {
  await fullPhone();
  const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
  freshStore();
  expect((await importAll(file)).ok).toBe(true);
  const again = await exportAll();
  for (const s of SECTIONS) expect(JSON.stringify(again[s]), s).toBe(JSON.stringify(file[s]));
  expect(JSON.stringify(again)).toBe(JSON.stringify(file));

  // And what came back is usable as itself.
  expect((await readTrip())?.pace).toBe('hard');
  expect((await readProfile()).thirst).toBe('more');
  expect((await readInputs(NOW))?.trip.flatKph).toBe(27);
  const rides = (await (await openDb()).getAll('calibration')) as { at: Date }[];
  expect(rides[0]!.at).toBeInstanceOf(Date);
});

test('[ST-EXPORT] byte-identical for generated trips too, and an empty phone exports and imports nothing', async () => {
  const empty = await exportAll();
  expect(empty.trip).toBeNull();
  freshStore();
  expect((await importAll(JSON.parse(JSON.stringify(empty)) as ExportFile)).ok).toBe(true);
  expect(await readTrip()).toBeNull();
  expect(JSON.stringify(await exportAll())).toBe(JSON.stringify(empty));

  await fc.assert(fc.asyncProperty(generatedTrip(), async (t) => {
    freshStore();
    await saveTrip(t);
    const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
    freshStore();
    expect((await importAll(file)).ok).toBe(true);
    expect(JSON.stringify((await exportAll()).trip)).toBe(JSON.stringify(file.trip));
  }), { numRuns: 25 });
});

test('[ST-EXPORT] no forbidden field in an export, whatever the phone holds', async () => {
  await fullPhone();
  const file = await exportAll();
  expect(hasKey(file, FORBIDDEN)).toBeNull();
  expect(JSON.stringify(file)).not.toContain('2026-10-17T10:00:00'); // the time of the water, the position's day start
});

test('[ST-EXPORT] forbidden fields in a file never get in: unknown fields are left out', async () => {
  const file = JSON.parse(JSON.stringify(await (async () => { await saveTrip(trip()); return exportAll(); })())) as ExportFile & Record<string, unknown>;
  freshStore();
  const tampered = {
    ...file, positions: [pos({ km: 1, at: '2026-10-17 10:00' })], waterLeft: { litres: 9 },
    trip: { ...file.trip, positions: ['x'], route: { ...file.trip!.route, dayStarts: ['y'] } },
    settings: { ...file.settings, waterLeft: 3 },
  } as unknown as ExportFile;
  expect((await importAll(tampered)).ok).toBe(true);
  expect(hasKey(await exportAll(), FORBIDDEN)).toBeNull();
  expect(await (await openDb()).count('positions')).toBe(0);
});

test('[ST-EXPORT] a bad version or shape writes nothing and says why', async () => {
  await saveTrip(trip());
  await writeSettings({ theme: 'dark' });
  const good = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
  freshStore();
  const before = dumpStorage();
  const bad: [string, unknown][] = [
    ['null', null], ['text', 'hello'], ['array', []],
    ['other app', { ...good, app: 'load-check' }], ['other kind', { ...good, kind: 'route' }],
    ['newer version', { ...good, v: 2 }], ['no version', { ...good, v: undefined }],
    ['broken route', { ...good, trip: { ...good.trip, route: { ...good.trip!.route, points: 'x' } } }],
    ['bad speed', { ...good, trip: { ...good.trip, flatKph: 400 } }],
    ['bad time', { ...good, trip: { ...good.trip, startTime: '99:00' } }],
    ['bad setting', { ...good, settings: { ...good.settings, flatKph: 400 } }],
    ['bad stamp', { ...good, settings: { ...good.settings, updatedAt: 7 } }],
    ['bad profile', { ...good, profile: { ...good.profile, k: 'x' } }],
    ['bad rides', { ...good, calibration: { ...good.calibration, rides: 'x' } }],
    ['bad tyres', { ...good, tyres: { updatedAt: good.tyres.updatedAt, byBike: 3 } }],
    ['section missing', { ...good, tyres: undefined }],
  ];
  for (const [name, file] of bad) {
    const r = await importAll(file);
    expect(r.ok, name).toBe(false);
    expect(r.reason, name).toBeTruthy();
    expect(await readTrip(), name).toBeNull();
    expect(dumpStorage(), name).toBe(before);
  }
});

test('[ST-EXPORT] a bad section leaves good sections unwritten on a phone already in use', async () => {
  await saveTrip(trip({ campWaterL: 1 }));
  const good = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
  const r = await importAll({ ...good, trip: { ...good.trip!, campWaterL: 4 }, settings: { ...good.settings, theme: 'blue' } });
  expect(r.ok).toBe(false);
  expect((await readTrip())?.campWaterL).toBe(1);
});

test('[ST-EXPORT] importing another route over a trip removes the old route\'s data; the same route keeps it', async () => {
  await fullPhone();
  const same = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
  expect((await importAll(same)).ok).toBe(true);
  const db = await openDb();
  expect(await db.count('places')).toBe(1);
  expect(await db.count('positions')).toBe(1);

  const other = { ...same, trip: { ...same.trip!, route: route({ id: 'route-other', hash: 'other' }, 60), updatedAt: '2026-10-20T00:00:00.000Z' } };
  expect((await importAll(JSON.parse(JSON.stringify(other)))).ok).toBe(true);
  for (const name of ROUTE_STORES) expect(await db.count(name), name).toBe(0);
  expect(await db.get('meta', `${ROUTE_META_PREFIX}routeEnd`)).toBeUndefined();
  expect(localStorage.getItem('copilot:plan-tomorrow')).toBeNull();
  expect((await readTrip())?.route.id).toBe('route-other');
});

test('[ST-EXPORT] after an import, a window that had read the older data must read again before it writes', async () => {
  await saveTrip(trip());
  const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
  const other = await anotherWindow();
  const seen = (await other.trip.readTrip())!;
  await other.trip.saveTrip({ ...seen, campWaterL: 4 }); // later than the file
  await readTrip();
  expect((await importAll(file)).ok).toBe(true); // older than what the other window holds
  await expect(other.trip.saveTrip({ ...seen, campWaterL: 1 })).rejects.toMatchObject({ section: 'trip' });
  expect((await readTrip())?.campWaterL).toBe(2);
});

test('[ST-DELETE] delete removes every copilot key and the database, and no loadcheck key', async () => {
  await fullPhone();
  localStorage.setItem('copilot:share-progress', 'yes');
  localStorage.setItem('copilot:handoff:v1', '{}');
  const request = JSON.stringify({ app: 'copilot', kind: 'delete-request', v: 1 });
  localStorage.setItem('copilot:delete-request:v1', request);
  const plan = JSON.stringify({ bags: [1, 2, 3], 'ünï': 'ß' });
  localStorage.setItem('loadcheck:draft', plan);
  localStorage.setItem('loadcheck:summary:v1', '{"v":1}');
  localStorage.setItem('someone-else', 'x');

  await deleteCopilotData();

  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)!);
  // A pending request to delete the bag planner's data stays (Contract 3), or the plans the rider asked to erase would stay.
  expect(keys.sort()).toEqual(['copilot:delete-request:v1', 'loadcheck:draft', 'loadcheck:summary:v1', 'someone-else']);
  expect(localStorage.getItem('copilot:delete-request:v1')).toBe(request);
  expect(localStorage.getItem('loadcheck:draft')).toBe(plan);
  expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(DB_NAME);
});

// Review of PR 70, M3: the bike Tools drew for this tab (wf:toolsBike, sessionStorage) holds bike ids and would draw a deleted choice.
test("[ST-DELETE] delete also removes Wayfinch's own keys of this tab (wf:*), and no other", async () => {
  sessionStorage.setItem('wf:toolsBike', JSON.stringify(['bike_red', 'bike_pink']));
  sessionStorage.setItem('someone-else', 'x');
  await deleteCopilotData();
  expect(sessionStorage.getItem('wf:toolsBike')).toBeNull();
  expect(sessionStorage.getItem('someone-else')).toBe('x');
  sessionStorage.clear();
});

test('[ST-DELETE] the other windows let go, are told, and can not bring old data back', async () => {
  await saveTrip(trip());
  const other = await anotherWindow();
  const seen = (await other.trip.readTrip())!; // its connection is open
  const events: (string | null)[] = [];
  const realSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k: string, v: string) => { if (k === 'copilot:changed') events.push(v); realSet(k, v); };

  await deleteCopilotData();

  expect(events.some((v) => v?.includes('"all"'))).toBe(true);
  expect(localStorage.getItem('copilot:changed')).toBeNull();
  localStorage.setItem = realSet;
  expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(DB_NAME);

  await expect(other.trip.saveTrip(seen)).rejects.toMatchObject({ section: 'trip' });
  expect(await other.trip.readTrip()).toBeNull();
  closeDb();
});

test('[ST-DELETE] after deleting, the app starts clean and works', async () => {
  await fullPhone();
  await deleteCopilotData();
  expect(await readTrip()).toBeNull();
  expect((await readSettings()).theme).toBe('auto');
  expect(await readInputs(NOW)).toBeNull();
  await saveTrip(trip());
  expect((await readTrip())?.campWaterL).toBe(2);
  expect((await openDb()).objectStoreNames.contains('positions')).toBe(true);
  expect(await (await openDb()).get('meta', HOLIDAYS_META)).toBeUndefined();
});

test('[ST-EXPORT] a stray field in a stored record does not leave the phone either', async () => {
  await saveTrip(trip());
  const db = await openDb();
  await db.put('trip', { ...trip(), positions: ['x'], route: { ...trip().route, dayStarts: ['y'] } }, 'current');
  await db.add('calibration', { at: new Date(0), predictedL: 1, intakeL: 1, feel: null, waterLeft: 3 });
  await db.put('meta', { ...(await readProfile()), litres: 2 }, 'profile');
  expect(hasKey(await exportAll(), FORBIDDEN)).toBeNull();
});

// Sub-project 11, group 2: the chosen bike travels in the settings, as the theme does.
test('[TB-EXPORT] settings.toolBike is in the file; a stored one comes back; a file without it, or with a bad id, imports and reads null', async () => {
  await fullPhone();
  expect((await exportAll()).settings).toMatchObject({ toolBike: null });
  await writeSettings({ toolBike: 'bike_b' });
  const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
  expect(file.settings).toMatchObject({ toolBike: 'bike_b', theme: 'dark' });
  freshStore();
  expect((await importAll(file)).ok).toBe(true);
  expect((await readSettings()).toolBike).toBe('bike_b');
  expect(JSON.stringify((await exportAll()).settings)).toBe(JSON.stringify(file.settings));
  // An export from before this sub-project has no such field: it imports, and the choice is none.
  const old = JSON.parse(JSON.stringify(file)) as { settings: Record<string, unknown> };
  delete old.settings.toolBike;
  freshStore();
  expect((await importAll(old)).ok).toBe(true);
  expect((await readSettings()).toolBike).toBeNull();
  expect((await readSettings()).theme).toBe('dark');
  // A bad id (wrong type, spaces, too long) is read as none; the rest of the file still comes in.
  for (const bad of [7, 'a b', 'x'.repeat(101), '', {}]) {
    freshStore();
    const odd = JSON.parse(JSON.stringify(file)) as { settings: Record<string, unknown> };
    odd.settings.toolBike = bad;
    expect((await importAll(odd)).ok, String(bad)).toBe(true);
    expect((await readSettings()).toolBike, String(bad)).toBeNull();
    expect((await readSettings()).theme).toBe('dark');
  }
  // The writer refuses a bad one too.
  await readSettings();
  expect((await writeSettings({ toolBike: 'a b' })).reasons.toolBike).toBeTruthy();
});
