// The tyre tool's figure lines and three of its questions and refusals, which only its own chunk shows, in their own module so that the
// first screen does not carry them. Moved from en.ts as they were (14 Nov 2026): they pay for En route's focus, Back to today and water link (sweep of 14 Nov 2026,
// findings 16 to 18). They follow the same rules as en.ts: the banned-words test reads this object too (tests/unit/core/wording-moved-enroute.test.ts).

export const TZ = {
  tyreDidYouMean: (value: string): string => `Did you mean ${value} psi?`,
  tyreRefuseTemp: (what: string): string => `${what} is not a usable temperature (−40 to 60 °C).`,
  tyreRefuseHeight: (what: string): string => `${what} is not a usable height (−400 to 9000 m).`,
  tyreFrontBackBar: (value: string): string => `${value} bar`,
  tyrePsiValue: (value: string): string => `${value} psi`,
  tyreAssumedList: (list: string): string => `Not set yet, so assumed: ${list}. Set them for a better figure.`,
};
