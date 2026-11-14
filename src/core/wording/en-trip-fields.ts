// Words only Trip's own chunks show: the trip settings' field names (the departure date, the nights and the trip details,
// src/ui/trip/settings.tsx), the route's summary and its credits (summary.tsx, credit.tsx), Add a route (add-route.tsx) and Prepare this route's
// storage line (getready.tsx). Moved from en.ts as
// they were, to make room on the first screen for Remove this trip (owner's wish, 9 November 2026). They follow the same rules as
// en.ts: the banned-words test reads this object too (tests/unit/core/wording-remove.test.ts).

export const TF = {
  appTripDeparture: 'Departure date',
  appTripStartTime: 'Daily start time',
  appTripNights: 'Nights',
  appTripNightsSuggested: (n: number): string => `Suggested for this distance and pace: ${n} ${n === 1 ? 'night' : 'nights'}.`,
  appTripNightsUseSuggested: 'Use the suggestion',
  appTripDepartureNone: 'No date yet. Without one, En route gives distances only and says why.',
  appTripDateClear: 'Clear the date',
  // Other nights choose their stops again (TRIP-DAY-STOPS), said once beside the nights (review of PR 101, M4), planned around the
  // rider's own stops, which are named, with where to change one (the owner's rulings of 14 Nov 2026, TRIP-STOPS-KEEP). `kept`,
  // `dropped`: the stops' words (appTripStopNight), joined, or '' for none; `uneven`: the days' words (appTripDayUneven), joined. A day
  // ride (0) names only what goes.
  appTripStopsNewNights: (n: number, kept: string, dropped: string, uneven: string): string => (n < 1
    ? `A day ride has no nights, so your stops are not kept: ${dropped}.`
    : `New stops for ${n} ${n === 1 ? 'night' : 'nights'}${kept ? `, planned around yours: ${kept}` : ''}.${dropped ? ` Not kept: ${dropped}.` : ''}`
      + `${uneven ? ` Around your stops, ${uneven}.` : ''}${kept || dropped ? ' To change a stop, use Change stop under its day in Your route.' : ''}`),
  // one own stop: its name ("No stop" for the rider's No stop) and its night, the new one, or the old one (`was`; review of PR 163, m-1)
  appTripStopNight: (name: string | null, night: number, was?: boolean): string => `${name ?? 'No stop'} (${was ? 'was ' : ''}night ${night})`,
  appTripDayUneven: (day: number, km: string, long: boolean): string => `day ${day} (${km} km) is much ${long ? 'longer' : 'shorter'} than an even day`,
  // the line after a route is added, only Add a route's chunk says it (moved word for word from en.ts to keep the first screen at main's figure)
  appTripNextGetReady: 'Next: Prepare this route, so En route can show water, food, sleep and weather.',
  appTripPace: 'Pace',
  appTripFlatKph: 'Flat speed, unloaded (km/h)',
  appTripStay: 'Stay type',
  appTripCampWater: 'Camp water per night (L)',
  appTripSummaryTitle: 'Your route',
  appTripProfileLabel: (low: number, high: number): string => `Elevation profile: lowest ${low} m, highest ${high} m`,
  appTripOsmLead: 'Places and routes: ',
  appTripStopsLabel: 'Stops along the route',
  appTripStorage: (mb: string): string => `Wayfinch uses ${mb} MB on this phone (all trips).`,
  appTripNothingSaved: 'Nothing is saved on this phone for this route yet.',
  appTripHeightsCredit: 'Heights looked up from Copernicus data through Open-Meteo.',
  appTripAddTitle: 'Add a route',
  appTripReplaceHeading: 'Use another route',
  appTripReplacedNoDate: (name: string): string => `Replaced with “${name}”, but its departure date was not saved. Set the date in the Route step.`,
  appTripSameRoute: 'That is the route you already have. Nothing was changed.',
  appTripAdded: (name: string): string => `Added “${name}”.`,
  appTripReplaced: (name: string): string => `Replaced with “${name}”.`,
  appTripPickGpx: 'Choose a GPX file',
  appTripReading: 'Reading the file…',
  appTripReplaceBody: (oldName: string, newName: string, km: string): string => `“${newName}” (${km} km) would replace “${oldName}”. The places, forecast, positions, departure date and nights saved for the old route are removed. The departure date goes back to today and the nights to the stage model's suggestion; pace, speed, start time, stay and camp water stay.`,
  appTripOsmLink: '© OpenStreetMap contributors',
  appTripGeoNamesLink: 'GeoNames',
  appTripGeoNamesLicence: ', CC BY 4.0',
};
