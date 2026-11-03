// A newer build of the place packs, fetched whole beside the old one and swapped in at once (spec sections 5 and 5a), so the
// stored places never mix two builds and the old ones stay usable until the new are in hand. Places of a refreshed stretch
// are the rider's newer data: they stay through a new build, with their stretch's kilometres.
import { decodeTile } from '../core/places/pack-format.ts';
import { tileKey } from '../core/places/tiles.ts';
import type { TileId } from '../core/places/types.ts';
import { matchRoofs } from '../core/route/matches.ts';
import { kitchenHoursId } from '../core/hours/check.ts';
import type { Place, RescuePoint, Roof, Route, Trip } from '../core/types.ts';
import type { PackRun, TileStore } from '../data/packs/download.ts';
import { tracked } from './changed.ts';
import { CURRENT, inTx, ROUTE_META_PREFIX } from './db.ts';
import type { Tx } from './db.ts';
import { SAVED_KM_META } from './inputs.ts';
import { mergeRanges, STRETCHES_META } from './stretch.ts';
import type { StretchRecord } from './stretch.ts';
import { readManifest } from '../data/packs/reader.ts';
import type { TileContent } from '../core/places/types.ts';
import type { TileReport } from '../data/packs/download.ts';
import { PACK_RUN_META, RouteGoneError } from './trip.ts';

/** The newer build on its way. Its tiles wait in `savedTiles` under this prefix, as the text that was verified. */
export const PACK_STAGE_META = `${ROUTE_META_PREFIX}packStage`;
export const STAGE_PREFIX = 'stage:';

const STORES = ['places', 'roofs', 'rescuePoints', 'savedTiles', 'matches', 'hours', 'meta', 'trip'];
/** prepared.ts's record of the steps: a swap makes it out of date, until the run that swapped writes a new one. */
const PREPARED_STEPS_KEY = `${ROUTE_META_PREFIX}preparedSteps`;
/** Runs a newer build may take to come in whole before it is given up, and the old one kept. */
export const STAGE_TRIES = 3;

async function routeOf(tx: Tx, routeId: string | undefined): Promise<Route> {
  const trip = (await tx.objectStore('trip').get(CURRENT)) as Trip | undefined;
  if (trip === undefined || (routeId !== undefined && trip.route?.id !== routeId)) throw new RouteGoneError();
  return trip.route;
}

const stretchesOf = (raw: unknown): StretchRecord[] =>
  (Array.isArray(raw) ? raw.filter((s): s is StretchRecord => typeof s?.fromKm === 'number' && typeof s?.toKm === 'number') : []);

/**
 * Removes the pack's data, keeping what Refresh this stretch brought: its places, and the roofs and rescue points on its
 * kilometres. Matches go, to be worked out again; the saved kilometres are the refreshed stretches' alone until then.
 */
export async function clearPackData(tx: Tx, route: Route): Promise<void> {
  const meta = tx.objectStore('meta');
  const stretches = stretchesOf(await meta.get(STRETCHES_META));
  const inStretch = (km: number): boolean => stretches.some((s) => km >= s.fromKm && km <= s.toKm);

  // A place goes with its hours, the kitchen's too: no "open" of the old data outlives it.
  const places = tx.objectStore('places');
  const hours = tx.objectStore('hours');
  for (const p of (await places.getAll()) as Place[]) {
    if (p.source === 'overpass') continue;
    await places.delete(p.id);
    await hours.delete(p.id);
    await hours.delete(kitchenHoursId(p.id));
  }

  const roofs = tx.objectStore('roofs');
  const roofKeys = await roofs.getAllKeys();
  const roofRows = (await roofs.getAll()) as Roof[];
  for (const [i, r] of roofRows.entries()) {
    const kept = stretches.length > 0 && matchRoofs([r], route).some((m) => inStretch(m.km));
    if (!kept) await roofs.delete(roofKeys[i]!);
  }
  const rescue = tx.objectStore('rescuePoints');
  const rescueKeys = await rescue.getAllKeys();
  const rescueRows = (await rescue.getAll()) as RescuePoint[];
  for (const [i, r] of rescueRows.entries()) if (!(Array.isArray(r.kms) && r.kms.some(inStretch))) await rescue.delete(rescueKeys[i]!);

  await tx.objectStore('matches').clear();
  await meta.put(mergeRanges(stretches), SAVED_KM_META);
}

