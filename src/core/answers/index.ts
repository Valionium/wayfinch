// The `answers` module (spec section 8): every engine builds its Answer through makeAnswer.
import type { Answer, Missing } from '../types.ts';

export { compareFinal } from './order.ts';
export { formatAbout, formatHm, formatLeaveBy, formatRainEnd, formatRainOnset, localIsoDate } from './time.ts';

/**
 * Honesty rule 1: every answer lists its basis and data age, so an answer without a basis cannot be built.
 * `missing` names the data whose absence the answer states (rule 2); it is empty when none is.
 */
export function makeAnswer(a: Omit<Answer, 'missing'> & { missing?: Missing[] }): Answer {
  if (!a.basis.some((line) => line.trim() !== '')) throw new Error(`Answer "${a.title}" has no basis (honesty rule 1)`);
  return { ...a, missing: a.missing ?? [] };
}
