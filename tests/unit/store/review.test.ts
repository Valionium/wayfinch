// What the fresh review of the store found: each test here failed before its fix.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { anotherWindow, freshStore, route, trip } from './helpers.ts';
import fc from 'fast-check';
import { dayRide } from '../../../src/core/engines/tripday.ts';
import { screen } from '../../../src/core/screen/screen.ts';
import type { Position, Trip } from '../../../src/core/types.ts';
import { flushWrites } from '../../../src/store/changed.ts';
import { CURRENT, openDb, ROUTE_META_PREFIX } from '../../../src/store/db.ts';
import { exportAll, importAll } from '../../../src/store/export.ts';
import type { ExportFile } from '../../../src/store/export.ts';
import { HOLIDAYS_META, keepAfterScreen, readInputs, ROUTE_END_META, SAVED_KM_META, ZONES_META } from '../../../src/store/inputs.ts';
import { addPosition, backToToday, confirmWater, keptPositions, readPlanTomorrow, setPlanTomorrow } from '../../../src/store/positions.ts';
import { readSettings, writeSettings } from '../../../src/store/settings.ts';
import { readTrip, replaceRoute, saveTrip } from '../../../src/store/trip.ts';
import { at, pos, sun, testTrip, zonesOf } from '../../fixtures/build.ts';
import { zonesOrDevice } from '../../../src/store/rules.ts';

/** Zones read as none: the phone's own zone stands in, as before Prepare this route (sweep of 14 Nov 2026, #1; was []). */
const NO_ZONES = zonesOrDevice([]);

beforeEach(freshStore);
afterEach(() => { vi.restoreAllMocks(); });

const ID = 'test-route';
async function onTrip(over: Partial<Trip> = {}): Promise<Trip> {
  const t = testTrip(over);
  await saveTrip(t);
  await (await openDb()).put('meta', zonesOf(t.route.lengthKm), ZONES_META);
  return t;
}
const rows = async (): Promise<unknown[]> => (await openDb()).getAll('positions');
const ride = (keepDayStart: { day: string; km: number } | null, routeEndReachedOn: string | null = null) => ({ ride: { keepDayStart, routeEndReachedOn } });

/** Every value written to `copilot:changed` while `work` runs. */
async function signals(work: () => Promise<unknown>): Promise<string[]> {
  const seen: string[] = [];
  const set = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k: string, v: string) => { if (k === 'copilot:changed') seen.push((JSON.parse(v) as { section: string }).section); set(k, v); };
  try { await work(); } finally { localStorage.setItem = set; }
  return seen;
}

describe('finding 1: a position measured on another route', () => {
  test('[ST-REPLACE] is refused, says so, and can not end a route not yet ridden', async () => {
    await onTrip();
    await readTrip();
    await replaceRoute(route({ id: 'route-new', hash: 'new' }, 50));
    await saveTrip({ ...(await readTrip())!, departureDate: '2026-10-17' });
    await (await openDb()).put('meta', zonesOf(50), ZONES_META);

    const now = at('2026-10-18 10:00');
    const result = await addPosition(pos({ km: 90, at: '2026-10-18 09:59' }), now, ID);

    expect(result).toEqual({ kept: false });
    expect(await rows()).toEqual([]);
    const s = screen({ ...(await readInputs(now))!, sun: sun() });
    expect(s.phase).not.toBe('route-end');
    expect(s.ride.routeEndReachedOn).toBeNull();
  });

  test('[ST-REPLACE] flips no water; with the right route it is kept, and says so', async () => {
    await onTrip();
    const t0 = at('2026-10-17 14:00');
    const later = at('2026-10-17 14:30');
    await confirmWater(1, t0);
    expect(await addPosition(pos({ km: 30, at: '2026-10-17 14:29' }), later, 'some-other-route')).toEqual({ kept: false });
    expect((await readInputs(later))!.waterLeft?.confirmed).toBe(true);
    expect(await addPosition(pos({ km: 30, at: '2026-10-17 14:29' }), later, ID)).toEqual({ kept: true });
    expect((await readInputs(later))!.waterLeft?.confirmed).toBe(false);
  });

  test('[ST-REPLACE] with no trip there is no route to measure on, and a kilometre beyond the route end is no position', async () => {
    const now = at('2026-10-17 14:00');
    expect(await addPosition(pos({ km: 30, at: '2026-10-17 13:59' }), now, ID)).toEqual({ kept: false });
    expect(await rows()).toEqual([]);
    await onTrip();
    expect(await addPosition(pos({ km: 302, at: '2026-10-17 13:59' }), now, ID)).toEqual({ kept: false });
    expect(await addPosition({ ...pos({ km: 30, at: '2026-10-17 13:59' }), km: -2 }, now, ID)).toEqual({ kept: false });
    expect(await rows()).toEqual([]);
    expect(await addPosition(pos({ km: 300, at: '2026-10-17 13:59' }), now, ID)).toEqual({ kept: true });
  });
});