/** Gives up the newer build on its way: its tiles go, the old build stays the one in use. */
export function dropStage(): Promise<void> {
  return tracked(inTx(['savedTiles', 'meta'], 'readwrite', async (tx) => {
    await dropStaged(tx);
    await tx.objectStore('meta').delete(PACK_STAGE_META);
  }));
}

/** Counts one more run that didn't bring the newer build in whole; resolves to how many there have been. */
export function bumpStage(buildId: string): Promise<number> {
  return tracked(inTx(['meta'], 'readwrite', async (tx) => {
    const stage = (await tx.objectStore('meta').get(PACK_STAGE_META)) as (PackRun & { tries?: number }) | undefined;
    if (stage?.buildId !== buildId) return 0;
    const tries = (typeof stage.tries === 'number' ? stage.tries : 0) + 1;
    await tx.objectStore('meta').put({ ...stage, tries }, PACK_STAGE_META);
    return tries;
  }));
}

export async function readStage(): Promise<PackRun | null> {
  return usableRun(await inTx(['meta'], 'readonly', (tx) => tx.objectStore('meta').get(PACK_STAGE_META)));
}

async function dropStaged(tx: Tx): Promise<void> {
  const store = tx.objectStore('savedTiles');
  for (const key of await store.getAllKeys()) if (String(key).startsWith(STAGE_PREFIX)) await store.delete(key);
}

/** Begins fetching a newer build, in place of any other one begun before. */
export function startStage(run: PackRun, routeId?: string): Promise<void> {
  return tracked(inTx(['savedTiles', 'meta', 'trip'], 'readwrite', async (tx) => {
    await routeOf(tx, routeId);
    await dropStaged(tx);
    await tx.objectStore('meta').put(run, PACK_STAGE_META);
  }));
}

export async function stagedTileKeys(): Promise<Set<string>> {
  return inTx(['savedTiles', 'meta'], 'readonly', async (tx) => {
    const stage = (await tx.objectStore('meta').get(PACK_STAGE_META)) as { buildId?: unknown } | undefined;
    const store = tx.objectStore('savedTiles');
    const keys = (await store.getAllKeys()).map(String).filter((k) => k.startsWith(STAGE_PREFIX));
    const out = new Set<string>();
    for (const k of keys) {
      const row = (await store.get(k)) as { buildId?: unknown } | undefined;
      if (row?.buildId === stage?.buildId) out.add(k.slice(STAGE_PREFIX.length));
    }
    return out;
  });
}

/** Verified tiles of the newer build, each batch in one transaction. */
export function stageTiles(tiles: { tile: TileId; text: string }[], buildId: string, routeId?: string): Promise<void> {
  return tracked(inTx(['savedTiles', 'meta', 'trip'], 'readwrite', async (tx) => {
    await routeOf(tx, routeId);
    const stage = (await tx.objectStore('meta').get(PACK_STAGE_META)) as { buildId?: unknown } | undefined;
    if (stage?.buildId !== buildId) throw new RouteGoneError();
    for (const { tile, text } of tiles) await tx.objectStore('savedTiles').put({ buildId, text }, `${STAGE_PREFIX}${tileKey(tile)}`);
  }));
}

/** The newer build in place of the old, all in one transaction: a failure leaves the old one whole. */
export function swapIn(buildId: string, routeId?: string): Promise<void> {
  return tracked(inTx(STORES, 'readwrite', async (tx) => {
    const route = await routeOf(tx, routeId);
    const meta = tx.objectStore('meta');
    const stage = usableRun(await meta.get(PACK_STAGE_META));
    if (stage?.buildId !== buildId) throw new RouteGoneError();
    await clearPackData(tx, route);
    const tiles = tx.objectStore('savedTiles');
    const keys = (await tiles.getAllKeys()).map(String);
    for (const key of keys) if (!key.startsWith(STAGE_PREFIX)) await tiles.delete(key);
    for (const key of keys.filter((k) => k.startsWith(STAGE_PREFIX))) {
      const row = (await tiles.get(key)) as { buildId: string; text: string };
      await tiles.delete(key);
      if (row.buildId !== buildId) continue;
      const content = decodeTile(row.text, { manifest: stage.manifest });
      for (const p of content.places) {
        const held = (await tx.objectStore('places').get(p.id)) as Place | undefined;
        if (held?.source !== 'overpass') await tx.objectStore('places').put(p);
      }
      for (const r of content.roofs) await tx.objectStore('roofs').add(r);
      for (const r of content.rescuePoints) await tx.objectStore('rescuePoints').add({ ...r, kms: [] });
      const [z, x, y] = key.slice(STAGE_PREFIX.length).split('/').map(Number);
      await tiles.put({ buildId, z, x, y }, key.slice(STAGE_PREFIX.length));
    }
    await meta.put(stage, PACK_RUN_META);
    await meta.delete(PACK_STAGE_META);
    await meta.delete(PREPARED_STEPS_KEY);
  }));
}

