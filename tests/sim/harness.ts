// The simulator's harness (spec section 11.1): it invents trip moments, builds the whole stop screen for each and runs the
// invariants on it. It counts how many moments each check really applied to, and saves a shrunk case when one fails.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { isKnownZone } from '../../src/core/answers/time.ts';
import { buildScreen, type Screen } from '../../src/core/screen/screen.ts';
import type { ScreenInputs } from '../../src/core/types.ts';
import { sunOf, type SunSpec } from '../gen/clocks.ts';
import { scenario } from '../gen/scenario.ts';

export type Check = {
  id: string; appliesTo(i: ScreenInputs, s: Screen): boolean;
  check(i: ScreenInputs, s: Screen, again: (i: ScreenInputs) => Screen): void; every?: number;
};
/** A saved failure: the broken invariant, its message, the seed and fast-check's path, and the shrunk inputs. */
export type SavedCase = { id: string; seed: number; replayPath: string; message: string; inputs: ScreenInputs };
export type SimReport = {
  seed: number; count: number; applied: Record<string, number>; failures: SavedCase[]; gateFailures: string[]; ok: boolean;
  digest: string; faults: Record<string, number>; msPerScreen: number;
};
type Built = { screen: Screen; faults: string[] };
export type SimOptions = {
  seed: number; count: number; checks: Check[]; onFail: (c: SavedCase) => void; gate: number;
  /** For the harness's own tests: other moments, another builder, no check of the whole screen. */
  arbitrary?: fc.Arbitrary<ScreenInputs>; build?: (i: ScreenInputs) => Built; whole?: boolean;
};

/** Section 11.1: a run of 1,000 fails if a check applied to fewer than 10. Shorter runs can't be held to that. */
export const GATE = 10;
const GATE_FROM_COUNT = 1000;
/** Shrinking stops after this many more screens: a smaller case isn't worth minutes of a pull request's run. */
const SHRINK_BUDGET = 400;

/** What every screen must be, whatever else: it was built, all parts are there, and Emergency shows numbers and fallback. */
export const WHOLE_SCREEN_ID = 'SCREEN-WHOLE';
function wholeScreen(s: Screen): void {
  const cards = Object.values(s.cards);
  const chips = Object.values(s.chips);
  if (cards.length !== 6 || chips.length !== 6) throw new Error(`${cards.length} cards and ${chips.length} chips`);
  for (const a of [...cards, ...chips]) {
    if (!a.title.trim()) throw new Error(`no title on ${a.topic}`);
    if (!a.basis.some((b) => b.trim() !== '')) throw new Error(`no basis on ${a.topic}`);
  }
  if (!s.chips.emergency.numbers.includes('112')) throw new Error('Emergency without 112');
  if (!s.chips.emergency.detail.trim()) throw new Error('Emergency without its fallback line');
}

const hasRealZones = (i: ScreenInputs): boolean => i.routeZones.every((z) => isKnownZone(z.timeZone));

/** A check that always fails, so that `npm run sim:replay` can be proved on a real file. */
export const SELF_TEST_CHECK: Check = { id: 'SIM-SELF-TEST', appliesTo: () => true, check: () => { throw new Error('self test: this check always fails'); } };

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const partOf = (fault: string): string => fault.split(':')[0]!;

