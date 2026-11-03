import { beforeEach, describe, expect, test } from 'vitest';
import { freshStore } from '../store/helpers.ts';
import { haversineKm } from '../../../src/core/geo/haversine.ts';
import { CORRIDOR_KM, corridorTiles, savedKmRanges, tileBounds, tileKey } from '../../../src/core/places/tiles.ts';
import type { ManifestTile, Place, TileId } from '../../../src/core/places/types.ts';
import { checkConnectivity } from '../../../src/data/connectivity.ts';
import { downloadTiles } from '../../../src/data/packs/download.ts';
import type { TileReport } from '../../../src/data/packs/download.ts';
import { openDb } from '../../../src/store/db.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';
import { tileStore } from '../../../src/store/packs.ts';
import { placeAt } from '../../fixtures/places.ts';
import { buildOf, fixtureBuild, fixtureTrip, ORIGIN, PackServer, rebuilt } from './pack-server.ts';

beforeEach(freshStore);

const noWait = async (): Promise<void> => undefined;

async function setUp() {
  const trip = await fixtureTrip('heidelberg-strasbourg');
  await readTrip();
  await saveTrip(trip);
  const build = fixtureBuild('heidelberg-strasbourg');
  return { trip, build, server: new PackServer(build) };
}
const run = (s: PackServer, route: Parameters<typeof downloadTiles>[0]): Promise<TileReport> =>
  downloadTiles(route, { fetch: s.fetch, store: tileStore, sleep: noWait });

const savedIds = (r: TileReport): string[] => r.saved.map(tileKey).sort();
const tileUrl = (buildId: string, t: TileId): string => `${ORIGIN}/packs/${buildId}/t/${t.z}/${t.x}/${t.y}.json`;

describe('the entry point', () => {
  test("[PREP-ENTRY] reads current.json, then only that build's manifest and tiles, and only tile numbers leave the phone", async () => {
    const { trip, build, server } = await setUp();
    const report = await run(server, trip.route);
    const id = build.manifest.buildId;
    expect(server.requests[0]).toBe(`${ORIGIN}/packs/current.json`);
    expect(server.requests[1]).toBe(`${ORIGIN}/packs/${id}/manifest.json`);
    expect(server.requests.length).toBeGreaterThan(2);
    // Nothing else: no query, so no coordinate of the route can be in it.
    for (const url of server.requests.slice(2)) expect(url).toMatch(new RegExp(`^${ORIGIN}/packs/${id}/t/\\d+/\\d+/\\d+\\.json$`));
    expect(report.buildId).toBe(id);
    expect(report.failed).toEqual([]);
    expect(savedIds(report)).toEqual(corridorTiles(trip.route.points, build.manifest, CORRIDOR_KM).map(tileKey).sort());
  });

  test('[PREP-ENTRY] tiles of the manifest outside the corridor are not asked for', async () => {
    const { trip, build, server } = await setUp();
    const far: ManifestTile = { ...build.manifest.tiles[0]!, z: 9, x: 100, y: 100 };
    build.manifest.tiles.push(far);
    await run(server, trip.route);
    expect(server.requests).not.toContain(tileUrl(build.manifest.buildId, far));
  });

  test('[PREP-ENTRY] no more than six tiles are asked for at a time', async () => {
    const trip = await fixtureTrip('multi-day-800');
    await readTrip();
    await saveTrip(trip);
    const build = fixtureBuild('multi-day-800');
    expect(build.manifest.tiles.length).toBeGreaterThan(6);
    const server = new PackServer(build);
    await run(server, trip.route);
    expect(server.maxActive).toBe(6);
  });

  test('[PREP-ENTRY] a tile that fails twice and then answers is saved; backoff waits longer each time', async () => {
    const { trip, build, server } = await setUp();
    const first = tileUrl(build.manifest.buildId, build.manifest.tiles[0]!);
    server.intercept = (url, nth) => (url === first && nth < 2 ? new Response('busy', { status: 503 }) : null);
    const waits: number[] = [];
    const report = await downloadTiles(trip.route, { fetch: server.fetch, store: tileStore, sleep: async (ms) => { waits.push(ms); } });
    expect(report.failed).toEqual([]);
    expect(savedIds(report)).toContain(tileKey(build.manifest.tiles[0]!));
    expect(waits.length).toBe(2);
    expect(waits[1]!).toBeGreaterThan(waits[0]!);
  });

  test('[PREP-ENTRY] a tile whose answer never comes fails on its own and stops nothing', async () => {
    const { trip, build, server } = await setUp();
    const first = tileUrl(build.manifest.buildId, build.manifest.tiles[0]!);
    server.intercept = (url) => (url === first ? 'hang' : null);
    const report = await downloadTiles(trip.route, { fetch: server.fetch, store: tileStore, sleep: noWait, timeoutMs: 5 });
    expect(report.failed.map((f) => tileKey(f.tile))).toEqual([tileKey(build.manifest.tiles[0]!)]);
    expect(report.failed[0]!.reason).toBe('timeout');
    expect(report.saved.length).toBeGreaterThan(0);
  });

  test('[PREP-ENTRY] no answer from current.json says so, and stores no run', async () => {
    const { trip, server } = await setUp();
    server.intercept = () => new Error('offline');
    await expect(run(server, trip.route)).rejects.toThrow();
    expect(await tileStore.readRun()).toBeNull();
  });
});

