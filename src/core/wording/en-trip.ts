// Trip's words that only its own chunks show (Add a route, Plan from A to B, Prepare this route's step, the trip settings, the
// route's summary), in their own module so that the first screen does not carry them (after the launch, part 4, 8 Nov 2026: room
// for En route's Emergency link and its answers from km 0). Moved from en.ts as they were. They follow the same rules as en.ts:
// the banned-words test reads this object too (tests/unit/core/wording-trip.test.ts).

export const TR = {
  appTripKeepFreshWhy: 'Updates only the weather, when the app opens with signal and a newer forecast exists. Places update only when you ask.',
  appAbNote: 'Type a town, an address (street and number), or a named place such as a station, campsite or hotel. The words you type go only to two place-search services: Open-Meteo for towns and Photon (OpenStreetMap) for addresses and named places. Nothing you type is stored. Planning sends the start and end points to a bike router.',
  appAbHint: 'Type a town, an address or a named place such as a station, campsite or hotel. Search needs signal and asks once when you press it.',
  appAbList: 'Places found',
  appTripPrepareLine: 'Fetches places, opening hours, heights and weather for this route and keeps them on your phone, so En route works without signal.',
  appTripSettingsStageNote: 'Changing nights, pace or speed changes the days of your route.',
  appTripChooseHint: 'For exact planning, upload your GPX. For a rough bag plan, a town-to-town route is enough.',
  appTripGpxHint: 'Exported from Komoot, Strava, RideWithGPS or another planner.',
  appTripProfileNone: 'The elevation profile appears once heights are known.',
  appAbPick: 'Choose the place you mean',
  appAbTitle: 'Plan from A to B',
  appAbSearching: 'Searching…',
  appAbPlanning: 'Planning…',
  appAbSearch: 'Search',
  appAbFrom: 'Start',
  appAbTo: 'End',
  appTripIphoneAsk: 'On an iPhone or iPad, first add Wayfinch to your home screen (Share, then Add to Home Screen), open it from there and use Prepare this route in that app. Safari can remove what a browser tab saved after seven days without a visit.',
  appTripPartial: 'Some steps did not finish. The answers use what was saved and name what is missing. Try again when you have signal.',
  appAbNone: 'No bike router answered, so no route was planned. Plan it in another app and add it as a GPX file.',
  appAbSearchFailed: "Search needs signal, and the search services did not answer. Check your connection and try again.",
  appAbNoResults: 'Nothing found. Try another spelling, add the town to an address, or search a larger town nearby.',
  appTripHeightsPending: 'This route has no heights. Prepare this route looks them up (Open-Meteo, Copernicus data).',
  appTripStepHeights: 'Heights',
  appTripStepHours: 'Opening hours',
  appTripStepWeather: 'Weather',
  appTripStepBaseline: 'Seasonal estimate',
  appTripReplaceTitle: 'Replace your route?',
  appAbChange: 'Change',
  appTripOsmSearch: 'Place names: ',
  appTripFileFailed: 'That file could not be read. Nothing was changed.',
  appTripUnchanged: 'Your current route is unchanged.',
};
