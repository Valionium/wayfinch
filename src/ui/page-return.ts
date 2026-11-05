// What a page must catch up on when the rider comes back to it (owner's try-out, 5 November 2026): a theme chosen in the bag planner
// or another Wayfinch window, and bikes the bag planner saved while this page sat in the browser's back-forward cache, which holds no
// storage events; and the one theme checked by its rule (theme-choice.ts) right after the first paint. Loaded after the first screen
// (main.tsx), so the first screen does not carry it.
import { refreshBikeSource } from './bike/live.ts';
import { onChanged } from '../store/changed.ts';
import { applyTheme } from './theme-apply.ts';
import { themeNow } from './theme-choice.ts';

/** Once per page: on loading this module. */
export function followReturns(): void {
  const follow = (): void => applyTheme(themeNow());
  follow();   // the first paint took the records as they were: checked now
  onChanged(follow);
  window.addEventListener('storage', (e) => { if (e.key === null || /^(copilot|loadcheck):theme/.test(e.key)) follow(); });
  window.addEventListener('pageshow', (e) => { follow(); if (e.persisted) refreshBikeSource(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) follow(); });
}

if (typeof window !== 'undefined') followReturns();
