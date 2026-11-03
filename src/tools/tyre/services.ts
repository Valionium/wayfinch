// What the tyre tool reads and keeps, in one object a test can replace: Load Check's records and You, read-only, and the tool's
// own storage. Apart from the screen, so the Tools card can use it without loading the screen's code.
import { readHost } from './host.ts';
import type { HostData } from './host.ts';
import type { KeyValueStore } from './storage.ts';

export interface TyreServices {
  /** Load Check's records and You, read-only. */
  host: () => HostData;
  /** The tyre tool's own storage. */
  storage: KeyValueStore;
  now: () => Date;
}

export function browserServices(riderKg: () => number | null = () => null): TyreServices {
  const kv: KeyValueStore = {
    getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    setItem: (k, v) => localStorage.setItem(k, v),
  };
  return { host: () => readHost(kv, riderKg), storage: kv, now: () => new Date() };
}
