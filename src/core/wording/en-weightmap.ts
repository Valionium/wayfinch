// The weight map's words (weight map and bag shapes design, 1.4 to 1.7). Only /tools/bags/weightmap.js carries them, loaded on the first
// press of "Show weight map". A reference, never advice: the ideal is "spread as a well-balanced bike carries it", never "you should".
export const WM = {
  title: 'Weight map',
  yours: 'Your weight',
  yoursSub: (kg: string): string => `${kg} kg packed, as the plan has it`,
  ideal: 'Ideal for the same kilos',
  idealSub: 'Same total, spread as a well-balanced bike carries it',
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
