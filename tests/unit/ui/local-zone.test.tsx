// @vitest-environment jsdom
// Before Prepare this route has found the route's own zones, times and dates are the phone's, never UTC; a date the bag planner
// saved is the phone's day too (sweep of 14 Nov 2026, #1 and #2). The phone's zone is set per test, near midnight and in summer time.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { localIsoDate } from '../../../src/core/answers/time.ts';
import { buildScreen } from '../../../src/core/screen/screen.ts';
import { W } from '../../../src/core/wording/en.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb, openDb } from '../../../src/store/db.ts';
import { readInputs, ZONES_META } from '../../../src/store/inputs.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';
import { browserServices } from '../../../src/tools/tyre/services.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { savedDay } from '../../../src/ui/saved-day.ts';
import { BagCard } from '../../../src/ui/tools/bag-card.tsx';
import { tripLineOf } from '../../../src/ui/trip/model.ts';
import { routeFromGpx } from '../../../src/ui/trip/read-gpx.ts';
import { browserTripServices } from '../../../src/ui/trip/services.ts';
import { zonesOf } from '../../fixtures/build.ts';
import { fixtureGpx } from '../../fixtures/gpx.ts';

const host = document.createElement('div');
document.body.append(host);
const TZ_BEFORE = process.env.TZ;

/** The phone's zone for this test; checked, so a runner that ignores it can't pass by luck. */
function phoneIn(zone: string): void {
  process.env.TZ = zone;
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
}

beforeEach(() => {
  render(null, host);
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  refreshBikeSource();
});
afterEach(() => { act(() => render(null, host)); });
afterAll(() => { if (TZ_BEFORE === undefined) delete process.env.TZ; else process.env.TZ = TZ_BEFORE; });

/** A fresh GPX route, as Choose a GPX file adds it: nothing prepared, so no zones are stored. */
async function addedAt(now: Date) {
  const svc = browserTripServices(() => now);
  await svc.addRoute(await routeFromGpx(await fixtureGpx('heidelberg-strasbourg'), 'ride.gpx', svc.parseXml), null);
  return svc;
}

