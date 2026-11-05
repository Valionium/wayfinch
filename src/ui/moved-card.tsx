// "Load Check is now part of Wayfinch" (spec section 9.5 step two): a one-time card for a rider whose bookmark, shortcut or home-screen
// icon at / opened the co-pilot instead of Load Check. Returning riders are known by the bag planner's own `loadcheck:draft` or
// `loadcheck:setups`, which are only read. The link stays in the same window, so an iPhone rider stays in the home-screen app that holds
// the plans. Gone for good once dismissed or followed; the mark is the co-pilot's own key.
import { useState } from 'preact/hooks';
import { W } from '../core/wording/en.ts';

export const MOVED_CARD_KEY = 'copilot:moved-card';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const returningLoadCheckRider = (): boolean => read('loadcheck:draft') !== null || read('loadcheck:setups') !== null;

function markSeen(): void {
  try {
    localStorage.setItem(MOVED_CARD_KEY, 'seen');
  } catch {
    // Storage that keeps nothing: the card goes for this visit only.
  }
}

export function MovedCard() {
  const [shown, setShown] = useState(() => read(MOVED_CARD_KEY) === null && returningLoadCheckRider());
  if (!shown) return null;
  const done = () => {
    markSeen();
    setShown(false);
  };
  return (
    <section class="card moved-card">
      <h2>{W.appMovedTitle}</h2>
      <p>{W.appMovedText}</p>
      <p class="moved-card-actions">
        <a class="btn btn-primary" href="/tools/bags/" onClick={markSeen}>{W.appMovedOpen}</a>
        <button type="button" class="btn" onClick={done}>{W.appMovedDismiss}</button>
      </p>
    </section>
  );
}
