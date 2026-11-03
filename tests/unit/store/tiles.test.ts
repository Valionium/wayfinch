import { beforeEach, describe, expect, test } from 'vitest';
import type { PackManifest, Place, TileContent } from '../../../src/core/places/types.ts';
import type { TileReport } from '../../../src/data/packs/download.ts';
import { openDb } from '../../../src/store/db.ts';
import { PACK_RUN_META, readTrip, replaceRoute, RouteGoneError, saveTrip } from '../../../src/store/trip.ts';
import { readPackRun, saveTiles, stageTiles, startPackRun, startStage, swapIn } from '../../../src/store/packs.ts';
import { saveMatched } from '../../../src/store/prepared.ts';
import { placeAt, rescueAt, roofAt } from '../../fixtures/places.ts';
import { freshStore, route, trip } from './helpers.ts';

beforeEach(freshStore);

const manifest: PackManifest = {
  v: 1, buildId: '20261028-1', builtAt: '2026-10-28T00:00:00Z',
  licence: { name: 'ODbL-1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors', buildCode: 'https://github.com/Valionium/wayfinch' },
  countries: {}, kinds: ['water'], tiles: [],
};
const report: TileReport = { buildId: manifest.buildId, manifest, saved: [{ z: 9, x: 1, y: 2 }], failed: [] };
const content = (places: Place[]): TileContent[] => [{ places, roofs: [roofAt(49, 8)], rescuePoints: [rescueAt(49, 8, 'KA-1')] }];
const counts = async (): Promise<number[]> => {
  const db = await openDb();
  return Promise.all(['places', 'roofs', 'rescuePoints', 'savedTiles'].map((s) => db.count(s)));
};

async function started(): Promise<void> {
  await readTrip();
  await saveTrip(trip());
  await startPackRun({ buildId: manifest.buildId, manifest });
}

describe('a batch of tiles', () => {
  test('[PREP-TRANSACTION] a batch saves its places, roofs, rescue points and savedTiles rows together', async () => {
    await started();
    await saveTiles(content([placeAt('water', 49, 8, { id: 'n1' })]), report);
    expect(await counts()).toEqual([1, 1, 1, 1]);
  });

  test('[PREP-TRANSACTION] an abort mid-batch leaves neither its places nor its savedTiles rows', async () => {
    await started();
    await saveTiles(content([placeAt('water', 49, 8, { id: 'n1' })]), report);
    // The second place can't be stored: the browser throws in the middle of the batch.
    const unstorable = { ...placeAt('water', 49, 8, { id: 'n3' }), tags: { bad: (() => undefined) as unknown as string } };
    await expect(saveTiles(content([placeAt('water', 49, 8, { id: 'n2' }), unstorable]), { ...report, saved: [{ z: 9, x: 1, y: 3 }] })).rejects.toThrow();
    expect(await counts()).toEqual([1, 1, 1, 1]);
    const db = await openDb();
    expect(await db.get('places', 'n2')).toBeUndefined();
    expect(await db.get('savedTiles', '9/1/3')).toBeUndefined();
  });

  test('[PREP-TRANSACTION] a tile of a run that is not the stored one is refused: a route replaced meanwhile gets nothing of the old', async () => {
    await started();
    await replaceRoute(route({}, 80));
    expect(await readPackRun()).toBeNull();
    await expect(saveTiles(content([placeAt('water', 49, 8, { id: 'n1' })]), report)).rejects.toBeInstanceOf(RouteGoneError);
    expect(await counts()).toEqual([0, 0, 0, 0]);
  });

  test('[PREP-TRANSACTION] a run of the same build for a route since replaced is refused too', async () => {
    await readTrip();
    await saveTrip(trip());
    const old = (await readTrip())!.route.id;
    await replaceRoute(route({ id: 'route-new' }, 80));
    await startPackRun({ buildId: manifest.buildId, manifest }, 'route-new');
    await expect(saveTiles(content([placeAt('water', 49, 8, { id: 'n1' })]), report, old)).rejects.toBeInstanceOf(RouteGoneError);
    await expect(startPackRun({ buildId: manifest.buildId, manifest }, old)).rejects.toBeInstanceOf(RouteGoneError);
    expect(await counts()).toEqual([0, 0, 0, 0]);
    await saveTiles(content([placeAt('water', 49, 8, { id: 'n1' })]), report, 'route-new');
    expect(await counts()).toEqual([1, 1, 1, 1]);
  });

  test('[PREP-TRANSACTION] a new run removes what an older build left, in one go', async () => {
    await started();
    await saveTiles(content([placeAt('water', 49, 8, { id: 'n1' })]), report);
    await startPackRun({ buildId: '20261104-1', manifest: { ...manifest, buildId: '20261104-1' } });
    expect(await counts()).toEqual([0, 0, 0, 0]);
    expect((await readPackRun())!.buildId).toBe('20261104-1');
  });

  test('[PREP-TRANSACTION] a damaged stored run counts as none, so the next run starts over', async () => {
    await started();
    await (await openDb()).put('meta', { buildId: manifest.buildId, manifest: { nonsense: true } }, PACK_RUN_META);
    expect(await readPackRun()).toBeNull();
  });
});

describe('hours go with their places', () => {
  const span = { placeId: 'x', windowStart: new Date('2026-10-17T00:00:00Z'), windowEnd: new Date('2026-10-20T00:00:00Z'), spans: [] };
  const hoursKeys = async (): Promise<string[]> => (await (await openDb()).getAllKeys('hours')).map(String).sort();

  test('[PREP-TRANSACTION] a swap removes the hours of every place it removes, the kitchen\'s too, and keeps a refreshed place\'s', async () => {
    await started();
    await saveTiles(content([placeAt('water', 49, 8, { id: 'n1' })]), report);
    const db = await openDb();
    await db.put('places', placeAt('water', 49, 8, { id: 'n7', source: 'overpass' }));
    for (const id of ['n1', 'n1:kitchen', 'n7', 'n7:kitchen']) await db.put('hours', { ...span, placeId: id });
    const next = { ...manifest, buildId: '20261110-1' };
    await startStage({ buildId: next.buildId, manifest: next });
    await stageTiles([], next.buildId);
    await swapIn(next.buildId);
    expect(await hoursKeys()).toEqual(['n7', 'n7:kitchen']);
  });

  test('[PREP-TRANSACTION] matching keeps no hours of a place it no longer keeps', async () => {
    await started();
    const db = await openDb();
    for (const id of ['n1', 'n1:kitchen', 'n2', 'n2:kitchen']) await db.put('hours', { ...span, placeId: id });
    await saveMatched((await readTrip())!.route.id, { places: [placeAt('water', 49, 8, { id: 'n1' })], roofs: [], rescuePoints: [], matches: [], savedKm: [] });
    expect(await hoursKeys()).toEqual(['n1', 'n1:kitchen']);
  });
});
