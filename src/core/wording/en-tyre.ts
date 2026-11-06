// The tyre tool's words that only its own screen shows, in their own module so that the first screen does not carry them: the tool
// is a chunk of its own. They follow the same rules as en.ts: the banned-words test reads this object too
// (tests/unit/core/wording-tyre.test.ts). The tool's older words are still in en.ts.

export const T = {
  // The card at the top (the owner's device check, 5 November 2026): the three things a figure needs, together and marked.
  tyreNeededTitle: 'Needed for a figure',
  tyreNeededIntro: 'Start with these three: the maximum pressure printed on your tyre, your tyre width and your rim type. Everything further down is optional.',
  tyreNeededTag: 'needed',
  tyreBikeWithout: 'Without a bike',
  tyreBikeGoneNext: 'The bike you chose is no longer saved in the bag planner. This now shows the bike in use.',
  tyreBikeGoneNone: 'The bike you chose is no longer saved in the bag planner. This now shows no bike.',
  // Moved from en.ts (6 Nov 2026), shown only on this screen: the first screen no longer carries them.
  tyreHeatIntro: 'Warm air and a high pass raise the pressure after you pump. Enter where and when you pump and the worst the trip can bring, to see how high to pump.',
  tyreCaliperHelp: 'A calipered tyre width replaces the effective width in the pressure calculation. The hookless limits and the rim check still use the printed width.',
};
