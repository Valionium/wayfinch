// Words only Trip's own chunks show: the trip settings' field names (the departure date, the nights and the trip details,
// src/ui/trip/settings.tsx), the route's summary (summary.tsx) and Get ready offline's storage line (getready.tsx). Moved from en.ts as
// they were, to make room on the first screen for Remove this trip (owner's wish, 9 November 2026). They follow the same rules as
// en.ts: the banned-words test reads this object too (tests/unit/core/wording-remove.test.ts).

export const TF = {
  appTripDeparture: 'Departure date',
  appTripStartTime: 'Daily start time',
  appTripNights: 'Nights',
  appTripNightsSuggested: (n: number): string => `The stage model suggests ${n}.`,
  appTripPace: 'Pace',
  appTripFlatKph: 'Flat speed, unloaded (km/h)',
  appTripStay: 'Stay type',
  appTripCampWater: 'Camp water per night (L)',
  appTripSummaryTitle: 'Your route',
  appTripProfileLabel: (low: number, high: number): string => `Elevation profile: lowest ${low} m, highest ${high} m`,
  appTripOsmLead: 'Places and routes: ',
  appTripStopsLabel: 'Stops along the route',
  appTripStorage: (mb: string): string => `${mb} MB used on this phone`,
};
