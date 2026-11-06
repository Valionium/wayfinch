// What Emergency's Update position says when it finds no usable position and there is no route to set one on by hand (owner's iPhone
// check, 6 November 2026). In their own module, loaded when the button is tapped: the first screen does not carry them (review of
// PR 53, M6). They follow the same rules as en.ts: the banned-words test reads this object too (tests/unit/core/wording-here.test.ts).

export const H = {
  hereDenied: 'Location is off, or not allowed for Wayfinch. Allow it in the phone settings for your browser or Wayfinch, then tap Update position again. 112 works without it.',
  hereNoFix: 'The phone found no position. Turn Location on, go where the sky is open, and tap Update position again.',
  hereTimeout: 'No position within 45 seconds. Without signal a first fix can take minutes: stay where the sky is open and tap Update position again.',
  hereUnusable: 'The phone gave no usable position. Go where the sky is open and tap Update position again.',
};
