// Every user-facing string lives here (spec section 8). Constants and small template functions, nothing else.
//
// Every key starts with the area it belongs to (water, weather, rain, shelter, stop, wait, food, daylight, climb,
// sleep, help, emergency, share, call, leaveby, time, route, bike, ask, ready, demo, about, honesty), followed by a
// capital letter. Keys of the areas weather, rain, shelter, stop and wait are held to the stricter list of banned
// words ("live", "dry"), so a string belongs under the area that describes it.
// `tests/unit/core/wording.test.ts` checks the keys, the fixed sentences and the banned words.

/** A route kilometre as shown: to 0.1 km, without a trailing zero. */
export const showKm = (km: number): string => String(Math.round(km * 10) / 10);

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

  // ---- Route files (GPX) ----
  routeGpxTooLarge: 'Choose a GPX file of 20 MB or less.',
  routeGpxTooManyPoints: 'This GPX has more than 200,000 points. Export a simplified track and try again.',
  routeGpxTooManySections: 'This GPX has more than 500 separate sections. Export fewer sections and try again.',
  routeGpxUnreadable: 'That did not read as a GPX track or route with valid coordinates.',
  routeTrackTooLong: 'The track distance could not be processed. Try a shorter or simplified GPX.',

  // ---- The start of the day's ride (section 6.2a). ----
  routeDayOneAtStart: 'Day 1 starts at the route start (km 0)',
  routePastStop: (which: 'today' | 'tomorrow', km: number): string =>
    `Your position lies past ${which === 'today' ? "today's" : "tomorrow's"} stop at km ${showKm(km)}. Times assume you rejoin the route there.`,
  routeFromTonightNoPosition: (km: number): string => `from tonight's stop at km ${showKm(km)}; no position`,
  routeFromStageStart: (km: number): string => `from the stage start at km ${showKm(km)}`,
  routeTonightIsEnd: (km: number): string => `Tonight's stop is the end of your route (km ${showKm(km)})`,

  // ---- Opening hours (section 6.4). ----
  foodHoursUnknown: 'hours unknown',
  foodHoursUpdate: 'hours unknown — update',
  foodUnknownSundayRules: 'hours unknown, probably closed (Sunday rules), an assumption',
  foodUnknownLocalHoliday: 'hours unknown, possibly closed — local holiday, an assumption',
  foodHolidayRules: 'probably closed (holiday rules), an assumption',
  foodLocalHoliday: 'possibly closed — local holiday, an assumption',
  foodMayBeOpen: 'may be open, an assumption',

  // ---- Daylight (section 6.5). Times as "HH:MM", spans as "3 h 30 min". ----
  daylightAllNight: 'light all night',
  daylightDarkAllDay: 'dark all day',
  daylightLightsOnAllDay: 'lights on all day',
  daylightLightsOnFrom: (time: string): string => `lights on from ${time}`,
  daylightDarkFrom: (time: string): string => `dark from ${time}`,
  daylightLeft: (span: string): string => `${span} of daylight left`,
  daylightFromSunrise: (span: string, sunrise: string): string => `${span} of daylight from sunrise at ${sunrise}`,
  daylightSunSet: (sunset: string, firstLight: string | null): string =>
    firstLight ? `The sun set at ${sunset}. First light tomorrow ${firstLight}.` : `The sun set at ${sunset}.`,

  /** "Mapped as a weather shelter, not checked." and the same line for each other roof kind. */
  shelterMappedAs: (what: string): string => `Mapped as ${what}, not checked.`,
  /** Call ahead and rescue points. `date` is the map data's date, such as "28 Oct". */
  callAsMapped: (date: string): string => `As mapped in OpenStreetMap (${date}), not checked.`,
  /** `n` of 10 forecast scenarios, `time` as "HH:MM". */
  weatherScenariosShowRain: (n: number, time: string): string => `${n} in 10 forecast scenarios show rain here around ${time}.`,
};
