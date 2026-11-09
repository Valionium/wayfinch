// A place to sleep near each day's end on Trip's days (TRIP-DAY-BEDS, owner's wish of 9 November 2026), in a module of its own that
// only the route summary's chunk loads, so the first screen does not carry it. The same rules as en.ts hold: the banned-words test
// reads this object too (tests/unit/core/wording-beds.test.ts). The days stay the stage model's; these lines only name a place.

export const BD = {
  appTripBedsAfter: 'Once Get ready offline has run, each day names a place to sleep near its end.',
  appTripBedNear: (name: string, km: string, town: string | null): string => `To sleep near the end: ${name}, km ${km}${town === null ? '' : `, by ${town}`}`,
  appTripBedTown: (name: string, km: string, windowKm: string): string => `No place to sleep mapped within ${windowKm} km of the end; nearest town: ${name}, km ${km}`,
  appTripBedNone: (windowKm: string): string => `No place to sleep mapped within ${windowKm} km of the end`,
};
