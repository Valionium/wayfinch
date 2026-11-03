import { beforeEach, expect, test } from 'vitest';
import { freshStore, generatedTrip, trip } from './helpers.ts';
import fc from 'fast-check';
import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import { clearCopies } from '../../../src/store/changed.ts';
import { DB_NAME, MIGRATIONS, STORES, closeDb, openDb, openWith } from '../../../src/store/db.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';

beforeEach(freshStore);

const PLAN_STORES = ['trip', 'matches', 'places', 'roofs', 'rescuePoints', 'hours', 'forecast', 'baseline', 'positions', 'dayStarts', 'calibration', 'waterLeft', 'meta', 'savedTiles', 'handoffs'];

test('[ST-SCHEMA] every store of the plan exists at version 1', async () => {
  const db = await openDb();
  expect(db.version).toBe(1);
  expect([...db.objectStoreNames].sort()).toEqual([...PLAN_STORES].sort());
  expect([...STORES].sort()).toEqual([...PLAN_STORES].sort());
});

test('[ST-SCHEMA] a generated trip comes back with all its fields', async () => {
  await fc.assert(fc.asyncProperty(generatedTrip(), async (t) => {
    freshStore();
    await saveTrip(t);
    expect(await readTrip()).toEqual(t);
  }), { numRuns: 25 });
});

test('[ST-ADD-ONLY] a version 2 that only adds a store keeps everything of version 1', async () => {
  await saveTrip(trip());
  const db = await openDb();
  await db.put('places', { id: 'node/1', kind: 'water' });
  await db.put('meta', 'kept', 'some-key');
  closeDb();

  const addOnly = (d: IDBPDatabase): void => { d.createObjectStore('addedLater'); };
  const v2 = await openWith([...MIGRATIONS, addOnly]);
  expect(v2.version).toBe(2);
  expect(v2.objectStoreNames.contains('addedLater')).toBe(true);
  for (const name of PLAN_STORES) expect(v2.objectStoreNames.contains(name)).toBe(true);
  expect(await v2.get('places', 'node/1')).toEqual({ id: 'node/1', kind: 'water' });
  expect(await v2.get('meta', 'some-key')).toBe('kept');
  expect(await v2.get('trip', 'current')).toEqual(trip());
  v2.close();
});

test('[ST-ADD-ONLY] the migrations only create stores', () => {
  // Each migration gets a database that refuses anything but adding a store.
  const calls: string[] = [];
  const spy = new Proxy({}, {
    get: (_t, name) => {
      if (name === 'createObjectStore') return (store: string) => { calls.push(store); return {}; };
      throw new Error(`a migration used ${String(name)}: migrations only add`);
    },
  }) as IDBPDatabase;
  for (const migrate of MIGRATIONS) migrate(spy);
  expect(calls.length).toBeGreaterThan(0);
});

test('[ST-VERSIONERROR] a database a newer build migrated opens without a version and reads what this build knows', async () => {
  await saveTrip(trip());
  closeDb();
  clearCopies();
  // A newer build took the database to version 3 and added a store.
  const newer = await openDB(DB_NAME, 3, { upgrade: (d) => { d.createObjectStore('fromTheFuture'); } });
  await newer.put('fromTheFuture', 'x', 'y');
  newer.close();

  const db = await openDb();
  expect(db.version).toBe(3);
  expect(await readTrip()).toEqual(trip());

  // What it writes is kept, and it leaves the newer store alone.
  await saveTrip(trip({ campWaterL: 1 }));
  expect((await readTrip())?.campWaterL).toBe(1);
  expect(await (await openDb()).get('fromTheFuture', 'y')).toBe('x');
});

test('[ST-VERSIONERROR] any other failure to open is not swallowed', async () => {
  const real = globalThis.indexedDB;
  globalThis.indexedDB = { open: () => { throw new DOMException('blocked', 'SecurityError'); } } as unknown as IDBFactory;
  await expect(openWith(MIGRATIONS)).rejects.toThrow('blocked');
  globalThis.indexedDB = real;
});
