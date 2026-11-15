// One queue for every Trip write of a window (review of PR 101, M5). A change of nights is planned and settled in its own turn, so
// the days are written once, already ending at the stops; Prepare this route's settle, the rider's picks and the change of nights
// wait for each other, so nothing the rider did is lost. On the real store; every trip write is recorded as it is made.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { freshStore } from '../store/helpers.ts';
import { dayStopOf } from '../../../src/core/route/day-stops.ts';
import { planStages } from '../../../src/core/route/stages.ts';
import type { Trip } from '../../../src/core/types.ts';
import { openDb } from '../../../src/store/db.ts';
import { flatRoute, pointAtKm } from '../../fixtures/build.ts';
import { placeAt } from '../../fixtures/places.ts';

/** Every trip the window writes, in order; `beforeWrite` runs (once) just before the next one is written. */
const writes: Trip[] = [];
let beforeWrite: (() => Promise<void>) | null = null;
/** Runs (once) just after the next settle has read its inputs. */
let afterInputs: (() => Promise<void>) | null = null;
vi.mock('../../../src/store/trip.ts', async (original) => {
  const real = await original<typeof import('../../../src/store/trip.ts')>();
  return {
    ...real,
    saveTrip: async (t: Trip) => {
      const hook = beforeWrite;
      beforeWrite = null;
      if (hook) await hook();
      writes.push(t);
      return real.saveTrip(t);
    },
  };
});
vi.mock('../../../src/store/inputs.ts', async (original) => {
  const real = await original<typeof import('../../../src/store/inputs.ts')>();
  return {
    ...real,
    readInputs: async (now: Date) => {
      const read = await real.readInputs(now);
      const hook = afterInputs;
      afterInputs = null;
      if (hook) await hook();
      return read;
    },
  };
});
const { readTrip, saveTrip } = await import('../../../src/store/trip.ts');
const { settleStops, stopChoices } = await import('../../../src/data/day-stops.ts');
const { settleDayStops } = await import('../../../src/data/heights.ts');
const { preparedStore } = await import('../../../src/store/prepared.ts');
const { browserTripServices } = await import('../../../src/ui/trip/services.ts');
const { removeTrip } = await import('../../../src/store/remove-trip.ts');
const { inTurn } = await import('../../../src/store/turn.ts');

vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => { freshStore(); localStorage.clear(); writes.length = 0; beforeWrite = null; afterInputs = null; });

const NOW = new Date('2026-10-16T08:00:00Z');
const route = { ...flatRoute(270), id: 'route-flat270', hash: 'f'.repeat(64) };
const plan = [...planStages(route, { flatKph: 25, pace: 'sporting', nights: 2 })];

/** The 270 km flat route (planned ends 90 and 180), 2 nights, with Camping A (92.4), Hotel B (86) and Hotel C (177) saved; settled. */
async function tripWithStops(settled = true): Promise<Trip> {
  localStorage.setItem('copilot:settings', JSON.stringify({ nights: 2, pace: 'sporting', updatedAt: '2026-10-16T07:00:00.000Z' }));
  const trip: Trip = { route: { ...route, stages: plan }, departureDate: '2026-10-17', startTime: '08:30', flatKph: 25, stay: 'mixed', campWaterL: 2, pace: 'sporting' };
  await readTrip();
  await saveTrip(trip);
  const db = await openDb();
  for (const [kind, km, name] of [['campsite', 92.4, 'Camping A'], ['lodging', 86, 'Hotel B'], ['lodging', 177, 'Hotel C']] as const) {
    const p = pointAtKm(km);
    const place = placeAt(kind, p.lat, p.lon, { id: `${kind}-${km}`, name });
    await db.put('places', place);
    await db.add('matches', { placeId: place.id, km, offRouteM: 0 });
  }
  if (settled) await settleStops(NOW);
  return (await readTrip())!;
}

