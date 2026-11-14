// Lines that show by the bike's brakes (care pictures redo, T9, owner's approval of 9 November 2026): a step that starts "Rim brakes:"
// shows only for rim brakes, one that starts "Disc brakes:" only for disc brakes; brakes Not sure, all of them, the disc line first.
import { expect, test } from 'vitest';
import { STEP_WHEN, stepsShown } from '../../../../src/core/care/lines.ts';
import { picturesFor } from '../../../../src/core/care/pictures.ts';
import type { RimKind } from '../../../../src/core/care/pictures.ts';
import type { CareDetails } from '../../../../src/core/care/types.ts';
import CARE_WORDS from '../../../../src/core/wording/en-care-pictures.json';
import { stepTitlesFrom } from '../../../../src/core/wording/en-care-pictures.ts';
import { CARE_TASKS, ROAD_CARDS } from '../../../../src/core/wording/en-care.ts';
import { bannedHits } from '../../../fixtures/banned.ts';

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

// The owner's decision of 9 November 2026 (after "Snapped spoke, step 2 of 5: Road caliper"): every line for one kind of brake carries its
// condition, not only the rim and disc lines: "Cable:" and "Cable brakes:" on a disc card for cable discs, "Hydraulic:" for hydraulic
// discs, "Cable brakes:" on a rim card for the rim brakes with a cable (a road caliper or a V-brake, not a hydraulic rim brake).
test('[BC-STEP-LINES] every line for one kind of brake carries its condition; a card without such lines shows all its steps in order', () => {
  for (const item of [...ROAD_CARDS, ...CARE_TASKS]) {
    const when = STEP_WHEN[item.id];
    const disc = (item.applies.brakes ?? []).every((b) => b !== 'rim') && (item.applies.brakes ?? []).length > 0;
    item.steps.forEach((t, i) => {
      const w = when?.[i] ?? null, at = `${item.id} ${i + 1}`;
      if (t.startsWith('Rim brakes:')) expect(w, at).toEqual({ brakes: ['rim'] });
      else if (t.startsWith('Disc brakes:')) expect(w, at).toEqual({ brakes: ['cable-disc', 'hydraulic-disc'] });
      else if (t.startsWith('Hydraulic:')) expect(w, at).toEqual({ brakes: ['hydraulic-disc'] });
      else if (t.startsWith('Cable:') || (t.startsWith('Cable brakes:') && disc)) expect(w, at).toEqual({ brakes: ['cable-disc'] });
      else if (t.startsWith('Cable brakes:')) expect(w, at).toEqual({ rimBrake: ['caliper', 'v-brake'] });
      else if (t.startsWith('Hydraulic rim brakes:')) expect(w, at).toEqual({ rimBrake: ['hydraulic'] });
      else expect(w, at).toBeNull();
    });
    if (!when) expect(stepsShown(item.id, item.steps.length, d('rim'))).toEqual(item.steps.map((_, i) => i));
  }
});

const shownOf = (id: string, brakes: CareDetails['brakes'], rimBrake: RimKind | null = null): string[] => {
  const item = ROAD_CARDS.find((c) => c.id === id)!;
  return stepsShown(id, item.steps.length, d(brakes), rimBrake).map((i) => item.steps[i]!);
};

test('[BC-STEP-LINES] cable and hydraulic lines show only for their brakes; not told, every line, the hydraulic one first; no cable line for a hydraulic rim brake', () => {
  expect(shownOf('brake-weak-disc', 'hydraulic-disc').some((t) => t.startsWith('Cable:'))).toBe(false);
  expect(shownOf('brake-weak-disc', 'hydraulic-disc').length).toBe(4);
  expect(shownOf('brake-weak-disc', 'cable-disc').some((t) => t.startsWith('Hydraulic:'))).toBe(false);
  expect(shownOf('brake-weak-disc', 'cable-disc').length).toBe(4);
  const unsure = shownOf('brake-weak-disc', null);
  expect(unsure.length).toBe(5);
  expect(unsure.findIndex((t) => t.startsWith('Hydraulic:'))).toBeLessThan(unsure.findIndex((t) => t.startsWith('Cable:')));
  expect(shownOf('brake-rub-disc', 'hydraulic-disc').some((t) => t.startsWith('Cable brakes:'))).toBe(false);
  expect(shownOf('brake-rub-disc', 'cable-disc').some((t) => t.startsWith('Cable brakes:'))).toBe(true);
  expect(shownOf('brake-rub-disc', null).length).toBe(ROAD_CARDS.find((c) => c.id === 'brake-rub-disc')!.steps.length);
  expect(shownOf('brake-weak-rim', 'rim', 'hydraulic').some((t) => t.startsWith('Cable brakes:'))).toBe(false);
  expect(shownOf('brake-weak-rim', 'rim', 'hydraulic').length).toBe(4);
  expect(shownOf('brake-weak-rim', 'rim', 'v-brake').some((t) => t.startsWith('Cable brakes:'))).toBe(true);
  expect(shownOf('brake-weak-rim', 'rim').length).toBe(5);
});

