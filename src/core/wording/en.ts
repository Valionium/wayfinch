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
  daylightUnknown: 'daylight not known',
  daylightDarkAllDay: 'dark all day',
  daylightLightsOnAllDay: 'lights on all day',
  daylightLightsOnFrom: (time: string): string => `lights on from ${time}`,
  daylightDarkFrom: (time: string): string => `dark from ${time}`,
  daylightLeft: (span: string): string => `${span} of daylight left`,
  daylightFromSunrise: (span: string, sunrise: string): string => `${span} of daylight from sunrise at ${sunrise}`,
  daylightSunSet: (sunset: string, firstLight: string | null): string =>
    firstLight ? `The sun set at ${sunset}. First light tomorrow ${firstLight}.` : `The sun set at ${sunset}.`,

  // ---- Water: drinking advice (section 6.3). ----
  waterDrinkToThirst: 'Drink to thirst.',
  waterGentleSchedule: (lPerH: number): string => `In this heat, a gentle guide is about ${lPerH.toFixed(1)} L an hour. An estimate, not a target.`,
  waterSaltyFood: 'On a long hot ride, have some salty food.',
  waterColdReminder: 'In the cold you may feel less thirsty. Keep sipping.',
  waterOutsideRange: 'outside the validated range',
  waterDayFlag: 'This day adds up to more than 11.4 L. Consider shorter or cooler stretches.',

  // ---- Water: the reach rule (section 6.3). `s` names a source or point; litres and kilometres come as shown. ----
  waterNotEnough: (s: string, litres: string): string => `Not enough water to reach ${s} with a reserve — you need about ${litres} L.`,
  waterTips: 'To reduce sweat: shade, cooler hours, an easier pace.',
  waterFillUp: (s: string, km: string, litres: string): string =>
    `Refill at ${s} and fill up completely — it's the last reliable water for ${km} km. Carry ${litres} L extra.`,
  waterBottlesHold: (capacity: string, litres: string, s: string): string => `Your bottles hold ${capacity} L. Carry ${litres} L extra from ${s}.`,
  waterRefill: (s: string, where: string, litres: string): string => `Refill at ${s} (${where}): fill to ${litres} L`,
  waterAhead: (km: string): string => `+${km} km`,
  waterBack: (km: string): string => `${km} km back`,
  waterRefreshOrCarry: (edgeKm: string, km: string): string => `No place data after km ${edgeKm} — refresh this stretch, or carry for ${km} km.`,
  waterEnoughToReach: (s2: string, s1: string): string => `Enough to reach ${s2} — refilling at ${s1} is optional.`,
  waterEnoughToComeBack: (s: string): string => `Enough to come back to ${s} — refilling there is optional.`,
  waterEnoughToEnd: 'Enough to the end.',
  waterNoSource: (km: string): string => `No mapped reliable water for the next ${km} km`,
  waterConfirm: 'Confirm your water to check the next stretch',
  waterStillAbout: (litres: string): string => `Still about ${litres} L?`,
  waterEnterCapacity: 'Enter the water you can carry (You) to plan refills.',
  waterSetDate: 'Set your departure date to check this stretch.',
  waterCantWorkOut: "The water estimate can't be worked out from these settings. Check your speed, weight and camp water in You and Trip.",
  waterExpectedPlanned: (s: string, expected: string, planned: string): string => `Estimate to ${s}: expected ${expected} L, planned ${planned} L`,
  waterNotCalibrated: 'Your personal factor is not calibrated yet.',
  waterPartlyCalibrated: 'Your personal factor is partly calibrated.',
  waterCalibrated: 'Your personal factor is calibrated from your rides.',
  waterRouteEnd: 'the route end',
  waterAtKm: (km: string): string => `km ${km}`,

  // ---- Water: sources (section 6.0). ----
  waterMappedAsDrinking: 'mapped as drinking water',
  waterUnverifiedSince: (year: string): string => `unverified since ${year}`,
  waterFee: 'fee',
  waterNearYou: 'near you, may be behind',
  waterSeasonal: (window: string): string => `seasonal: ${window}`,
  waterMaybeOffForWinter: 'may be switched off for winter',
  waterClassB: 'water not verified',
  waterClassC: 'treat or filter first',
  waterWithFilter: 'usable with your filter',
  waterClassD: 'not mapped as drinking water',
  waterNotOpenAllWindow: 'closes or opens within 30 minutes of arrival',
  waterClosedAtArrival: 'closed at arrival',
  waterNoShop: 'no shop mapped at this fuel station',
  waterNoDate: 'no departure date, so hours and seasons at arrival are not known',
  waterNotASource: 'not a water source',

  // ---- Water: the basis lines. ----
  waterBasisEstimate: 'WaterNeed v1: an estimate from weather, pace and load',
  waterBasisSeasonal: 'seasonal estimate',
  waterBasisAssumedHot: 'no weather data — assumes a hot day',
  waterBasisOsm: '© OpenStreetMap contributors',

  // ---- Rain windows (section 6.6). Times come as "about 14:00" or "HH:MM". ----
  rainFrom: (about: string): string => `from ${about}`,
  rainDryAgain: (about: string): string => `likely dry again from ${about}`,
  rainOnAndOff: 'on and off',
  rainHours: (from: string, to: string): string => `${from}–${to}`,
  rainDayPart: (weekday: string, part: string): string => `${weekday} ${part}`,
  rainPartNight: 'night',
  rainPartMorning: 'morning',
  rainPartAfternoon: 'afternoon',
  rainPartEvening: 'evening',
  rainChance: (n: number): string => `${n} in 10 forecast scenarios`,
  rainUnderAmount: 'under 0.1 mm/h (one model)',
  rainAmount: (mm: string): string => `${mm} mm/h (one model)`,
  rainLikely: (when: string): string => `Rain likely ${when}`,
  rainPossible: (km: string, when: string): string => `Rain possible ${km}, ${when}`,
  rainShowersLikely: (km: string, when: string): string => `Showers likely ${km}, ${when}`,
  rainShowersPossible: (km: string, when: string): string => `Showers possible ${km}, ${when}`,
  rainHeavy: (km: string, when: string): string => `Heavy rain likely ${km}, ${when}`,

  // ---- The Weather card (section 6.6). ----
  weatherThunder: (km: string, when: string): string => `Thunderstorms possible ${km}, ${when}`,
  weatherThunderNight: (km: string, when: string, hours: string | null): string =>
    `Thunderstorm possible at km ${km} ${when}${hours ? `, ${hours}` : ''}. Exact places and times can't be forecast.`,
  weatherTonight: 'tonight',
  weatherOnTheNightOf: (day: string): string => `on the night of ${day}`,
  weatherHail: 'Hail possible.',
  weatherRainHere: 'Rain likely here',
  weatherRainHereUntil: (about: string): string => `Rain likely here until ${about}`,
  weatherGustsTitle: (kmh: string, km: string, when: string): string => `Gusts up to ${kmh} km/h near km ${km}, ${when}`,
  weatherLow: (c: string, km: string): string => `Night's low about ${c} °C at km ${km}`,
  weatherLowUnknown: (km: string): string => `Night's low unknown at km ${km}`,
  weatherSummary: (ride: string, temps: string): string => `Rain unlikely on ${ride}${temps ? ` · ${temps}` : ''}`,
  weatherTemps: (low: string, high: string): string => (low === high ? `${low} °C` : `${low}–${high} °C`),
  weatherRideToday: "today's ride",
  weatherRideTomorrow: "tomorrow's ride",
  weatherRideDayOne: "day 1's ride",
  weatherRideRest: 'the rest of the route',
  weatherHeadwind: (ms: string): string => `Headwind about ${ms} m/s`,
  weatherTailwind: (ms: string): string => `Tailwind about ${ms} m/s`,
  weatherWindAcross: 'Little head or tailwind',
  weatherGustsUpTo: (kmh: string): string => `gusts up to ${kmh} km/h`,
  weatherRainingAnyway: 'Raining anyway? Shelter',
  weatherStampHere: (time: string): string => `here · ${time}`,
  weatherStampAhead: (km: string): string => `+${km} km`,
  weatherBasis: (fetched: string, run: string | null): string => `Open-Meteo forecast fetched ${fetched}${run ? ` · model run ${run}` : ''}`,
  weatherAttribution: 'Weather data by Open-Meteo.com',
  weatherDetailRange: (half: string, parts: string): string => `30-minute detail to ${half}, day parts to ${parts}`,
  weatherStale: 'This forecast is stale: over 12 hours old.',
  weatherNothingSaved: 'No forecast and no seasonal data saved.',
  weatherUnknown: 'Weather unknown: no forecast and no seasonal data saved.',
  weatherCantWorkOut: "The weather along the ride can't be worked out from these settings. Check your speed in You.",
  weatherSetDate: 'Set your departure date to match the forecast to your ride.',
  weatherNoForecastFrom: (km: string): string => `No forecast from km ${km}`,
  weatherNoForecastFor: (ride: string): string => `No forecast for ${ride}`,
  weatherSeasonalFromKm: (km: string): string => ` from km ${km}`,
  weatherSeasonalTitle: (from: string, high: string, low: string, days: string): string =>
    `Seasonal estimate${from}: highs about ${high} °C, lows about ${low} °C, about ${days} days of rain a month`,

  /** "Mapped as a weather shelter, not checked." and the same line for each other roof kind. */
  shelterMappedAs: (what: string): string => `Mapped as ${what}, not checked.`,
  /** Call ahead and rescue points. `date` is the map data's date, such as "28 Oct". */
  callAsMapped: (date: string): string => `As mapped in OpenStreetMap (${date}), not checked.`,
  /** `n` of 10 forecast scenarios, `time` as "HH:MM". */
  weatherScenariosShowRain: (n: number, time: string): string => `${n} in 10 forecast scenarios show rain here around ${time}.`,
};
