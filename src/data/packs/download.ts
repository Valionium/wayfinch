// Getting a route's tiles (spec sections 5, 5a and 9.4): chunked, resumable, and verified against the manifest the run began
// with. Only coarse tile numbers leave the phone. Each batch is saved whole, so a tab killed at any moment leaves whole
// batches, and the next run asks only for what isn't saved.
// Only the one field: the whole file would put the launch switch into the app's bytes (review of PR 63, C1, APP-LAUNCH-BYTES).
import { dataOrigin } from '../../../build.config.json';
import type { LatLng } from '../../core/geo/haversine.ts';
import { CORRIDOR_KM, corridorTiles, tileKey } from '../../core/places/tiles.ts';
import type { ManifestTile, PackManifest, TileContent, TileId } from '../../core/places/types.ts';
import { PackError, readEntry, readManifest, readTile } from './reader.ts';

export type TileFailure = { tile: TileId; reason: string };
export type TileReport = {
  buildId: string; manifest: PackManifest; saved: TileId[]; failed: TileFailure[];
  /** The build this run had begun on is gone from the host, so it began again on a new one. */
  restartedFrom?: string;
  /** A finished run's build was replaced by a newer one. */
  replacedFrom?: string;
  /** A newer build is on its way but not yet whole: the report is of the old one, which stays until then. */
  pending?: { buildId: string; staged: number; total: number; full: boolean; dropped?: 'tries' | 'room' };
};
/** A run in the store: its build, and the manifest it began with, of the tiles of this route's corridor. */
export type PackRun = { buildId: string; manifest: PackManifest };

export type TileStore = {
  readRun(): Promise<PackRun | null>;
  /** Puts a run in place of any earlier one, and removes what was saved from that one. */
  startRun(run: PackRun): Promise<void>;
  savedTileKeys(): Promise<Set<string>>;
  saveTiles(content: TileContent[], report: TileReport): Promise<void>;
  /** A newer build on its way, kept beside the old one: its run, its verified tiles, and the swap once it's whole. */
  readStage(): Promise<PackRun | null>;
  startStage(run: PackRun): Promise<void>;
  stagedTileKeys(): Promise<Set<string>>;
  stageTiles(tiles: { tile: TileId; text: string }[], buildId: string): Promise<void>;
  swapIn(buildId: string): Promise<void>;
  dropStage(): Promise<void>;
  bumpStage(buildId: string): Promise<number>;
};

export type DownloadDeps = {
  fetch: typeof fetch; store: TileStore;
  onProgress?: (done: number, total: number) => void;
  origin?: string; sleep?: (ms: number) => Promise<void>; timeoutMs?: number;
};

/** The reason a tile carries when the store could take no more. */
export const STORAGE_FULL = 'storage-full';

const AT_A_TIME = 6;
/** Runs a newer build may take to come in whole (store/packs.ts's STAGE_TRIES). */
const STAGE_TRIES = 3;
const TRIES = 3;
const FIRST_WAIT_MS = 1000;
const TILE_WAIT_MS = 30_000;

/** The host answered that this address holds nothing. */
class NotThere extends Error {}

export const isStorageFull = (e: unknown): boolean => (e as { name?: string } | null)?.name === 'QuotaExceededError';

type Got = { kind: 'ok'; tile: ManifestTile; content: TileContent; text: string } | { kind: 'failed'; tile: ManifestTile; reason: string } | { kind: 'absent'; tile: ManifestTile };

const idOf = (t: TileId): TileId => ({ z: t.z, x: t.x, y: t.y });

