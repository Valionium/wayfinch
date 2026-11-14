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
