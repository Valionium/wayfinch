// A fresh store for each test, and "another window": the same database through a second copy of the store's modules,
// which has its own connection and its own idea of which section copies it holds, as a second tab has.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import fc from 'fast-check';
import { vi } from 'vitest';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb } from '../../../src/store/db.ts';
import { flatRoute } from '../../fixtures/build.ts';
import { departureDate, route as routeGen, startTime } from '../../gen/index.ts';
import type { Route, Trip } from '../../../src/core/types.ts';

/** The browser's localStorage, as far as the store uses it. The tests run in plain Node: the shared generators read their files there. */
class MemoryStorage {
  private items = new Map<string, string>();
  get length(): number { return this.items.size; }
  key(i: number): string | null { return [...this.items.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.items.get(k) ?? null; }
  setItem(k: string, v: string): void { this.items.set(k, String(v)); }
  removeItem(k: string): void { this.items.delete(k); }
  clear(): void { this.items.clear(); }
}
globalThis.localStorage = new MemoryStorage() as unknown as Storage;
globalThis.sessionStorage = new MemoryStorage() as unknown as Storage;

/** Every key and value, in key order. */
export function dumpStorage(): string {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)!);
  return JSON.stringify(keys.sort().map((k) => [k, localStorage.getItem(k)]));
}

const open: (() => void)[] = [];

export function freshStore(): void {
  closeDb();
  clearCopies();
  for (const close of open.splice(0)) close();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
}

export type Window2 = {
  trip: typeof import('../../../src/store/trip.ts');
  settings: typeof import('../../../src/store/settings.ts');
};

export async function anotherWindow(): Promise<Window2> {
  vi.resetModules();
  const db = await import('../../../src/store/db.ts');
  open.push(() => db.closeDb());
  const w: Window2 = { trip: await import('../../../src/store/trip.ts'), settings: await import('../../../src/store/settings.ts') };
  vi.resetModules();
  return w;
}

export const route = (over: Partial<Route> = {}, km = 100): Route => ({ ...flatRoute(km, { stageEnds: [40, 70] }), ...over });
export const trip = (over: Partial<Trip> = {}): Trip => ({
  route: route(), departureDate: '2026-10-17', startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2, ...over,
});

/** Any trip the store should accept. */
export const generatedTrip = (): fc.Arbitrary<Trip> => fc.record({
  route: routeGen(), departureDate: departureDate(), startTime: startTime(),
  flatKph: fc.double({ min: 15, max: 40, noNaN: true }),
  stay: fc.constantFrom('camping' as const, 'mixed' as const, 'accommodation' as const),
  campWaterL: fc.double({ min: 0, max: 5, noNaN: true }),
  pace: fc.constantFrom('steady' as const, 'sporting' as const, 'hard' as const),
});
