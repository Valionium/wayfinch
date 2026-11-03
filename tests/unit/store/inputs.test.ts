import { beforeEach, describe, expect, test } from 'vitest';
import { freshStore, route } from './helpers.ts';
import fc from 'fast-check';
import { positionOrder } from '../../../src/core/engines/locate.ts';
import { sunFromSuncalc } from '../../../src/core/engines/daylight.ts';
import { dayRide } from '../../../src/core/engines/tripday.ts';
import { buildScreen, screen } from '../../../src/core/screen/screen.ts';
import type { Position, Trip } from '../../../src/core/types.ts';
import { CURRENT, openDb } from '../../../src/store/db.ts';
import { HOLIDAYS_META, keepAfterScreen, readInputs, ROUTE_END_META, SAVED_KM_META, ZONES_META } from '../../../src/store/inputs.ts';
import { addPosition, backToToday, confirmWater, keptPositions, readPlanTomorrow, setPlanTomorrow } from '../../../src/store/positions.ts';
import { readTrip, replaceRoute, saveTrip } from '../../../src/store/trip.ts';
import { at, pos, sun, testTrip, zonesOf } from '../../fixtures/build.ts';
import { scenario } from '../../gen/index.ts';

beforeEach(freshStore);

/** The standard trip: 300 km, stage ends at 78, 150, 222, leaving Saturday 17 October 2026 at 08:30, Berlin time. */
async function onTrip(over: Partial<Trip> = {}): Promise<Trip> {
  const t = testTrip(over);
  await saveTrip(t);
  await (await openDb()).put('meta', zonesOf(t.route.lengthKm), ZONES_META);
  return t;
}
const stored = async (): Promise<Position[]> => (await (await openDb()).getAll('positions')) as Position[];
const kms = (list: Position[]): number[] => list.map((p) => p.km).sort((a, b) => a - b);
const put = async (...list: Position[]): Promise<void> => { const db = await openDb(); for (const p of list) await db.add('positions', p); };
const withInputs = async (now: Date) => (await readInputs(now))!;
const rideOf = (s: { ride: { keepDayStart: { day: string; km: number } | null; routeEndReachedOn: string | null } }) => s;

