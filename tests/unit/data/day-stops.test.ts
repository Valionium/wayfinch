// Days that end where you can sleep, on the real store (owner's ruling of 9 Nov 2026): chosen after Prepare this route, kept with
// the trip for its route and plan alone, changed by the rider with Undo, gone with the trip.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { freshStore } from '../store/helpers.ts';
import { planStages } from '../../../src/core/route/stages.ts';
import type { Trip } from '../../../src/core/types.ts';
import { settleStops, stopChoices } from '../../../src/data/day-stops.ts';
import { prepareTrip } from '../../../src/data/prepare.ts';
import { openDb } from '../../../src/store/db.ts';
import { readTrip, replaceRoute, saveTrip } from '../../../src/store/trip.ts';
import { removeTrip } from '../../../src/store/remove-trip.ts';
import { flatRoute, pointAtKm } from '../../fixtures/build.ts';
import { placeAt } from '../../fixtures/places.ts';
import { fixtureBuild, fixtureTrip, PackServer } from './pack-server.ts';

vi.setConfig({ testTimeout: 30_000 });
const boundaryText = readFileSync(fileURLToPath(new URL('../../../public/data/boundaries.v1.json', import.meta.url)), 'utf8');
beforeEach(() => { freshStore(); localStorage.clear(); });

const NOW = new Date('2026-10-16T08:00:00Z');
const route = { ...flatRoute(270), id: 'route-flat270', hash: 'f'.repeat(64) };
const plan = [...planStages(route, { flatKph: 25, pace: 'sporting', nights: 2 })];

/** A trip on the 270 km flat route (planned ends 90 and 180) with sleep places saved and matched. */
async function tripWithPlaces(spots: [string, number, string][], over: Partial<Trip> = {}): Promise<Trip> {
  localStorage.setItem('copilot:settings', JSON.stringify({ nights: 2, pace: 'sporting', updatedAt: '2026-10-16T07:00:00.000Z' }));
  const trip: Trip = { route: { ...route, stages: plan }, departureDate: '2026-10-17', startTime: '08:30', flatKph: 25, stay: 'mixed', campWaterL: 2, pace: 'sporting', ...over };
  await readTrip();
  await saveTrip(trip);
  const db = await openDb();
  for (const [kind, km, name] of spots) {
    const p = pointAtKm(km);
    const place = placeAt(kind as 'campsite', p.lat, p.lon, { id: `${kind}-${km}`, name });
    await db.put('places', place);
    await db.add('matches', { placeId: place.id, km, offRouteM: 0 });
  }
  return trip;
}