describe('finding 2: damaged records', () => {
  const NOW = at('2026-10-18 10:00');
  const good = pos({ km: 90, at: '2026-10-18 09:00' });
  const works = async (): Promise<NonNullable<Awaited<ReturnType<typeof readInputs>>>> => {
    const i = (await readInputs(NOW))!;
    expect(screen({ ...i, sun: sun() }).chips.emergency).toBeTruthy();
    return i;
  };

  test('[ST-RETENTION] a damaged position is dropped, and only it', async () => {
    await onTrip();
    const db = await openDb();
    await db.add('positions', good);
    for (const bad of [{ ...good, km: 91, at: '2026-10-18T09:00:00Z' }, { ...good, km: 92, at: null }, { km: 93 }, 'text', null, 7]) await db.add('positions', bad);
    const i = await works();
    expect(i.positions).toEqual([good]);
    expect(await rows()).toEqual([good]);
  });

  test('[ST-WATER-FLIP] damaged water reads as none and heals, and never stops a position being kept', async () => {
    for (const bad of [null, 'text', { litres: 1, at: 'yesterday', confirmed: true }, { litres: 'x', at: NOW, confirmed: true }, { litres: 1, at: new Date(Number.NaN), confirmed: true }, { litres: 1, at: NOW, confirmed: 'yes' }]) {
      freshStore();
      await onTrip();
      const db = await openDb();
      await db.put('waterLeft', bad, CURRENT);
      expect(await addPosition(good, NOW, ID), JSON.stringify(bad)).toEqual({ kept: true });
      await db.put('waterLeft', bad, CURRENT);
      expect((await works()).waterLeft, JSON.stringify(bad)).toBeNull();
      expect(await db.get('waterLeft', CURRENT)).toBeUndefined();
    }
  });

  test('[ST-RETENTION] damaged zones read as none; one bad span drops the list, as wrong zones are worse than none', async () => {
    const span = zonesOf(300)[0]!;
    for (const bad of ['text', 7, { a: 1 }, [null], [{ ...span, timeZone: 'Not/AZone' }], [{ ...span, fromKm: 'x' }], [{ ...span, timeZone: 7 }]]) {
      freshStore();
      await onTrip();
      const db = await openDb();
      await db.put('meta', bad, ZONES_META);
      expect(await addPosition(good, NOW, ID), JSON.stringify(bad)).toEqual({ kept: true });
      expect((await works()).routeZones, JSON.stringify(bad)).toEqual(NO_ZONES);
      expect(await keepAfterScreen(ride({ day: '2026-10-18', km: 3 }), NOW, ID)).toBeUndefined();
    }
    freshStore();
    await onTrip();
    await (await openDb()).put('meta', [span, { ...span, timeZone: 'Not/AZone' }], ZONES_META);
    expect((await works()).routeZones).toEqual(NO_ZONES);
  });

  test('[ST-KEEP-DAYSTART] the other damaged small records read as none; the good ones stay', async () => {
    await onTrip();
    const db = await openDb();
    await db.put('meta', 'text', HOLIDAYS_META);
    await db.put('meta', { a: 1 }, SAVED_KM_META);
    await db.put('meta', 7, ROUTE_END_META);
    await db.put('dayStarts', { day: 'soon', km: 3 });
    await db.put('dayStarts', { day: '2026-10-18', km: 'x' });
    let i = await works();
    expect(i).toMatchObject({ holidays: {}, savedKm: [], routeEndDate: null, dayStarts: [] });

    await db.put('meta', { 'DE-BW': ['2026-10-18'], bad: 3 }, HOLIDAYS_META);
    await db.put('meta', [{ fromKm: 0, toKm: 5 }, { fromKm: 'x', toKm: 5 }, null], SAVED_KM_META);
    await db.put('dayStarts', { day: '2026-10-18', km: 3 });
    i = await works();
    expect(i).toMatchObject({ holidays: { 'DE-BW': ['2026-10-18'] }, savedKm: [{ fromKm: 0, toKm: 5 }], dayStarts: [{ day: '2026-10-18', km: 3 }] });
    expect(i.holidays).not.toHaveProperty('bad');
  });

  test('[ST-ROUTE-END] a damaged date holds no place', async () => {
    await onTrip();
    await (await openDb()).put('meta', 7, ROUTE_END_META);
    await keepAfterScreen(ride(null, '2026-10-18'), NOW, ID);
    expect((await works()).routeEndDate).toBe('2026-10-18');
  });
});

