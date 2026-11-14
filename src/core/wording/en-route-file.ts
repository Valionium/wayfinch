// Two of the route file's refusals, which only the GPX reader shows (a chunk of its own), in their own module so that the first
// screen does not carry them. Moved from en.ts as they were (14 Nov 2026): they pay for En route's focus, Back to today and water link (sweep of 14 Nov 2026,
// findings 16 to 18). They follow the same rules as en.ts: the banned-words test reads this object too (tests/unit/core/wording-moved-enroute.test.ts).

export const RF = {
  routeGpxTooManyPoints: 'This GPX has more than 200,000 points. Export a simplified track and try again.',
  routeGpxTooManySections: 'This GPX has more than 500 separate sections. Export fewer sections and try again.',
};
