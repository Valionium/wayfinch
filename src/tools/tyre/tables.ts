// The tables and constants of spec section 7.2, exact. Nothing here comes from SRAM, SILCA or Rene Herse: the only formula is the
// openly published Berto / Bicycle Quarterly 15% tyre-drop data, fitted as a power law (docs/research/2026-10-29-tyre.json).

export type Pos = 'fork' | 'bar' | 'top' | 'frame' | 'bottle' | 'seat' | 'rack' | 'pack';

export const PSI_PER_BAR = 14.5037738;
export const BAR_PER_PSI = 0.0689475729;

/** Lever factors a_i: the share of an item's mass that sits on the front wheel. A backpack counts as rider, not here. */
export const LEVER: Record<Exclude<Pos, 'pack'>, number> = { fork: 1.0, bar: 0.85, top: 0.75, frame: 0.6, bottle: 0.6, seat: 0.1, rack: 0.0 };

/** Default front share of the whole mass. */
export const DEFAULT_SPLIT = { drop: 0.45, flat: 0.4, other: 0.4 } as const;

/** [from mm, to mm, design rim width mm], ETRTO/ISO. The ends of this table are the ends of what the tool accepts. */
export const DESIGN_WIDTHS: readonly (readonly [number, number, number])[] = [
  [18, 21, 15], [22, 24, 17], [25, 28, 19], [29, 34, 21], [35, 46, 23], [47, 57, 25], [58, 65, 30], [66, 71, 35], [72, 83, 45],
];
export const WIDTH_MIN_MM = 18;
export const WIDTH_MAX_MM = 83;

/** [from mm, to mm, bar]: the hookless cap by PRINTED width. A width between two whole millimetres takes the lower row. */
export const HOOKLESS_CAPS: readonly (readonly [number, number, number])[] = [
  [18, 24, 5.5], [25, 29, 5.0], [30, 34, 4.5], [35, 39, 4.0], [40, 44, 3.5], [45, 54, 3.0], [55, 64, 2.5], [65, 74, 2.0], [75, 84, 1.5],
];
export const HOOKLESS_MAX_BAR = 5.0;

/** [rim inner width up to mm, minimum tyre width mm], ETRTO. Beyond 35 mm the table ends. */
export const ETRTO_MIN: readonly (readonly [number, number])[] = [
  [15, 18], [17, 20], [20, 22], [22, 25], [23, 28], [25, 29], [27, 35], [30, 47], [35, 58],
];
export const ETRTO_MAX_RIM_MM = 35;

/** Bead seat diameters the tool knows, with the words for them. */
export const WHEELS: readonly { bsdMm: number; label: string }[] = [
  { bsdMm: 622, label: '700C / 29 inch' },
  { bsdMm: 584, label: '650B / 27.5 inch' },
  { bsdMm: 571, label: '650C' },
  { bsdMm: 559, label: '26 inch' },
  { bsdMm: 507, label: '24 inch' },
  { bsdMm: 406, label: '20 inch' },
];

export const RIM_MIN_MM = 10;
export const RIM_MAX_MM = 60;

/** The 15% tyre-drop law: P15 [bar] = 31.2 x L / W_eff^1.694. Fit domain 20-37 mm. */
export const P15_COEFFICIENT = 31.2;
export const P15_EXPONENT = 1.694;
export const FIT_MIN_MM = 20;
export const FIT_MAX_MM = 37;

/** Limits that can be typed: anything outside is not a tyre pressure. */
export const LIMIT_BAR = { min: 0.2, max: 11, queryAbove: 10 } as const;
export const LIMIT_PSI = { min: 3, max: 160 } as const;