export async function downloadTiles(route: { points: LatLng[] }, deps: DownloadDeps): Promise<TileReport> {
  const origin = deps.origin ?? dataOrigin;
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
  const manifestOf = async (entry: ReturnType<typeof readEntry>): Promise<PackRun> => {
    const manifest = readManifest(await textOf(`${origin}${entry.manifest}`, {}), entry.buildId);
    return { buildId: entry.buildId, manifest: { ...manifest, tiles: corridorTiles(route.points, manifest, CORRIDOR_KM) } };
  };
  const fresh = async (): Promise<PackRun> => manifestOf(readEntry(await textOf(`${origin}/packs/current.json`, { cache: 'no-cache' })));

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
        return { kind: 'ok', tile, content: await readTile(got, tile, run.manifest), text: new TextDecoder().decode(got) };
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

  type Filled = { saved: TileId[]; failed: TileFailure[]; gone: boolean; full: boolean; missing: ManifestTile[] };

  /** Fetches what `run` lacks of `have`, batch by batch, handing each verified batch to `keep`. */
  const fill = async (run: PackRun, have: Set<string>, keep: (got: Extract<Got, { kind: 'ok' }>[], ids: TileId[]) => Promise<void>): Promise<Filled> => {
    const missing = run.manifest.tiles.filter((t) => !have.has(tileKey(t)));
    const saved: TileId[] = run.manifest.tiles.filter((t) => have.has(tileKey(t))).map(idOf);
    const failed: TileFailure[] = [];
    const total = run.manifest.tiles.length;
    deps.onProgress?.(saved.length, total);
    let full = false;
    for (let i = 0; i < missing.length; i += AT_A_TIME) {
      const batch = missing.slice(i, i + AT_A_TIME);
      if (full) {
        failed.push(...batch.map((t) => ({ tile: idOf(t), reason: STORAGE_FULL })));
        continue;
      }
      const got = await Promise.all(batch.map((t) => getTile(run, t)));
      const absent = got.filter((g) => g.kind === 'absent');
      if (absent.length > 0 && (await buildIsGone(run))) return { saved, failed, gone: true, full, missing };
      failed.push(...absent.map((g) => ({ tile: idOf(g.tile), reason: 'not-found' })));
      for (const g of got) if (g.kind === 'failed') failed.push({ tile: idOf(g.tile), reason: g.reason });
      const good = got.filter((g) => g.kind === 'ok');
      if (good.length > 0) {
        const ids = good.map((g) => idOf(g.tile));
        try {
          await keep(good, ids);
          saved.push(...ids);
        } catch (e) {
          if (!isStorageFull(e)) throw e;
          full = true;
          failed.push(...ids.map((tile) => ({ tile, reason: STORAGE_FULL })));
        }
      }
      deps.onProgress?.(saved.length, total);
    }
    return { saved, failed, gone: false, full, missing };
  };

  const saveInto = (run: PackRun) => (good: Extract<Got, { kind: 'ok' }>[], ids: TileId[]): Promise<void> =>
    store.saveTiles(good.map((g) => g.content), { buildId: run.buildId, manifest: run.manifest, saved: ids, failed: [] });

  const reportOf = (run: PackRun, f: Pick<Filled, 'saved' | 'failed'>, extra: Partial<TileReport> = {}): TileReport =>
    ({ buildId: run.buildId, manifest: run.manifest, saved: f.saved, failed: f.failed, ...extra });

  /** What a run holds, with no request made. */
  const asStored = async (run: PackRun): Promise<TileReport> => {
    const had = await store.savedTileKeys();
    return reportOf(run, {
      saved: run.manifest.tiles.filter((t) => had.has(tileKey(t))).map(idOf),
      failed: run.manifest.tiles.filter((t) => !had.has(tileKey(t))).map((t) => ({ tile: idOf(t), reason: 'build-gone' })),
    });
  };

  /**
   * A newer build, fetched whole beside the old and checked against its own manifest, then put in the old one's place in one
   * transaction. Until then the old build's data stays as it was, and is what the report is of.
   */
  const replaceWith = async (old: PackRun, next: PackRun, flag: Partial<TileReport>): Promise<TileReport> => {
    const staged = await store.readStage();
    const target = staged?.buildId === next.buildId ? staged : next;
    if (target !== staged) await store.startStage(target);
    const f = await fill(target, await store.stagedTileKeys(), (good, ids) =>
      store.stageTiles(good.map((g, i) => ({ tile: ids[i]!, text: g.text })), target.buildId));
    let full = f.full;
    if (!f.gone && f.failed.length === 0) {
      try {
        await store.swapIn(target.buildId);
        return reportOf(target, { saved: f.saved, failed: [] }, flag);
      } catch (e) {
        // Another window swapped the very same build in first: it is in, which is all this run was for.
        if ((await store.readRun())?.buildId === target.buildId) return reportOf(target, { saved: f.saved, failed: [] }, flag);
        if (!isStorageFull(e)) throw e;
        full = true;
      }
    }
    const before = await asStored(old);
    const pending = { buildId: target.buildId, staged: f.saved.length, total: target.manifest.tiles.length, full };
    // Two builds held at once cost room: no room drops the newer one at once, and so do three runs that couldn't finish it.
    let dropped: 'tries' | 'room' | undefined;
    if (full) dropped = 'room';
    else if ((await store.bumpStage(target.buildId)) >= STAGE_TRIES) dropped = 'tries';
    if (dropped) await store.dropStage();
    return { ...before, failed: before.failed.filter((x) => x.reason !== 'build-gone'), pending: { ...pending, ...(dropped ? { dropped } : {}) } };
  };

  let run = await store.readRun();
  if (!run) {
    run = await fresh();
    await store.startRun(run);
    const f = await fill(run, new Set(), saveInto(run));
    return reportOf(run, f);
  }

  const had = await store.savedTileKeys();
  if (run.manifest.tiles.some((t) => !had.has(tileKey(t)))) {
    // An unfinished run goes on on its own build, while that build's address answers (plan, Review Focus 1).
    const f = await fill(run, had, saveInto(run));
    if (!f.gone) return reportOf(run, f);
    let next: PackRun;
    try {
      next = await fresh();
    } catch {
      return reportOf(run, { saved: f.saved, failed: [...f.failed, ...f.missing.filter((t) => !f.saved.some((s) => tileKey(s) === tileKey(t))).map((t) => ({ tile: idOf(t), reason: 'build-gone' }))] });
    }
    if (next.buildId === run.buildId) return asStored(run);
    return replaceWith(run, next, { restartedFrom: run.buildId });
  }

  // A finished run: the entry point says whether there's newer data (section 5a). No answer keeps what is stored.
  let entry: ReturnType<typeof readEntry>;
  try {
    entry = readEntry(await textOf(`${origin}/packs/current.json`, { cache: 'no-cache' }));
  } catch {
    return reportOf(run, { saved: run.manifest.tiles.map(idOf), failed: [] });
  }
  if (entry.buildId === run.buildId) return reportOf(run, { saved: run.manifest.tiles.map(idOf), failed: [] });
  let next: PackRun;
  try {
    next = await manifestOf(entry);
  } catch {
    return reportOf(run, { saved: run.manifest.tiles.map(idOf), failed: [] }, { pending: { buildId: entry.buildId, staged: 0, total: 0, full: false } });
  }
  return replaceWith(run, next, { replacedFrom: run.buildId });
}
