import { beforeEach, expect, test } from 'vitest';
import { freshStore } from '../../store/helpers.ts';
import { exportAll, importAll } from '../../../../src/store/export.ts';
import type { ExportFile } from '../../../../src/store/export.ts';
import { TYRE_KEY, readStore, saveEntry } from '../../../../src/tools/tyre/storage.ts';

beforeEach(freshStore);
const NOW = new Date('2026-11-03T10:00:00Z');
const kv = () => localStorage;
const mineBefore = () => {
  saveEntry(kv(), 'bike_a', { details: { tyreMax: { value: 5, unit: 'bar' }, rimType: 'hooked' }, last: { frontBar: 2.1, rearBar: 2.4, at: NOW.toISOString(), bike: 'A' } }, NOW);
  saveEntry(kv(), 'default', { details: { tyreMax: { value: 65, unit: 'psi' } }, last: null }, NOW);
};

test('[TY-UI-EXPORT] the tyre details are in the export file and an import on an empty phone brings them back', async () => {
  mineBefore();
  const stored = localStorage.getItem(TYRE_KEY);
  const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
  expect(Object.keys(file.tyres.byBike).sort()).toEqual(['bike_a', 'default']);
  freshStore();
  expect(localStorage.getItem(TYRE_KEY)).toBeNull();
  const result = await importAll(file);
  expect(result.ok).toBe(true);
  const back = readStore(kv());
  expect(back.ok && back.store.entries.bike_a?.details).toEqual({ tyreMax: { value: 5, unit: 'bar' }, rimType: 'hooked' });
  expect(back.ok && back.store.entries.default?.details.tyreMax).toEqual({ value: 65, unit: 'psi' });
  expect(back.ok && back.store.entries.bike_a?.last?.frontBar).toBe(2.1);
  expect(stored).not.toBeNull();
});

test('[TY-UI-EXPORT] a damaged entry in the tyre section does not stop the file, and bad fields are dropped', async () => {
  mineBefore();
  const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
  file.tyres.byBike = { bike_a: { details: { tyreMax: { value: 'x', unit: 'bar' }, rimType: 'hooked' }, last: 7 }, bad: 5, default: null };
  freshStore();
  const result = await importAll(file);
  expect(result.ok).toBe(true);
  const back = readStore(kv());
  expect(back.ok && back.store.entries.bike_a?.details).toEqual({ rimType: 'hooked' });
  expect(back.ok && Object.keys(back.store.entries)).toEqual(['bike_a']);
});

test('[TY-UI-EXPORT] an empty phone exports an empty tyre section, and importing it writes no tyre key', async () => {
  const file = JSON.parse(JSON.stringify(await exportAll())) as ExportFile;
  expect(file.tyres.byBike).toEqual({});
  freshStore();
  expect((await importAll(file)).ok).toBe(true);
  expect(localStorage.getItem(TYRE_KEY)).toBeNull();
});
