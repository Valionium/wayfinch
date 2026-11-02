// What `npm run sim` and `npm run sim:replay` run: the scenarios, then every saved regression case (spec section 11.1).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { CHECKS } from './checks.ts';
import { decodeCase, GATE, replayCase, reportFailure, runSim, SELF_TEST_CHECK, type SavedCase } from './harness.ts';

const REGRESSIONS = resolve(process.env.SIM_REGRESSIONS ?? 'tests/regressions');
const known = [...CHECKS, SELF_TEST_CHECK];

const replayText = (c: SavedCase): string => {
  const r = replayCase(c, known);
  return r.failed ? `still fails: ${r.message}` : 'passes';
};

const replay = process.env.SIM_REPLAY;
if (replay) {
  test(`replay ${replay}`, () => {
    const c = decodeCase(readFileSync(replay, 'utf8'));
    const text = replayText(c);
    console.log(`[sim:replay] ${c.id}, seed ${c.seed}: ${text}`);
    expect(text).toBe('passes');
  });
} else {
  test('the simulator', () => {
    const seed = Number(process.env.SIM_SEED ?? 20261030);
    const count = Number(process.env.SIM_COUNT ?? 1000);
    const report = runSim({
      seed, count, checks: CHECKS, gate: GATE,
      onFail: (c) => { reportFailure(c, REGRESSIONS); },
    });
    console.log(`[sim] seed ${seed}, ${count} scenarios, ${report.msPerScreen.toFixed(1)} ms per screen`);
    for (const [id, n] of Object.entries(report.applied)) console.log(`[sim] ${id}: applied to ${n}`);
    for (const [part, n] of Object.entries(report.faults)) console.log(`[sim] guarded failure in ${part}: ${n}`);
    expect(report.failures.map((c) => `${c.id}: ${c.message}`)).toEqual([]);
    expect(report.gateFailures).toEqual([]);
  });

  const saved = existsSync(REGRESSIONS) ? readdirSync(REGRESSIONS).filter((f) => f.endsWith('.json')) : [];
  test.each(saved)('regression %s', (file) => {
    expect(replayText(decodeCase(readFileSync(join(REGRESSIONS, file), 'utf8')))).toBe('passes');
  });
}