describe('finding 3: two windows must not signal each other forever', () => {
  const NOW = at('2026-10-18 10:00');

  test('[ST-KEEP-DAYSTART] the same day start twice signals once', async () => {
    await onTrip();
    expect(await signals(() => keepAfterScreen(ride({ day: '2026-10-18', km: 76 }), NOW, ID))).toEqual(['day']);
    expect(await signals(() => keepAfterScreen(ride({ day: '2026-10-18', km: 76 }), NOW, ID))).toEqual([]);
    expect(await signals(() => keepAfterScreen(ride({ day: '2026-10-18', km: 80 }), NOW, ID))).toEqual(['day']);
  });

  test('[ST-ROUTE-END] the date signals only when it is written', async () => {
    await onTrip();
    expect(await signals(() => keepAfterScreen(ride(null, '2026-10-18'), NOW, ID))).toEqual(['day']);
    expect(await signals(() => keepAfterScreen(ride(null, '2026-10-18'), NOW, ID))).toEqual([]);
    expect(await signals(() => keepAfterScreen(ride(null, '2026-10-19'), NOW, ID))).toEqual([]);
  });
});

test('[ST-NO-OVERWRITE] finding 4: reading settings does not let an older trip be written', async () => {
  await saveTrip(trip({ departureDate: '2026-10-17' }));
  const old = (await readTrip())!;
  const other = await anotherWindow();
  await other.trip.saveTrip({ ...(await other.trip.readTrip())!, departureDate: '2026-11-01' });

  await readSettings(); // for the settings panel
  await expect(saveTrip({ ...old, campWaterL: 4 })).rejects.toMatchObject({ name: 'NewerDataError' });
  expect((await readTrip())?.departureDate).toBe('2026-11-01');
});

test('[ST-NO-OVERWRITE] finding 4: a window changing a field through settings then may not write its older trip over it', async () => {
  await saveTrip(trip());
  const old = (await readTrip())!;
  await readSettings();
  await writeSettings({ campWaterL: 4 });
  await expect(saveTrip({ ...old, flatKph: 30 })).rejects.toMatchObject({ name: 'NewerDataError' });
  expect((await readTrip())?.campWaterL).toBe(4);
});

describe('finding 5: what the file holds decides, not the stamp', () => {
  test('[ST-EXPORT] rides, a profile and tyres without a stamp come back, byte-identical', async () => {
    await saveTrip(trip());
    const db = await openDb();
    await db.add('calibration', { at: new Date('2026-10-01T10:00:00Z'), predictedL: 2, intakeL: 2.5, feel: 'B' });
    await db.put('meta', { weightKg: 70, thirst: 'more', ebike: false, capacityL: 2, k: 1.1, sumW: 1, kDrink: 1, weighedRides: 1 }, 'profile');
    await db.put('meta', { byBike: { a: { front: 2 } } }, 'tyres');
    const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
    freshStore();
    expect((await importAll(file)).ok).toBe(true);
    const fresh = await openDb();
    expect(await fresh.count('calibration')).toBe(1);
    expect(await fresh.get('meta', 'profile')).toMatchObject({ weightKg: 70 });
    expect(await fresh.get('meta', 'tyres')).toEqual({ byBike: { a: { front: 2 } } });
    expect(JSON.stringify(await exportAll())).toBe(JSON.stringify(file));
  });

  test('[ST-EXPORT] a section really empty and unstamped leaves what the phone has', async () => {
    freshStore();
    const empty = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
    const db = await openDb();
    await db.add('calibration', { at: new Date('2026-10-01T10:00:00Z'), predictedL: 2, intakeL: 2.5, feel: 'B' });
    await db.put('meta', { weightKg: 70 }, 'profile');
    expect((await importAll(empty)).ok).toBe(true);
    expect(await db.count('calibration')).toBe(1);
    expect(await db.get('meta', 'profile')).toEqual({ weightKg: 70 });
  });
});


