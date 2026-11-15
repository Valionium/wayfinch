// @vitest-environment jsdom
// The owner's ruling of 14 Nov 2026 (sweep #26): Tools' Bag planner card counts the bottles in the plan's cages beside its bags, with the
// same kit-plus-water total the packing check shows (the load summary's carriedKg, to 0.1 kg). The line with the bottles is the full
// Tools screen's (its own chunk), so the first screen carries none of it; while that screen loads, the card counts the bags only.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, test } from 'vitest';
import full from '../../../contracts/load-summary/full.json';
import { TK } from '../../../src/core/wording/en-tyre-card.ts';
import { W } from '../../../src/core/wording/en.ts';
import { browserServices } from '../../../src/tools/tyre/ui.tsx';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { go } from '../../../src/ui/nav.ts';
import { ToolsFirst } from '../../../src/ui/tools/bag-card.tsx';
import { ToolsScreen } from '../../../src/ui/tools/tools.tsx';

const host = document.createElement('div');
document.body.append(host);
afterEach(() => { act(() => render(null, host)); localStorage.clear(); refreshBikeSource(); });
beforeEach(() => { go('tools'); localStorage.clear(); });
const line = () => host.querySelector('.tool-line')?.textContent;
const seed = (summary: unknown) => { localStorage.setItem('loadcheck:summary:v1', JSON.stringify(summary)); refreshBikeSource(); };

test('[LC-LITRES-ONE] the Tools card counts the bottles in the cages beside the bags, with the summary\'s kit-plus-water total', async () => {
  seed(full);   // 3 bags, a bottle on the seat tube and one on the down tube, 10.2 kg
  await act(async () => { render(<ToolsScreen services={browserServices()} />, host); });
  expect(line()).toBe('3 bags, 2 bottles · 10.2 kg');
  expect(TK.tyreBagCardBottles(1, 1, 1.649)).toBe('1 bag, 1 bottle · 1.6 kg');
  // no bottle in a cage: the line as before
  seed({ ...full, water: { ...full.water, bottles: [], cageL: 0, totalL: 0 } });
  act(() => render(null, host));
  await act(async () => { render(<ToolsScreen services={browserServices()} />, host); });
  expect(line()).toBe('3 bags · 10.2 kg');
  // while the Tools screen loads: the bags only, from the first screen's own words
  seed(full);
  act(() => render(null, host));
  await act(async () => { render(<ToolsFirst services={browserServices()} />, host); });
  expect(line()).toBe(W.tyreBagCardLine(3, 10.2));
});
