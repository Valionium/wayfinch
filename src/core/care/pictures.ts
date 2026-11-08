// Which drawing shows with which step (care pictures design of 7 November 2026, sections 2 and 5). Pure data: a card's or task's id to one
// entry per step, the picture's id or null. A step with null, or a card not listed, shows its text alone. Each id is a file
// src/tools/care/pictures/<id>.svg, with its name and description in src/core/wording/en-care-pictures.ts (BC-PIC-FILES checks both).
export const STEP_PICTURES: Readonly<Record<string, readonly (string | null)[]>> = {
  'puncture-tube': [null, 'tyre-levers', null, null, null, null, null],
};

/** The picture of a card's or task's step (0-based), or null for text alone. */
export const pictureFor = (id: string, step: number): string | null => STEP_PICTURES[id]?.[step] ?? null;