describe('day stops on the store', () => {
  test('[TRIP-DAY-STOPS] settling ends each day at the best place near its planned end and keeps the stops with the trip; the grid follows', async () => {
    await tripWithPlaces([['campsite', 92.4, 'KNAUS Campingpark Koblenz'], ['lodging', 177, 'Hotel Krone']]);
    const stops = await settleStops(NOW);
    expect(stops!.days.map((d) => d.name)).toEqual(['KNAUS Campingpark Koblenz', 'Hotel Krone']);
    const after = (await readTrip())!;
    expect(after.stops).toEqual(stops);
    expect(after.route.stages.map((s) => s.endKm)).toEqual([92.4, 177, 270]);
    expect(after.route.sampleGrid).toEqual(expect.arrayContaining([92.4, 177]));
    // Settling again changes nothing.
    await settleStops(NOW);
    expect((await readTrip())!.route.stages.map((s) => s.endKm)).toEqual([92.4, 177, 270]);
  });

  test('[TRIP-DAY-STOPS] the rider picks another place or "No stop", and Undo brings the day back exactly', async () => {
    await tripWithPlaces([['campsite', 92.4, 'Camping A'], ['lodging', 86, 'Hotel B'], ['lodging', 177, 'Hotel C']]);
    const first = (await settleStops(NOW))!;
    const choices = await stopChoices(NOW, 1);
    expect(choices.map((c) => c.name)).toEqual(['Camping A', 'Hotel B']);
    await settleStops(NOW, { day: 1, to: choices[1]! });
    let t = (await readTrip())!;
    expect(t.stops!.days[0]).toMatchObject({ name: 'Hotel B', km: 86, by: 'rider' });
    expect(t.route.stages[0]!.endKm).toBe(86);
    await settleStops(NOW, { day: 1, to: null });
    t = (await readTrip())!;
    expect(t.stops!.days[0]).toEqual({ placeId: null, km: 90, name: null, town: null, by: 'rider' });
    expect(t.route.stages.map((s) => s.endKm)).toEqual([90, 177, 270]);
    await settleStops(NOW, { restore: first });
    t = (await readTrip())!;
    expect(t.stops).toEqual(first);
    expect(t.route.stages.map((s) => s.endKm)).toEqual([92.4, 177, 270]);
  });

  test('[TRIP-DAY-STOPS] nothing near a planned end: that day keeps it, and says so; no places saved: no stops at all', async () => {
    await tripWithPlaces([['lodging', 177, 'Hotel C']]);
    const stops = (await settleStops(NOW))!;
    expect(stops.days[0]).toEqual({ placeId: null, km: 90, name: null, town: null, by: 'auto' });
    freshStore();
    await tripWithPlaces([]);
    expect(await settleStops(NOW)).toBeNull();
    expect((await readTrip())!.stops).toBeUndefined();
  });

  test('[TRIP-DAY-STOPS] other nights choose afresh, and the rider\'s choice of the old plan is not carried over', async () => {
    await tripWithPlaces([['campsite', 92.4, 'Camping A'], ['lodging', 86, 'Hotel B'], ['lodging', 177, 'Hotel C'], ['lodging', 135, 'Hotel D']]);
    await settleStops(NOW);
    await settleStops(NOW, { day: 1, to: (await stopChoices(NOW, 1))[1]! });
    localStorage.setItem('copilot:settings', JSON.stringify({ nights: 1, pace: 'sporting', updatedAt: '2026-10-16T07:30:00.000Z' }));
    const one = (await settleStops(NOW))!;
    expect(one.basis).toEqual([135]);
    expect(one.days).toEqual([expect.objectContaining({ name: 'Hotel D', by: 'auto' })]);
  });

  test('[TRIP-DAY-STOPS] never mixed between routes: a replaced route has none of the old stops; Remove this trip takes them', async () => {
    const trip = await tripWithPlaces([['campsite', 92.4, 'Camping A'], ['lodging', 177, 'Hotel C']]);
    await settleStops(NOW);
    const other = { ...route, id: 'route-other', hash: 'e'.repeat(64), points: [...route.points].reverse() };
    await replaceRoute(other);
    const t = (await readTrip())!;
    expect(t.stops === undefined || t.stops.routeId !== other.id).toBe(true);
    expect(t.route.stages.map((s) => s.endKm)).not.toContain(92.4);
    await saveTrip({ ...trip, stops: (await readTrip())!.stops });
    await removeTrip((await readTrip())!.route);
    expect(await readTrip()).toBeNull();
  });

  test('[TRIP-DAY-STOPS] Prepare this route ends the days at the places it saved, before the forecast asks for the grid', async () => {
    const t = await fixtureTrip('heidelberg-strasbourg');
    await readTrip();
    await saveTrip(t);
    const grids: number[][] = [];
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    await prepareTrip({
      fetch: async (input, init) => (String(input) === '/' ? new Response(null) : String(input) === '/data/boundaries.v1.json' ? new Response(boundaryText) : server.fetch(input, init)),
      now: () => NOW, sleep: async () => undefined, nav: {},
      fetchForecast: async (grid) => { grids.push(grid.map((g) => g.km)); return { fetchedAt: NOW, runs: [], grid: [], has15: false }; },
      fetchBaseline: async () => ({ years: '2021–2025', points: [] }),
      fetchElevation: async (points) => points.map(() => 200),
    }, () => undefined);
    const after = (await readTrip())!;
    expect(after.stops!.routeId).toBe(after.route.id);
    expect(after.stops!.days).toHaveLength(after.route.stages.length - 1);
    for (const [i, d] of after.stops!.days.entries()) expect(after.route.stages[i]!.endKm).toBeCloseTo(d.placeId === null ? after.stops!.basis[i]! : d.km, 9);
    expect(grids[0]).toEqual(after.route.sampleGrid);
  });
});