describe('finding 7: one bad record never stops a backup', () => {
  const ride1 = { at: new Date('2026-10-01T10:00:00Z'), predictedL: 2, intakeL: 2.5, feel: 'B' };

  test('[ST-EXPORT] a ride with a bad date or figure stays out of the file, and the file restores', async () => {
    await saveTrip(trip());
    const db = await openDb();
    await db.add('calibration', ride1);
    for (const bad of [{ ...ride1, at: new Date(Number.NaN) }, { ...ride1, at: 'never' }, { ...ride1, predictedL: Number.NaN }, { ...ride1, intakeL: Infinity }, 'text', null]) await db.add('calibration', bad);
    const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
    expect(file.calibration.rides).toHaveLength(1);
    freshStore();
    expect((await importAll(file)).ok).toBe(true);
    expect(await (await openDb()).count('calibration')).toBe(1);
    expect((await readTrip())?.route.id).toBe(ID);
  });

  test('[ST-EXPORT] a file with one bad ride still brings the rest', async () => {
    await saveTrip(trip());
    await (await openDb()).add('calibration', ride1);
    await (await openDb()).put('meta', '2026-10-02T00:00:00.000Z', 'updatedAt:calibration');
    const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
    freshStore();
    const damaged = { ...file, calibration: { ...file.calibration, rides: [...file.calibration.rides, { at: 'never', predictedL: null, intakeL: 1, feel: null }] } };
    expect((await importAll(damaged)).ok).toBe(true);
    expect(await (await openDb()).count('calibration')).toBe(1);
    expect((await readTrip())?.route.id).toBe(ID);
  });

  test('[ST-EXPORT] damaged stamps and damaged tyres leave a file that restores', async () => {
    await saveTrip(trip());
    const db = await openDb();
    await db.put('meta', 7, 'updatedAt:tyres');
    await db.put('meta', { byBike: 'nope' }, 'tyres');
    await db.put('meta', 'never', 'updatedAt:profile');
    await db.put('meta', 'garbage', 'updatedAt:calibration');
    localStorage.setItem('copilot:settings', JSON.stringify({ updatedAt: 'never', theme: 'dark' }));
    const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
    freshStore();
    expect(await importAll(file)).toMatchObject({ ok: true });
    expect((await readSettings()).theme).toBe('dark');
  });
});

describe('finding 8: a wrong clock deletes nothing stamped after it', () => {
  test('[ST-RETENTION] rows after now stay on the phone through a read and an add; the right clock finds them', async () => {
    await onTrip();
    const db = await openDb();
    const today = [pos({ km: 90, at: '2026-10-18 09:00', acc: 300 }), pos({ km: 95, at: '2026-10-18 10:00', manual: true }), pos({ km: 100, at: '2026-10-18 11:00' })];
    for (const p of today) await db.add('positions', p);
    await db.put('dayStarts', { day: '2026-10-18', km: 78 });
    await confirmWater(1, at('2026-10-18 11:00'));

    const wrong = at('2020-01-01 12:00');
    const seen = (await readInputs(wrong))!;
    expect(seen.dayStarts).toEqual([]);
    await addPosition(pos({ km: 60, at: '2020-01-01 11:59' }), wrong, ID);
    await keepAfterScreen(ride({ day: '2020-01-01', km: 60 }), wrong, ID);

    expect(await db.count('positions')).toBe(4);
    expect(await db.get('dayStarts', '2026-10-18')).toEqual({ day: '2026-10-18', km: 78 });

    const right = (await readInputs(at('2026-10-18 11:30')))!;
    expect(right.positions.map((p) => p.km)).toEqual(expect.arrayContaining([90, 95, 100]));
    expect(right.dayStarts).toEqual([{ day: '2026-10-18', km: 78 }]);
    expect(right.waterLeft?.litres).toBe(1);
  });

  test('[ST-RETENTION] what is older than now and past its time still goes', async () => {
    await onTrip();
    const db = await openDb();
    await db.add('positions', pos({ km: 10, at: '2026-10-17 10:00' }));
    await db.put('dayStarts', { day: '2026-10-15', km: 1 });
    await readInputs(at('2026-10-20 10:00'));
    expect(await db.count('positions')).toBe(0);
    expect(await db.count('dayStarts')).toBe(0);
  });
});

