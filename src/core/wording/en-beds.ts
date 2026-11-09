// A place to sleep near each day's end on Trip's days (TRIP-DAY-BEDS, owner's wish of 9 November 2026), in a module of its own that
// only the route summary's chunk loads, so the first screen does not carry it. The same rules as en.ts hold: the banned-words test
// reads this object too (tests/unit/core/wording-beds.test.ts). The days stay the stage model's; these lines only name a place.

export const BD = {
  appTripBedsAfter: 'Each day will then end at a place to sleep near its planned end, where one is mapped.',
  // Days that end where you can sleep (TRIP-DAY-STOPS, the owner's ruling of 9 Nov 2026).
  appTripDayTo: (day: number, km: string, name: string): string => `Day ${day} · ${km} km to ${name}`,
  appTripStopBy: (town: string): string => `by ${town}`,
  appTripStopNone: (windowKm: string): string => `No place to sleep mapped within ${windowKm} km of the planned end, so the day ends there.`,
  appTripStopSplit: 'No stop chosen: the day ends where the effort splits evenly.',
  appTripStopChange: 'Change stop',
  appTripStopPick: (name: string, km: string): string => `${name}, km ${km}`,
  appTripStopNo: 'No stop: split by effort',
  appTripStopUndo: 'Undo',
  appTripStopChanged: (day: number): string => `Day ${day} ends at the stop you chose.`,
  appTripStopNoChoice: "No other place to sleep is mapped near this day's planned end.",
  appTripBedNear: (name: string, km: string, town: string | null): string => `To sleep near the end: ${name}, km ${km}${town === null ? '' : `, by ${town}`}`,
  appTripBedTown: (name: string, km: string, windowKm: string): string => `No place to sleep mapped within ${windowKm} km of the end; nearest town: ${name}, km ${km}`,
  appTripBedNone: (windowKm: string): string => `No place to sleep mapped within ${windowKm} km of the end`,
};
