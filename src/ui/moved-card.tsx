// "Load Check is now part of Wayfinch" (spec section 9.5 step two): a one-time card for a rider whose bookmark, shortcut or home-screen
// icon at / opened the co-pilot instead of Load Check. Returning riders are known by the bag planner's own `loadcheck:draft` or
// `loadcheck:setups`, which are only read. The link stays in the same window, so an iPhone rider stays in the home-screen app that holds
// the plans. Gone for good once dismissed or followed; the mark is the co-pilot's own key.
import { useState } from 'preact/hooks';
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

export function MovedCard() {
  const [shown, setShown] = useState(movedCardDue);
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
