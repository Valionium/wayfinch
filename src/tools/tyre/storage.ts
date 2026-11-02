// The tyre tool's own storage: details per bag-planner bike id, or under one default key when there is no saved bike (spec section 7.2).
// One `copilot:*` key, never a `loadcheck:*` one. It is also what the export file's `tyres` section carries.
import { limitUsable } from './core.ts';
import type { Bars, Casing, Limit, RimType, Setup, Surface } from './core.ts';
import type { Details } from './model.ts';
import { WHEELS } from './tables.ts';

export const TYRE_KEY = 'copilot:tyre:v1';
export const DEFAULT_KEY = 'default';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The last figures shown for one bike, for the Tools tab. Shown values only (bar), never written anywhere else. */
export interface LastResult { frontBar: number; rearBar: number; at: string }
export interface Entry { details: Details; last: LastResult | null }
export interface TyreStore { v: 1; updatedAt: string; entries: Record<string, Entry> }

const empty = (): TyreStore => ({ v: 1, updatedAt: '', entries: {} });

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const oneOf = <T extends string>(x: unknown, list: readonly T[]): T | undefined => (typeof x === 'string' && (list as readonly string[]).includes(x) ? (x as T) : undefined);
const num = (x: unknown, lo: number, hi: number): number | undefined => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : undefined);
const limit = (x: unknown): Limit | undefined => {
  if (!isObject(x)) return undefined;
  const unit = oneOf(x.unit, ['bar', 'psi'] as const);
  const l = unit && typeof x.value === 'number' ? { value: x.value, unit } : undefined;
  return l && limitUsable(l) ? l : undefined;
};

/** Anything stored or imported is read through this: unknown fields are dropped, impossible values are ignored (not repaired). */
export function sanitizeDetails(raw: unknown): Details {
  if (!isObject(raw)) return {};
  const d: Details = {};
  const set = <K extends keyof Details>(k: K, v: Details[K] | undefined): void => { if (v !== undefined) d[k] = v; };
  set('bars', oneOf(raw.bars, ['drop', 'flat', 'other'] as const satisfies readonly Bars[]));
  const bsd = num(raw.wheelBsdMm, 300, 700);
  set('wheelBsdMm', bsd !== undefined && WHEELS.some((w) => w.bsdMm === bsd) ? bsd : undefined);
  set('frontMm', num(raw.frontMm, 18, 83));
  set('rearMm', num(raw.rearMm, 18, 83));
  if (raw.caliperFrontMm === null) d.caliperFrontMm = null; else set('caliperFrontMm', num(raw.caliperFrontMm, 10, 110));
  if (raw.caliperRearMm === null) d.caliperRearMm = null; else set('caliperRearMm', num(raw.caliperRearMm, 10, 110));
  set('casing', oneOf(raw.casing, ['supple', 'standard', 'reinforced'] as const satisfies readonly Casing[]));
  set('setup', oneOf(raw.setup, ['butyl', 'latex', 'tpu', 'tubeless'] as const satisfies readonly Setup[]));
  set('rimType', oneOf(raw.rimType, ['hooked', 'hookless', 'tubular'] as const satisfies readonly RimType[]));
  set('rimInnerMm', num(raw.rimInnerMm, 10, 60));
  set('surface', oneOf(raw.surface, ['paved', 'rough', 'unpaved'] as const satisfies readonly Surface[]));
  if (typeof raw.wet === 'boolean') d.wet = raw.wet;
  set('tyreMax', limit(raw.tyreMax));
  if (raw.tyreMin === null) d.tyreMin = null; else set('tyreMin', limit(raw.tyreMin));
  if (raw.rimMax === null) d.rimMax = null; else set('rimMax', limit(raw.rimMax));
  set('riderKg', num(raw.riderKg, 20, 350));
  set('bikeKg', num(raw.bikeKg, 1, 150));
  set('carriedKg', num(raw.carriedKg, 0, 300));
  if (raw.measured === null) d.measured = null;
  else if (isObject(raw.measured)) {
    const f = num(raw.measured.frontKg, 1, 300);
    const r = num(raw.measured.rearKg, 1, 300);
    if (f !== undefined && r !== undefined) d.measured = { frontKg: f, rearKg: r };
  }
  if (isObject(raw.heat)) {
    const h: NonNullable<Details['heat']> = {};
    const t = (x: unknown) => num(x, -40, 60);
    const m = (x: unknown) => num(x, -400, 9000);
    if (t(raw.heat.pumpC) !== undefined) h.pumpC = t(raw.heat.pumpC);
    if (t(raw.heat.maxC) !== undefined) h.maxC = t(raw.heat.maxC);
    if (m(raw.heat.pumpHeightM) !== undefined) h.pumpHeightM = m(raw.heat.pumpHeightM);
    if (m(raw.heat.highestM) !== undefined) h.highestM = m(raw.heat.highestM);
    if (Object.keys(h).length) d.heat = h;
  }
  return d;
}