// ---- The run and its tiles ----

export const usableRun = (raw: unknown): PackRun | null => {
  const r = raw as Partial<PackRun> | null | undefined;
  if (typeof r?.buildId !== 'string') return null;
  try {
    return { buildId: r.buildId, manifest: readManifest(JSON.stringify(r.manifest), r.buildId) };
  } catch {
    return null; // damaged: the next run starts over, which costs only a download
  }
};

export async function readPackRun(): Promise<PackRun | null> {
  return usableRun(await inTx(['meta'], 'readonly', (tx) => tx.objectStore('meta').get(PACK_RUN_META)));
}

/** Refuses when there's no trip, or when it isn't the route this write was meant for. */
async function holdsRoute(tx: Tx, routeId: string | undefined): Promise<void> {
  const trip = (await tx.objectStore('trip').get(CURRENT)) as Trip | undefined;
  if (trip === undefined || (routeId !== undefined && trip.route?.id !== routeId)) throw new RouteGoneError();
}

const TILE_STORES = ['places', 'roofs', 'rescuePoints', 'savedTiles', 'matches', 'hours', 'meta', 'trip'];

/** Begins a run. What an earlier run of an older build left goes in the same transaction: builds never mix. */
export function startPackRun(run: PackRun, routeId?: string): Promise<void> {
  return tracked(inTx(TILE_STORES, 'readwrite', async (tx) => {
    await holdsRoute(tx, routeId);
    await clearPackData(tx, ((await tx.objectStore('trip').get(CURRENT)) as Trip).route);
    await tx.objectStore('savedTiles').clear();
    await tx.objectStore('meta').delete(PACK_STAGE_META);
    await tx.objectStore('meta').put(run, PACK_RUN_META);
  }));
}

export async function savedTileKeys(): Promise<Set<string>> {
  const keys = await inTx(['savedTiles'], 'readonly', (tx) => tx.objectStore('savedTiles').getAllKeys());
  return new Set(keys.map(String).filter((k) => !k.startsWith(STAGE_PREFIX)));
}

/**
 * One batch of verified tiles, all in one transaction, so a killed tab leaves whole batches and no tile reads as saved
 * without its content. Refused when the run isn't the stored one: the route was replaced meanwhile.
 */
export function saveTiles(content: TileContent[], report: TileReport, routeId?: string): Promise<void> {
  return tracked(inTx(['places', 'roofs', 'rescuePoints', 'savedTiles', 'meta', 'trip'], 'readwrite', async (tx) => {
    await holdsRoute(tx, routeId);
    const run = (await tx.objectStore('meta').get(PACK_RUN_META)) as { buildId?: unknown } | undefined;
    if (run?.buildId !== report.buildId) throw new RouteGoneError();
    // Each is awaited: a value the browser can't store throws at its call, and the requests before it would then be left
    // to fail unheard when the transaction is undone.
    for (const c of content) {
      for (const p of c.places) await tx.objectStore('places').put(p);
      for (const r of c.roofs) await tx.objectStore('roofs').add(r);
      for (const r of c.rescuePoints) await tx.objectStore('rescuePoints').add({ ...r, kms: [] });
    }
    for (const t of report.saved) await tx.objectStore('savedTiles').put({ buildId: report.buildId, z: t.z, x: t.x, y: t.y }, tileKey(t));
  }));
}



/** The store as a download sees it. */
export const tileStore: TileStore = { readRun: readPackRun, startRun: startPackRun, savedTileKeys, saveTiles, readStage, startStage, stagedTileKeys, stageTiles, swapIn, dropStage, bumpStage };
