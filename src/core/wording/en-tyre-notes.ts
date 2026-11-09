// More of the tyre tool's words that only its own chunk shows (its notes, warnings and refusals), in their own module so that the first
// screen does not carry them. Moved from en.ts as they were (9 Nov 2026): they pay for the first-run bike card on Trip (wish 17). They
// follow the same rules as en.ts: the banned-words test reads this object too (tests/unit/core/wording-hint.test.ts).

export const TN = {
  tyreWarnIncompatible: 'The lowest pressure this tube needs is above what your tyre or rim allows. These parts do not fit together for this load. Going tubeless, or another tyre or rim, may.',
  tyreWarnIncompatibleUnknown: 'With your rim type or tyre width not set, the lowest limits are used, and the tube needs more than they allow. Set your rim type and tyre width.',
  tyreWarnHooklessTube: 'A hookless rim is made for tubeless-ready tyres. Check the rim maker before you fit a tube.',
  tyreWhyDefaultUnplaced: 'Some of your load is not placed in a bag, so the usual split for your handlebar applies.',
  tyreWarnRimOutside: 'This rim is wider than the ETRTO table (35 mm), so no minimum tyre width was checked.',
  tyreEstimateNote: 'An estimate, not a measurement. Other calculators differ from this one by 10 to 30%.',
  tyreWarnTubular: 'Tubular rims have no ETRTO width check here. Check the pairing with the rim maker.',
  tyreSramIntro: "SRAM's own calculator is a second opinion. Open it and type these values there.",
  tyreNotSaved: 'This browser is not keeping these details. They stay until you close the app.',
  tyreRefuseMinMax: 'The minimum is above the maximum, so no pressure fits. Check both limits.',
  tyreHeatFits: 'The heat and height you entered do not push these pressures over a limit.',
  tyreSavedHere: 'Changes here stay in this tool. Your bike and bag plan are not changed.',
  tyreLimitHint: 'Enter it in the unit printed. A value above 10 bar is asked about.',
  tyreWarnExtrapolated: 'Beyond the original 20–37 mm data, checked against gravel tables.',
  tyreLoadEnteredNote: 'An entered load has no bag positions, so the usual split is used.',
  tyreSplitSensitivity: 'Five points of split move the front pressure by about 10%.',
  tyreWarnCapRimUnset: 'Set your rim type: this limit applies to hookless rims.',
  tyreLoadNone: 'No bag plan. Enter what you carry, or leave it out.',
  tyreSramDiffer: 'Calculators differ by 10–30% for the same inputs.',
  tyrePumpHeightLabel: 'Height where you pump (m, blank for sea level)',
  tyreLimitTooLow: 'That limit is too low to be a tyre pressure.',
  tyreRefuseWheel: "This wheel size is not in the tool's table.",
  tyreLimitHookless5: 'the 5.0 bar limit for hookless rims',
  tyreWhatMaxTemp: 'The highest temperature on the trip',
  tyreRoundedNote: 'Rounded down to 0.05 bar and 1 psi.',
  tyreSramLink: "Open SRAM's tyre pressure calculator",
  tyreNeedRimTitle: 'No figure yet: tell us your rim type',
  tyreAssumedRimType: 'rim type not set (hookless limits used)',
};
