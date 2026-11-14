// Prepare this route's pause for the weather service, which only the heights' lookup shows (a chunk of its own), in their own module so that the first screen does not carry them. Moved from en.ts as they were (14 Nov 2026): they
// pay for the clearer En route chips (sweep of 14 Nov 2026, findings 13 to 15). They follow the same rules as en.ts: the
// banned-words test reads this object too (tests/unit/core/wording-tyre-fields.test.ts).

export const PS = {
  appPrepWait: (at: string): string => `The weather service asks for a minute's pause. Asking again at about ${at}; you can leave this screen meanwhile.`,
};
