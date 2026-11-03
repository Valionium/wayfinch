// Frame templates (spec section 7.4): one per style at size M, in mm from the bottom bracket, x forward, y up. Drawing values only,
// never fit advice: tuned until the bike looks like itself. Sizes scale the main triangle; the wheels keep their size.
import type { FitStyle, SizeLetter } from './normalise.ts';

export type Style = Exclude<FitStyle, 'unknown'>;
export type Pt = readonly [number, number];

/** The four points of section 7.4. */
export type FramePoints = { rear: Pt; front: Pt; seatTop: Pt; headTop: Pt };

export type Template = FramePoints & {
  /** Head tube length and angle (degrees from the ground). */
  headMm: number; headDeg: number;
  /** Saddle height from the bottom bracket along the seat tube. */
  saddleMm: number;
  /** Where the top tube meets the head tube, as a share of the head tube from its top. */
  topJoin: number;
  /** A low top tube (trapeze): from this share up the seat tube to this share down the head tube. */
  low?: readonly [number, number];
  /** Twin tubes (mixte) from the head tube to the rear axle, passing the seat tube. */
  twin?: true;
  /** No top tube (step-through): the down tube sweeps low from this share down the head tube. */
  step?: number;
  /** A rear shock (full suspension). */
  shock?: true;
  /** Stem length and rise, mm. */
  stemMm: number; stemDeg: number;
};

export const TEMPLATES: Record<Style, Template> = {
  'diamond-sloping': {
    rear: [-422, 72], front: [612, 72], seatTop: [-142, 475], headTop: [383, 588],
    headMm: 150, headDeg: 71.5, saddleMm: 735, topJoin: 0.12, stemMm: 95, stemDeg: 6,
  },
  'diamond-level': {
    rear: [-445, 75], front: [618, 75], seatTop: [-168, 558], headTop: [372, 600],
    headMm: 175, headDeg: 71, saddleMm: 730, topJoin: 0.16, stemMm: 90, stemDeg: 10,
  },
  compact: {
    rear: [-418, 70], front: [600, 70], seatTop: [-122, 420], headTop: [380, 592],
    headMm: 160, headDeg: 71.5, saddleMm: 735, topJoin: 0.12, stemMm: 95, stemDeg: 6,
  },
  trapeze: {
    rear: [-455, 62], front: [648, 62], seatTop: [-165, 525], headTop: [398, 650],
    headMm: 200, headDeg: 69, saddleMm: 735, topJoin: 0.1, low: [0.56, 0.42], stemMm: 85, stemDeg: 25,
  },
  mixte: {
    rear: [-452, 62], front: [645, 62], seatTop: [-162, 515], headTop: [395, 640],
    headMm: 190, headDeg: 69.5, saddleMm: 735, topJoin: 0.14, twin: true, stemMm: 85, stemDeg: 20,
  },
  'step-through': {
    rear: [-460, 58], front: [655, 58], seatTop: [-168, 505], headTop: [405, 655],
    headMm: 200, headDeg: 68.5, saddleMm: 735, topJoin: 0.1, step: 0.3, stemMm: 85, stemDeg: 25,
  },
  'full-suspension': {
    rear: [-438, 28], front: [742, 28], seatTop: [-152, 440], headTop: [452, 618],
    headMm: 115, headDeg: 65.5, saddleMm: 720, topJoin: 0.18, shock: true, stemMm: 55, stemDeg: 0,
  },
};

/** Sizes scale the main triangle around the bottom bracket. */
export const SIZE_FACTOR: Record<SizeLetter, number> = { XS: 0.89, S: 0.945, M: 1, L: 1.055, XL: 1.11 };

/** The four points of a style at a size: the triangle scales, the rear axle stays, the front axle moves with the head tube. */
export function framePoints(style: Style, size: SizeLetter): FramePoints {
  const t = TEMPLATES[style];
  const f = SIZE_FACTOR[size];
  const shift = t.headTop[0] * (f - 1);
  return {
    rear: t.rear,
    front: [t.front[0] + shift, t.front[1]],
    seatTop: [t.seatTop[0] * f, t.seatTop[1] * f],
    headTop: [t.headTop[0] * f, t.headTop[1] * f],
  };
}
