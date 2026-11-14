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

/**
 * Three more of the tyre screen's own words, moved from en.ts (care pictures, 10 Nov 2026) as they were: Bike care's two optional bike
 * details (the wheel axle, the rim brake) cost the first screen about 60 bytes, and these pay for them. Under the same check as T
 * (tests/unit/core/wording-tyre.test.ts).
 */
export const TM = {
  tyreWindow: (lo: string, hi: string): string => `Aim for ${lo} to ${hi} bar. The lower end is the careful end.`,
  tyreWindowOne: (value: string): string => `Aim for ${value} bar. Lower is the careful side.`,
  tyreSplit: (front: string, rear: string): string => `Weight split: ${front}% front, ${rear}% rear.`,
};

/**
 * The SRAM cross-check's labels and values, moved from en.ts as they were (14 Nov 2026): the brake fluid in the bike's details (the
 * owner's wish of 14 November 2026) costs the first screen a few bytes, and these pay for them. Shown only in the tyre tool's own chunk,
 * under the same check as T (tests/unit/core/wording-tyre.test.ts).
 */
export const TS = {
  tyreSramRider: 'Rider weight',
  tyreSramGear: 'Bike and gear weight',
  tyreSramWidth: 'Tyre width',
  tyreSramCasing: 'Casing',
  tyreSramWheel: 'Wheel size',
  tyreSramRim: 'Rim type',
  tyreSramInner: 'Inner rim width',
  tyreSramRide: 'Ride type',
  tyreSramWet: 'Wet or dry',
  tyreSramThin: 'Thin',
  tyreSramRimUnset: 'Not set here: look at your rim',
  tyreSramRoad: 'Road',
  tyreSramGravel: 'Gravel',
  tyreSramWetWord: 'Wet',
  tyreSramDryWord: 'Dry',
};
