// What Ahead says while it asks which pass of the route a fix lies on (spec section 6.1, an out-and-back route or a loop that passes
// itself). In their own module, loaded with Update position's tap when there is a route: the first screen does not carry them (after
// the launch, 7 Nov 2026). They follow the same rules as en.ts: the banned-words test reads this object too
// (tests/unit/core/wording-ask.test.ts).

export const A = {
  askPass: (a: string, b: string): string => `Are you at km ${a} (way out) or km ${b} (way back)?`,
  askPassKm: (km: string): string => `km ${km}`,
  // A position was found and waits for the rider's answer, so "No position yet" would not be true (after the launch, 7 Nov 2026).
  askPassFromStart: "Position found. Choose which pass you're on; until then the answers count from the route start (km 0).",
  // The same for the help chips (bike shop, pharmacy, train, toilets), in place of "No position yet: measured from km …" (review of PR 65, M1).
  askPassMeasuredFrom: (km: string): string => `Position found; until you choose the pass, measured from km ${km}.`,
};
