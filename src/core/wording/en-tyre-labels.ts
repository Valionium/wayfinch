// The tyre tool's field labels, its short assumed-value words and its what-is-this answers, which only its own chunk shows, in their
// own module so that the first screen does not carry them. Moved from en.ts as they were (9 Nov 2026): they pay for keeping the
// first-run hint's key deleted in every window (ST-DELETE). They follow the same rules as en.ts: the banned-words test reads this object
// too (tests/unit/core/wording-tyre-labels.test.ts).

export const TF = {
  tyreFloorTyreMin: 'the minimum printed on your tyre',
  tyreAssumedRider: 'rider weight 75 kg (enter yours)',
  tyreCaliperRearLabel: 'Rear tyre width, calipered (mm)',
  tyreWhatPumpTemp: 'The temperature where you pump',
  tyreBackToPlan: "Back to your bag plan's value",
  tyreWhatHighest: 'The highest point of the trip',
  tyreLimitTyreMax: "your tyre's printed maximum",
  tyreBackToYou: 'Back to the value from You',
  tyreWhatPumpHeight: 'The height where you pump',
  tyreSurfaceRough: 'Rough paved or compacted',
  tyreWhatWheelLoads: 'The weighed wheel loads',
  tyreAssumedRim: 'rim inner width 19 mm',
  tyreSramTitle: 'Cross-check with SRAM',
  tyreRimInnerLabel: 'Rim inner width (mm)',
  tyreLimitRimMax: "your rim's maximum",
  tyreAssumedBike: 'bike weight 14 kg',
  tyreWhatMax: 'The tyre maximum',
  tyreWhatMin: 'The tyre minimum',
  tyreAssumedFront: 'front tyre 32 mm (a typical road tyre)',
  tyreWhatRimMax: 'The rim maximum',
  tyreRearLabelShort: 'Rear tyre width',
  tyreAssumedRear: 'rear tyre 32 mm (a typical road tyre)',
  tyreAssumedCasing: 'standard casing',
  tyreNotANumber: 'Enter a number.',
  tyreResultTitle: 'Your pressures',
  tyreAssumedBars: 'drop handlebar',
  tyreWetLabel: 'Wet (3% lower)',
  tyreRefusedTitle: 'No figure yet',
  tyreWhatRider: 'Rider weight',
  tyreWhatBike: 'Bike weight',
};