describe('positions kept', () => {
  test('[ST-RETENTION] a position older than 48 hours is gone, from the inputs and from the phone', async () => {
    await onTrip();
    await put(pos({ km: 10, at: '2026-10-17 10:00' }), pos({ km: 90, at: '2026-10-19 09:59' }), pos({ km: 80, at: '2026-10-19 10:01' }));
    const now = at('2026-10-21 10:00');
    const i = await withInputs(now);
    expect(i.positions.map((p) => p.km)).toEqual([80]);
    expect(kms(await stored())).toEqual([80]);
  });

  test('[ST-RETENTION] a rider who opens the app days later has no positions left, and nothing pretends otherwise', async () => {
    await onTrip();
    await put(pos({ km: 10, at: '2026-10-17 10:00' }), pos({ km: 30, at: '2026-10-17 12:00' }));
    const now = at('2026-10-20 12:00');
    const i = await withInputs(now);
    expect(i.positions).toEqual([]);
    expect(await stored()).toEqual([]);
    const s = screen({ ...i, sun: sun() });
    expect(s.positionLine).toBeNull();
    expect(s.ride.nightKm).toBeNull();
  });

  test('[ST-RETENTION] exactly 48 hours still counts, as the engines read it; one millisecond more does not', async () => {
    await onTrip();
    const now = at('2026-10-19 12:00');
    const p = pos({ km: 40, at: '2026-10-17 12:00' });
    expect(keptPositions([p], now, testTrip(), zonesOf(300))).toHaveLength(1);
    expect(keptPositions([p], new Date(now.getTime() + 1), testTrip(), zonesOf(300))).toHaveLength(0);
  });

  test('[ST-RETENTION] the latest accepted position under 48 hours is always there, wherever it lies and however rough', async () => {
    await onTrip();
    const now = at('2026-10-19 12:00');
    const lonely = pos({ km: 40, at: '2026-10-18 01:00', off: 40_000, acc: 900 });
    expect(keptPositions([lonely], now, testTrip(), zonesOf(300))).toEqual([lonely]);

    const when = fc.integer({ min: 1, max: 47 * 60 }).map((min) => new Date(now.getTime() - min * 60_000));
    const anyPosition = fc.record({
      km: fc.integer({ min: 0, max: 300 }), off: fc.constantFrom(0, 50, 6_000, 40_000), acc: fc.constantFrom(5, 80, 150, 900), manual: fc.boolean(), t: when,
    }).map((o): Position => ({ ...pos({ km: o.km, at: '2026-10-18 12:00', off: o.off, acc: o.acc, manual: o.manual }), at: o.t }));
    fc.assert(fc.property(fc.array(anyPosition, { minLength: 1, maxLength: 12 }), (list) => {
      const kept = keptPositions(list, now, testTrip(), zonesOf(300));
      const latest = [...list].sort(positionOrder).at(-1)!;
      expect(kept).toContainEqual(latest);
      for (const p of kept) expect(now.getTime() - p.at.getTime()).toBeLessThanOrEqual(48 * 3_600_000);
    }));
  });

  test('[ST-RETENTION] check-ins of the current and the previous riding day only, and only those of the rest', () => {
    const now = at('2026-10-19 12:00'); // day 3
    const twoDaysAgoCheckIn = pos({ km: 10, at: '2026-10-17 13:00' });
    const yesterdayCheckIn = pos({ km: 60, at: '2026-10-18 10:00' });
    const yesterdayRough = pos({ km: 61, at: '2026-10-18 11:00', acc: 300 });
    const yesterdayManual = pos({ km: 62, at: '2026-10-18 12:00', manual: true });
    const todayCheckIn = pos({ km: 110, at: '2026-10-19 09:00' });
    const todayRough = pos({ km: 111, at: '2026-10-19 09:30', acc: 800 });
    const todayManual = pos({ km: 112, at: '2026-10-19 10:00', manual: true });
    const todayFirstFar = pos({ km: 113, at: '2026-10-19 10:15', off: 8_000, acc: 200 }); // the day start's fallback
    const todayFarRough = pos({ km: 113.5, at: '2026-10-19 10:30', off: 8_000, acc: 200 });
    const latest = pos({ km: 114, at: '2026-10-19 11:00' });
    const kept = keptPositions(
      [twoDaysAgoCheckIn, yesterdayCheckIn, yesterdayRough, yesterdayManual, todayCheckIn, todayRough, todayManual, todayFirstFar, todayFarRough, latest],
      now, testTrip(), zonesOf(300));
    // 62 is the last day position before today: the day start reads it. 61 and 113.5 serve nothing.
    expect(kms(kept)).toEqual([60, 62, 110, 111, 112, 113, 114]);
  });

  test('[ST-RETENTION] the latest day position stays for the night kilometre, also once the check-ins of its day are dropped', () => {
    const now = at('2026-10-20 07:00'); // day 4, morning
    const lastEvening = pos({ km: 150, at: '2026-10-18 18:00', acc: 300 }); // no check-in, two days back, still under 48 hours
    const farLater = pos({ km: 160, at: '2026-10-19 20:00', off: 30_000 }); // the latest accepted, far off the route
    const kept = keptPositions([lastEvening, farLater], now, testTrip(), zonesOf(300));
    expect(kms(kept)).toEqual([150, 160]);
    expect(dayRide(testTrip(), kept, null, null, now, { sun: sun(), routeZones: zonesOf(300) }).nightKm).toBe(150);
  });

  test('[ST-RETENTION] a position stamped after now, from a clock moved back, is kept as the latest', () => {
    const now = at('2026-10-18 10:00');
    const ahead = pos({ km: 30, at: '2026-10-18 11:00' });
    expect(keptPositions([pos({ km: 20, at: '2026-10-18 09:00' }), ahead], now, testTrip(), zonesOf(300))).toContainEqual(ahead);
  });

  test('[ST-RETENTION] until the zones are known no date can be judged: all under 48 hours stay, nothing older', () => {
    const now = at('2026-10-19 12:00');
    const kept = keptPositions([pos({ km: 5, at: '2026-10-17 13:00', acc: 300 }), pos({ km: 6, at: '2026-10-17 11:00' }), pos({ km: 7, at: '2026-10-19 11:00' })], now, testTrip(), []);
    expect(kms(kept)).toEqual([5, 7]);
  });

  test('[ST-RETENTION] without a clock nothing is deleted, and no position is passed on', async () => {
    await onTrip();
    await put(pos({ km: 10, at: '2026-10-17 10:00' }));
    const i = await withInputs(new Date(Number.NaN));
    expect(i.positions).toEqual([]);
    expect(await stored()).toHaveLength(1);
  });

  test('[ST-RETENTION] what is dropped changes no ride: the kept positions give the same trip day as all under 48 hours', () => {
    fc.assert(fc.property(scenario(), (i) => {
      fc.pre(Number.isFinite(i.now.getTime()) && i.routeZones.length > 0 && Number.isFinite(i.trip.flatKph) && i.trip.flatKph >= 15 && i.trip.flatKph <= 40);
      fc.pre(/^\d\d:\d\d$/.test(i.trip.startTime) && i.trip.startTime <= '14:00');
      const under48 = i.positions.filter((p) => i.now.getTime() - p.at.getTime() <= 48 * 3_600_000);
      const env = { sun: i.sun, routeZones: i.routeZones };
      const kept = keptPositions(under48, i.now, i.trip, i.routeZones);
      const full = dayRide(i.trip, under48, i.planTomorrow, i.routeEndDate, i.now, env, i.dayStarts);
      const after = dayRide(i.trip, kept, i.planTomorrow, i.routeEndDate, i.now, env, i.dayStarts);
      expect({ phase: after.phase, nightKm: after.nightKm, startKm: after.startKm, stopKm: after.stopKm })
        .toEqual({ phase: full.phase, nightKm: full.nightKm, startKm: full.startKm, stopKm: full.stopKm });
    }), { numRuns: Math.min(Number(process.env.FC_RUNS ?? 100), 100) });
  });

  test('[ST-RETENTION] adding a position sweeps too, so old ones go even if the screen is never read', async () => {
    await onTrip();
    await put(pos({ km: 10, at: '2026-10-17 10:00' }));
    await addPosition(pos({ km: 90, at: '2026-10-20 10:00' }), at('2026-10-20 10:00'), 'test-route');
    expect(kms(await stored())).toEqual([90]);
  });

  test('[ST-RETENTION] a position that makes no sense is not kept', async () => {
    await onTrip();
    await addPosition({ ...pos({ km: 10, at: '2026-10-17 10:00' }), km: Number.NaN }, at('2026-10-17 10:00'), 'test-route');
    await addPosition({ ...pos({ km: 10, at: '2026-10-17 10:00' }), at: new Date(Number.NaN) }, at('2026-10-17 10:00'), 'test-route');
    expect(await stored()).toEqual([]);
  });

  test('[ST-RETENTION] in the inputs, positions come in time order whatever order they were saved in', async () => {
    await onTrip();
    const now = at('2026-10-18 12:00');
    await put(pos({ km: 30, at: '2026-10-18 11:00' }), pos({ km: 20, at: '2026-10-18 10:58' }));
    expect((await withInputs(now)).positions.map((p) => p.km)).toEqual([20, 30]);
  });
});