/** A trip whose days end at the stops it holds: one stop per night, each day ending at its stop (or its planned end, for none). */
const daysEndAtStops = (t: Trip): boolean => t.stops !== undefined && t.stops.routeId === t.route.id && t.stops.days.length === t.route.stages.length - 1
  && t.stops.days.every((_, i) => dayStopOf(t, i) !== null);
/** Waits for `p`, but no longer than `ms`: a change queued behind the one under way can't end inside it. */
const awhile = (p: Promise<unknown>, ms = 400): Promise<void> => Promise.race([p.then(() => undefined, () => undefined), new Promise<void>((r) => setTimeout(r, ms))]);
const ends = (t: Trip): number[] => t.route.stages.map((s) => Math.round(s.endKm * 10) / 10);

describe('one queue for the stops and the days (review of PR 101, M5)', () => {
  test('[TRIP-STOPS-ONE-TURN] a change of nights writes the trip once: its days already end at the stops, planned around the rider\'s own', async () => {
    await tripWithStops();
    const hotelB = (await stopChoices(NOW, 1)).find((c) => c.name === 'Hotel B')!;
    await settleStops(NOW, { day: 1, to: hotelB });
    writes.length = 0;
    const svc = browserTripServices(() => NOW);
    const outcome = await svc.writeSettings({ nights: 3 });
    expect(outcome).toMatchObject({ ok: true, note: null });
    // Trip's own settle on the new days (its summary runs it when the days change) finds nothing left to write.
    await settleStops(NOW);
    expect(writes).toHaveLength(1);
    expect(daysEndAtStops(writes[0]!)).toBe(true);
    expect(ends(writes[0]!)).toEqual([86, 147.3, 208.7, 270]);
    expect(writes[0]!.stops!.days[0]).toMatchObject({ name: 'Hotel B', km: 86, by: 'rider' });
    expect(await readTrip()).toEqual(writes[0]);
  });

  test('[TRIP-STOPS-ONE-TURN] a stop picked while a change of nights is being written is kept: the pick waits for its turn', async () => {
    await tripWithStops();
    const hotelB = (await stopChoices(NOW, 1)).find((c) => c.name === 'Hotel B')!;
    writes.length = 0;
    let picked: Promise<unknown> = Promise.resolve();
    // The rider's pick lands just as the change of nights writes the days.
    beforeWrite = async () => {
      picked = settleStops(NOW, { day: 1, to: hotelB });
      await awhile(picked);
    };
    await browserTripServices(() => NOW).writeSettings({ nights: 3 });
    await picked;
    await settleStops(NOW);
    const after = (await readTrip())!;
    expect(after.stops!.days[0]).toMatchObject({ name: 'Hotel B', km: 86, by: 'rider' });
    expect(ends(after)).toEqual([86, 147.3, 208.7, 270]);
    expect(writes.every(daysEndAtStops)).toBe(true);
  });

  test('[TRIP-STOPS-ONE-TURN] the rider picks a stop and changes the nights while Prepare this route settles: both kept, each written once', async () => {
    const trip = await tripWithStops();
    const hotelB = (await stopChoices(NOW, 1)).find((c) => c.name === 'Hotel B')!;
    writes.length = 0;
    const svc = browserTripServices(() => NOW);
    let pick: Promise<unknown> = Promise.resolve();
    let nights: Promise<unknown> = Promise.resolve();
    // Prepare's settle has read its inputs: the rider picks Hotel B for day 1, then sets 3 nights.
    afterInputs = async () => {
      pick = settleStops(NOW, { day: 1, to: hotelB });
      nights = svc.writeSettings({ nights: 3 });
      await awhile(Promise.all([pick, nights]));
    };
    const settled = await settleDayStops(NOW, preparedStore, trip);
    expect(settled.route.id).toBe(route.id);
    await pick;
    await nights;
    await settleStops(NOW);
    const after = (await readTrip())!;
    expect(after.stops!.days[0]).toMatchObject({ name: 'Hotel B', km: 86, by: 'rider' });
    expect(ends(after)).toEqual([86, 147.3, 208.7, 270]);
    expect(daysEndAtStops(after)).toBe(true);
    // Prepare's settle had nothing to change; the pick and the nights are one write each, and no write held days and stops apart.
    expect(writes.every(daysEndAtStops)).toBe(true);
    expect(writes).toHaveLength(2);
  });
});

