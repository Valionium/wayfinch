import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { freshStore } from '../store/helpers.ts';
import { kitchenHoursId, stateAt } from '../../../src/core/hours/check.ts';
import { tileKey } from '../../../src/core/places/tiles.ts';
import { screen } from '../../../src/core/screen/screen.ts';
import { assembleRoute, buildRoute } from '../../../src/core/route/profile.ts';
import { haversineKm } from '../../../src/core/geo/haversine.ts';
import { W } from '../../../src/core/wording/en.ts';
import type { Baseline, Place, PlaceHours, RescuePoint, Roof, RouteMatch, ScreenInputs, StoredForecast, Trip } from '../../../src/core/types.ts';
import { catchUpHours, prepareTrip } from '../../../src/data/prepare.ts';
import type { PrepareDeps, StepReport } from '../../../src/data/prepare.ts';
import { openDb } from '../../../src/store/db.ts';
import { readInputs } from '../../../src/store/inputs.ts';
import { readWeatherState } from '../../../src/store/weather.ts';
import { preparedStore, PERSIST_META, readPrepared } from '../../../src/store/prepared.ts';
import { readPackRun, readTrip, replaceRoute, saveTrip } from '../../../src/store/trip.ts';
import { placeAt, rescueAt, roofAt } from '../../fixtures/places.ts';
import { flatRoute } from '../../fixtures/build.ts';
import { buildOf, fixtureBuild, fixtureTrip, ORIGIN, PackServer, rebuilt } from './pack-server.ts';
import type { Build } from './pack-server.ts';

const openingHours = vi.hoisted(() => ({ tags: [] as string[] }));
vi.mock('opening_hours', async (original) => {
  const real = (await original()) as { default: new (...a: unknown[]) => object };
  class Counted extends real.default {
    constructor(...a: unknown[]) {
      super(...a);
      openingHours.tags.push(String(a[0]));
    }
  }
  return { ...real, default: Counted };
});

beforeEach(() => {
  freshStore();
  openingHours.tags.length = 0;
});

const boundaryText = readFileSync(fileURLToPath(new URL('../../../public/data/boundaries.v1.json', import.meta.url)), 'utf8');
const NOW = new Date('2026-10-16T08:00:00Z');

const forecast = (): StoredForecast => ({ fetchedAt: NOW, runs: [], grid: [], has15: false });
const baseline = (): Baseline => ({ years: '2021–2025', points: [] });

/** The whole of preparation on a stub network: the data project, the site itself, and stubs for Open-Meteo (Task 10). */
function depsFor(server: PackServer, over: Partial<PrepareDeps> = {}): PrepareDeps & { log: string[] } {
  const log: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === '/') return new Response(null, { status: 200 });
    if (url === '/data/boundaries.v1.json') return new Response(boundaryText);
    return server.fetch(input, init);
  };
  return {
    log, fetch: fetcher, now: () => NOW, sleep: async () => undefined, nav: {},
    fetchForecast: async () => { log.push('forecast'); return forecast(); },
    fetchBaseline: async () => { log.push('baseline'); return baseline(); },
    fetchElevation: async (points) => { log.push('elevation'); return points.map(() => 200); },
    ...over,
  };
}

async function onTrip(id: Parameters<typeof fixtureTrip>[0] = 'heidelberg-strasbourg', over: Partial<Trip> = {}): Promise<Trip> {
  const t = { ...(await fixtureTrip(id)), ...over };
  await readTrip();
  await saveTrip(t);
  return t;
}

const step = (r: StepReport[], name: StepReport['step']): StepReport => r.find((s) => s.step === name)!;
const inputs = async (now: Date = NOW): Promise<ScreenInputs> => (await readInputs(now))!;
const stored = async <T>(name: string): Promise<T[]> => (await (await openDb()).getAll(name)) as T[];

