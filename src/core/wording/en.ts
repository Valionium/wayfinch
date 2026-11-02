// Every user-facing string lives here (spec section 8). Constants and small template functions, nothing else.
//
// Every key starts with the area it belongs to (water, weather, rain, shelter, stop, wait, food, daylight, climb,
// sleep, help, emergency, share, call, leaveby, time, route, bike, ask, ready, demo, about, honesty), followed by a
// capital letter. Keys of the areas weather, rain, shelter, stop and wait are held to the stricter list of banned
// words ("live", "dry"), so a string belongs under the area that describes it.
// `tests/unit/core/wording.test.ts` checks the keys, the fixed sentences and the banned words.

export const W = {
  // ---- Fixed sentences of section 8: change none of them without the owner. ----
  waterOverDrinkCaution:
    "You reported drinking more than you were likely losing. Drink to thirst and don't finish heavier than you started.",
  weatherNoLightningProtection: 'Roofs, shelters and huts give no protection from lightning.',
  weatherCantForecastExact: "Exact places and times can't be forecast.",
  weatherNoOfficialWarnings: 'Official weather warnings are not included.',
  sleepFreePitchesUnknown: 'Free pitches and rooms are not known to the app.',
  helpGiveNumberAndCoordinates: 'Give this number and your coordinates when you call.',
  leavebyExclusions: 'Wind, weather and extra stops are not included.',
  demoBasis: 'Demo, recorded data',

  /** "Mapped as a weather shelter, not checked." and the same line for each other roof kind. */
  shelterMappedAs: (what: string): string => `Mapped as ${what}, not checked.`,
  /** Call ahead and rescue points. `date` is the map data's date, such as "28 Oct". */
  callAsMapped: (date: string): string => `As mapped in OpenStreetMap (${date}), not checked.`,
  /** `n` of 10 forecast scenarios, `time` as "HH:MM". */
  weatherScenariosShowRain: (n: number, time: string): string => `${n} in 10 forecast scenarios show rain here around ${time}.`,
};