describe('the day start and the route end', () => {
  const NOW = '2026-10-18 09:00';

  test('[ST-KEEP-DAYSTART] after a screen the day start is kept and read back', async () => {
    await onTrip();
    const now = at(NOW);
    await keepAfterScreen(rideOf({ ride: { keepDayStart: { day: '2026-10-18', km: 76.5 }, routeEndReachedOn: null } }), now, 'test-route');
    expect((await withInputs(now)).dayStarts).toEqual([{ day: '2026-10-18', km: 76.5 }]);
  });

  test('[ST-KEEP-DAYSTART] only the current and the previous riding day are kept', async () => {
    await onTrip();
    const db = await openDb();
    await db.put('dayStarts', { day: '2026-10-16', km: 1 });
    await db.put('dayStarts', { day: '2026-10-17', km: 2 });
    await keepAfterScreen(rideOf({ ride: { keepDayStart: { day: '2026-10-18', km: 3 }, routeEndReachedOn: null } }), at(NOW), 'test-route');
    expect((await db.getAll('dayStarts')).map((d: { day: string }) => d.day)).toEqual(['2026-10-17', '2026-10-18']);

    const later = await withInputs(at('2026-10-20 09:00'));
    expect(later.dayStarts).toEqual([]);
    expect(await db.count('dayStarts')).toBe(0);
  });

  test('[ST-KEEP-DAYSTART] a provisional result saves nothing', async () => {
    await onTrip();
    await keepAfterScreen(rideOf({ ride: { keepDayStart: null, routeEndReachedOn: null } }), at(NOW), 'test-route');
    expect(await (await openDb()).count('dayStarts')).toBe(0);
  });

  test('[ST-KEEP-DAYSTART] a later screen gives the same day start, once the position it came from is gone and the rider has moved on', async () => {
    await onTrip({ startTime: '07:00' });
    // The last position before today lies on day 1, 47.5 hours back; there is none on day 2.
    await put(pos({ km: 50, at: '2026-10-17 08:00' }));
    const first = await withInputs(at('2026-10-19 07:30'));
    const before = screen({ ...first, sun: sun() });
    expect(before.ride.dayStartKm).toBe(50);
    await keepAfterScreen(before, at('2026-10-19 07:30'), 'test-route');

    // An hour on, that position is over 48 hours old, and the rider is further along.
    await addPosition(pos({ km: 70, at: '2026-10-19 08:40' }), at('2026-10-19 08:40'), 'test-route');
    const next = await withInputs(at('2026-10-19 08:45'));
    expect(next.positions.map((p) => p.km)).toEqual([70]);
    expect(screen({ ...next, sun: sun() }).ride.dayStartKm).toBe(50);
    // And without the kept value it would not be: the proof the store's part matters.
    expect(screen({ ...next, dayStarts: [], sun: sun() }).ride.dayStartKm).toBe(70);
  });

  test('[ST-KEEP-DAYSTART] a screen of a route replaced meanwhile leaves nothing behind for the new one', async () => {
    await onTrip();
    await readInputs(at(NOW));
    await readTrip();
    await replaceRoute(route({ id: 'route-new', hash: 'new' }, 50));
    await keepAfterScreen(rideOf({ ride: { keepDayStart: { day: '2026-10-18', km: 76.5 }, routeEndReachedOn: '2026-10-18' } }), at(NOW), 'test-route');
    const i = await withInputs(at(NOW));
    expect(i.dayStarts).toEqual([]);
    expect(i.routeEndDate).toBeNull();
  });

  test('[ST-ROUTE-END] the date is saved once, and kept until the trip is replaced', async () => {
    await onTrip();
    const now = at(NOW);
    await readInputs(now);
    const end = (day: string | null) => rideOf({ ride: { keepDayStart: null, routeEndReachedOn: day } });
    await keepAfterScreen(end(null), now, 'test-route');
    expect((await withInputs(now)).routeEndDate).toBeNull();
    await keepAfterScreen(end('2026-10-18'), now, 'test-route');
    expect((await withInputs(now)).routeEndDate).toBe('2026-10-18');
    await keepAfterScreen(end('2026-10-19'), at('2026-10-19 09:00'), 'test-route');
    await keepAfterScreen(end(null), at('2026-10-20 09:00'), 'test-route');
    expect((await withInputs(at('2026-10-25 09:00'))).routeEndDate).toBe('2026-10-18');

    await readTrip();
    await replaceRoute(route({ id: 'route-new', hash: 'new' }, 50));
    expect((await withInputs(now)).routeEndDate).toBeNull();
    expect(await (await openDb()).get('meta', ROUTE_END_META)).toBeUndefined();
  });

  test('[ST-ROUTE-END] a date from before a departure moved later counts for nothing, and a new arrival takes its place', async () => {
    await onTrip({ departureDate: '2026-11-01' });
    await (await openDb()).put('meta', '2026-10-18', ROUTE_END_META);
    const now = at('2026-11-03 09:00');
    await readInputs(now);
    await keepAfterScreen(rideOf({ ride: { keepDayStart: null, routeEndReachedOn: '2026-11-03' } }), now, 'test-route');
    expect((await withInputs(now)).routeEndDate).toBe('2026-11-03');
  });
});

