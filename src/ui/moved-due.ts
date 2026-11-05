// Whether the one-time card "Load Check is now part of Wayfinch" is due (spec section 9.5 step two). Kept apart from the card, which is a
// chunk of its own: the first screen carries only these few reads, and a new rider never loads the card.
export const MOVED_CARD_KEY = 'copilot:moved-card';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** A rider who comes from Load Check: the bag planner's own draft or setups, only read. */
export const returningLoadCheckRider = (): boolean => read('loadcheck:draft') !== null || read('loadcheck:setups') !== null;

/**
 * Due once, to a rider whose Load Check keys were there when the co-pilot first looked. A first look with neither key is kept as
 * not due, so a draft the bag planner writes later (a new rider trying it) brings no card (review M4).
 */
export function movedCardDue(): boolean {
  if (read(MOVED_CARD_KEY) !== null) return false;
  if (returningLoadCheckRider()) return true;
  try { localStorage.setItem(MOVED_CARD_KEY, 'not-due'); } catch { /* keeps nothing: asked again next time */ }
  return false;
}
