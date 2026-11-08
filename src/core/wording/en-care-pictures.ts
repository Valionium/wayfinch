// Bike care's pictures in words (care pictures design of 7 November 2026, section 2.5): each drawing's short name (one sentence) and its
// description (what it shows, in plain words, two to four sentences), and a one-line caption where the picture shows a test or method the
// step only names. Loaded only with Bike care, under the banned-words test (tests/unit/core/care/pictures.test.ts). Labels drawn inside a
// picture are repeated here.
export type PictureWords = { name: string; description: string; caption?: string };

export const PICTURE_WORDS: Readonly<Record<string, PictureWords>> = {
  'tyre-levers': {
    name: 'Prying the tyre off the rim with two tyre levers.',
    description: 'The top of a wheel taken out of the bike, seen from the side. A first tyre lever is tucked under the edge of the tyre, pulled down towards the centre of the wheel, and its hooked end is clipped onto a spoke so it stays put; that stretch of tyre edge now sits outside the rim. A second lever is tucked under the tyre edge a hand width further on, and an arrow shows it being run along the rim, away from the first lever. A small picture in the corner shows the whole wheel and where this view is.',
  },
};