describe('water', () => {
  const T1400 = at('2026-10-17 14:00');
  const minutes = (n: number): Date => new Date(T1400.getTime() + n * 60_000);
  const position = (t: Date): Position => ({ ...pos({ km: 30, at: '2026-10-17 12:00' }), at: t });

  test('[ST-WATER-FLIP] confirmed at 14:00: a position at 14:10 leaves it confirmed; one at 14:16 does not, with the same litres and time', async () => {
    await onTrip();
    await confirmWater(1.5, T1400);
    await addPosition(position(minutes(10)), minutes(10), 'test-route');
    expect((await withInputs(minutes(10))).waterLeft).toEqual({ litres: 1.5, at: T1400, confirmed: true });
    await addPosition(position(minutes(16)), minutes(16), 'test-route');
    expect((await withInputs(minutes(16))).waterLeft).toEqual({ litres: 1.5, at: T1400, confirmed: false });
  });

  test('[ST-WATER-FLIP] exactly 15 minutes stays confirmed; a confirmation after the flip is confirmed again', async () => {
    await onTrip();
    await confirmWater(1, T1400);
    await addPosition(position(minutes(15)), minutes(15), 'test-route');
    expect((await withInputs(minutes(15))).waterLeft?.confirmed).toBe(true);
    await addPosition(position(minutes(15.01)), minutes(15.01), 'test-route');
    expect((await withInputs(minutes(16))).waterLeft?.confirmed).toBe(false);
    await confirmWater(0.5, minutes(20));
    expect((await withInputs(minutes(20))).waterLeft).toEqual({ litres: 0.5, at: minutes(20), confirmed: true });
  });

  test('[ST-WATER-FLIP] time alone flips nothing, and a position that was not kept flips nothing', async () => {
    await onTrip();
    await confirmWater(1, T1400);
    expect((await withInputs(minutes(30))).waterLeft?.confirmed).toBe(true);
    await addPosition({ ...position(minutes(30)), km: Number.NaN }, minutes(30), 'test-route');
    expect((await withInputs(minutes(30))).waterLeft?.confirmed).toBe(true);
  });

  test("[ST-WATER-FLIP] through the store and screen(), the flipped amount's Water card is not fine, and offers the amount back", async () => {
    await onTrip();
    await confirmWater(1.5, T1400);
    await addPosition(position(minutes(16)), minutes(16), 'test-route');
    const s = screen({ ...(await withInputs(minutes(16))), sun: sun() });
    expect(s.cards.water.status).not.toBe('fine');
    expect(s.cards.water.status).toBe('unknown');
  });

  test("[ST-WATER-FLIP] property: an unconfirmed amount's Water card is never fine, in any scenario", () => {
    fc.assert(fc.property(scenario(), fc.double({ min: 0, max: 20, noNaN: true }), fc.integer({ min: 16, max: 400 }), (i, litres, ago) => {
      const flipped = { litres, at: new Date(i.now.getTime() - ago * 60_000), confirmed: false };
      const { screen: s } = buildScreen({ ...i, waterLeft: flipped });
      expect(s.cards.water.status).not.toBe('fine');
    }), { numRuns: Math.min(Number(process.env.FC_RUNS ?? 100), 50) });
  });

  test('[ST-WATER-FLIP] an amount past its 3 hours is gone from the phone', async () => {
    await onTrip();
    await confirmWater(1, T1400);
    expect((await withInputs(minutes(180))).waterLeft).not.toBeNull();
    expect((await withInputs(minutes(181))).waterLeft).toBeNull();
    expect(await (await openDb()).get('waterLeft', CURRENT)).toBeUndefined();
  });

  test('[ST-WATER-CONFIRM] 0 is a real amount, not "none"', async () => {
    await onTrip();
    expect((await confirmWater(0, T1400)).ok).toBe(true);
    const left = (await withInputs(T1400)).waterLeft;
    expect(left).toEqual({ litres: 0, at: T1400, confirmed: true });
    const s = screen({ ...(await withInputs(T1400)), sun: sun() });
    expect(s.cards.water.status).not.toBe('unknown');
  });

  test('[ST-WATER-CONFIRM] the quick choices and any custom amount from 0 to 20 L are taken; anything else is refused and the last stays', async () => {
    await onTrip();
    for (const litres of [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 7.3, 20]) {
      expect((await confirmWater(litres, T1400)).ok, String(litres)).toBe(true);
      expect((await withInputs(T1400)).waterLeft?.litres).toBe(litres);
    }
    for (const bad of [-0.1, 20.1, Number.NaN, Infinity]) {
      const r = await confirmWater(bad, T1400);
      expect(r.ok, String(bad)).toBe(false);
      expect(r.reason).toMatch(/0.*20/);
      expect((await withInputs(T1400)).waterLeft?.litres).toBe(20);
    }
  });
});

