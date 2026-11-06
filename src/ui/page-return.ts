// What a page must catch up on when the rider comes back to it (owner's try-out, 5 November 2026): a theme chosen in the bag planner
// or another Wayfinch window, and bikes the bag planner saved while this page sat in the browser's back-forward cache, which holds no
// storage events; and the one theme checked by its rule (theme-choice.ts) right after the first paint. Loaded after the first screen
// (main.tsx), so the first screen does not carry it.
//
// Out of the back-forward cache (owner's iPhone rehearsal, 6 November 2026), Wayfinch reads again all that may have changed while it
// was away: the bikes, the theme, every screen's sections (another Wayfinch window may have written), and the trip handoff the bag
// planner may have answered. The moved card reads its own mark (moved-card.tsx).
import { refreshBikeSource } from './bike/live.ts';
import { cleanupStoredHandoff } from './trip/handoff.ts';
import { announceHere, onChanged } from '../store/changed.ts';
import { applyTheme } from './theme-apply.ts';
import { newerRecord, noteThemeChoice, themeNow } from './theme-choice.ts';

/**
 * At a start only: Load Check's older choice alone (the two records have neither) becomes Wayfinch's own record, dated at the start of
 * time, so the next start paints it at once and any real choice in either app is newer (review I3). Never on a later event: after
 * Delete co-pilot data the open page writes nothing back (re-check of PR 49).
 */
export function noteOlderChoice(): void {
  try {
    const now = themeNow();
    if (now !== 'auto' && !newerRecord((key) => localStorage.getItem(key))) noteThemeChoice(now, new Date(0));
  } catch { /* storage refused: the rule still applies it at each start */ }
}

/** Once per page: on loading this module. */
export function followReturns(): void {
  const follow = (): void => applyTheme(themeNow());
  follow();   // the first paint had the two records and this app's setting; the rule also knows Load Check's older choice
  onChanged(follow);
  window.addEventListener('storage', (e) => { if (e.key === null || /^(copilot|loadcheck):theme/.test(e.key)) follow(); });
  window.addEventListener('pageshow', (e) => {
    follow();
    if (!e.persisted) return;
    refreshBikeSource();
    announceHere('all');
    void cleanupStoredHandoff();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) follow(); });
}

if (typeof window !== 'undefined') {
  noteOlderChoice();
  followReturns();
  // the trip handoff's records, once the bag planner has answered or after 24 hours (Contract 2): moved here out of the first screen
  void cleanupStoredHandoff();
}
