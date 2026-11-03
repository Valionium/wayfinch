// Tyre sizes as riders type them (spec section 7.4): ETRTO "40-622", French "700 × 40C" or "650B × 47", inch "29 × 2.2".
// One reader for the drawing and the tyre tool. Anything unsure is null, never a guess: a fraction of an inch ("28 x 1 1/2") is an
// old size this does not read, and the tyre tool would set a pressure from a wrong reading.

/** Bead seat diameters this reads, in mm: 700c / 29", 650b / 27.5", 650c, 26", 24", 20". */
export const RIMS_MM = [622, 584, 571, 559, 507, 406] as const;

/** The widest tyre the drawing takes: 5 inch, a fat bike's. The tyre tool narrows this to its own table. */
const WIDTH_MIN_MM = 18;
const WIDTH_MAX_MM = 130;

const INCH_RIM: Record<string, number> = { '29': 622, '28': 622, '27.5': 584, '26': 559, '24': 507, '20': 406 };

export type TyreSize = { rimMm: number; widthMm: number };

const usable = (rimMm: number | undefined, widthMm: number): TyreSize | null =>
  rimMm !== undefined && (RIMS_MM as readonly number[]).includes(rimMm) && widthMm >= WIDTH_MIN_MM && widthMm <= WIDTH_MAX_MM ? { rimMm, widthMm } : null;

/** The rim diameter and the tyre width, in mm, unrounded ("29 × 2.2" gives 622 and 55.88). Null when it does not read. */
export function parseTyre(text: unknown): TyreSize | null {
  if (typeof text !== 'string') return null;
  if (/\d\s*\/\s*\d/.test(text) || /[¼-¾⅐-⅞]/.test(text)) return null;
  const etrto = /(?<![\d.])(\d{2,3})\s*[-–]\s*(\d{3})\b/.exec(text);
  if (etrto) return usable(Number(etrto[2]), Number(etrto[1]));
  const french = /\b(700|650)\s*([bc])?\s*[x×]\s*(\d{2})\s*(?:mm|c)?(?![\w.,/x×])(?!\s*[x×]\s*\d)/i.exec(text);
  if (french) {
    const letter = (french[2] ?? '').toLowerCase();
    const rimMm = french[1] === '700' ? (letter === 'b' ? undefined : 622) : letter === 'b' ? 584 : letter === 'c' ? 571 : undefined;
    return usable(rimMm, Number(french[3]));
  }
  const inch = /(?<![\w.])(\d{2}(?:\.5)?)\s*[x×]\s*(\d(?:[.,]\d{1,2})?)\s*(?:"|in|inch)?(?![\w.,/x×])(?!\s*[x×]\s*\d)/i.exec(text);
  if (inch) return usable(INCH_RIM[inch[1]!], Math.round(Number(inch[2]!.replace(',', '.')) * 25.4 * 100) / 100);
  return null;
}
