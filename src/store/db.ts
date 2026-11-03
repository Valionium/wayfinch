// The app's IndexedDB database (spec section 4.4). A migration only adds stores and fields. After a rollback a build can
// meet a database a newer build has migrated: it then reopens without a version and reads what it knows.
import { openDB } from 'idb';
import type { IDBPDatabase, IDBPTransaction } from 'idb';

export type Db = IDBPDatabase;
export type Migration = (db: Db) => void;
export type Tx = IDBPTransaction<unknown, string[], 'readwrite'>;

export const DB_NAME = 'copilot';

/** The single record of a store that holds one thing: the trip, the forecast, the baseline, the water left. */
export const CURRENT = 'current';

/** Records of `meta` under this prefix belong to the route, and go with it. */
export const ROUTE_META_PREFIX = 'route:';

/** Every store that holds data of one route: what `replaceRoute` empties. Calibration and handoffs are the rider's. */
export const ROUTE_STORES = [
  'matches', 'places', 'roofs', 'rescuePoints', 'hours', 'forecast', 'baseline', 'positions', 'dayStarts', 'waterLeft', 'savedTiles',
];

const V1: Migration = (db) => {
  db.createObjectStore('trip');
  db.createObjectStore('matches', { autoIncrement: true });
  db.createObjectStore('places', { keyPath: 'id' });
  db.createObjectStore('roofs', { autoIncrement: true });
  db.createObjectStore('rescuePoints', { autoIncrement: true });
  db.createObjectStore('hours', { keyPath: 'placeId' });
  db.createObjectStore('forecast');
  db.createObjectStore('baseline');
  db.createObjectStore('positions', { autoIncrement: true });
  db.createObjectStore('dayStarts', { keyPath: 'day' });
  db.createObjectStore('calibration', { autoIncrement: true });
  db.createObjectStore('waterLeft');
  db.createObjectStore('meta');
  db.createObjectStore('savedTiles');
  db.createObjectStore('handoffs');
};

/** One entry per version. Only ever append, and only ever add. */
export const MIGRATIONS: Migration[] = [V1];

export const STORES = [...ROUTE_STORES, 'trip', 'calibration', 'meta', 'handoffs'];

let current: Promise<Db> | null = null;

const forget = (): void => { current = null; };

/** A connection that lets go when another window needs to upgrade or delete the database. */
const callbacks = (db: () => Db | null) => ({
  blocking: () => { db()?.close(); forget(); },
  terminated: forget,
});

/** Opens at the version these migrations reach, or without a version when a newer build got there first. */
export async function openWith(migrations: Migration[]): Promise<Db> {
  let opened: Db | null = null;
  const hooks = callbacks(() => opened);
  try {
    opened = await openDB(DB_NAME, migrations.length, {
      upgrade: (db, oldVersion) => { for (const migrate of migrations.slice(oldVersion)) migrate(db as unknown as Db); },
      ...hooks,
    });
  } catch (e) {
    if ((e as { name?: string } | null)?.name !== 'VersionError') throw e;
    opened = await openDB(DB_NAME, undefined, hooks);
  }
  return opened;
}

export function openDb(): Promise<Db> {
  if (!current) {
    const opening = openWith(MIGRATIONS);
    current = opening;
    opening.catch(() => { if (current === opening) forget(); });
  }
  return current;
}

/**
 * The database if it is there, else null: this open never makes one. IndexedDB queues it behind a delete another window has
 * started, and it is undone in the same step if it would create the database, so a read in one window can't bring back what the
 * rider just deleted in another (ST-DELETE). A database of an older build is opened as usual, to be brought up to date.
 */
export async function openExisting(): Promise<Db | null> {
  if (current) {
    try {
      return await current;
    } catch {
      // the open that was under way failed: try again below
    }
  }
  let opened: Db | null = null;
  const hooks = callbacks(() => opened);
  try {
    opened = await openDB(DB_NAME, undefined, {
      upgrade: (_db, oldVersion, _newVersion, tx) => {
        if (oldVersion !== 0) return;
        tx.done.catch(() => undefined); // the abort is the answer, not an error
        tx.abort();
      },
      ...hooks,
    });
  } catch (e) {
    if ((e as { name?: string } | null)?.name === 'AbortError') return null;
    throw e;
  }
  if (opened.version < MIGRATIONS.length) {
    opened.close();
    return openDb();
  }
  if (!current) current = Promise.resolve(opened);
  else opened.close();
  return current;
}

// What a transaction reads with no database at all: every store empty. A write to it is lost, as a write meant to follow a read
// must be once the rider has deleted everything.
const emptyStore = {
  get: async () => undefined, getKey: async () => undefined, getAll: async () => [], getAllKeys: async () => [], count: async () => 0,
  openCursor: async () => null, put: async () => undefined, add: async () => undefined, delete: async () => undefined, clear: async () => undefined,
  index: () => emptyStore,
};
const emptyTx = { objectStore: () => emptyStore, done: Promise.resolve(), abort: () => undefined, error: null };

/** Lets go of this window's connection; the next use opens a new one. */
export function closeDb(): void {
  const closing = current;
  forget();
  void closing?.then((db) => db.close()).catch(() => undefined);
}

/**
 * A phone can close the connection while the app sleeps, which only shows here: then once more, on a new one. A read, and a write
 * that only follows up a read (`existing`), never make the database: with none they see empty stores.
 */
async function begin(stores: string[], mode: 'readonly' | 'readwrite', existing: boolean) {
  const open = (): Promise<Db | null> => (existing ? openExisting() : openDb());
  const db = await open();
  if (!db) return emptyTx;
  try {
    return db.transaction(stores, mode);
  } catch (e) {
    if ((e as { name?: string } | null)?.name !== 'InvalidStateError') throw e;
    forget();
    const again = await open();
    return again ? again.transaction(stores, mode) : emptyTx;
  }
}

/**
 * Runs `work` in one transaction. Anything it throws undoes all of it, also what was done before the throw: a value the
 * browser can't store throws at the call, which by itself would not stop the transaction. `work` awaits only this
 * transaction's own requests, or the browser ends it early.
 */
export async function inTx<T>(stores: string[], mode: 'readonly' | 'readwrite', work: (tx: Tx) => Promise<T>, opts: { existing?: boolean } = {}): Promise<T> {
  const tx = (await begin(stores, mode, mode === 'readonly' || opts.existing === true)) as unknown as Tx;
  try {
    const result = await work(tx);
    await tx.done;
    return result;
  } catch (e) {
    try { tx.abort(); } catch { /* already ended */ }
    await tx.done.catch(() => undefined);
    // A full disk can show first as a request aborted: the transaction's own error says why.
    if ((e as { name?: string } | null)?.name === 'AbortError' && tx.error) throw tx.error;
    throw e;
  }
}

/** A write that only follows up a read (a sweep, what a screen keeps, an accepted position): it never makes the database. */
export function inExistingTx<T>(stores: string[], work: (tx: Tx) => Promise<T>): Promise<T> {
  return inTx(stores, 'readwrite', work, { existing: true });
}
