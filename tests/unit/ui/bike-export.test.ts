// @vitest-environment jsdom
// Sub-project 11, group 2, Task 5: the You services carry the chosen bike through an export and an import.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, test, vi } from 'vitest';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb } from '../../../src/store/db.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { loadRiderKg } from '../../../src/ui/rider-kg.ts';
import { BIKE_CHOICE_KEY, newerChoice, noteBikeChoice } from '../../../src/ui/tools/bike-choice.ts';
import { browserYouServices } from '../../../src/ui/you/services.ts';

vi.setConfig({ testTimeout: 30_000 });
const NOW = new Date('2026-11-07T09:00:00Z');
beforeEach(async () => {
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  refreshBikeSource();
  await loadRiderKg();
});
const svc = () => browserYouServices(() => NOW, () => undefined);
const choice = () => newerChoice((k) => localStorage.getItem(k));

test('[TB-EXPORT] the export holds the chosen bike; importing it on a fresh device makes it the choice; a file without it, or with an unknown id, imports and falls back', async () => {
  noteBikeChoice('bike_b', NOW);
  const file = JSON.parse((await svc().exportFile()).text) as { settings: Record<string, unknown> };
  expect(file.settings.toolBike).toBe('bike_b');

  // A fresh device: the import brings settings, and with them the choice.
  localStorage.clear();
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  expect(choice()).toBeNull();
  const result = await svc().applyImport(JSON.stringify(file));
  expect(result.ok).toBe(true);
  expect(choice()).toEqual({ bikeId: 'bike_b' });
  expect(JSON.parse(localStorage.getItem(BIKE_CHOICE_KEY)!)).toMatchObject({ app: 'copilot', kind: 'bike-choice', v: 1 });

  // An export from before this sub-project: no field, no choice, nothing fails.
  localStorage.clear();
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  const old = JSON.parse(JSON.stringify(file)) as { settings: Record<string, unknown> };
  delete old.settings.toolBike;
  old.settings.theme = 'light';
  expect((await svc().applyImport(JSON.stringify(old))).ok).toBe(true);
  expect(choice()).toBeNull();

  // An id this phone has no bike for: the import succeeds, and the bike line falls back (nothing saved here, so the choice is not used).
  localStorage.clear();
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  const strange = JSON.parse(JSON.stringify(file)) as { settings: Record<string, unknown> };
  strange.settings.toolBike = 'bike_elsewhere';
  expect((await svc().applyImport(JSON.stringify(strange))).ok).toBe(true);
  const { choiceAmong } = await import('../../../src/ui/tools/bike-choice.ts');
  expect(choiceAmong((k) => localStorage.getItem(k), ['bike_here'])).toBeNull();
  // A bad id comes in as none: no record at all.
  localStorage.clear();
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  strange.settings.toolBike = 'not valid';
  expect((await svc().applyImport(JSON.stringify(strange))).ok).toBe(true);
  expect(choice()).toBeNull();
});
