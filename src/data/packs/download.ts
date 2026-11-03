// Getting a route's tiles (spec sections 5, 5a and 9.4): chunked, resumable, and verified against the manifest the run began
// with. Only coarse tile numbers leave the phone. Each batch is saved whole, so a tab killed at any moment leaves whole
// batches, and the next run asks only for what isn't saved.
import config from '../../../build.config.json';
import type { LatLng } from '../../core/geo/haversine.ts';
import { CORRIDOR_KM, corridorTiles, tileKey } from '../../core/places/tiles.ts';
import type { ManifestTile, PackManifest, TileContent, TileId } from '../../core/places/types.ts';
import { PackError, readEntry, readManifest, readTile } from './reader.ts';

export type TileFailure = { tile: TileId; reason: string };
export type TileReport = {
  buildId: string; manifest: PackManifest; saved: TileId[]; failed: TileFailure[];
  /** The build this run had begun on is gone from the host, so it began again on a new one. */
  restartedFrom?: string;
};
/** A run in the store: its build, and the manifest it began with, of the tiles of this route's corridor. */
export type PackRun = { buildId: string; manifest: PackManifest };

export type TileStore = {
  readRun(): Promise<PackRun | null>;
  /** Puts a run in place of any earlier one, and removes what was saved from that one. */
  startRun(run: PackRun): Promise<void>;
  savedTileKeys(): Promise<Set<string>>;
  saveTiles(content: TileContent[], report: TileReport): Promise<void>;
};

export type DownloadDeps = {
  fetch: typeof fetch; store: TileStore;
  onProgress?: (done: number, total: number) => void;
  origin?: string; sleep?: (ms: number) => Promise<void>; timeoutMs?: number;
};

/** The reason a tile carries when the store could take no more. */
export const STORAGE_FULL = 'storage-full';

const AT_A_TIME = 6;
const TRIES = 3;
const FIRST_WAIT_MS = 1000;
const TILE_WAIT_MS = 30_000;

/** The host answered that this address holds nothing. */
class NotThere extends Error {}

export const isStorageFull = (e: unknown): boolean => (e as { name?: string } | null)?.name === 'QuotaExceededError';

type Got = { kind: 'ok'; tile: ManifestTile; content: TileContent } | { kind: 'failed'; tile: ManifestTile; reason: string } | { kind: 'absent'; tile: ManifestTile };

const idOf = (t: TileId): TileId => ({ z: t.z, x: t.x, y: t.y });