function sanitizeLast(raw: unknown): LastResult | null {
  if (!isObject(raw)) return null;
  const f = num(raw.frontBar, 0.1, 15);
  const r = num(raw.rearBar, 0.1, 15);
  return f !== undefined && r !== undefined && typeof raw.at === 'string' && raw.at.length <= 40 ? { frontBar: f, rearBar: r, at: raw.at } : null;
}

export type ReadOutcome = { ok: true; store: TyreStore } | { ok: false; reason: 'newer' | 'broken' };

/** Reads the whole store. A newer format is not read (and not overwritten by `saveEntry`); a broken value reads as empty. */
export function readStore(kv: KeyValueStore): ReadOutcome {
  let text: string | null = null;
  try { text = kv.getItem(TYRE_KEY); } catch { return { ok: true, store: empty() }; }
  if (text === null) return { ok: true, store: empty() };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'broken' }; }
  if (!isObject(raw)) return { ok: false, reason: 'broken' };
  if (typeof raw.v === 'number' && raw.v > 1) return { ok: false, reason: 'newer' };
  const store = empty();
  store.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : '';
  if (isObject(raw.entries)) {
    for (const [key, value] of Object.entries(raw.entries)) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(key) || !isObject(value)) continue;
      store.entries[key] = { details: sanitizeDetails(value.details), last: sanitizeLast(value.last) };
    }
  }
  return { ok: true, store };
}

export const entryOf = (store: TyreStore, key: string): Entry => store.entries[key] ?? { details: {}, last: null };

/** Writes one bike's entry, keeping the others. False when the browser would not keep it, or a newer format is there. */
export function saveEntry(kv: KeyValueStore, key: string, entry: Entry, now: Date): boolean {
  const read = readStore(kv);
  if (!read.ok && read.reason === 'newer') return false;
  const store = read.ok ? read.store : empty();
  store.entries[key] = { details: sanitizeDetails(entry.details), last: entry.last };
  store.updatedAt = now.toISOString();
  try { kv.setItem(TYRE_KEY, JSON.stringify(store)); return true; } catch { return false; }
}

/** The export file's `tyres` section: the stored data, or null when there is none. */
export function exportTyres(kv: KeyValueStore): TyreStore | null {
  const read = readStore(kv);
  if (!read.ok) return null;
  return Object.keys(read.store.entries).length ? read.store : null;
}

/** An imported `tyres` section: read as stored data (unknown fields dropped), then replaces the stored data. */
export function importTyres(kv: KeyValueStore, section: unknown, now: Date): { ok: true } | { ok: false; reason: string } {
  if (!isObject(section) || section.v !== 1) return { ok: false, reason: 'The tyre details in this file are not in a format this version reads.' };
  const store = empty();
  store.updatedAt = now.toISOString();
  if (isObject(section.entries)) {
    for (const [key, value] of Object.entries(section.entries)) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(key) || !isObject(value)) continue;
      store.entries[key] = { details: sanitizeDetails(value.details), last: sanitizeLast(value.last) };
    }
  }
  try { kv.setItem(TYRE_KEY, JSON.stringify(store)); return { ok: true }; } catch { return { ok: false, reason: 'This browser would not keep the tyre details.' }; }
}