describe('the steps', () => {
  test('[PREP-STEPS] order heights → places → hours → weather → baseline → save, each reported, with progress', async () => {
    await onTrip();
    const seen: string[] = [];
    const reports = await prepareTrip(depsFor(new PackServer(fixtureBuild('heidelberg-strasbourg'))), (s) => { if (seen.at(-1) !== s) seen.push(s); });
    expect(reports.map((r) => r.step)).toEqual(['heights', 'places', 'hours', 'weather', 'baseline', 'save']);
    expect(seen).toEqual(['heights', 'places', 'hours', 'weather', 'baseline', 'save']);
    for (const r of reports) expect(r).toMatchObject({ ok: true, note: null });
  });

  test('[PREP-STEPS] with weather failing, places and hours are saved and reported ok; weather is named; the trip is marked prepared; Water names what is absent', async () => {
    await onTrip();
    const deps = depsFor(new PackServer(fixtureBuild('heidelberg-strasbourg')), { fetchForecast: async () => { throw new Error('refused'); } });
    const reports = await prepareTrip(deps, () => undefined);
    expect(step(reports, 'places').ok).toBe(true);
    expect(step(reports, 'hours').ok).toBe(true);
    expect(step(reports, 'weather')).toMatchObject({ ok: false, note: W.prepWeatherFailed });
    expect(step(reports, 'baseline').ok).toBe(true);
    expect(step(reports, 'save').ok).toBe(true);
    expect((await stored('places')).length).toBeGreaterThan(0);
    expect((await stored('hours')).length).toBeGreaterThan(0);
    const prepared = await readPrepared();
    expect(prepared?.steps.find((s) => s.step === 'weather')?.ok).toBe(false);
    const s = screen(await inputs());
    expect(s.cards.water.missing).toContain('weather');
    expect(s.cards.water.missing).not.toContain('places');
  });

  test('[PREP-STEPS] a forecast held from before stays when the new one fails', async () => {
    await onTrip();
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    await prepareTrip(depsFor(server), () => undefined);
    await prepareTrip(depsFor(server, { fetchForecast: async () => { throw new Error('refused'); }, fetchBaseline: async () => { throw new Error('refused'); } }), () => undefined);
    const i = await inputs();
    expect(i.forecast).not.toBeNull();
    expect(i.baseline).not.toBeNull();
  });

  test('[PREP-STEPS] the forecast asks for the trip\'s grid, up to its end, hourly only; the baseline for the stage ends and high point in the trip\'s months', async () => {
    const trip = await onTrip();
    let seenGrid: { km: number; lat: number; lon: number }[] = [];
    let seenOptions: { days: number; with15: boolean } | null = null;
    let seenPoints: { km: number }[] = [];
    let seenMonths: number[] = [];
    await prepareTrip(depsFor(new PackServer(fixtureBuild('heidelberg-strasbourg')), {
      fetchForecast: async (grid, o) => { seenGrid = grid; seenOptions = o; return forecast(); },
      fetchBaseline: async (points, months) => { seenPoints = points; seenMonths = months; return baseline(); },
    }), () => undefined);
    const saved = (await readTrip())!;
    expect(seenGrid.map((g) => g.km)).toEqual(saved.route.sampleGrid);
    expect(saved.route.sampleGrid.length).toBeGreaterThan(5);
    // From 16 October to the planned end of a trip leaving on the 17th.
    expect(seenOptions).toMatchObject({ days: saved.route.stages.length + 1, with15: false });
    expect(trip.departureDate).toBe('2026-10-17');
    const ends = saved.route.stages.map((st) => st.endKm);
    for (const e of ends) expect(seenPoints.map((p) => p.km)).toContain(e);
    expect(seenMonths).toEqual([10]);
  });

  test('[PREP-STEPS] with no connection nothing is asked of the outside; what needs none still runs', async () => {
    await onTrip();
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    const deps = depsFor(server);
    await prepareTrip(deps, () => undefined);
    const before = server.requests.length;
    const log = deps.log.length;
    const offline = depsFor(server);
    const reports = await prepareTrip({ ...offline, fetch: async (u) => { if (String(u) === '/data/boundaries.v1.json') return new Response(boundaryText); throw new Error('no signal'); } }, () => undefined);
    expect(server.requests.length).toBe(before);
    expect(offline.log).toEqual([]);
    expect(log).toBeGreaterThan(0);
    expect(step(reports, 'hours').ok).toBe(true);
    expect(step(reports, 'places').ok).toBe(true); // all was saved
    expect(step(reports, 'weather')).toMatchObject({ ok: false, note: W.prepNoConnection });
    expect(step(reports, 'baseline')).toMatchObject({ ok: false, note: W.prepNoConnection });
  });

  test('[PREP-STEPS] a route replaced during preparation gets nothing of the old one', async () => {
    await onTrip();
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    let replaced = false;
    server.intercept = (url) => {
      if (url.includes('/t/') && !replaced) {
        replaced = true;
        void readTrip().then(() => replaceRoute(flatRoute(50, { stageEnds: [50] })));
      }
      return null;
    };
    const reports = await prepareTrip(depsFor(server), () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(replaced).toBe(true);
    expect(reports.some((r) => r.note === W.prepRouteReplaced)).toBe(true);
    for (const name of ['places', 'matches', 'hours', 'roofs', 'rescuePoints', 'savedTiles', 'forecast', 'baseline']) expect(await stored(name), name).toEqual([]);
    expect(await readPrepared()).toBeNull();
    const i = await inputs();
    expect(i.savedKm).toEqual([]);
    expect(i.routeZones).toEqual([]);
  });
});

describe('with Update weather', () => {
  test('[PREP-STEPS] the steps ending mark the trip prepared for Update weather, and its turn to ask is shared', async () => {
    const t = await onTrip();
    expect((await readWeatherState())!.prepared).toBe(false);
    let asked = 0;
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    const deps = depsFor(server, { fetchForecast: async () => { asked++; return forecast(); } });
    await prepareTrip(deps, () => undefined);
    expect((await readWeatherState())!.prepared).toBe(true);
    expect(asked).toBe(1);
    // Minutes later, Get ready again: the forecast just fetched stays, and nothing is sent.
    const again = await prepareTrip(deps, () => undefined);
    expect(asked).toBe(1);
    expect(step(again, 'weather')).toMatchObject({ ok: true, note: W.prepWeatherRecent });
    // A route replaced: the mark goes with it.
    await replaceRoute(flatRoute(40, { stageEnds: [40] }));
    expect((await readWeatherState())!.prepared).toBe(false);
    expect(t.route.id).not.toBe((await readTrip())!.route.id);
  });
});

describe('heights', () => {
  async function noHeights(): Promise<Trip> {
    const base = await fixtureTrip('heidelberg-strasbourg');
    const points = base.route.points.map((p) => ({ lat: p.lat, lon: p.lon, ele: null }));
    const route = await buildRoute(points, base.route.name, 'gpx');
    const t: Trip = { ...base, route };
    await readTrip();
    await saveTrip(t);
    return t;
  }

  test('[PREP-HEIGHTS] the notice is given first, heights looked up, and stages, grid and baseline points fixed only after; the hash is set when final', async () => {
    const before = await noHeights();
    expect(before.route.stages).toEqual([]);
    const order: string[] = [];
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    const reports = await prepareTrip(depsFor(server, {
      onNotice: (text) => { order.push(`notice:${text}`); },
      // A climb in the middle of the route, so the grid gains climb points.
      fetchElevation: async (points) => {
        order.push('elevation');
        expect(points.length).toBeGreaterThan(10);
        return points.map((_, i) => (i < points.length * 0.4 ? 300 - i * 0.2 : i < points.length * 0.5 ? 200 + (i - points.length * 0.4) * 8 : 100));
      },
      fetchForecast: async (grid) => { order.push(`forecast:${grid.length}`); return forecast(); },
      fetchBaseline: async (points) => { order.push(`baseline:${points.length}`); return baseline(); },
    }), () => undefined);
    expect(step(reports, 'heights').ok).toBe(true);
    expect(order[0]).toBe(`notice:${W.prepHeightsNotice}`);
    expect(order[1]).toBe('elevation');
    const after = (await readTrip())!;
    expect(after.route.ascentM).not.toBeNull();
    expect(after.route.points.every((p) => p.ele !== null)).toBe(true);
    expect(after.route.stages.length).toBeGreaterThan(0);
    expect(after.route.climbs.length).toBeGreaterThan(0);
    expect(after.route.sampleGrid).toEqual(expect.arrayContaining([expect.closeTo(after.route.climbs[0]!.topKm, 2)]));
    expect(after.route.hash).not.toBe(before.route.hash);
    expect(after.route.id).toBe(`route-${after.route.hash.slice(0, 12)}`);
    expect(order.at(-2)).toBe(`forecast:${after.route.sampleGrid.length}`);
    // The line is the same: nothing of the route's data was thrown away, and its kilometres stand.
    expect(after.route.lengthKm).toBe(before.route.lengthKm);
    expect((await stored('places')).length).toBeGreaterThan(0);
  });

  test('[PREP-HEIGHTS] failing: stages split by distance, climbing unknown, no climb points, and the others go on', async () => {
    await noHeights();
    let asked = 0;
    const reports = await prepareTrip(depsFor(new PackServer(fixtureBuild('heidelberg-strasbourg')), {
      fetchElevation: async (points) => { asked++; return points.map((_, i) => (i === 3 ? null : 200)); },
    }), () => undefined);
    expect(asked).toBe(1);
    expect(step(reports, 'heights')).toMatchObject({ ok: false, note: W.prepHeightsFailed });
    expect(step(reports, 'places').ok).toBe(true);
    const after = (await readTrip())!;
    expect(after.route.ascentM).toBeNull();
    expect(after.route.climbs).toEqual([]);
    expect(after.route.points.every((p) => p.ele === null)).toBe(true);
    expect(after.route.stages.length).toBeGreaterThan(0);
    const screenNow = screen(await inputs());
    expect(screenNow.cards.climbing.status).toBe('unknown');
    expect(screenNow.cards.water.missing).toContain('heights');
  });

  test('[PREP-HEIGHTS] no heights asked for a route that has them, and no notice', async () => {
    await onTrip();
    const notices: string[] = [];
    const deps = depsFor(new PackServer(fixtureBuild('heidelberg-strasbourg')), { onNotice: (t) => { notices.push(t); } });
    await prepareTrip(deps, () => undefined);
    expect(notices).toEqual([]);
    expect(deps.log).not.toContain('elevation');
  });

  test('[PREP-HEIGHTS] a section break of the GPX adds no distance when the route is built again', async () => {
    const raw = [
      { lat: 49.0, lon: 8.0, ele: null }, { lat: 49.01, lon: 8.0, ele: null },
      { lat: 49.2, lon: 8.2, ele: null, break: true as const }, { lat: 49.21, lon: 8.2, ele: null },
    ];
    const route = await buildRoute(raw, 'break', 'gpx');
    await readTrip();
    await saveTrip({ route, departureDate: '2026-10-17', startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2 });
    await prepareTrip(depsFor(new PackServer(fixtureBuild('heidelberg-strasbourg'))), () => undefined);
    const after = (await readTrip())!.route;
    expect(after.ascentM).not.toBeNull();
    expect(after.lengthKm).toBeCloseTo(route.lengthKm, 6);
    expect(after.points.map((p) => p.km)).toEqual(route.points.map((p) => p.km));
  });
});

describe('hours', () => {
  const lat = 49.3;
  const lon = 8.6;
  const line = (): { lat: number; lon: number; ele: number }[] => Array.from({ length: 21 }, (_, i) => ({ lat: lat + i * 0.002, lon, ele: 100 }));
  async function packTrip(places: Place[], roofs: Roof[] = [], rescue: ReturnType<typeof rescueAt>[] = []): Promise<{ trip: Trip; build: Build }> {
    const route = await buildRoute(line(), 'short', 'gpx');
    const trip: Trip = { route, departureDate: '2026-10-17', startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2 };
    await readTrip();
    await saveTrip(trip);
    return { trip, build: buildOf({ places, roofs, rescuePoints: rescue }, '20261028-3', ['shop', 'restaurant', 'station', 'water', 'settlement', 'shelter']) };
  }
  const shopAt = (id: string, tag: string | null, over: Partial<Place> = {}): Place => placeAt('shop', lat + 0.002, lon, {
    id, openingHours: tag, country: 'DE', subdivision: 'DE-BW', hoursRegionKey: 'DE-BW', holidayZone: 'DE-BW', timeZone: 'Europe/Berlin', tags: { shop: 'convenience' }, ...over,
  });

  test('[PREP-HOURS] spans cover the trip window with no holes; one tag on many places runs once; screen() never runs the library', async () => {
    const places = Array.from({ length: 30 }, (_, i) => shopAt(`n${i}`, 'Mo-Sa 08:00-20:00'));
    const { trip, build } = await packTrip(places);
    await prepareTrip(depsFor(new PackServer(build)), () => undefined);
    const hours = await stored<PlaceHours>('hours');
    expect(hours).toHaveLength(30);
    const start = new Date('2026-10-16T22:00:00Z'); // 17 October, 00:00 in Berlin
    for (const h of hours) {
      expect(h.windowStart).toEqual(start);
      // The planned end + 3 days, whole.
      const days = trip.route.stages.length || (await readTrip())!.route.stages.length;
      expect(h.windowEnd.getTime()).toBeGreaterThanOrEqual(start.getTime() + (days + 3) * 86_400_000);
      expect(h.spans[0]!.from).toEqual(h.windowStart);
      expect(h.spans.at(-1)!.to).toEqual(h.windowEnd);
      h.spans.forEach((s, i) => { if (i > 0) expect(s.from).toEqual(h.spans[i - 1]!.to); });
    }
    expect(openingHours.tags.filter((t) => t === 'Mo-Sa 08:00-20:00')).toHaveLength(1);
    openingHours.tags.length = 0;
    screen(await inputs());
    expect(openingHours.tags).toEqual([]);
  });

  test('[PREP-HOURS] the cache tells apart what the rules read: zone, kind and a station within 100 m', async () => {
    const tag = 'Mo-Sa 08:00-20:00';
    const station = placeAt('station', lat + 0.0025, lon, { id: 'n900', timeZone: 'Europe/Berlin', country: 'DE', holidayZone: 'DE-BW', tags: { railway: 'station' } });
    const { build } = await packTrip([
      shopAt('n1', null), shopAt('n2', null, { tags: { shop: 'bakery' } }),
      shopAt('n3', null, { lat: lat + 0.0025, tags: { shop: 'convenience' } }),
      shopAt('n4', tag, { country: 'CH', holidayZone: 'CH-ZH', hoursRegionKey: 'CH-ZH' }),
      shopAt('n5', null, { lat: lat + 0.0025, country: 'CH', holidayZone: 'CH-ZH', hoursRegionKey: 'CH-ZH', tags: { shop: 'convenience' } }),
      shopAt('n6', null, { lat: lat + 0.006, country: 'CH', holidayZone: 'CH-ZH', hoursRegionKey: 'CH-ZH', tags: { shop: 'convenience' } }),
      station,
    ]);
    await prepareTrip(depsFor(new PackServer(build)), () => undefined);
    const hours = new Map((await stored<PlaceHours>('hours')).map((h) => [h.placeId, h]));
    const sunday = new Date('2026-10-18T10:00:00Z');
    expect(stateAt(hours.get('n1'), sunday).reason).toBe(W.foodUnknownSundayRules);
    // A bakery may be open, unlike a food shop.
    expect(stateAt(hours.get('n2'), sunday).state).toBe('unknown');
    expect(stateAt(hours.get('n1'), sunday).state).toBe('possibly-closed');
    // In Switzerland a shop at a station may be open on a Sunday, and one away from it probably is not.
    expect(stateAt(hours.get('n5'), sunday).state).toBe('unknown');
    expect(stateAt(hours.get('n6'), sunday).state).toBe('possibly-closed');
  });

  test('[PREP-HOURS] a place outside the first countries loses its PH rules, as a refreshed one does, rather than reading unknown', async () => {
    const { build } = await packTrip([shopAt('n1', 'Mo-Sa 08:00-20:00; PH off', { country: 'LI', holidayZone: null, hoursRegionKey: null, subdivision: null, timeZone: 'Europe/Vaduz' })]);
    await prepareTrip(depsFor(new PackServer(build)), () => undefined);
    const h = (await stored<PlaceHours>('hours')).find((x) => x.placeId === 'n1')!;
    expect(stateAt(h, new Date('2026-10-17T10:00:00Z')).state).toBe('open');
  });

  test('[PREP-KITCHEN] a place with opening_hours:kitchen has spans under kitchenHoursId(id); Food uses them for a meal stop', async () => {
    const stop = { indoorSeating: true, outdoorSeating: null, toilets: null, takeaway: null, bikeParking50m: false };
    const zone = { country: 'DE', subdivision: 'DE-BW', hoursRegionKey: 'DE-BW', holidayZone: 'DE-BW', timeZone: 'Europe/Berlin' };
    const inn = placeAt('restaurant', lat + 0.03, lon, { id: 'n7', name: 'Zum Ochsen', openingHours: 'Mo-Su 08:00-23:00', ...zone, tags: { amenity: 'restaurant' }, stop: { ...stop, kitchenHours: 'Mo-Su 11:30-14:00' } });
    const { build } = await packTrip([inn]);
    await prepareTrip(depsFor(new PackServer(build)), () => undefined);
    const hours = new Map((await stored<PlaceHours>('hours')).map((h) => [h.placeId, h]));
    const kitchen = hours.get(kitchenHoursId('n7'))!;
    expect(kitchen).toBeDefined();
    expect(stateAt(kitchen, new Date('2026-10-17T10:00:00Z')).state).toBe('open'); // 12:00 in Berlin
    expect(stateAt(kitchen, new Date('2026-10-17T15:00:00Z')).state).toBe('closed'); // 17:00: the inn itself is open
    expect(stateAt(hours.get('n7'), new Date('2026-10-17T15:00:00Z')).state).toBe('open');
    // A place without the tag has no such record.
    expect(hours.has(kitchenHoursId('n999'))).toBe(false);

    // Through screen(): the rider reaches the inn at lunch, and is offered it for a meal; with the kitchen hours gone he isn't.
    const i = await inputs(new Date('2026-10-17T07:00:00Z'));
    const position = { lat, lon, accuracyM: 10, at: new Date('2026-10-17T09:50:00Z'), km: 0, offRouteM: 0, source: 'gps' as const, approximate: false };
    const lunch = { ...i, now: new Date('2026-10-17T09:50:00Z'), positions: [position] };
    const withKitchen = JSON.stringify(screen(lunch).cards.food);
    const without = JSON.stringify(screen({ ...lunch, hours: lunch.hours.filter((h) => h.placeId !== kitchenHoursId('n7')) }).cards.food);
    expect(withKitchen).toContain('Zum Ochsen');
    expect(withKitchen).not.toBe(without);
  });

  test('[PREP-MATCHES] rescue points carry kms and lie within 3 km of the route; roofs and places get one match per pass; what is of no use is not kept', async () => {
    const near = placeAt('water', lat + 0.01, lon + 0.002, { id: 'n1' });
    const far = placeAt('water', lat + 0.01, lon + 0.1, { id: 'n2' }); // 7 km off, past the 1 km of water
    const town = placeAt('settlement', lat + 0.01, lon + 0.1, { id: 'n3', name: 'Abseits' }); // kept: a rider far off asks for it
    const onRoute = rescueAt(lat + 0.01, lon, 'KA-1');
    const off2km = rescueAt(lat + 0.01, lon + 0.027, 'KA-2');
    const off10km = rescueAt(lat + 0.01, lon + 0.14, 'KA-3');
    const { trip } = await packTrip([]);
    const route = (await readTrip())!.route;
    const build = buildOf({ places: [near, far, town], roofs: [roofAt(lat + 0.01, lon, { kind: 'bus_stop' }), roofAt(lat + 0.01, lon + 0.1, { kind: 'bus_stop' })], rescuePoints: [onRoute, off2km, off10km] }, '20261028-4', ['water', 'settlement']);
    await prepareTrip(depsFor(new PackServer(build)), () => undefined);
    expect(trip.route.id).toBe(route.id);
    const rescue = await stored<RescuePoint>('rescuePoints');
    expect(rescue.map((r) => r.ref).sort()).toEqual(['KA-1', 'KA-2']);
    const first = rescue.find((r) => r.ref === 'KA-1')!;
    expect(first.kms).toHaveLength(1);
    expect(first.kms[0]).toBeCloseTo(haversineKm(route.points[0]!, onRoute), 0);
    expect(rescue.find((r) => r.ref === 'KA-2')!.kms).toEqual([]);
    const matches = await stored<RouteMatch>('matches');
    expect(matches.map((m) => m.placeId)).toEqual(['n1']);
    expect((await stored<Place>('places')).map((p) => p.id).sort()).toEqual(['n1', 'n3']);
    expect(await stored<Roof>('roofs')).toHaveLength(1);
  });

  test('[PREP-MATCHES] an out-and-back passes a place twice: two matches, and running it again adds nothing', async () => {
    const there = Array.from({ length: 41 }, (_, i) => ({ lat: lat + i * 0.005, lon, ele: 100 }));
    const back = [...there].reverse().slice(1);
    const route = await buildRoute([...there, ...back], 'there and back', 'gpx');
    await readTrip();
    await saveTrip({ route, departureDate: '2026-10-17', startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2 });
    const build = buildOf({
      places: [placeAt('water', lat + 0.05, lon, { id: 'n1' })],
      roofs: [roofAt(lat + 0.05, lon)],
      rescuePoints: [rescueAt(lat + 0.05, lon, 'KA-1')],
    }, '20261028-5', ['water']);
    const server = new PackServer(build);
    const check = async (): Promise<void> => {
      expect(await stored<RouteMatch>('matches')).toHaveLength(2);
      expect(await stored<Roof>('roofs')).toHaveLength(1);
      const rescue = await stored<RescuePoint>('rescuePoints');
      expect(rescue).toHaveLength(1);
      expect(rescue[0]!.kms).toHaveLength(2);
    };
    await prepareTrip(depsFor(server), () => undefined);
    await check();
    await prepareTrip(depsFor(server), () => undefined);
    await check();
  });
});

describe('what two tiles both hold', () => {
  test('[PREP-MATCHES] a roof or rescue point written into two tiles is kept once', async () => {
    const base = await fixtureTrip('heidelberg-strasbourg');
    await readTrip();
    await saveTrip(base);
    const a = base.route.points[0]!;
    const b = base.route.points.at(-1)!;
    const roof = roofAt(a.lat, a.lon);
    const point = rescueAt(a.lat, a.lon, 'KA-1');
    const first = buildOf({ places: [], roofs: [roof], rescuePoints: [point] }, '20261028-7');
    const second = buildOf({ places: [placeAt('water', b.lat, b.lon, { id: 'n1' })], roofs: [], rescuePoints: [] }, '20261028-7');
    // The second tile holds the same roof and point as well: its text is written by hand, with its hash.
    const t = second.manifest.tiles[0]!;
    const path = `t/${t.z}/${t.x}/${t.y}.json`;
    const tile = JSON.parse(new TextDecoder().decode(second.files.get(path)!)) as Record<string, unknown>;
    const other = JSON.parse(new TextDecoder().decode([...first.files.values()][0]!)) as Record<string, unknown>;
    const text = JSON.stringify({ ...tile, roofs: other['roofs'], rescue: other['rescue'] });
    const bytes = new TextEncoder().encode(text);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const server = new PackServer({
      manifest: { ...first.manifest, countries: second.manifest.countries, tiles: [...first.manifest.tiles, { ...t, sha256, bytes: bytes.length, roofs: 1, rescuePoints: 1 }] },
      files: new Map([...first.files, [path, bytes]]),
    });
    const reports = await prepareTrip(depsFor(server), () => undefined);
    expect(step(reports, 'places').ok).toBe(true);
    expect(await (await openDb()).getAllKeys('savedTiles')).toHaveLength(2);
    expect(await stored<Roof>('roofs')).toHaveLength(1);
    expect(await stored<RescuePoint>('rescuePoints')).toHaveLength(1);
  });
});

describe('zones and holidays', () => {
  test('[PREP-ZONES] routeZones and holidays are saved, readInputs gives them, and the dates cover every zone on the route for the trip\'s window', async () => {
    await onTrip();
    await prepareTrip(depsFor(new PackServer(fixtureBuild('heidelberg-strasbourg'))), () => undefined);
    const i = await inputs();
    expect(i.routeZones.map((z) => z.holidayZone)).toEqual(expect.arrayContaining(['DE-BW', 'FR-67']));
    expect(i.routeZones[0]!.fromKm).toBe(0);
    expect(i.routeZones.at(-1)!.toKm).toBe(i.trip.route.lengthKm);
    for (const z of i.routeZones) expect(Object.keys(i.holidays)).toContain(z.holidayZone);
  });

  test('[PREP-ZONES] a holiday inside the window is held for its zone: 1 November in Baden-Württemberg, not in Hamburg', async () => {
    const t = await fixtureTrip('heidelberg-strasbourg');
    await readTrip();
    await saveTrip({ ...t, departureDate: '2026-10-30' });
    await prepareTrip(depsFor(new PackServer(fixtureBuild('heidelberg-strasbourg'))), () => undefined);
    const i = await inputs();
    expect(i.holidays['DE-BW']).toContain('2026-11-01');
    expect(i.holidays['FR-67']).toContain('2026-11-01');
    expect(i.holidays['DE-BW']).not.toContain('2026-10-03');
  });

  test('[PREP-ZONES] the boundary file failing is named, and no kilometre without a listed tile counts as saved', async () => {
    await onTrip();
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    const deps = depsFor(server);
    const reports = await prepareTrip({ ...deps, fetch: async (u, o) => (String(u) === '/data/boundaries.v1.json' ? new Response('gone', { status: 500 }) : deps.fetch(u, o)) }, () => undefined);
    expect(step(reports, 'places')).toMatchObject({ ok: false, note: W.prepZonesMissing });
    const i = await inputs();
    expect(i.routeZones).toEqual([]);
    expect(i.savedKm.length).toBeGreaterThan(0);
    expect(step(reports, 'hours').ok).toBe(true); // hours use the zones stored in the pack (section 5)
  });

  test('[PREP-KM] a stretch outside the manifest\'s countries has no saved data, though no tile is missing', async () => {
    // Milan to the Swiss border and on: the manifest knows Switzerland only.
    const points = Array.from({ length: 81 }, (_, i) => ({ lat: 45.6 + i * 0.01, lon: 8.95, ele: 100 }));
    const route = await buildRoute(points, 'over the border', 'gpx');
    await readTrip();
    await saveTrip({ route, departureDate: '2026-10-17', startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2 });
    const zone = { country: 'CH', subdivision: 'CH-TI', hoursRegionKey: 'CH-TI', holidayZone: 'CH-TI', timeZone: 'Europe/Zurich' };
    const build = buildOf({ places: [placeAt('water', 46.3, 8.95, { id: 'n1', ...zone })], roofs: [], rescuePoints: [] }, '20261028-6', ['water']);
    const reports = await prepareTrip(depsFor(new PackServer(build)), () => undefined);
    expect(step(reports, 'places').ok).toBe(true);
    const i = await inputs();
    const zones = i.routeZones;
    expect(zones[0]!.country).toBe('XX');
    expect(zones.at(-1)!.country).toBe('CH');
    expect(i.savedKm).toHaveLength(1);
    expect(i.savedKm[0]!.fromKm).toBeGreaterThanOrEqual(zones[0]!.toKm);
    expect(i.savedKm[0]!.toKm).toBe(route.lengthKm);
  });
});

describe('a download cut off', () => {
  test('[PREP-RESUME] abort after half: the rerun fetches only missing tiles, on the same build, verified against the manifest it began with', async () => {
    const trip = await onTrip('multi-day-800');
    const build = fixtureBuild('multi-day-800');
    const server = new PackServer(build);
    let tiles = 0;
    const half = Math.floor(build.manifest.tiles.length / 2);
    server.intercept = (url) => {
      if (!url.includes('/t/')) return null;
      if (tiles >= half) return new TypeError('network gone');
      tiles++;
      return null;
    };
    const first = await prepareTrip(depsFor(server), () => undefined);
    expect(step(first, 'places').ok).toBe(false);
    expect(step(first, 'places').note).toMatch(/tiles|map data/i);
    const savedAfterFirst = (await (await openDb()).getAllKeys('savedTiles')).map(String);
    expect(savedAfterFirst.length).toBeGreaterThan(0);
    expect(savedAfterFirst.length).toBeLessThan(build.manifest.tiles.length);
    // Answers name what's missing meanwhile.
    expect(screen(await inputs()).cards.water.missing).toContain('places');

    // A new build has appeared meanwhile; the old build's address still answers.
    const newer = rebuilt(build, '20261110-1');
    newer.manifest.tiles.forEach((t) => { t.sha256 = '0'.repeat(64); });
    server.add(newer);
    server.current = newer.manifest.buildId;
    server.intercept = () => null;
    server.requests.length = 0;
    const second = await prepareTrip(depsFor(server), () => undefined);
    expect(step(second, 'places')).toMatchObject({ ok: true, note: null });
    expect(server.requests.filter((u) => u.endsWith('current.json'))).toEqual([]);
    const asked = server.tileRequests().map((u) => u.replace(`${ORIGIN}/packs/${build.manifest.buildId}/t/`, '').replace('.json', ''));
    const missing = build.manifest.tiles.map(tileKey).filter((k) => !savedAfterFirst.includes(k));
    expect(asked.sort()).toEqual(missing.sort());
    expect((await readPackRun())!.buildId).toBe(build.manifest.buildId);
    const i = await inputs();
    expect(i.savedKm).toEqual([{ fromKm: 0, toKm: trip.route.lengthKm }]);
  });

  test('[PREP-RESUME] a finished run asks for no tiles when run again', async () => {
    await onTrip();
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    await prepareTrip(depsFor(server), () => undefined);
    server.requests.length = 0;
    await prepareTrip(depsFor(server), () => undefined);
    expect(server.requests).toEqual([]);
  });

  test('[PREP-RESUME] a build gone (404) restarts on the new one and says so; nothing of the old stays', async () => {
    await onTrip('multi-day-800');
    const build = fixtureBuild('multi-day-800');
    const server = new PackServer(build);
    let tiles = 0;
    server.intercept = (url) => (url.includes('/t/') && ++tiles > 8 ? new TypeError('network gone') : null);
    await prepareTrip(depsFor(server), () => undefined);

    const zone = { country: 'DE', subdivision: 'DE-BW', hoursRegionKey: 'DE-BW', holidayZone: 'DE-BW', timeZone: 'Europe/Berlin' };
    const start = (await readTrip())!.route.points[0]!;
    const next = buildOf({ places: [placeAt('water', start.lat, start.lon, { id: 'n777', ...zone })], roofs: [], rescuePoints: [] }, '20261110-1', ['water']);
    server.builds.delete(build.manifest.buildId);
    server.add(next);
    server.current = next.manifest.buildId;
    server.intercept = () => null;
    const reports = await prepareTrip(depsFor(server), () => undefined);
    expect(step(reports, 'places')).toMatchObject({ ok: true, note: W.prepPacksRestarted });
    expect((await readPackRun())!.buildId).toBe('20261110-1');
    expect((await stored<Place>('places')).map((p) => p.id)).toEqual(['n777']);
    expect((await (await openDb()).getAllKeys('savedTiles')).map(String)).toEqual(next.manifest.tiles.map(tileKey));
  });

  test('[PREP-RESUME] one tile missing while the build\'s manifest answers is that tile\'s failure, not a restart', async () => {
    await onTrip();
    const build = fixtureBuild('heidelberg-strasbourg');
    const victim = build.manifest.tiles[0]!;
    build.files.delete(`t/${victim.z}/${victim.x}/${victim.y}.json`);
    const server = new PackServer(build);
    const reports = await prepareTrip(depsFor(server), () => undefined);
    expect(step(reports, 'places').ok).toBe(false);
    expect((await readPackRun())!.buildId).toBe(build.manifest.buildId);
    expect(server.requests.filter((u) => u.endsWith('current.json'))).toHaveLength(1);
    expect((await (await openDb()).getAllKeys('savedTiles'))).toHaveLength(build.manifest.tiles.length - 1);
  });
});

describe('storage full', () => {
  const quota = (): Error => new DOMException('full', 'QuotaExceededError');

  test('[PREP-QUOTA] on save: "Storage full" with what was saved; the session keeps working; no half-written batch reads as complete', async () => {
    const trip = await onTrip('multi-day-800');
    const build = fixtureBuild('multi-day-800');
    let batches = 0;
    const server = new PackServer(build);
    const reports = await prepareTrip(depsFor(server, {
      store: { ...preparedStore, saveTiles: async (content, report) => { if (++batches > 1) throw quota(); await preparedStore.saveTiles(content, report); } },
    }), () => undefined);
    const places = step(reports, 'places');
    expect(places.ok).toBe(false);
    const saved = (await (await openDb()).getAllKeys('savedTiles')).length;
    expect(saved).toBe(6);
    expect(places.note).toBe(W.prepStorageFull(saved, build.manifest.tiles.length));
    // It stopped asking once there was no room for more.
    expect(server.tileRequests().length).toBe(12);
    expect(reports.map((r) => r.step)).toEqual(['heights', 'places', 'hours', 'weather', 'baseline', 'save']);
    const i = await inputs();
    const covered = i.savedKm.reduce((sum, r) => sum + r.toKm - r.fromKm, 0);
    expect(covered).toBeLessThan(trip.route.lengthKm);
    const s = screen(i);
    expect(s.cards.water.missing).toContain('places');
    expect(s.chips.emergency.numbers).toContain('112');
  });

  test('[PREP-QUOTA] full while saving hours, or the forecast: named on that step; the others stand', async () => {
    await onTrip();
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    const reports = await prepareTrip(depsFor(server, {
      store: {
        ...preparedStore,
        saveHours: async () => { throw quota(); },
        saveForecast: async () => { throw quota(); },
      },
    }), () => undefined);
    expect(step(reports, 'places').ok).toBe(true);
    expect(step(reports, 'hours')).toMatchObject({ ok: false, note: W.prepStorageFullStep });
    expect(step(reports, 'weather')).toMatchObject({ ok: false, note: W.prepStorageFullStep });
    expect(step(reports, 'baseline').ok).toBe(true);
    expect(await readPrepared()).not.toBeNull();
    expect(screen(await inputs()).cards.water.missing).toContain('hours');
  });
});

describe('the phone', () => {
  test('[PREP-AWAKE] a Wake Lock is requested when available and released after', async () => {
    await onTrip();
    const calls: string[] = [];
    const nav = { wakeLock: { request: async (type: 'screen') => { calls.push(`request:${type}`); return { release: async () => { calls.push('release'); } }; } } };
    await prepareTrip(depsFor(new PackServer(fixtureBuild('heidelberg-strasbourg')), {
      nav, fetchForecast: async () => { calls.push('work'); return forecast(); },
    }), () => undefined);
    expect(calls).toEqual(['request:screen', 'work', 'release']);
  });

  test('[PREP-AWAKE] no error when missing or refused; released also after a step blew up', async () => {
    await onTrip();
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    await expect(prepareTrip(depsFor(server, { nav: {} }), () => undefined)).resolves.toBeDefined();
    await expect(prepareTrip(depsFor(server, { nav: { wakeLock: { request: async () => { throw new DOMException('no', 'NotAllowedError'); } } } }), () => undefined)).resolves.toBeDefined();
    let released = 0;
    await prepareTrip(depsFor(server, {
      nav: { wakeLock: { request: async () => ({ release: async () => { released++; } }) } },
      store: { ...preparedStore, savePrepared: async () => { throw new Error('broke'); } },
    }), () => undefined);
    expect(released).toBe(1);
  });

  test('[PREP-PERSIST] navigator.storage.persist() is requested after a successful download, and the answer stored', async () => {
    await onTrip();
    let order = '';
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    const deps = depsFor(server, {
      nav: { storage: { persist: async () => { order += `persist after ${server.tileRequests().length > 0 ? 'tiles' : 'nothing'};`; return false; } } },
    });
    await prepareTrip(deps, () => undefined);
    expect(order).toBe('persist after tiles;');
    expect(await (await openDb()).get('meta', PERSIST_META)).toEqual({ granted: false, at: NOW });
  });

  test('[PREP-PERSIST] not requested when no tile could be saved, and its absence is no error', async () => {
    await onTrip();
    const server = new PackServer(fixtureBuild('heidelberg-strasbourg'));
    server.intercept = (url) => (url.includes('/t/') ? new TypeError('no') : null);
    let asked = 0;
    const reports = await prepareTrip(depsFor(server, { nav: { storage: { persist: async () => { asked++; return true; } } } }), () => undefined);
    expect(asked).toBe(0);
    expect(step(reports, 'places').ok).toBe(false);
    server.intercept = () => null;
    await expect(prepareTrip(depsFor(server, { nav: { storage: {} } }), () => undefined)).resolves.toBeDefined();
  });
});

describe('a trip past its window', () => {
  const LATE = new Date('2026-11-10T09:00:00Z'); // weeks after the window's end

  async function prepared(): Promise<void> {
    await onTrip();
    await prepareTrip(depsFor(new PackServer(fixtureBuild('heidelberg-strasbourg'))), () => undefined);
  }

  test('[PREP-IDLE-SPANS] answers read "hours unknown — update" until spans are recomputed in idle time, offline too, after answers show', async () => {
    await prepared();
    const before = (await stored<PlaceHours>('hours')).filter((h) => h.spans.some((s) => s.state === 'open'))[0]!;
    expect(stateAt(before, LATE)).toMatchObject({ state: 'unknown', reason: W.foodHoursUpdate });

    const order: string[] = [];
    let idle: (() => void) | null = null;
    const done = catchUpHours(LATE, { requestIdle: (run) => { order.push('asked for idle time'); idle = run; } });
    await vi.waitFor(() => expect(order).toHaveLength(1));
    // Nothing has been worked out yet: the answers on screen came first.
    const still = (await stored<PlaceHours>('hours')).find((h) => h.placeId === before.placeId)!;
    expect(still.windowEnd).toEqual(before.windowEnd);
    expect(order).toEqual(['asked for idle time']);
    idle!();
    expect(await done).toBe(true);

    const after = (await stored<PlaceHours>('hours')).find((h) => h.placeId === before.placeId)!;
    expect(after.windowEnd.getTime()).toBeGreaterThan(LATE.getTime());
    expect(after.windowStart.getTime()).toBeLessThanOrEqual(LATE.getTime());
    expect(stateAt(after, LATE).reason).not.toBe(W.foodHoursUpdate);
  });

  test('[PREP-IDLE-SPANS] a trip inside its window asks for nothing, and no outside request is ever made', async () => {
    await prepared();
    let asked = 0;
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await catchUpHours(new Date('2026-10-17T09:00:00Z'), { requestIdle: () => { asked++; } })).toBe(false);
    expect(asked).toBe(0);
    await catchUpHours(LATE, { requestIdle: (run) => run() });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('[PREP-IDLE-SPANS] the screen at the window\'s far side reads "update" on the screen, until the idle work is done', async () => {
    await prepared();
    const trip = (await readTrip())!;
    // The rider is late: on the road a whole week after the planned end, past the window. On a Monday morning.
    const late = new Date('2026-11-02T09:00:00Z');
    const where = trip.route.points[200]!;
    const position = { lat: where.lat, lon: where.lon, accuracyM: 10, at: late, km: where.km, offRouteM: 0, source: 'gps' as const, approximate: false };
    const seen = async (): Promise<string> => JSON.stringify(screen({ ...(await inputs(late)), now: late, positions: [position] }));
    const before = await seen();
    expect(before).toContain(W.foodHoursUpdate);
    expect((await stored<PlaceHours>('hours')).every((h) => h.windowEnd.getTime() < late.getTime())).toBe(true);
    await catchUpHours(late, { requestIdle: (run) => run() });
    const after = await seen();
    expect((await stored<PlaceHours>('hours')).every((h) => h.windowEnd.getTime() > late.getTime())).toBe(true);
    expect(after).not.toContain(W.foodHoursUpdate);
  });
});

test('[PREP-STEPS] assembleRoute stays the one way to build a route: the fixture is unchanged by preparing it', async () => {
  const t = await onTrip();
  await prepareTrip(depsFor(new PackServer(fixtureBuild('heidelberg-strasbourg'))), () => undefined);
  const after = (await readTrip())!.route;
  expect(after.points).toEqual(assembleRoute(t.route.points.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele })), t.route.name, 'gpx').points);
  expect(after.hash).toBe(t.route.hash);
});
