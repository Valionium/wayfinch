import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, test, vi } from 'vitest';
import { screen, type Screen } from '../../../src/core/screen/screen.ts';
import type { ScreenInputs } from '../../../src/core/types.ts';
import { scenario } from '../../gen/scenario.ts';
import { decodeCase, encodeCase, reportFailure, replayCase, runSim, saveCase, SELF_TEST_CHECK, type Check, type SavedCase } from '../../sim/harness.ts';

const SEED = 20261030;
const dir = mkdtempSync(join(tmpdir(), 'wayfinch-sim-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A cheap stand-in: the gate counts, so no real screens are needed for a thousand moments. */
const cheap = { arbitrary: fc.integer() as unknown as fc.Arbitrary<ScreenInputs>, build: () => ({ screen: {} as Screen, faults: [] }), whole: false };
const appliedTimes = (n: number): Check => {
  let seen = 0;
  return { id: 'TEST-GATE', appliesTo: () => seen++ < n, check: () => undefined };
};

describe('the gate', () => {
  test('[HON-SIM-GATE] a check that applied to 9 of 1,000 fails the run', () => {
    const r = runSim({ seed: SEED, count: 1000, checks: [appliedTimes(9)], onFail: () => undefined, gate: 10, ...cheap });
    expect(r.applied['TEST-GATE']).toBe(9);
    expect(r.gateFailures).toEqual(['TEST-GATE']);
    expect(r.ok).toBe(false);
  });
  test('[HON-SIM-GATE] 10 of 1,000 passes', () => {
    const r = runSim({ seed: SEED, count: 1000, checks: [appliedTimes(10)], onFail: () => undefined, gate: 10, ...cheap });
    expect(r.applied['TEST-GATE']).toBe(10);
    expect(r.gateFailures).toEqual([]);
    expect(r.ok).toBe(true);
  });
  test('[HON-SIM-GATE] with a count under 1,000 the gate is off', () => {
    const r = runSim({ seed: SEED, count: 999, checks: [appliedTimes(9)], onFail: () => undefined, gate: 10, ...cheap });
    expect(r.gateFailures).toEqual([]);
    expect(r.ok).toBe(true);
  });
  test('[HON-SIM-GATE] a check that says it does not apply is not run; `every` skips the moments between', () => {
    let runs = 0;
    const never: Check = { id: 'NEVER', appliesTo: () => false, check: () => { throw new Error('ran'); } };
    const fifth: Check = { id: 'FIFTH', appliesTo: () => true, check: () => { runs++; }, every: 5 };
    const r = runSim({ seed: SEED, count: 20, checks: [never, fifth], onFail: () => undefined, gate: 10, ...cheap });
    expect(r.ok).toBe(true);
    expect(r.applied).toEqual({ NEVER: 0, FIFTH: 4 });
    expect(runs).toBe(4);
  });
});

describe('a failure', () => {
  const hasPlaces: Check = {
    id: 'TEST-FALSE', appliesTo: (i) => i.places.length >= 2,
    check: (i) => { throw new Error(`deliberately false with ${i.places.length} places`); },
  };

  test('[HON-SIM-FAIL] a deliberately false check saves <ID>-<seed>.json with the broken invariant and a shrunk case, prints seed and path, and replays', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const saved: SavedCase[] = [];
    const r = runSim({ seed: SEED, count: 50, checks: [hasPlaces], gate: 10, onFail: (c) => { saved.push(c); reportFailure(c, dir); } });
    const printed = log.mock.calls.flat().join(' ');
    log.mockRestore();
    expect(r.ok).toBe(false);
    expect(saved).toHaveLength(1);
    const file = join(dir, `TEST-FALSE-${SEED}.json`);
    expect(existsSync(file)).toBe(true);
    expect(printed).toContain(String(SEED));
    expect(printed).toContain(file);
    const back = decodeCase(readFileSync(file, 'utf8'));
    expect(back.id).toBe('TEST-FALSE');
    expect(back.seed).toBe(SEED);
    expect(back.message).toContain('deliberately false');
    // Shrunk: the smallest list that still breaks it, on a route far below the generator's longest.
    expect(back.inputs.places.length).toBe(2);
    expect(replayCase(back, [hasPlaces])).toMatchObject({ failed: true, message: expect.stringContaining('deliberately false') });
    expect(replayCase(back, [{ ...hasPlaces, check: () => undefined }])).toMatchObject({ failed: false });
    expect(replayCase({ ...back, id: 'NO-SUCH-CHECK' }, [hasPlaces]).message).toContain('NO-SUCH-CHECK');
    expect(replayCase({ ...back, id: 'NO-SUCH-CHECK' }, [hasPlaces]).failed).toBe(true);
  }, 120_000);

  test('[HON-SIM-FAIL] npm run sim:replay reruns a saved case and exits with an error while it still fails', () => {
    const inputs = fc.sample(scenario(), { numRuns: 1, seed: SEED })[0]!;
    const c: SavedCase = { id: SELF_TEST_CHECK.id, seed: 7, replayPath: '0', message: 'self test', inputs };
    const file = saveCase(c, dir);
    expect(file).toBe(join(dir, `${SELF_TEST_CHECK.id}-7.json`));
    const r = spawnSync(process.execPath, ['tools/sim-replay.mjs', file], { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('still fails');
  }, 120_000);

  test('[HON-SIM-FAIL] a screen that throws or loses Emergency fails the run by itself', () => {
    const failures: SavedCase[] = [];
    const r = runSim({
      seed: SEED, count: 5, checks: [], gate: 10, onFail: (c) => failures.push(c),
      arbitrary: fc.integer() as unknown as fc.Arbitrary<ScreenInputs>, build: () => { throw new Error('the screen threw'); },
    });
    expect(r.ok).toBe(false);
    expect(failures[0]!.id).toBe('SCREEN-WHOLE');
    expect(failures[0]!.message).toContain('the screen threw');
  });

  test('[HON-SIM-FAIL] a part that failed behind its guard fails the run: a card that says it cannot be worked out is no excuse for an engine that threw', () => {
    const good = fc.sample(scenario(), { numRuns: 1, seed: SEED })[0]!;
    const r = runSim({
      seed: SEED, count: 5, checks: [], gate: 10, onFail: () => undefined,
      arbitrary: fc.constant({ ...good, routeZones: [{ fromKm: 0, toKm: 1, timeZone: 'Europe/Berlin', holidayZone: null, country: 'DE' }] }), build: (i) => ({ screen: screen(i), faults: ['water: boom'] }),
    });
    expect(r.failures[0]!.id).toBe('SCREEN-WHOLE');
    expect(r.failures[0]!.message).toContain('water: boom');
  });

  test('[HON-SIM-FAIL] a zone that is none is the one thing that may fail behind the guard: the trip day has no clock to read', () => {
    const good = fc.sample(scenario(), { numRuns: 1, seed: SEED })[0]!;
    const r = runSim({
      seed: SEED, count: 5, checks: [], gate: 10, onFail: () => undefined,
      arbitrary: fc.constant({ ...good, routeZones: [{ fromKm: 0, toKm: 1, timeZone: 'constructor', holidayZone: null, country: 'DE' }] }),
    });
    expect(r.ok).toBe(true);
  });

  test('[HON-SIM-FAIL] guarded failures of a part are counted in the report', () => {
    const r = runSim({
      seed: SEED, count: 5, checks: [], gate: 10, onFail: () => undefined, whole: false,
      arbitrary: fc.integer() as unknown as fc.Arbitrary<ScreenInputs>, build: () => ({ screen: {} as Screen, faults: ['water: boom', 'water: bang', 'ride: oops'] }),
    });
    expect(r.faults).toEqual({ water: 10, ride: 5 });
  });
});

describe('a saved case reads back as it was', () => {
  test('[HON-SIM-FAIL] NaN, Infinity, dates that are none, own __proto__ tags and the sun source survive the file', () => {
    const nasty = fc.sample(scenario(), { numRuns: 40, seed: SEED });
    for (const inputs of nasty) {
      const c: SavedCase = { id: 'X', seed: 1, replayPath: '1', message: 'm', inputs };
      const back = decodeCase(encodeCase(c)).inputs;
      expect(JSON.stringify(screen(back))).toBe(JSON.stringify(screen(inputs)));
    }
  }, 120_000);
  test('[HON-SIM-FAIL] the values themselves', () => {
    const tags = JSON.parse('{"__proto__":"odd","shop":"x"}') as Record<string, string>;
    const value = { a: Number.NaN, b: Infinity, c: -Infinity, d: new Date(Number.NaN), e: new Date(5), f: [null, 1], tags };
    const c = { id: 'X', seed: 1, replayPath: '1', message: 'm', inputs: value as unknown as ScreenInputs };
    const back = decodeCase(encodeCase(c)).inputs as unknown as typeof value;
    expect(back.a).toBeNaN();
    expect(back.b).toBe(Infinity);
    expect(back.c).toBe(-Infinity);
    expect(back.d).toBeInstanceOf(Date);
    expect(back.d.getTime()).toBeNaN();
    expect(back.e).toEqual(new Date(5));
    expect(back.f).toEqual([null, 1]);
    expect(Object.hasOwn(back.tags, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(back.tags)).toBe(Object.prototype);
  });
});

describe('the seed', () => {
  const counting: Check = { id: 'TEST-COUNT', appliesTo: (i) => i.places.length > 2, check: () => undefined };
  test('[HON-SIM-SEED] the same seed gives the same run, twice; another seed another', () => {
    const run = (seed: number): ReturnType<typeof runSim> => runSim({ seed, count: 40, checks: [counting], onFail: () => undefined, gate: 10 });
    const a = run(SEED);
    const b = run(SEED);
    const other = run(SEED + 1);
    expect(a.digest).not.toBe('');
    expect(a.digest).toBe(b.digest);
    expect(a.applied).toEqual(b.applied);
    expect(a.faults).toEqual(b.faults);
    expect(other.digest).not.toBe(a.digest);
  }, 120_000);
  test('[HON-SIM-SEED] npm run sim runs with a seed and count from the command line', () => {
    const file = join(dir, 'empty-regressions');
    writeFileSync(`${file}.txt`, '');
    const r = spawnSync(process.execPath, ['tools/sim.mjs', '--seed', '11', '--count', '3'], { encoding: 'utf8', env: { ...process.env, SIM_REGRESSIONS: file } });
    expect(r.stdout).toContain('[sim] seed 11, 3 scenarios');
    expect(r.status).toBe(0);
  }, 120_000);
});
