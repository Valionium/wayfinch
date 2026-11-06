// The words of the bike's look extras (frame patterns, the fork, rim depth, colours from a photo), in their own module so the first
// screen does not carry them: the co-pilot loads them with the patterns, the bag planner with /tools/bags/bike.js. Same rules as
// en.ts: the banned-words test reads this object too (tests/unit/core/wording-paint.test.ts), and every key starts with `paint`.

export const PT = {
  // ---- frame patterns (names as in the owner's try-out of 5 November 2026; no brand names) ----
  paintPatternTitle: 'Frame pattern',
  paintSolid: 'One colour',
  paintSolidNote: 'The frame as today.',
  paintFadeH: 'Fade, front to back',
  paintFadeHNote: 'From the head tube to the rear wheel.',
  paintFadeV: 'Fade, top to bottom',
  paintFadeVNote: 'From the top tube down to the bottom bracket.',
  paintSplit: 'Split on a slant',
  paintSplitNote: 'Two colours with a hard, angled line between them.',
  paintBlocks: 'Two-tone blocks',
  paintBlocksNote: 'Main triangle in one colour, the rear stays in the other.',
  paintShift: 'Colour shift',
  paintShiftNote: 'Three colours flowing into each other, like chameleon paint.',
  paintMarble: 'Water-dyed',
  paintMarbleNote: 'Swirls of two or three colours, like a dipped or marbled finish.',
  paintStripes: 'Stripes',
  paintStripesNote: 'Slanted bands across the tubes.',
  paintSpeckle: 'Speckle',
  paintSpeckleNote: 'Fine flecks of the other colours on the first.',
  paintCamo: 'Camo',
  paintCamoNote: 'Soft blotches of the other colours.',
  paintPanel: 'Accent panel',
  paintPanelNote: 'One colour with a band of the second across the front of the frame.',
  paintSparkle: 'Metallic sparkle',
  paintSparkleNote: 'The colour with fine flake that catches the light.',
  paintChrome: 'Liquid metal',
  paintChromeNote: 'Mirror-like bands of light and dark, tinted with the colour.',
  paintCarbon: 'Raw carbon',
  paintCarbonNote: 'Bare carbon weave, no paint. Colours are ignored.',

  // ---- the colours a pattern uses ----
  paintFirst: 'First colour, chosen above',
  paintMain: 'Main triangle: the colour chosen above',
  paintSecond: 'Second colour',
  paintRear: 'Rear stays',
  paintThird: 'Third colour',

  // ---- the fork ----
  paintForkTitle: 'Fork',
  paintForkFrame: 'Like the frame',
  paintForkOwn: 'Own colour',
  paintForkFade: 'Fade',
  paintForkPattern: 'Pattern',
  paintForkColour: 'Fork colour',
  paintForkFadeLabel: 'Fade, from the crown down to the dropouts',
  paintForkPatternLabel: 'Fork pattern',
  paintForkPairLabel: 'Its two colours',
  // the fork's own two colours (owner's wish, 6 Nov 2026): the frame's swatches, the presets above fill both
  paintForkFrom: 'First colour, at the crown',
  paintForkTo: 'Second colour, at the dropouts',
  paintForkGround: 'First colour, the ground',
  paintForkFleck: 'Second colour, the pattern',

  // ---- the six colour pairs of a fade ----
  paintPairBluePurple: 'Blue to purple',
  paintPairTealBlue: 'Teal to blue',
  paintPairOrangeRed: 'Orange to red',
  paintPairPurplePink: 'Purple to pink',
  paintPairSilverBlack: 'Silver to black',
  paintPairOliveSand: 'Olive to sand',
  paintPairName: (from: string, to: string): string => `${from} to ${to}`,

  // ---- rims ----
  paintRimTitle: 'Rims',
  paintRimDepth: 'Rim depth',
  paintRimNotSet: 'Not set',
  paintRimUnset: 'Not set: drawn as a plain rim',
  paintRimLow: '15 mm, low alloy',
  paintRimHigh: '60 mm, deep carbon',
  paintRimValue: (mm: number): string => `${mm} mm · ${mm < 25 ? 'low alloy' : mm < 40 ? 'mid carbon' : 'deep carbon'}`,

  // ---- the drawing's accessible name ----
  paintFrameLabel: (colours: string[], pattern: string): string => `${colours.map((c) => c.toLowerCase()).join(' and ')} frame, ${pattern.toLowerCase()}`,
  paintCarbonLabel: 'raw carbon frame',
  paintForkColourLabel: (colour: string): string => `${colour.toLowerCase()} fork`,
  paintForkFadeName: (pair: string): string => `fork fading ${pair.toLowerCase()}`,
  paintForkPatternName: (pattern: string, pair: string | null): string => `${pattern.toLowerCase()} fork${pair ? `, ${pair.toLowerCase()}` : ''}`,
  paintRimLabel: (mm: number): string => `${mm} mm deep rims`,

  // ---- colours from a photo: three taps ----
  paintPhotoOne: 'One colour',
  paintPhotoThree: 'Front, back and fork',
  paintPhotoModes: 'What to take from the photo',
  paintPhotoFront: 'Tap the frame near the front (the head tube or down tube).',
  paintPhotoBack: 'Tap the frame near the back (a seat stay or the seat tube).',
  paintPhotoFork: 'Tap the fork near the bottom.',
  paintPhotoDone: 'Front and back make the frame fade, and the fork takes its own colour.',
  paintPhotoUse: 'Use these colours',
};
