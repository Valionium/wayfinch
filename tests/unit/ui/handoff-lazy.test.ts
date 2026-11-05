// @vitest-environment jsdom
// Plan bags for this trip loads its code on the tap (src/ui/trip/handoff.ts, a chunk of its own; review of PR 49). A chunk that can't be
// loaded, as in a tab left open across two releases, is said in words with a way out, and the button works again.
import { expect, test, vi } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { browserTripServices } from '../../../src/ui/trip/services.ts';

vi.mock('../../../src/ui/trip/handoff.ts', () => { throw new TypeError('Failed to fetch dynamically imported module'); });

test("[C-HANDOFF] the handoff's chunk can't be loaded: the tap answers 'reload to try again', nothing else happens", async () => {
  const go = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: go } });
  const out = await browserTripServices(() => new Date('2026-11-05T10:00:00Z')).handOff!();
  expect(out).toEqual({ ok: false, reason: W.appLazyFailed });
  expect(W.appLazyFailed).toMatch(/Reload to try again/);
  expect(go).not.toHaveBeenCalled();
});
