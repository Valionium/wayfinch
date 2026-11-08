// Which drawing shows with which step (care pictures design of 7 November 2026, sections 2, 3.6 and 5). Pure data: a card's or task's id to
// one entry per step: a picture's id, a choice by the bike's bars, or null. A step with null, or a card not listed, shows its text alone.
// Each id is a file src/tools/care/pictures/<id>.svg, with its name and description in src/core/wording/en-care-pictures.ts (BC-PIC-FILES).
import type { Bars } from '../bike/normalise.ts';

/** A picture that depends on the bars (design 3.6; the owner's answer 1 of 8 November): drop bars, flat bars; other or Not sure, both. */
export type ByBars = { drop: string; flat: string };
export type StepPicture = string | ByBars | null;

/** The brake's quick release: a road caliper's lever on drop bars, a V-brake's curved cable tube on flat bars (review of PR 72, I1). */
const QR_OPEN: ByBars = { drop: 'brake-qr-open', flat: 'vbrake-open' };
const QR_CLOSE: ByBars = { drop: 'brake-qr-close', flat: 'vbrake-close' };

export const STEP_PICTURES: Readonly<Record<string, readonly StepPicture[]>> = {
  'puncture-tube': [null, 'tyre-levers', null, 'pinch-slits', 'patch-press', null, null],
  'puncture-tubeless': [null, null, 'tubeless-plug', null, null, null, null],
  'chain-broken': [null, 'quick-link', null, 'stiff-link', null, null],
  'spoke-snapped': ['spoke-wrap', QR_OPEN, null, null, QR_CLOSE],
  'brake-rub-rim': [null, null, null, null, QR_OPEN, QR_CLOSE],
  'brake-rub-disc': [null, null, 'disc-bolts', null, null],
  'brake-weak-rim': [null, QR_CLOSE, 'barrel-adjuster', null, null],
  'gears-skipping': ['stiff-link', null, null, null],
  'bolt-loose': [null, null, 'twist-test', null],
  'tyre-torn': [null, 'tyre-boot', null, null],
};

/** Every picture id an entry can show. */
export const idsOf = (entry: StepPicture): string[] => (entry === null ? [] : typeof entry === 'string' ? [entry] : [entry.drop, entry.flat]);

/**
 * The pictures of a card's or task's step (0-based) for a bike's bars, in order; empty for text alone. A choice by bars gives drop bars the
 * first, flat bars the second, and other bars, Not sure or no bike both, side by side, the drop-bar one first.
 */
export function picturesFor(id: string, step: number, bars: Bars | null): string[] {
  const entry = STEP_PICTURES[id]?.[step] ?? null;
  if (entry === null || typeof entry === 'string') return idsOf(entry);
  return bars === 'drop' ? [entry.drop] : bars === 'flat' ? [entry.flat] : [entry.drop, entry.flat];
}
