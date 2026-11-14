// Plan bags for this trip's refusals (Contract 2): only src/ui/trip/handoff.ts, a chunk of its own, says them, so they are apart from
// en.ts and the first screen does not carry them (moved word for word, sweep 2 of 15 Nov 2026, to make room for Trip's bike name).
// The same rules as en.ts hold: the banned-words test reads this object too (tests/unit/core/wording-handoff.test.ts).

export const HO = {
  appHandoffTooManyPoints: 'This route has more than 200,000 points, more than the bag planner reads. Add a simplified version of it to plan bags.',
  appHandoffTooLarge: 'This route is over 20 MB as a file, more than the bag planner reads. Add a simplified version of it to plan bags.',
  appHandoffStorageFull: "This phone's storage is full, so the route could not be passed on. Free some space, then try again.",
  appHandoffNotKept: 'The route could not be passed on to the bag planner. Try again.',
};
