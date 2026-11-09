// The trip settings' field names (the departure date, the nights and the trip details), which only their own chunk shows
// (src/ui/trip/settings.tsx). Moved from en.ts as they were, to make room on the first screen for Remove this trip (owner's wish,
// 9 November 2026). They follow the same rules as en.ts: the banned-words test reads this object too (tests/unit/core/wording-remove.test.ts).

export const TF = {
  appTripDeparture: 'Departure date',
  appTripStartTime: 'Daily start time',
  appTripNights: 'Nights',
  appTripNightsSuggested: (n: number): string => `The stage model suggests ${n}.`,
  appTripPace: 'Pace',
  appTripFlatKph: 'Flat speed, unloaded (km/h)',
  appTripStay: 'Stay type',
  appTripCampWater: 'Camp water per night (L)',
};