describe('finding 9: retention must not change the day start', () => {
  const env = { sun: sun(), routeZones: zonesOf(300) };
  const startOf = (list: Position[], now: Date): number => dayRide(testTrip(), list, null, null, now, env, []).dayStartKm;
  const same = (list: Position[], now: Date): void => {
    expect(startOf(keptPositions(list, now, testTrip(), zonesOf(300)), now)).toBe(startOf(list, now));
  };

  test('[ST-RETENTION] yesterday far off and rough, today far off: the fallback position stays', () => {
    const now = at('2026-10-19 10:00');
    const list = [pos({ km: 40, at: '2026-10-18 18:00', off: 8_000, acc: 300 }), pos({ km: 44, at: '2026-10-19 09:00', off: 8_000 })];
    expect(startOf(list, now)).toBe(40);
    same(list, now);
  });

  test('[ST-RETENTION] yesterday near and rough, today moved on: the night position stays', () => {
    const now = at('2026-10-19 12:00');
    same([pos({ km: 40, at: '2026-10-18 18:00', acc: 300 }), pos({ km: 60, at: '2026-10-19 11:00' })], now);
  });

  test("[ST-RETENTION] only today's rough far-off positions: the first stays", () => {
    const now = at('2026-10-19 12:00');
    same([pos({ km: 40, at: '2026-10-19 09:00', off: 8_000, acc: 300 }), pos({ km: 44, at: '2026-10-19 10:00', off: 8_000, acc: 300 }), pos({ km: 48, at: '2026-10-19 11:00', off: 8_000, acc: 300 })], now);
  });

  test('[ST-RETENTION] property: for any positions, the day start is the same from what is kept, and all stay within 48 hours', () => {
    const now = at('2026-10-20 12:00'); // day 4
    const one = fc.record({
      km: fc.integer({ min: 0, max: 300 }), off: fc.constantFrom(0, 50, 6_000, 40_000), acc: fc.constantFrom(5, 80, 150, 900), manual: fc.boolean(), min: fc.integer({ min: 1, max: 47 * 60 }),
    }).map((o): Position => ({ ...pos({ km: o.km, at: '2026-10-18 12:00', off: o.off, acc: o.acc, manual: o.manual }), at: new Date(now.getTime() - o.min * 60_000) }));
    fc.assert(fc.property(fc.array(one, { maxLength: 10 }), (list) => {
      const kept = keptPositions(list, now, testTrip(), zonesOf(300));
      expect(startOf(kept, now)).toBe(startOf(list, now));
      for (const p of kept) expect(now.getTime() - p.at.getTime()).toBeLessThanOrEqual(48 * 3_600_000);
    }));
  });
});

describe('finding 10: a settings write is whole or not at all', () => {
  test('[ST-NO-OVERWRITE] settings newer elsewhere: the trip is not touched either', async () => {
    await saveTrip(trip());
    await readSettings();
    localStorage.setItem('copilot:settings', JSON.stringify({ updatedAt: '2030-01-01T00:00:00.000Z', theme: 'light', flatKph: 22 }));
    const r = await writeSettings({ flatKph: 30 });
    expect(r.ok).toBe(false);
    expect(r.newer).toEqual(['settings']);
    expect((await readTrip())?.flatKph).toBe(25);
    expect(r.settings.flatKph).toBe(25);
  });

  test('[ST-NO-OVERWRITE] trip newer elsewhere: the settings are not touched either', async () => {
    await saveTrip(trip());
    await readSettings();
    const other = await anotherWindow();
    await other.trip.saveTrip({ ...(await other.trip.readTrip())!, campWaterL: 4 });
    const r = await writeSettings({ flatKph: 30 });
    expect(r.newer).toEqual(['trip']);
    expect(JSON.parse(localStorage.getItem('copilot:settings') ?? '{}').flatKph).not.toBe(30);
    expect((await readTrip())?.flatKph).toBe(25);
  });

  test('[ST-SETTINGS-RANGE] a browser refusing the settings leaves the trip as it was', async () => {
    await saveTrip(trip());
    await readSettings();
    const set = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (k: string, v: string) => { if (k === 'copilot:settings') throw new DOMException('full', 'QuotaExceededError'); set(k, v); };
    await expect(writeSettings({ flatKph: 30 })).rejects.toThrow();
    localStorage.setItem = set;
    expect((await readTrip())?.flatKph).toBe(25);
    await flushWrites();
  });

  test('[ST-SETTINGS-RANGE] a setting of the phone alone needs no database', async () => {
    const real = globalThis.indexedDB;
    await readSettings();
    freshStore();
    globalThis.indexedDB = { open: () => { throw new DOMException('blocked', 'SecurityError'); } } as unknown as IDBFactory;
    const r = await writeSettings({ theme: 'dark' }).catch(() => null);
    globalThis.indexedDB = real;
    expect(JSON.parse(localStorage.getItem('copilot:settings') ?? '{}').theme).toBe('dark');
    expect(r).not.toBeUndefined();
  });
});

