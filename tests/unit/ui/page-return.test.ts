// @vitest-environment jsdom
// What Wayfinch reads again when the browser brings it back from its back-forward cache (owner's iPhone rehearsal, 6 November 2026):
// no storage event reached it while it sat there. The bike and the theme: bike.test.tsx and theme-follow.test.ts; the moved card:
// moved-card.test.tsx; the browser path: tests/e2e/app-page-return.spec.ts.
import { afterEach, expect, test, vi } from 'vitest';
import { CHANGED_KEY } from '../../../src/store/changed.ts';
import { onChanged } from '../../../src/store/changed.ts';

const cleanup = vi.fn(() => Promise.resolve());
vi.mock('../../../src/ui/trip/handoff.ts', () => ({ cleanupStoredHandoff: cleanup }));
await import('../../../src/ui/page-return.ts');   // as main.tsx loads it once the first screen is drawn
cleanup.mockClear();   // its start-up cleanup

afterEach(() => { localStorage.clear(); cleanup.mockClear(); });

test('[PAGE-RETURN] out of the back-forward cache, every screen reads its sections again and the trip handoff is cleaned up; a fresh load does neither twice', () => {
  const sections: string[] = [];
  const stop = onChanged((s) => sections.push(s));
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
  expect(sections).toEqual([]);
  expect(cleanup).not.toHaveBeenCalled();
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  expect(sections).toEqual(['all']);
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(CHANGED_KEY)).toBeNull();   // only this window: nothing is written for the others
  stop();
});
