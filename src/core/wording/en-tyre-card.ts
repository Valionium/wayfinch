// The Tools screen's tyre card words, which only that screen shows (a chunk of its own), in their own module so that the first
// screen does not carry them. Moved from en.ts as they were (14 Nov 2026): they pay for the clearer En route chips (sweep of
// 14 Nov 2026, findings 13 to 15). They follow the same rules as en.ts: the banned-words test reads this object too
// (tests/unit/core/wording-tyre-fields.test.ts).

export const TK = {
  tyreCardTitle: 'Tyre pressure',
  tyreCardLast: (front: string, rear: string): string => `front ${front} · rear ${rear} bar`,
  tyreCardBike: (name: string): string => `For ${name}`,
};
