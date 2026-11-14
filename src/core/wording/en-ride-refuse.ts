// Two of the ride report's refusals, which only You's ride report shows (a chunk of its own), in their own module so that the first
// screen does not carry them. Moved from en.ts as they were (14 Nov 2026): they pay for En route's focus, Back to today and water link (sweep of 14 Nov 2026,
// findings 16 to 18). They follow the same rules as en.ts: the banned-words test reads this object too (tests/unit/core/wording-moved-enroute.test.ts).

export const YR = {
  appStoreRideLong: 'A ride over 16 hours is not taken in. Check the hours.',
  appStoreRideWeighing: 'Check the weighing: weight change within 10 kg, toilet stops from 0 to 30.',
};
