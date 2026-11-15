// The route file's refusal of a track too long to process, which only the route reader shows (its own chunk, with the GPX reader),
// in its own module so that the first screen does not carry it. Moved from en.ts as it was (15 Nov 2026): it pays for the town check
// in the hospitals' name check (EM-CLINIC-NAME: Rehau is a town, not a Reha clinic). It follows the same rules as en.ts: the
// banned-words test reads this object too (tests/unit/core/wording-track.test.ts).

export const TK = {
  routeTrackTooLong: 'The track distance could not be processed. Try a shorter or simplified GPX.',
};
