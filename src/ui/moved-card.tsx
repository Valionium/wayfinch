// "Load Check is now part of Wayfinch" (spec section 9.5 step two): a one-time card for a rider whose bookmark, shortcut or home-screen
// icon at / opened the co-pilot instead of Load Check. Returning riders are known by the bag planner's own `loadcheck:draft` or
// `loadcheck:setups`, which are only read. The link stays in the same window, so an iPhone rider stays in the home-screen app that holds
// the plans. Gone for good once dismissed or followed; the mark is the co-pilot's own key.
//
// Also after Back to Wayfinch (owner's iPhone rehearsal, 6 November 2026): Safari brings the page back from its back-forward cache as
// it was before the jump, card and all, and no storage event reached it there. So the mark is read again as the page is left (the page
// the cache keeps has no card), when it shows again, and when another window sets it.
import { useEffect, useState } from 'preact/hooks';
import { M } from '../core/wording/en-moved.ts';

import { MOVED_CARD_KEY, movedCardDue } from './moved-due.ts';

export { MOVED_CARD_KEY, returningLoadCheckRider } from './moved-due.ts';

function markSeen(): void {
  try {
    localStorage.setItem(MOVED_CARD_KEY, 'seen');
  } catch {
    // Storage that keeps nothing: the card goes for this visit only.
  }
}

const marked = (): boolean => {
  try {
    return localStorage.getItem(MOVED_CARD_KEY) !== null;
  } catch {
    return false;
  }
};

export function MovedCard() {
  const [shown, setShown] = useState(movedCardDue);
  useEffect(() => {
    const reread = (): void => { if (marked()) setShown(false); };
    const events = ['pagehide', 'pageshow', 'storage'] as const;
    const w = window;   // the same window at clean-up, also when that runs late
    for (const e of events) w.addEventListener(e, reread);
    return () => { for (const e of events) w.removeEventListener(e, reread); };
  }, []);
  if (!shown) return null;
  const done = () => {
    markSeen();
    setShown(false);
  };
  return (
    <section class="card moved-card">
      <h2>{M.movedTitle}</h2>
      <p>{M.movedText}</p>
      <p class="moved-card-actions">
        <a class="btn btn-primary" href="/tools/bags/" onClick={markSeen}>{M.movedOpen}</a>
        <button type="button" class="btn" onClick={done}>{M.movedDismiss}</button>
      </p>
    </section>
  );
}