describe('Plan tomorrow', () => {
  const NOW = at('2026-10-18 17:00');

  test('[ST-PLAN-TOMORROW] set, read, back to today', async () => {
    await onTrip();
    expect(readPlanTomorrow()).toBeNull();
    setPlanTomorrow('2026-10-18');
    expect(readPlanTomorrow()).toEqual({ date: '2026-10-18', backToTodayAt: null });
    expect((await withInputs(NOW)).planTomorrow).toEqual({ date: '2026-10-18', backToTodayAt: null });
    expect(localStorage.getItem('copilot:plan-tomorrow')).toContain('2026-10-18');

    backToToday(NOW);
    expect(readPlanTomorrow()?.backToTodayAt).toEqual(NOW);
    expect((await withInputs(NOW)).planTomorrow?.backToTodayAt).toEqual(NOW);
  });

  test('[ST-PLAN-TOMORROW] through screen(): the choice ends the day, Back to today undoes it', async () => {
    await onTrip();
    const now = at('2026-10-18 11:00');
    await put(pos({ km: 78, at: '2026-10-17 18:00' }));
    await addPosition(pos({ km: 90, at: '2026-10-18 10:50' }), now, 'test-route');
    expect(screen({ ...(await withInputs(now)), sun: sun() }).phase).toBe('riding');
    setPlanTomorrow('2026-10-18');
    expect(screen({ ...(await withInputs(now)), sun: sun() }).phase).toBe('after-ride');
    backToToday(now);
    expect(screen({ ...(await withInputs(now)), sun: sun() }).phase).toBe('riding');
  });

  test('[ST-PLAN-TOMORROW] a stored date of another riding date has no effect', async () => {
    await onTrip();
    const now = at('2026-10-18 11:00');
    await put(pos({ km: 78, at: '2026-10-17 18:00' }));
    await addPosition(pos({ km: 90, at: '2026-10-18 10:50' }), now, 'test-route');
    setPlanTomorrow('2026-10-17');
    expect(screen({ ...(await withInputs(now)), sun: sun() }).phase).toBe('riding');
    setPlanTomorrow('2026-10-19');
    expect(screen({ ...(await withInputs(now)), sun: sun() }).phase).toBe('riding');
  });

  test('[ST-PLAN-TOMORROW] what can not be read is no choice', () => {
    for (const bad of ['{not json', '7', '{"date":"soon"}', '{"at":"never"}']) {
      localStorage.setItem('copilot:plan-tomorrow', bad);
      expect(readPlanTomorrow(), bad).toBeNull();
    }
    localStorage.removeItem('copilot:plan-tomorrow');
    setPlanTomorrow('soon');
    expect(readPlanTomorrow()).toBeNull();
    backToToday(new Date(Number.NaN));
    expect(readPlanTomorrow()).toBeNull();
  });
});