test('[ST-WATER-FLIP] finding 11: the flip tells other windows about the water', async () => {
  await onTrip();
  const t0 = at('2026-10-17 14:00');
  await confirmWater(1, t0);
  const early = at('2026-10-17 14:10');
  expect(await signals(() => addPosition(pos({ km: 30, at: '2026-10-17 14:09' }), early, ID))).toEqual(['positions']);
  const late = at('2026-10-17 14:20');
  expect(await signals(() => addPosition(pos({ km: 31, at: '2026-10-17 14:19' }), late, ID))).toEqual(expect.arrayContaining(['positions', 'water']));
});

test("[ST-KEEP-DAYSTART] finding 12: a late screen of the old route is refused, also after the new route's inputs were read", async () => {
  await onTrip();
  const now = at('2026-10-18 10:00');
  await readInputs(now);
  await readTrip();
  await replaceRoute(route({ id: 'route-new', hash: 'new' }, 50));
  await readInputs(now);
  await keepAfterScreen(ride({ day: '2026-10-18', km: 76 }, '2026-10-18'), now, ID);
  const i = (await readInputs(now))!;
  expect(i.routeEndDate).toBeNull();
  expect(i.dayStarts).toEqual([]);
  await keepAfterScreen(ride({ day: '2026-10-18', km: 6 }), now, 'route-new');
  expect((await readInputs(now))!.dayStarts).toEqual([{ day: '2026-10-18', km: 6 }]);
});

describe('finding 13: nothing is left over for a first route', () => {
  test('[ST-REPLACE] data with no trip above it goes when a trip is saved; nights chosen beforehand stay', async () => {
    await writeSettings({ nights: 3 });
    const db = await openDb();
    await db.add('positions', pos({ km: 90, at: '2026-10-17 10:00' }));
    await db.put('meta', '2026-10-17', ROUTE_END_META);
    await saveTrip(trip());
    expect(await db.count('positions')).toBe(0);
    expect(await db.get('meta', `${ROUTE_META_PREFIX}routeEnd`)).toBeUndefined();
    expect((await readSettings()).nights).toBe(3);
  });

  test('[ST-REPLACE] the same through an import; and another route by file leaves the old nights behind', async () => {
    await saveTrip(trip());
    const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
    freshStore();
    const db = await openDb();
    await db.add('positions', pos({ km: 90, at: '2026-10-17 10:00' }));
    expect((await importAll(file)).ok).toBe(true);
    expect(await db.count('positions')).toBe(0);

    await readSettings();
    await writeSettings({ nights: 3 });
    const unstampedSettings = { ...file, settings: { ...file.settings, updatedAt: null }, trip: { ...file.trip!, route: route({ id: 'route-other', hash: 'other' }, 60) } };
    expect((await importAll(JSON.parse(JSON.stringify(unstampedSettings)))).ok).toBe(true);
    expect((await readSettings()).nights).toBeNull();
  });
});

