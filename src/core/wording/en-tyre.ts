// The tyre tool's words that only its own screen shows, in their own module so that the first screen does not carry them: the tool
// is a chunk of its own. They follow the same rules as en.ts: the banned-words test reads this object too
// (tests/unit/core/wording-tyre.test.ts). The tool's older words are still in en.ts.

export const T = {
  // The card at the top (the owner's device check, 5 November 2026): the three things a figure needs, together and marked.
  tyreNeededTitle: 'Needed for a figure',
  tyreNeededIntro: 'Start with these three: the maximum pressure printed on your tyre, your tyre width and your rim type. Everything further down is optional.',
  tyreNeededTag: 'needed',
};