test('[ST-SCHEMA] the inputs carry what is stored, with the real sun source, and no demo', async () => {
  const t = await onTrip();
  const db = await openDb();
  await db.put('places', { id: 'node/1', kind: 'water' });
  await db.add('matches', { placeId: 'node/1', km: 3, offRouteM: 10 });
  await db.put('meta', { 'DE-BW': ['2026-10-18'] }, HOLIDAYS_META);
  await db.put('meta', [{ fromKm: 0, toKm: 50 }], SAVED_KM_META);
  const i = await withInputs(at('2026-10-17 10:00'));
  expect(i.trip).toEqual(t);
  expect(i.sun).toBe(sunFromSuncalc);
  expect(i.demo).toBeNull();
  expect(i.routeZones).toEqual(zonesOf(300));
  expect(i.holidays).toEqual({ 'DE-BW': ['2026-10-18'] });
  expect(i.savedKm).toEqual([{ fromKm: 0, toKm: 50 }]);
  expect(i.places).toHaveLength(1);
  expect(i.matches).toHaveLength(1);
  expect(i.profile).toMatchObject({ thirst: 'average', k: 1 });
  expect(await readInputs(at('2026-10-17 10:00'))).not.toBeNull();
  freshStore();
  expect(await readInputs(at('2026-10-17 10:00'))).toBeNull();
});
