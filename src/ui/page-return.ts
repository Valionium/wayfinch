// What a page must catch up on when the rider comes back to it (owner's try-out, 5 November 2026): a theme chosen in the bag planner
// or another Wayfinch window, and bikes the bag planner saved while this page sat in the browser's back-forward cache, which holds no
// storage events; and the one theme checked by its rule (theme-choice.ts) right after the first paint. Loaded after the first screen
// (main.tsx), so the first screen does not carry it.
import { refreshBikeSource } from './bike/live.ts';
import { cleanupStoredHandoff } from './trip/handoff.ts';
import { onChanged } from '../store/changed.ts';
import { applyTheme } from './theme-apply.ts';
import { newerRecord, noteThemeChoice, themeNow } from './theme-choice.ts';

/** Once per page: on loading this module. */
export function followReturns(): void {
  const follow = (): void => {
    const now = themeNow();
    applyTheme(now);
    // Load Check's older choice alone (the two records have neither) becomes Wayfinch's own record, dated at the start of time: the
    // next start paints it at once, and any real choice in either app is newer (review I3)
    try {
      if (now !== 'auto' && !newerRecord((key) => localStorage.getItem(key))) noteThemeChoice(now, new Date(0));
    } catch { /* storage refused: the rule still applies it at each start */ }
  };
  follow();   // the first paint had the two records and this app's setting; the rule also knows Load Check's older choice
  onChanged(follow);
  window.addEventListener('storage', (e) => { if (e.key === null || /^(copilot|loadcheck):theme/.test(e.key)) follow(); });
  window.addEventListener('pageshow', (e) => { follow(); if (e.persisted) refreshBikeSource(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) follow(); });
}

if (typeof window !== 'undefined') {
  followReturns();
  // the trip handoff's records, once the bag planner has answered or after 24 hours (Contract 2): moved here out of the first screen
  void cleanupStoredHandoff();
}
