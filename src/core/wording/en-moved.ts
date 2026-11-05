// The words of the one-time card "Load Check is now part of Wayfinch" (spec section 9.5 step two), in their own module so that the
// first screen does not carry them: the card is a chunk of its own, loaded only for a rider who comes from Load Check. They follow the
// same rules as en.ts: the banned-words test reads this object too (tests/unit/core/wording-moved.test.ts).

export const M = {
  movedTitle: 'Load Check is now part of Wayfinch',
  movedText: 'Your plans, setups and bikes are all here. Load Check is now the Bag planner, under Tools.',
  movedOpen: 'Open the Bag planner',
  movedDismiss: 'Got it',
};