describe("the review's interleavings (review of PR 175, m-4)", () => {
  test("[TRIP-STOPS-ONE-TURN] Prepare's first settle after the places has work to do when the rider picks a stop and sets 3 nights: all three kept", async () => {
    const trip = await tripWithStops(false);
    const hotelB = (await stopChoices(NOW, 1)).find((c) => c.name === 'Hotel B')!;
    writes.length = 0;
    const svc = browserTripServices(() => NOW);
    let pick: Promise<unknown> = Promise.resolve();
    let nights: Promise<unknown> = Promise.resolve();
    afterInputs = async () => {
      pick = settleStops(NOW, { day: 1, to: hotelB });
      nights = svc.writeSettings({ nights: 3 });
      await awhile(Promise.all([pick, nights]));
    };
    await settleDayStops(NOW, preparedStore, trip);
    await pick;
    await nights;
    await settleStops(NOW);
    const after = (await readTrip())!;
    expect(after.stops!.days[0]).toMatchObject({ name: 'Hotel B', km: 86, by: 'rider' });
    expect(ends(after)).toEqual([86, 147.3, 208.7, 270]);
    // Prepare's stops, the pick and the nights: one write each, every one with its days ending at its stops.
    expect(writes).toHaveLength(3);
    expect(writes.every(daysEndAtStops)).toBe(true);
    expect(writes[0]!.stops!.days.map((d) => d.name)).toEqual(['Camping A', 'Hotel C']);
  });

  test("[TRIP-STOPS-ONE-TURN] a date set on Trip while You's flat speed is being settled is kept: both services objects share the turn", async () => {
    await tripWithStops();
    const tripScreen = browserTripServices(() => NOW);
    const you = browserTripServices(() => NOW);
    let dated: Promise<unknown> = Promise.resolve();
    beforeWrite = async () => {
      dated = tripScreen.setDeparture('2026-10-20');
      await awhile(dated);
    };
    expect(await you.writeSettings({ flatKph: 28 })).toMatchObject({ ok: true, note: null });
    expect(await dated).toBeNull();
    const after = (await readTrip())!;
    expect(after.departureDate).toBe('2026-10-20');
    expect(after.flatKph).toBe(28);
    expect(after.stops!.days.map((d) => d.name)).toEqual(['Camping A', 'Hotel C']);
  });

  test('[TRIP-STOPS-ONE-TURN] Remove this trip tapped while a stop is being written: the trip stays removed', async () => {
    const t = await tripWithStops();
    const hotelB = (await stopChoices(NOW, 1)).find((c) => c.name === 'Hotel B')!;
    let removed: Promise<unknown> = Promise.resolve();
    beforeWrite = async () => {
      removed = removeTrip(t.route);
      await awhile(removed);
    };
    await settleStops(NOW, { day: 1, to: hotelB });
    await removed;
    expect(await readTrip()).toBeNull();
  });
});

describe('the queue between tests (review of PR 175, m-5)', () => {
  test('[TRIP-STOPS-ONE-TURN] a test that leaves a turn hanging (here, one that never ends)', async () => {
    void inTurn(() => new Promise<never>(() => undefined));
    expect(true).toBe(true);
  });
  test("[TRIP-STOPS-ONE-TURN] does not hold the next test's writes: the queue starts empty for each test", async () => {
    await tripWithStops();
    expect((await readTrip())!.stops!.days.map((d) => d.name)).toEqual(['Camping A', 'Hotel C']);
  });
});