describe('verifying', () => {
  test('[PREP-VERIFY] a tile with a wrong hash is bad-hash in failed, not saved; the others stay', async () => {
    const { trip, build, server } = await setUp();
    const victim = build.manifest.tiles[1]!;
    const path = `t/${victim.z}/${victim.x}/${victim.y}.json`;
    const bytes = build.files.get(path)!.slice();
    bytes[10] = bytes[10]! ^ 1;
    build.files.set(path, bytes);
    const report = await run(server, trip.route);
    expect(report.failed).toEqual([{ tile: { z: victim.z, x: victim.x, y: victim.y }, reason: 'bad-hash' }]);
    expect(savedIds(report)).not.toContain(tileKey(victim));
    expect(report.saved.length).toBe(build.manifest.tiles.length - 1);
    const db = await openDb();
    expect(await db.get('savedTiles', tileKey(victim))).toBeUndefined();
    const places = (await db.getAll('places')) as Place[];
    expect(places.length).toBe(build.manifest.tiles.filter((t) => t !== victim).reduce((n, t) => n + t.places, 0));
  });
});

describe('one build for the whole run', () => {
  test('[PREP-SAME-BUILD] current.json changing mid-download changes nothing: the run stays on its build', async () => {
    const { trip, build, server } = await setUp();
    const id = build.manifest.buildId;
    server.intercept = (url) => {
      if (url.includes('/t/') && server.current === id) {
        const newer = rebuilt(build, '20261104-1');
        server.add(newer);
        server.current = newer.manifest.buildId;
      }
      return null;
    };
    const report = await run(server, trip.route);
    expect(report.buildId).toBe(id);
    expect(report.failed).toEqual([]);
    expect(server.requests.filter((u) => u.endsWith('current.json'))).toHaveLength(1);
    expect(server.requests.filter((u) => u.includes('20261104-1'))).toEqual([]);
  });
});

describe('deduplicating', () => {
  test('[PREP-DEDUP] a place in two tiles is saved once (by id)', async () => {
    const base = await fixtureTrip('heidelberg-strasbourg');
    const a = base.route.points[0]!;
    const b = base.route.points.at(-1)!;
    const twin = placeAt('water', a.lat, a.lon, { id: 'n42' });
    // The same place written into a second tile, as a build's boundary case could.
    const inFirst = buildOf({ places: [twin], roofs: [], rescuePoints: [] }, '20261028-2');
    const inSecond = buildOf({ places: [{ ...twin, lat: b.lat, lon: b.lon }, placeAt('water', b.lat, b.lon, { id: 'n43' })], roofs: [], rescuePoints: [] }, '20261028-2');
    expect(tileKey(inFirst.manifest.tiles[0]!)).not.toBe(tileKey(inSecond.manifest.tiles[0]!));
    const server = new PackServer({
      manifest: { ...inFirst.manifest, tiles: [...inFirst.manifest.tiles, ...inSecond.manifest.tiles] },
      files: new Map([...inFirst.files, ...inSecond.files]),
    });
    await readTrip();
    await saveTrip(base);
    const report = await run(server, base.route);
    expect(report.failed).toEqual([]);
    expect(report.saved).toHaveLength(2);
    const places = (await (await openDb()).getAll('places')) as Place[];
    expect(places.map((p) => p.id).sort()).toEqual(['n42', 'n43']);
  });
});

