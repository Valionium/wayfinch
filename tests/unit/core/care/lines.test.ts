// Lines that show by the bike's brakes (care pictures redo, T9, owner's approval of 9 November 2026): a step that starts "Rim brakes:"
// shows only for rim brakes, one that starts "Disc brakes:" only for disc brakes; brakes Not sure, all of them, the disc line first.
import { expect, test } from 'vitest';
import { STEP_WHEN, stepsShown } from '../../../../src/core/care/lines.ts';
import type { CareDetails } from '../../../../src/core/care/types.ts';
import { CARE_TASKS, ROAD_CARDS } from '../../../../src/core/wording/en-care.ts';

const d = (brakes: CareDetails['brakes']): CareDetails => ({ brakes, tyres: null, drive: null, gears: null, shifting: null, suspension: null, ebike: null });
const spoke = ROAD_CARDS.find((c) => c.id === 'spoke-snapped')!;
const texts = (brakes: CareDetails['brakes']): string[] => stepsShown('spoke-snapped', spoke.steps.length, d(brakes)).map((i) => spoke.steps[i]!);

test('[BC-STEP-LINES] the snapped-spoke card: rim brakes see the rim lines only, disc brakes the disc line only, Not sure all three with the disc line first', () => {
  expect(texts('rim').some((t) => t.startsWith('Disc brakes:'))).toBe(false);
  expect(texts('rim').filter((t) => t.startsWith('Rim brakes:')).length).toBe(2);
  for (const disc of ['hydraulic-disc', 'cable-disc'] as const) {
    expect(texts(disc).some((t) => t.startsWith('Rim brakes:')), disc).toBe(false);
    expect(texts(disc).filter((t) => t.startsWith('Disc brakes:')).length, disc).toBe(1);
  }
  const unsure = texts(null);
  expect(unsure.length).toBe(spoke.steps.length);
  expect(unsure.findIndex((t) => t.startsWith('Disc brakes:'))).toBeLessThan(unsure.findIndex((t) => t.startsWith('Rim brakes:')));
  // the last rim line, closing the brake's release, stays the last step
  expect(unsure.at(-1)).toMatch(/^Rim brakes: close/);
  // other brakes (a coaster or roller brake): neither line
  expect(texts('other').some((t) => /^(Rim|Disc) brakes:/.test(t))).toBe(false);
});

test('[BC-STEP-LINES] every line that starts "Rim brakes:" or "Disc brakes:" carries its condition; a card without such lines shows all its steps in order', () => {
  for (const item of [...ROAD_CARDS, ...CARE_TASKS]) {
    const when = STEP_WHEN[item.id];
    item.steps.forEach((t, i) => {
      const brakes = when?.[i]?.brakes;
      if (t.startsWith('Rim brakes:')) expect(brakes, `${item.id} ${i + 1}`).toEqual(['rim']);
      else if (t.startsWith('Disc brakes:')) expect(brakes, `${item.id} ${i + 1}`).toEqual(['cable-disc', 'hydraulic-disc']);
      else expect(when?.[i] ?? null, `${item.id} ${i + 1}`).toBeNull();
    });
    if (!when) expect(stepsShown(item.id, item.steps.length, d('rim'))).toEqual(item.steps.map((_, i) => i));
  }
});