describe('Times before Prepare this route are the phone\'s (sweep of 14 Nov 2026, #1)', () => {
  test('[TRIP-LOCAL-ZONE] Berlin in summer time, 00:30 on 15 July: a route added before Prepare starts today, not tomorrow', async () => {
    phoneIn('Europe/Berlin');
    const now = new Date('2026-07-14T22:30:00Z');
    const snap = await (await addedAt(now)).load();
    expect(snap.trip!.departureDate).toBe('2026-07-15');
    expect(snap.zone).toBe('Europe/Berlin');
    expect(tripLineOf(snap.trip, localIsoDate(snap.now, snap.zone)).when).toBe(W.appTripLineStarts('Wed 15 Jul', 0));
    // En route reads the same day.
    expect(buildScreen((await readInputs(now))!).screen.ride.date).toBe('2026-07-15');
  });

  test('[TRIP-LOCAL-ZONE] the day line\'s leave-by and En route\'s daylight before Prepare are the ones Prepare gives once it has found the zone', async () => {
    phoneIn('Europe/Berlin');
    const now = new Date('2026-07-14T22:30:00Z');
    const svc = await addedAt(now);
    const trip = (await readTrip())!;
    // Leaving tomorrow, so the day line names the leave-by.
    await saveTrip({ ...trip, departureDate: '2026-07-16' });
    const before = await svc.load();
    const screenBefore = buildScreen((await readInputs(now))!).screen;
    await (await openDb()).put('meta', zonesOf(trip.route.lengthKm, 'Europe/Berlin'), ZONES_META);
    const after = await svc.load();
    const screenAfter = buildScreen((await readInputs(now))!).screen;
    expect(after.day1LeaveBy).not.toBeNull();
    expect(before.day1LeaveBy).toBe(after.day1LeaveBy);
    expect(screenBefore.ride.departure).toEqual(screenAfter.ride.departure);
    expect(screenBefore.cards.daylight).toEqual(screenAfter.cards.daylight);
  });

  test('[TRIP-LOCAL-ZONE] west of UTC, New York at 23:30 on 14 July: the trip starts today, and En route\'s day and daylight are the ones Prepare will give', async () => {
    phoneIn('America/New_York');
    const now = new Date('2026-07-15T03:30:00Z');
    const snap = await (await addedAt(now)).load();
    expect(snap.trip!.departureDate).toBe('2026-07-14');
    expect(snap.zone).toBe('America/New_York');
    expect(tripLineOf(snap.trip, localIsoDate(snap.now, snap.zone)).when).toBe(W.appTripLineStarts('Tue 14 Jul', 0));
    // En route's day is the one it reads once the route's zone is New York's too (in UTC it would be 15 July, the trip's day 2).
    const before = buildScreen((await readInputs(now))!).screen;
    await (await openDb()).put('meta', zonesOf(snap.trip!.route.lengthKm, 'America/New_York'), ZONES_META);
    const after = buildScreen((await readInputs(now))!).screen;
    expect(before.ride).toEqual(after.ride);
    expect(before.cards.daylight).toEqual(after.cards.daylight);
  });

  test('[TRIP-LOCAL-ZONE] once Prepare has stored the route\'s zones, they decide, not the phone\'s', async () => {
    phoneIn('America/New_York');
    const now = new Date('2026-07-15T03:30:00Z');
    const svc = await addedAt(now);
    const trip = (await readTrip())!;
    await (await openDb()).put('meta', zonesOf(trip.route.lengthKm, 'Europe/Berlin'), ZONES_META);
    expect((await svc.load()).zone).toBe('Europe/Berlin');
    expect((await readInputs(now))!.routeZones).toEqual(zonesOf(trip.route.lengthKm, 'Europe/Berlin'));
  });
});

const plan = (at: string) => JSON.stringify({
  app: 'load-check', kind: 'load-summary', v: 1, at, planUpdatedAt: at, nights: 2, month: 6,
  departureDate: null, mode: 'comfort', foodDays: 2, bikeId: null,
  bags: { count: 1, positions: ['frame'], items: [] },
  decks: { bar: null, rack: null }, water: { bottles: [], cageL: 0, extraL: 0, totalL: 0 },
  weight: { kitKg: 1.5, cageWaterKg: 0, carriedKg: 1.5, bikeKg: 14, emptyLuggageKg: 0.2, byPositionKg: { fork: 0, bar: 0, top: 0, frame: 1.5, bottle: 0, seat: 0, rack: 0, pack: 0 }, unplacedKg: 0 },
  kit: { waterFilter: false },
});

describe('A saved date is the phone\'s day (sweep of 14 Nov 2026, #2)', () => {
  test('[TB-SAVED-LOCAL] a plan saved at 00:35 in Berlin on 14 Nov reads "Saved 14 Nov" on the Bag planner card, not 13 Nov', async () => {
    phoneIn('Europe/Berlin');
    localStorage.setItem('loadcheck:summary:v1', plan('2026-11-13T23:35:00.000Z'));
    await act(async () => { render(<BagCard services={browserServices()} />, host); });
    expect(host.textContent).toContain(W.tyreBagCardAge('14 Nov'));
  });

  test('[TB-SAVED-LOCAL] the tyre tool\'s "from your bag plan, saved …" reads the same day: the phone\'s, east and west of UTC', () => {
    phoneIn('Europe/Berlin');
    expect(savedDay('2026-11-13T23:35:00.000Z')).toBe('14 Nov');
    phoneIn('America/New_York');
    expect(savedDay('2026-11-14T03:00:00.000Z')).toBe('13 Nov');
    expect(savedDay('not a date')).toBeNull();
  });
});
