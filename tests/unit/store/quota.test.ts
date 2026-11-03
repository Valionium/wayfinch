// A full disk as a browser shows it: the requests went through, the commit is refused, the transaction undone. Its requests then
// read AbortError, and only the transaction's own error says QuotaExceededError.
import { beforeEach, expect, test } from 'vitest';
import { unwrap } from 'idb';
import { freshStore } from './helpers.ts';
import { CURRENT, inTx, openDb } from '../../../src/store/db.ts';
import { isStorageFull } from '../../../src/data/packs/download.ts';

beforeEach(freshStore);

test('[PREP-QUOTA] a commit refused for lack of room reads as storage full, not as an aborted request, and keeps nothing', async () => {
  const failure = inTx(['meta'], 'readwrite', async (tx) => {
    const raw = unwrap(tx) as IDBTransaction;
    const request = tx.objectStore('meta').put('x'.repeat(1000), CURRENT);
    Object.defineProperty(raw, 'error', { value: new DOMException('The quota has been exceeded.', 'QuotaExceededError') });
    raw.abort();
    await request;
  });
  const e = await failure.catch((x: unknown) => x);
  expect((e as { name?: string }).name).toBe('QuotaExceededError');
  expect(isStorageFull(e)).toBe(true);
  expect(await (await openDb()).get('meta', CURRENT)).toBeUndefined();
});

test('[PREP-QUOTA] an abort for another reason stays what it was', async () => {
  const e = await inTx(['meta'], 'readwrite', async (tx) => {
    const request = tx.objectStore('meta').put('x', CURRENT);
    (unwrap(tx) as IDBTransaction).abort();
    await request;
  }).catch((x: unknown) => x);
  expect((e as { name?: string }).name).toBe('AbortError');
  expect(isStorageFull(e)).toBe(false);
});
