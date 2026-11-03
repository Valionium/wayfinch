// The page's reader of simulator cases (src/ui/sim-case.ts) against the harness's own: the same inputs give the same screen.
import fc from 'fast-check';
import { expect, test } from 'vitest';
import { buildScreen } from '../../../src/core/screen/screen.ts';
import { caseInputs } from '../../../src/ui/sim-case.ts';
import { scenario } from '../../gen/scenario.ts';
import { decodeCase, encodeCase } from '../../sim/harness.ts';

test('[AH-SIM-SCREENS] a saved case read in the page gives the screen the harness reads from it, for every kind of sun', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) {
    const inputs = fc.sample(scenario(), { seed, numRuns: 1 })[0]!;
    const json = encodeCase({ id: 'AH-SIM-SCREENS', seed, replayPath: '', message: '', inputs });
    const page = buildScreen(caseInputs(json)).screen;
    const harness = buildScreen(decodeCase(json).inputs).screen;
    expect(JSON.stringify(page), `seed ${seed}`).toBe(JSON.stringify(harness));
    seen.add((JSON.parse(json) as { inputs: { sun: { $sun: { kind: string } | null } } }).inputs.sun.$sun?.kind ?? 'none');
  }
  expect(seen.size).toBeGreaterThanOrEqual(2);
}, 60_000);