test('[ST-PLAN-TOMORROW] finding 14: a choice the browser refused says so', () => {
  const set = localStorage.setItem.bind(localStorage);
  expect(setPlanTomorrow('2026-10-18')).toBe(true);
  expect(backToToday(at('2026-10-18 10:00'))).toBe(true);
  localStorage.removeItem('copilot:plan-tomorrow');
  localStorage.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  try {
    expect(setPlanTomorrow('2026-10-18')).toBe(false);
    expect(backToToday(at('2026-10-18 10:00'))).toBe(false);
  } finally {
    localStorage.setItem = set;
  }
  expect(setPlanTomorrow('soon')).toBe(false);
  expect(backToToday(new Date(Number.NaN))).toBe(false);
  expect(readPlanTomorrow()).toBeNull();
});

test('[APP-UPDATE-PROMPT] finding 15: a refused route is not an unsaved one', async () => {
  await flushWrites();
  await expect(saveTrip(trip({ flatKph: 3 }))).rejects.toThrow();
  await expect(replaceRoute({ ...route(), lengthKm: Number.NaN })).rejects.toThrow();
  expect(await flushWrites()).toBe(true);
});

describe("finding 16: a stay's round trip keeps the rider's camp water", () => {
  test('[ST-CAMP-ONE] camping with 3 L, accommodation, camping again gives 3 L', async () => {
    await saveTrip(trip({ campWaterL: 3 }));
    await readSettings();
    await writeSettings({ stay: 'accommodation' });
    expect((await readTrip())?.campWaterL).toBe(0);
    await writeSettings({ stay: 'camping' });
    expect((await readTrip())?.campWaterL).toBe(3);
    await writeSettings({ stay: 'mixed' });
    expect((await readTrip())?.campWaterL).toBe(3);
  });

  test('[ST-CAMP-ONE] an edit made meanwhile stays; with nothing to go back to it is the default', async () => {
    await saveTrip(trip({ campWaterL: 3 }));
    await readSettings();
    await writeSettings({ stay: 'accommodation' });
    await writeSettings({ campWaterL: 1 });
    await writeSettings({ stay: 'camping' });
    expect((await readTrip())?.campWaterL).toBe(1);
    freshStore();
    await saveTrip(trip({ stay: 'accommodation', campWaterL: 0 }));
    await readSettings();
    await writeSettings({ stay: 'camping' });
    expect((await readTrip())?.campWaterL).toBe(2);
  });

  test('[ST-CAMP-ONE] a refused write remembers nothing', async () => {
    await saveTrip(trip({ campWaterL: 3 }));
    await readSettings();
    const other = await anotherWindow();
    await other.trip.saveTrip({ ...(await other.trip.readTrip())!, stay: 'mixed', campWaterL: 4 });
    expect((await writeSettings({ stay: 'accommodation' })).ok).toBe(false);
    expect(localStorage.getItem('copilot:camp-water-before')).toBeNull();
  });
});

describe('re-check R1: a file whose rides are all unreadable', () => {
  const ride1 = { at: new Date('2026-10-01T10:00:00Z'), predictedL: 2, intakeL: 2.5, feel: 'B' };

  test('[ST-EXPORT] writes nothing and says why, and the rides on the phone stay', async () => {
    await saveTrip(trip({ campWaterL: 1 }));
    const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
    const db = await openDb();
    await db.add('calibration', ride1);
    const damaged = { ...file, trip: { ...file.trip!, campWaterL: 4 }, calibration: { updatedAt: '2026-10-02T00:00:00.000Z', rides: [{ at: 'x' }, { junk: 1 }] } };
    const r = await importAll(damaged);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/water learning/);
    expect(await db.count('calibration')).toBe(1);
    expect((await readTrip())?.campWaterL).toBe(1);
  });

  test('[ST-EXPORT] an unstamped section of unreadable rides is refused too; a stamped empty list is the rider having none', async () => {
    await saveTrip(trip());
    const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
    const db = await openDb();
    await db.add('calibration', ride1);
    expect((await importAll({ ...file, calibration: { updatedAt: null, rides: ['junk'] } })).ok).toBe(false);
    expect(await db.count('calibration')).toBe(1);
    expect((await importAll({ ...file, calibration: { updatedAt: '2026-10-02T00:00:00.000Z', rides: [] } })).ok).toBe(true);
    expect(await db.count('calibration')).toBe(0);
  });

  test('[ST-EXPORT] when only some are unreadable, the result says how many were left out', async () => {
    await saveTrip(trip());
    await (await openDb()).add('calibration', ride1);
    const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
    expect((await importAll(file)).ridesLeftOut).toBe(0);
    const r = await importAll({ ...file, calibration: { ...file.calibration, rides: [...file.calibration.rides, { at: 'x' }, { junk: 1 }] } });
    expect(r).toMatchObject({ ok: true, ridesLeftOut: 2 });
  });
});