export async function downloadTiles(route: { points: LatLng[] }, deps: DownloadDeps): Promise<TileReport> {
  const origin = deps.origin ?? config.dataOrigin;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = deps.timeoutMs ?? TILE_WAIT_MS;
  const { store } = deps;

  /** One try, cut off when no answer comes. The wait covers the body too: a phone can lose its network halfway through it. */
  const asked = async <T>(url: string, init: RequestInit, read: (r: Response) => Promise<T>): Promise<T> => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), timeoutMs);
    try {
      return await read(await deps.fetch(url, { ...init, signal: stop.signal }));
    } catch (e) {
      if (stop.signal.aborted) throw new Error('timeout', { cause: e });
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };

  const textOf = (url: string, init: RequestInit): Promise<string> => asked(url, init, async (r) => {
    if (r.status === 404) throw new NotThere(url);
    if (!r.ok) throw new Error(`http-${r.status}`);
    return r.text();
  });

  /** A new run, from the entry point. Nothing of an older run is touched until this has worked. */
  const fresh = async (): Promise<PackRun> => {
    const entry = readEntry(await textOf(`${origin}/packs/current.json`, { cache: 'no-cache' }));
    const manifest = readManifest(await textOf(`${origin}${entry.manifest}`, {}), entry.buildId);
    return { buildId: entry.buildId, manifest: { ...manifest, tiles: corridorTiles(route.points, manifest, CORRIDOR_KM) } };
  };

  const getTile = async (run: PackRun, tile: ManifestTile): Promise<Got> => {
    const url = `${origin}/packs/${run.buildId}/t/${tile.z}/${tile.x}/${tile.y}.json`;
    let reason = 'network';
    for (let attempt = 0; attempt < TRIES; attempt++) {
      if (attempt > 0) await sleep(FIRST_WAIT_MS * 3 ** (attempt - 1));
      try {
        // After a wrong hash the next try goes past any cache that may hold the bad copy.
        const init: RequestInit = reason === 'bad-hash' ? { cache: 'reload' } : {};
        const got = await asked(url, init, async (r): Promise<Uint8Array | 'absent'> => {
          if (r.status === 404) return 'absent';
          if (!r.ok) throw new Error(`http-${r.status}`);
          return new Uint8Array(await r.arrayBuffer());
        });
        if (got === 'absent') return { kind: 'absent', tile };
        return { kind: 'ok', tile, content: await readTile(got, tile, run.manifest) };
      } catch (e) {
        reason = e instanceof PackError ? e.code : e instanceof Error && /^(timeout|http-\d+)$/.test(e.message) ? e.message : 'network';
      }
    }
    return { kind: 'failed', tile, reason };
  };

  /** A tile missing from the host: the whole build is gone only when its manifest is gone too. */
  const buildIsGone = async (run: PackRun): Promise<boolean> => {
    try {
      await textOf(`${origin}/packs/${run.buildId}/manifest.json`, { cache: 'no-cache' });
      return false;
    } catch (e) {
      return e instanceof NotThere;
    }
  };

  let run = await store.readRun();
  let restartedFrom: string | undefined;
  if (!run) {
    run = await fresh();
    await store.startRun(run);
  }

  for (;;) {
    const current: PackRun = run;
    const had = await store.savedTileKeys();
    const missing = current.manifest.tiles.filter((t) => !had.has(tileKey(t)));
    const saved: TileId[] = current.manifest.tiles.filter((t) => had.has(tileKey(t))).map(idOf);
    const failed: TileFailure[] = [];
    const total = current.manifest.tiles.length;
    const finish = (extra: TileFailure[] = []): TileReport => ({
      buildId: current.buildId, manifest: current.manifest, saved, failed: [...failed, ...extra], ...(restartedFrom ? { restartedFrom } : {}),
    });
    deps.onProgress?.(saved.length, total);
    let full = false;
    let gone = false;

    for (let i = 0; i < missing.length; i += AT_A_TIME) {
      const batch = missing.slice(i, i + AT_A_TIME);
      if (full) {
        failed.push(...batch.map((t) => ({ tile: idOf(t), reason: STORAGE_FULL })));
        continue;
      }
      const got = await Promise.all(batch.map((t) => getTile(current, t)));
      const absent = got.filter((g) => g.kind === 'absent');
      if (absent.length > 0 && (await buildIsGone(current))) {
        gone = true;
        break;
      }
      failed.push(...absent.map((g) => ({ tile: idOf(g.tile), reason: 'not-found' })));
      for (const g of got) if (g.kind === 'failed') failed.push({ tile: idOf(g.tile), reason: g.reason });
      const good = got.filter((g) => g.kind === 'ok');
      if (good.length > 0) {
        const ids = good.map((g) => idOf(g.tile));
        try {
          await store.saveTiles(good.map((g) => g.content), { buildId: current.buildId, manifest: current.manifest, saved: ids, failed: [] });
          saved.push(...ids);
        } catch (e) {
          if (!isStorageFull(e)) throw e;
          full = true;
          failed.push(...ids.map((tile) => ({ tile, reason: STORAGE_FULL })));
        }
      }
      deps.onProgress?.(saved.length, total);
    }

    if (!gone) return finish();

    // Only once: a host that loses a second build within one run is not answering sensibly.
    let next: PackRun | null = null;
    if (restartedFrom === undefined) {
      try {
        next = await fresh();
      } catch {
        next = null;
      }
    }
    if (!next || next.buildId === current.buildId) {
      const savedNow = new Set(saved.map(tileKey));
      return finish(missing.filter((t) => !savedNow.has(tileKey(t))).map((t) => ({ tile: idOf(t), reason: 'build-gone' })));
    }
    restartedFrom = current.buildId;
    await store.startRun(next);
    run = next;
  }
}