function fnv(hash: number, text: string): number {
  let h = hash;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export function runSim(o: SimOptions): SimReport {
  const build = o.build ?? buildScreen;
  const whole = o.whole ?? true;
  const applied: Record<string, number> = Object.fromEntries(o.checks.map((c) => [c.id, 0]));
  const faults: Record<string, number> = {};
  const again = (i: ScreenInputs): Screen => build(i).screen;
  let index = 0;
  let broken: string | null = null;
  let budget = SHRINK_BUDGET;
  let digest = 0x811c9dc5;
  let ms = 0;
  let screens = 0;

  const property = fc.property(o.arbitrary ?? scenario(), (i) => {
    // While shrinking only the broken check counts, and the budget ends the search.
    if (broken !== null && budget-- <= 0) return true;
    const first = broken === null;
    const now = index;
    if (first) index++;
    let built: Built;
    const t0 = performance.now();
    try {
      built = build(i);
      if (whole) {
        wholeScreen(built.screen);
        // The guard is for the rider. In a run an engine that threw is a bug, unless the route's own zone is no zone at all.
        if (built.faults.length > 0 && hasRealZones(i)) throw new Error(`a part failed behind its guard: ${built.faults[0]}`);
      }
    } catch (e) {
      if (first) broken = WHOLE_SCREEN_ID;
      if (broken === WHOLE_SCREEN_ID) throw e;
      return true;
    }
    if (first) {
      ms += performance.now() - t0;
      screens++;
      for (const f of built.faults) faults[partOf(f)] = (faults[partOf(f)] ?? 0) + 1;
      digest = fnv(digest, JSON.stringify(built.screen) ?? '');
    }
    for (const c of o.checks) {
      if (first ? c.every !== undefined && now % c.every !== 0 : c.id !== broken) continue;
      if (!c.appliesTo(i, built.screen)) continue;
      if (first) applied[c.id]!++;
      try {
        c.check(i, built.screen, again);
      } catch (e) {
        if (first) broken = c.id;
        throw e;
      }
    }
    return true;
  });

  const result = fc.check(property, { seed: o.seed, numRuns: o.count, verbose: 0 });
  const failures: SavedCase[] = [];
  if (result.failed && result.counterexample) {
    const saved: SavedCase = {
      id: broken ?? WHOLE_SCREEN_ID, seed: o.seed, replayPath: result.counterexamplePath ?? '', message: messageOf(result.errorInstance),
      inputs: result.counterexample[0],
    };
    failures.push(saved);
    o.onFail(saved);
  }
  const gateFailures = !result.failed && o.count >= GATE_FROM_COUNT ? o.checks.filter((c) => applied[c.id]! < o.gate).map((c) => c.id) : [];
  return {
    seed: o.seed, count: o.count, applied, failures, gateFailures, ok: failures.length === 0 && gateFailures.length === 0,
    digest: digest.toString(16), faults, msPerScreen: screens > 0 ? ms / screens : 0,
  };
}

// ---- saved cases ---------------------------------------------------------------------------------------------------

function setOwn(out: object, key: string, value: unknown): void {
  Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true }); // so that __proto__ stays a plain key
}

/** JSON has no NaN, Infinity or broken date, and a sun source is a function: each gets a mark that reads back exactly. */
function pack(x: unknown): unknown {
  if (typeof x === 'number') return Number.isFinite(x) ? x : { $number: String(x) };
  if (x instanceof Date) return { $date: Number.isFinite(x.getTime()) ? x.toISOString() : null };
  if (typeof x === 'function') return { $sun: (x as unknown as { spec?: SunSpec }).spec ?? null };
  if (Array.isArray(x)) return x.map(pack);
  if (typeof x !== 'object' || x === null) return x;
  const out = {};
  for (const [k, v] of Object.entries(x)) if (v !== undefined) setOwn(out, k, pack(v));
  return out;
}

function unpack(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(unpack);
  if (typeof x !== 'object' || x === null) return x;
  const o = x as Record<string, unknown>;
  if (typeof o['$number'] === 'string') return Number(o['$number']);
  if ('$date' in o) return new Date(o['$date'] === null ? Number.NaN : (o['$date'] as string));
  if ('$sun' in o) return sunOf((o['$sun'] ?? { kind: 'broken' }) as SunSpec);
  const out = {};
  for (const [k, v] of Object.entries(o)) setOwn(out, k, unpack(v));
  return out;
}

export const encodeCase = (c: SavedCase): string => JSON.stringify(pack(c));
export const decodeCase = (text: string): SavedCase => unpack(JSON.parse(text)) as SavedCase;

/** Writes `<dir>/<ID>-<seed>.json` and returns its path. */
export function saveCase(c: SavedCase, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${c.id}-${c.seed}.json`);
  writeFileSync(file, encodeCase(c));
  return file;
}

export function reportFailure(c: SavedCase, dir: string): string {
  const file = saveCase(c, dir);
  console.log(`[sim] ${c.id} failed: ${c.message}\n[sim] Seed ${c.seed}, path ${c.replayPath}. Saved ${file}. Replay: npm run sim:replay -- ${file}`);
  return file;
}

/** Runs a saved case again on the check it broke. A check that no longer exists can't pass. */
export function replayCase(c: SavedCase, checks: Check[]): { failed: boolean; message: string } {
  try {
    const built = buildScreen(c.inputs);
    wholeScreen(built.screen);
    if (built.faults.length > 0 && hasRealZones(c.inputs)) throw new Error(`a part failed behind its guard: ${built.faults[0]}`);
    if (c.id === WHOLE_SCREEN_ID) return { failed: false, message: '' };
    const check = checks.find((x) => x.id === c.id);
    if (!check) return { failed: true, message: `no check named ${c.id}` };
    if (check.appliesTo(c.inputs, built.screen)) check.check(c.inputs, built.screen, (i) => buildScreen(i).screen);
    return { failed: false, message: '' };
  } catch (e) {
    return { failed: true, message: messageOf(e) };
  }
}
