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
import { exportAll, importAll } from '../../../src/store/export.ts';
import type { ExportFile } from '../../../src/store/export.ts';
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

describe('review of PR 101: stops judged again, gone places, export', () => {
  /** Adds a place and its match after the trip is stored. */
  async function addPlace(kind: string, km: number, name: string, over: Record<string, unknown> = {}): Promise<string> {
    const p = pointAtKm(km);
    const place = placeAt(kind as 'campsite', p.lat, p.lon, { id: `${kind}-${km}`, name, ...over });
    const db = await openDb();
    await db.put('places', place);
    await db.add('matches', { placeId: place.id, km, offRouteM: 0 });
    return place.id;
  }
  async function dropPlace(id: string): Promise<void> {
    const db = await openDb();
    await db.delete('places', id);
    const tx = db.transaction('matches', 'readwrite');
    for (let c = await tx.store.openCursor(); c; c = await c.continue()) if ((c.value as { placeId: string }).placeId === id) await c.delete();
    await tx.done;
  }
  const setDate = async (date: string | null): Promise<void> => { const t = (await readTrip())!; await saveTrip({ ...t, departureDate: date }); };

  test('[TRIP-DAY-STOPS] a date set later judges the stops again: an automatic stop closed that night is replaced (I1)', async () => {
    await tripWithPlaces([['lodging', 95, 'Open Hotel'], ['lodging', 177, 'Hotel C']], { departureDate: null });
    await addPlace('campsite', 91, 'Seasonal Camp', { seasonal: 'Apr-Oct' });
    expect((await settleStops(NOW))!.days[0]!.name).toBe('Seasonal Camp');
    await setDate('2026-11-10');
    const again = (await settleStops(NOW))!;
    expect(again.days[0]!.name).toBe('Open Hotel');
    expect((await readTrip())!.route.stages[0]!.endKm).toBe(95);
  });

  test('[TRIP-DAY-STOPS] prepared hours closed on the night of day 1 make that place no stop, also when it was held before (I1)', async () => {
    await tripWithPlaces([['lodging', 91, 'Shut Monday'], ['lodging', 96, 'Open'], ['lodging', 177, 'Hotel C']], { departureDate: '2026-11-09' });
    expect((await settleStops(NOW))!.days[0]!.name).toBe('Shut Monday');
    await (await openDb()).put('hours', { placeId: 'lodging-91', windowStart: new Date('2026-11-01T00:00:00Z'), windowEnd: new Date('2026-11-30T00:00:00Z'),
      spans: [{ from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-30T00:00:00Z'), state: 'closed' }] });
    expect((await settleStops(NOW))!.days[0]!.name).toBe('Open');
  });

  test('[TRIP-DAY-STOPS] a stop the rider chose that is closed that night is kept, and marked closed (I1)', async () => {
    await tripWithPlaces([['lodging', 95, 'Open Hotel'], ['lodging', 177, 'Hotel C']], { departureDate: null });
    await addPlace('campsite', 88, 'Seasonal Camp', { seasonal: 'Apr-Oct' });
    await settleStops(NOW);
    const camp = (await stopChoices(NOW, 1)).find((c) => c.name === 'Seasonal Camp')!;
    await settleStops(NOW, { day: 1, to: camp });
    await setDate('2026-11-10');
    const again = (await settleStops(NOW))!;
    expect(again.days[0]).toMatchObject({ name: 'Seasonal Camp', by: 'rider', closed: true });
    await setDate('2026-06-10');
    expect((await settleStops(NOW))!.days[0]!.closed).toBeUndefined();
  });

  test('[TRIP-DAY-STOPS] a stop whose place is gone from the saved places is chosen afresh; a rider\'s says so (I2)', async () => {
    await tripWithPlaces([['lodging', 91, 'Gone Hotel'], ['lodging', 96, 'Other'], ['lodging', 177, 'Hotel C']]);
    expect((await settleStops(NOW))!.days[0]!.name).toBe('Gone Hotel');
    await dropPlace('lodging-91');
    const auto = (await settleStops(NOW))!;
    expect(auto.days[0]).toMatchObject({ name: 'Other', by: 'auto' });
    expect(auto.days[0]!.was).toBeUndefined();
    await settleStops(NOW, { day: 1, to: (await stopChoices(NOW, 1)).find((c) => c.name === 'Other')! });
    await dropPlace('lodging-96');
    await addPlace('lodging', 93, 'Newer');
    const replaced = (await settleStops(NOW))!;
    expect(replaced.days[0]).toMatchObject({ name: 'Newer', by: 'auto', was: 'Other' });
    expect((await readTrip())!.route.stages[0]!.endKm).toBe(93);
    // said until the rider picks again, not lost on the next settle
    expect((await settleStops(NOW))!.days[0]!.was).toBe('Other');
  });

  test('[TRIP-DAY-STOPS] export and import carry the stops, the rider\'s own pick included; another route\'s are left out (I3)', async () => {
    await tripWithPlaces([['lodging', 91, 'H1'], ['lodging', 86, 'H2'], ['lodging', 177, 'Hotel C']]);
    await settleStops(NOW);
    await settleStops(NOW, { day: 1, to: (await stopChoices(NOW, 1)).find((c) => c.name === 'H2')! });
    const before = (await readTrip())!.stops;
    const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
    expect(file.trip!.stops).toEqual(before);
    freshStore();
    expect((await importAll(file)).ok).toBe(true);
    expect((await readTrip())!.stops).toEqual(before);
    freshStore();
    const other = JSON.parse(JSON.stringify(file)) as ExportFile;
    other.trip!.stops = { ...other.trip!.stops!, routeId: 'route-else' };
    expect((await importAll(other)).ok).toBe(true);
    expect((await readTrip())!.stops).toBeUndefined();
  });
});