describe('which kilometres are saved', () => {
  test('[PREP-KM] one failed tile leaves out exactly the kilometres within the corridor of it', async () => {
    const { trip, build, server } = await setUp();
    const corridor = corridorTiles(trip.route.points, build.manifest, CORRIDOR_KM);
    const victim = corridor[Math.floor(corridor.length / 2)]!;
    const url = tileUrl(build.manifest.buildId, victim);
    server.intercept = (u) => (u === url ? new Response('busy', { status: 503 }) : null);
    const report = await run(server, trip.route);
    expect(report.failed).toHaveLength(1);
    const saved = new Set(report.saved.map(tileKey));
    const ranges = savedKmRanges(trip.route, corridor, saved, () => true);

    const box = tileBounds(victim);
    const offTile = (p: { lat: number; lon: number }): number => haversineKm(p, {
      lat: Math.min(box.north, Math.max(box.south, p.lat)), lon: Math.min(box.east, Math.max(box.west, p.lon)),
    });
    let left = 0;
    let kept = 0;
    for (const p of trip.route.points) {
      const inRange = ranges.some((r) => p.km >= r.fromKm && p.km <= r.toKm);
      const off = offTile(p);
      // Exact to the 250 m the ranges are worked out on.
      if (off <= CORRIDOR_KM - 0.3) { expect(inRange).toBe(false); left++; }
      if (off >= CORRIDOR_KM + 0.3) { expect(inRange).toBe(true); kept++; }
    }
    expect(left).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });

  test('[PREP-KM] with every tile saved the whole route is covered, in one range', async () => {
    const { trip, build } = await setUp();
    const corridor = corridorTiles(trip.route.points, build.manifest, CORRIDOR_KM);
    const ranges = savedKmRanges(trip.route, corridor, new Set(corridor.map(tileKey)), () => true);
    expect(ranges).toEqual([{ fromKm: 0, toKm: trip.route.lengthKm }]);
  });

  test('[PREP-KM] a tile the manifest does not list is no gap, but a kilometre outside the covered countries has no data', async () => {
    const { trip, build } = await setUp();
    const corridor = corridorTiles(trip.route.points, build.manifest, CORRIDOR_KM);
    const all = new Set(corridor.map(tileKey));
    expect(savedKmRanges(trip.route, [], new Set(), () => true)).toEqual([{ fromKm: 0, toKm: trip.route.lengthKm }]);
    const ranges = savedKmRanges(trip.route, corridor, all, (km) => km < 50);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.fromKm).toBe(0);
    expect(ranges[0]!.toKm).toBeLessThan(50);
    expect(ranges[0]!.toKm).toBeGreaterThan(49.5);
  });
});

describe('the connectivity check', () => {
  test('[PREP-ENTRY] one HEAD for /, no-store: any HTTP answer is online, and its date gives the clock offset', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const answer = await checkConnectivity(async (u, o) => {
      calls.push([String(u), o]);
      return new Response(null, { status: 503, headers: { Date: new Date(1_000_000 + 60_000).toUTCString(), Age: '30' } });
    }, () => 1_000_000);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('/');
    expect(calls[0]![1]).toMatchObject({ method: 'HEAD', cache: 'no-store' });
    expect(answer.online).toBe(true);
    // Date headers hold whole seconds.
    expect(Math.abs(answer.clockOffsetMs! - 90_000)).toBeLessThan(1000);
  });
  test('[PREP-ENTRY] no answer means no connection; an answer without a date gives no offset', async () => {
    expect(await checkConnectivity(async () => { throw new Error('no'); })).toEqual({ online: false, clockOffsetMs: null });
    expect(await checkConnectivity(async () => new Response(null))).toEqual({ online: true, clockOffsetMs: null });
  });
  test('[PREP-ENTRY] no answer within 5 s means no connection', async () => {
    let signal: AbortSignal | undefined;
    const answer = await checkConnectivity((_u, o) => {
      signal = o?.signal ?? undefined;
      return new Promise((_resolve, reject) => { signal!.addEventListener('abort', () => reject(new Error('aborted'))); });
    }, Date.now, 5);
    expect(answer).toEqual({ online: false, clockOffsetMs: null });
    expect(signal?.aborted).toBe(true);
  });
});
