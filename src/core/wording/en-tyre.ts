// The tyre tool's words that only its own screen shows, in their own module so that the first screen does not carry them: the tool
// is a chunk of its own. They follow the same rules as en.ts: the banned-words test reads this object too
// (tests/unit/core/wording-tyre.test.ts). The tool's older words are still in en.ts.

export const T = {
  // The card at the top (the owner's device check, 5 November 2026): the three things a figure needs, together and marked.
  tyreNeededTitle: 'Needed for a figure',
  tyreNeededIntro: 'Start with these three: the maximum pressure printed on your tyre, your tyre width and your rim type. Everything further down is optional.',
  tyreNeededTag: 'needed',
  tyreBikeWithout: 'Without a bike',
  // A choice made in Tools, or in the bag planner, while this is open and the rider has already picked or typed here: one line naming
  // where it was made, never a switch.
  tyreChosenElsewhere: 'was chosen in Tools ·',
  tyreChosenInPlanner: 'was chosen in the bag planner ·',
  tyreChosenSwitch: 'Switch',
  tyreBikeGoneNext: 'The bike you chose is no longer saved in the bag planner. This now shows the bike in use.',
  tyreBikeGoneNone: 'The bike you chose is no longer saved in the bag planner. This now shows no bike.',
  // Moved from en.ts (6 Nov 2026), shown only on this screen: the first screen no longer carries them.
  tyreHeatIntro: 'Warm air and a high pass raise the pressure after you pump. Enter where and when you pump and the worst the trip can bring, to see how high to pump.',
  tyreCaliperHelp: 'A calipered tyre width replaces the effective width in the pressure calculation. The hookless limits and the rim check still use the printed width.',
  // Moved from en.ts (7 Nov 2026, sub-project 12): they pay for Bike care's entry in the first screen.
  tyreIntro: 'An estimate for your setup, worked out on this phone from published tyre-drop data. It never goes above a limit you enter, and it sends nothing.',
  tyreMeasuredHelp: 'Wheel loads: with your gear on, ride-ready, put one wheel on a bathroom scale and the other on a block of the same height, then swap. Enter both.',
};

// Moved from en.ts (9 Nov 2026, care pictures part 2), shown only on the tyre screen: room in the first screen for the parts guide.
// Its own object, so T keeps its pinned set (HON-BANNED reads both).
export const TM = {
  tyreRearLabelShort: 'Rear tyre width',
  tyreBackToPlan: "Back to your bag plan's value",
  tyreBackToYou: 'Back to the value from You',
  tyreAskNoPsi: 'No, psi',
  // and one more (care pictures redo, 9 Nov 2026): main's first screen came within 3 bytes of this branch's
  tyreLimitBothWheels: 'This one maximum is used for both wheels. If your front and rear tyres have different maximums, enter the lower one.',
};