describe('re-check R2: zones', () => {
  const NOW = at('2026-10-18 10:00');
  const span = zonesOf(300)[0]!;

  test('[ST-RETENTION] a last span open to the end of the route is a good span; not a number is not', async () => {
    await onTrip();
    const db = await openDb();
    await db.put('meta', [{ ...span, toKm: Infinity }], ZONES_META);
    expect((await readInputs(NOW))!.routeZones).toEqual([{ ...span, toKm: Infinity }]);
    await db.put('meta', [{ ...span, toKm: Number.NaN }], ZONES_META);
    expect((await readInputs(NOW))!.routeZones).toEqual(NO_ZONES);
    await db.put('meta', [{ ...span, fromKm: -Infinity }], ZONES_META);
    expect((await readInputs(NOW))!.routeZones).toEqual(NO_ZONES);
  });

  test('[ST-RETENTION] a damaged start span never moves the start zone to the next span', async () => {
    await onTrip();
    const tokyo = { fromKm: 100, toKm: 300, timeZone: 'Asia/Tokyo', holidayZone: null, country: 'JP' };
    await (await openDb()).put('meta', [{ ...span, toKm: 100, timeZone: 'Not/AZone' }, tokyo], ZONES_META);
    expect((await readInputs(NOW))!.routeZones).toEqual(NO_ZONES);
  });
});

describe('re-check R5: a position stamped ahead must not hide later true fixes', () => {
  const NOW = at('2026-10-18 10:00');
  const ahead = pos({ km: 20, at: '2026-10-19 10:00' }); // the clock ran a day ahead for this one fix

  test('[ST-RETENTION] a later true fix is what the screen starts from, and the row stamped ahead stays stored', async () => {
    await onTrip();
    await addPosition(pos({ km: 15, at: '2026-10-18 09:00' }), at('2026-10-18 09:00'), ID);
    await addPosition(ahead, NOW, ID);
    await addPosition(pos({ km: 60, at: '2026-10-18 09:59' }), NOW, ID);
    const i = (await readInputs(NOW))!;
    expect(i.positions.map((p) => p.km)).toEqual([15, 60]);
    expect(screen({ ...i, sun: sun() }).ride.startKm).toBe(60);
    expect(await rows()).toContainEqual(ahead);
  });

  test('[ST-RETENTION] once real time has passed its stamp, it stays hidden and goes', async () => {
    await onTrip();
    await addPosition(ahead, NOW, ID);
    await addPosition(pos({ km: 60, at: '2026-10-18 09:59' }), NOW, ID);
    const later = at('2026-10-19 11:00');
    const i = (await readInputs(later))!;
    expect(i.positions.map((p) => p.km)).toEqual([60]);
    expect((await rows() as Position[]).map((p) => p.km)).toEqual([60]);
  });

  test('[ST-RETENTION] with no later fix it still counts as the latest; fixes a little out of order hide nothing', async () => {
    await onTrip();
    await addPosition(ahead, NOW, ID);
    expect((await readInputs(NOW))!.positions.map((p) => p.km)).toEqual([20]);
    freshStore();
    await onTrip();
    await addPosition(pos({ km: 30, at: '2026-10-18 09:59' }), NOW, ID);
    await addPosition(pos({ km: 29, at: '2026-10-18 09:58' }), NOW, ID);
    expect((await readInputs(NOW))!.positions.map((p) => p.km)).toEqual([29, 30]);
  });

  test('[ST-RETENTION] a fix from a clock far behind hides nothing once the clock is right: it is old, the others are true', async () => {
    await onTrip();
    const today = pos({ km: 90, at: '2026-10-18 09:00' });
    await addPosition(today, at('2026-10-18 09:00'), ID);
    await addPosition(pos({ km: 60, at: '2020-01-01 11:59' }), at('2020-01-01 12:00'), ID);
    expect((await readInputs(NOW))!.positions.map((p) => p.km)).toEqual([90]);
  });
});
