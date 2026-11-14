// Two windows on one trip (review of PR 101, M6): a settle in this window never writes stops it worked out from a trip another window
// has changed since. It is guarded as every Trip write is, by the version it read, and on a refusal it runs once more on the newer trip,
// so both changes stay. On the real store; the other window's write lands just after this window has read its inputs.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { anotherWindow, freshStore } from '../store/helpers.ts';
import { planStages } from '../../../src/core/route/stages.ts';
import type { Trip } from '../../../src/core/types.ts';
import { openDb } from '../../../src/store/db.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';
import { flatRoute, pointAtKm } from '../../fixtures/build.ts';
import { placeAt } from '../../fixtures/places.ts';

let between: (() => Promise<void>) | null = null;
vi.mock('../../../src/store/inputs.ts', async (original) => {
  const real = await original<typeof import('../../../src/store/inputs.ts')>();
  return {
    ...real,
    readInputs: async (now: Date) => {
      const read = await real.readInputs(now);
      const hook = between;
      between = null;
      if (hook) await hook();
      return read;
    },
  };
});
const { settleStops, stopChoices } = await import('../../../src/data/day-stops.ts');

vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => { freshStore(); localStorage.clear(); between = null; });

const NOW = new Date('2026-10-16T08:00:00Z');
const route = { ...flatRoute(270), id: 'route-flat270', hash: 'f'.repeat(64) };
const plan = [...planStages(route, { flatKph: 25, pace: 'sporting', nights: 2 })];

async function tripWithPlaces(spots: [string, number, string][]): Promise<void> {
  localStorage.setItem('copilot:settings', JSON.stringify({ nights: 2, pace: 'sporting', updatedAt: '2026-10-16T07:00:00.000Z' }));
  const trip: Trip = { route: { ...route, stages: plan }, departureDate: '2026-10-17', startTime: '08:30', flatKph: 25, stay: 'mixed', campWaterL: 2, pace: 'sporting' };
  await readTrip();
  await saveTrip(trip);
  const db = await openDb();
  for (const [kind, km, name] of spots) {
    const p = pointAtKm(km);
    const place = placeAt(kind as 'campsite', p.lat, p.lon, { id: `${kind}-${km}`, name });
    await db.put('places', place);
    await db.add('matches', { placeId: place.id, km, offRouteM: 0 });
  }
}

describe('A settle and another window (review of PR 101, M6)', () => {
  test('[TRIP-STOPS-WINDOWS] another window\'s "No stop" for day 1, saved while this window picks day 2, stays; this window\'s pick lands on top', async () => {
    await tripWithPlaces([['campsite', 92.4, 'Camping A'], ['lodging', 177, 'Hotel C'], ['lodging', 183, 'Hotel E']]);
    await settleStops(NOW);
    const pickDay2 = (await stopChoices(NOW, 2)).find((c) => c.name === 'Hotel E')!;
    between = async () => {
      const w2 = await anotherWindow();
      const t = (await w2.trip.readTrip())!;
      const days = [...t.stops!.days];
      days[0] = { placeId: null, km: 90, name: null, town: null, by: 'rider' };
      await w2.trip.saveTrip({ ...t, stops: { ...t.stops!, days } });
    };
    await settleStops(NOW, { day: 2, to: pickDay2 });
    const after = (await readTrip())!;
    expect(after.stops!.days[0]).toEqual({ placeId: null, km: 90, name: null, town: null, by: 'rider' });
    expect(after.stops!.days[1]).toMatchObject({ name: 'Hotel E', by: 'rider' });
    expect(after.route.stages.map((s) => s.endKm)).toEqual([90, 183, 270]);
  });
});