// The owner's decision of 9 November 2026: a step for some bikes only has a title that says so ("Rim brakes only: ..."), in the step
// pictures' words file (precached data, not the lazy JavaScript); every other step has none.
test('[BC-STEP-TITLES] each step for some bikes only has a title saying which, the owner\'s two as written; no other step has one; no banned word', () => {
  const titles = stepTitlesFrom(CARE_WORDS)!;
  expect(titles).not.toBeNull();
  expect(stepTitlesFrom({ titles: { x: [3] } })).toBeNull();
  expect(titles['spoke-snapped']![1]).toBe('Rim brakes only: let the wobbly wheel pass the pads');
  expect(titles['spoke-snapped']![4]).toBe('Rim brakes only: close the brake again');
  for (const item of [...ROAD_CARDS, ...CARE_TASKS]) {
    const when = STEP_WHEN[item.id], t = titles[item.id];
    if (!when) { expect(t, item.id).toBeUndefined(); continue; }
    expect(t!.length, item.id).toBe(item.steps.length);
    when.forEach((w, i) => {
      if (w === null) expect(t![i], `${item.id} ${i + 1}`).toBeNull();
      else {
        expect(t![i], `${item.id} ${i + 1}`).toMatch(/^(Rim|Disc|Cable disc|Hydraulic disc|Cable rim|Hydraulic rim) brakes only: [a-z]/);
        expect(bannedHits(t![i]!, false), t![i]!).toEqual([]);
      }
    });
  }
});

// The owner's ruling of 14 November 2026: a hydraulic rim brake gets its own centring step, with its own words and never the road
// caliper's centring screw; no honest picture of it exists, so it shows its text alone.
test('[BC-HYDRO-RIM-CENTRE] Brake rubbing: a hydraulic rim brake sees its own centring step and not the cable one, with no picture; a road caliper or V-brake the cable one only; not told, both, the cable one first', () => {
  const rub = ROAD_CARDS.find((c) => c.id === 'brake-rub-rim')!;
  const hydro = rub.steps.findIndex((t) => t.startsWith('Hydraulic rim brakes:'));
  const cable = rub.steps.findIndex((t) => t.startsWith('Cable brakes:') && /centring screw/.test(t));
  expect(hydro).toBeGreaterThan(-1);
  expect(cable).toBeGreaterThan(-1);
  expect(rub.steps[hydro]).not.toMatch(/road caliper|V-brake|spring screw|turn its/i);
  expect(rub.steps[hydro]).toMatch(/shop/);
  const shown = (k: RimKind | null) => stepsShown(rub.id, rub.steps.length, d('rim'), k);
  expect(shown('hydraulic')).toContain(hydro);
  expect(shown('hydraulic')).not.toContain(cable);
  for (const k of ['caliper', 'v-brake'] as const) {
    expect(shown(k), k).toContain(cable);
    expect(shown(k), k).not.toContain(hydro);
  }
  expect(shown(null).indexOf(cable)).toBeLessThan(shown(null).indexOf(hydro));
  expect(shown(null).length).toBe(rub.steps.length);
  // its own step has no picture: no road caliper's centring screw, no V-brake's spring screw
  for (const k of [null, 'hydraulic', 'caliper', 'v-brake'] as const) {
    expect(picturesFor(rub.id, hydro, { brakes: 'rim', rimBrake: k, axle: null, shifting: null, bars: null }), String(k)).toEqual([]);
  }
  // the cable step keeps its two pictures
  expect(picturesFor(rub.id, cable, { brakes: 'rim', rimBrake: 'caliper', axle: null, shifting: null, bars: null }).map((p) => p.id)).toEqual(['rim-centre-caliper', 'rim-centre-vbrake']);
  // its title says which brakes it is for
  expect(stepTitlesFrom(CARE_WORDS)!['brake-rub-rim']![hydro]).toMatch(/^Hydraulic rim brakes only: /);
  expect(bannedHits(rub.steps[hydro]!, false)).toEqual([]);
});
