// The weight map's words (weight map and bag shapes design, 1.4 to 1.7). Only /tools/bags/weightmap.js carries them, loaded on the first
// press of "Show weight map". A reference, never advice: the ideal is the rider's own bags and things packed for the best balance (the
// owner's finding G, 8 Nov 2026), never "you should".
export const WM = {
  title: 'Weight map',
  yours: 'Your weight',
  yoursSub: (kg: string): string => `${kg} kg packed, as the plan has it`,
  /** The ideal's two kinds, with and without panniers, and the switch between them. */
  idealWith: 'Ideal with panniers',
  idealWithout: 'Ideal without panniers',
  switchLabel: 'Ideal',
  switchWith: 'With panniers',
  switchWithout: 'Without panniers',
  /** Under the ideal's title: which bags it uses. Always the same things and kilos as yours. */
  idealSub: {
    own: 'Your bags and things, packed for the best balance',
    added: 'Your bags plus two 20 L panniers, packed for the best balance',
    removed: 'Your bags without the panniers, packed for the best balance',
  },
  idealSame: 'Your packing already has the best balance these bags allow.',
  /** Why an ideal cannot be shown, in its place. */
  why: {
    mounts: 'Your bike is set to no rack mounts, so there is no ideal with panniers.',
    room: 'Without the panniers your other bags cannot hold everything, so there is no ideal without them.',
  },
  diff: 'Where yours differs',
  diffSub: 'Yours minus the ideal',
  diffShow: 'Show where yours differs',
  diffHide: 'Hide where yours differs',
  shares: (back: number, rear: number, middle: number, front: number): string =>
    `Of the weighted load: ${back}% on your back, ${rear}% at the rear, ${middle}% in the middle, ${front}% at the front.`,
  zone: { back: 'on your back', rear: 'at the rear', middle: 'in the middle', front: 'at the front' },
  points: (n: number, more: boolean, zone: string): string => `${n} points ${more ? 'more' : 'less'} ${zone}`,
  close: 'Close to the ideal.',
  caption: 'Warmth shows weighted kilos: each kilo times the handling weight of where it sits, from 1.0 in the frame to 3.5 on your back.',
  key: 'Blue: little weight. Violet: some. Red: the most.',
  keyNote: 'Warmer means more weighted kilos at that spot. The lines mark three steps up the scale. Both maps share one scale.',
  diffKey: 'Teal: less than ideal. Grey: about the same. Orange: more than ideal.',
  back: 'on your back',
  nothing: 'Nothing is packed yet, so there is no weight to show.',
} as const;
