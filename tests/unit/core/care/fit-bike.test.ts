// Bike care fitted to the bike's details (the owner's wish of 14 November 2026): the kind of brakes, with hydraulic brakes their fluid,
// and the gear shifting, as You's bike details store them. Cards and tasks that do not fit the bike are left out, Not sure shows them all;
// steps that depend on the fluid or on electronic shifting say what the bike has; the line at the top names what the list is fitted to.
import { expect, test } from 'vitest';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import type { BikeRecord } from '../../../../src/core/bike/normalise.ts';
import { careDetails, careFluid, fitBike, fitted } from '../../../../src/core/care/fit.ts';
import { stepWords } from '../../../../src/core/care/lines.ts';
import { pictureDetails } from '../../../../src/core/care/pictures.ts';
import { C, CARE_TASKS, fitWords, ROAD_CARDS, STEP_VARIANTS } from '../../../../src/core/wording/en-care.ts';
import { bannedHits } from '../../../fixtures/banned.ts';

const bike = (extra: Record<string, unknown>): BikeRecord => normaliseBike({ id: 'bike_1', name: 'Test', ...extra })!;
const ids = (b: BikeRecord | null): string[] => [...fitted(CARE_TASKS, careDetails(b)), ...fitted(ROAD_CARDS, careDetails(b))].map((x) => x.id);
const ALL = [...CARE_TASKS, ...ROAD_CARDS].map((x) => x.id);

const RIM_ONLY = ['brakes-rim-wipe', 'brakes-pads-rim', 'brake-rub-rim', 'brake-weak-rim'];
const DISC = ['brakes-rotor-wipe', 'brakes-pads-disc', 'brakes-rotor-thickness', 'brake-rub-disc', 'brake-weak-disc'];
const CABLE_DISC_ONLY = ['brakes-cable-disc-service'];
const HYDRO_DISC_ONLY = ['brakes-hydraulic-bleed', 'brakes-spongy'];
const CABLE_GEARS = ['gears-cables-look', 'gears-cables-replace'];
const ELECTRONIC_GEARS = ['gears-electronic-battery'];

test('[BC-FIT-KINDS] each kind of brake shows its own cards and tasks and leaves out the others; Not sure (and no bike) shows them all', () => {
  const has = (b: BikeRecord, list: string[], want: boolean): void => { for (const id of list) expect(ids(b).includes(id), `${id} ${JSON.stringify(b.brakes)} ${b.rimBrake ?? ''}`).toBe(want); };
  // rim brakes a cable pulls (a road caliper, a V-brake), a hydraulic rim brake, and the kind not told: the rim cards, never a disc one
  for (const rimBrake of ['caliper', 'v-brake', 'hydraulic', undefined]) {
    const b = bike({ brakes: 'rim', ...(rimBrake ? { rimBrake } : {}) });
    has(b, RIM_ONLY, true); has(b, [...DISC, ...CABLE_DISC_ONLY, ...HYDRO_DISC_ONLY], false);
  }
  const cable = bike({ brakes: 'cable-disc' });
  has(cable, [...DISC, ...CABLE_DISC_ONLY], true); has(cable, [...RIM_ONLY, ...HYDRO_DISC_ONLY], false);
  const hydro = bike({ brakes: 'hydraulic-disc' });
  has(hydro, [...DISC, ...HYDRO_DISC_ONLY], true); has(hydro, [...RIM_ONLY, ...CABLE_DISC_ONLY], false);
  // the fluid never hides anything: it only changes words
  for (const brakeFluid of ['mineral', 'dot']) expect(ids(bike({ brakes: 'hydraulic-disc', brakeFluid }))).toEqual(ids(hydro));
  // other brakes (a coaster or a roller brake): none of the kind-bound ones
  has(bike({ brakes: 'other' }), [...RIM_ONLY, ...DISC, ...CABLE_DISC_ONLY, ...HYDRO_DISC_ONLY], false);
  // Not sure, an old bike stored before these details, and no bike: every card and task
  for (const b of [bike({}), bike({ brakes: 'unknown', shifting: 'unknown' }), null]) expect(ids(b).sort()).toEqual([...ALL].sort());
});

test('[BC-FIT-KINDS] gear shifting: cable gears see the cable tasks, electronic gears the shifting battery, no gears neither; Not sure both', () => {
  const has = (b: BikeRecord, list: string[], want: boolean): void => { for (const id of list) expect(ids(b).includes(id), `${id} ${b.shifting}`).toBe(want); };
  const cable = bike({ shifting: 'cable' });
  has(cable, CABLE_GEARS, true); has(cable, ELECTRONIC_GEARS, false);
  const electronic = bike({ shifting: 'electronic' });
  has(electronic, ELECTRONIC_GEARS, true); has(electronic, [...CABLE_GEARS, 'gears-indexing'], false);
  has(bike({ shifting: 'none' }), [...CABLE_GEARS, ...ELECTRONIC_GEARS], false);
  has(bike({}), [...CABLE_GEARS, ...ELECTRONIC_GEARS], true);
});

test('[BC-FIT-KINDS] the fluid is read only with hydraulic brakes (a hydraulic disc, or a hydraulic rim brake); otherwise, or not told, none', () => {
  for (const brakeFluid of ['mineral', 'dot'] as const) {
    expect(careFluid(bike({ brakes: 'hydraulic-disc', brakeFluid }))).toBe(brakeFluid);
    expect(careFluid(bike({ brakes: 'rim', rimBrake: 'hydraulic', brakeFluid }))).toBe(brakeFluid);
    // kept as answered after a change of brakes, but a cable brake has no fluid
    for (const other of [{ brakes: 'cable-disc' }, { brakes: 'rim', rimBrake: 'caliper' }, { brakes: 'rim' }, { brakes: 'other' }, {}]) {
      expect(careFluid(bike({ ...other, brakeFluid })), JSON.stringify(other)).toBeNull();
    }
  }
  expect(careFluid(bike({ brakes: 'hydraulic-disc' }))).toBeNull();
  expect(careFluid(null)).toBeNull();
});

const facts = (b: BikeRecord | null) => ({ fluid: careFluid(b), shifting: careDetails(b).shifting });
const textOf = (id: string, i: number, b: BikeRecord | null): string => {
  const item = [...CARE_TASKS, ...ROAD_CARDS].find((x) => x.id === id)!;
  return stepWords(id, i, item.steps[i]!, facts(b));
};

test('[BC-STEP-WORDS] a hydraulic brake step names the bike\'s fluid and says never to mix; not told, the content\'s own words', () => {
  const bleed = CARE_TASKS.find((t) => t.id === 'brakes-hydraulic-bleed')!;
  const mineral = bike({ brakes: 'hydraulic-disc', brakeFluid: 'mineral' });
  const dot = bike({ brakes: 'hydraulic-disc', brakeFluid: 'dot' });
  const unsure = bike({ brakes: 'hydraulic-disc' });
  const all = (b: BikeRecord | null) => bleed.steps.map((_, i) => textOf(bleed.id, i, b)).join(' ');
  expect(all(mineral)).toMatch(/mineral oil/);
  expect(all(mineral)).toMatch(/never .*DOT fluid/i);
  expect(all(dot)).toMatch(/DOT fluid/);
  expect(all(dot)).toMatch(/never .*mineral oil/i);
  // review of PR 129, m2: a told fluid keeps the content's cross-check (which maker usually uses which fluid) and sends the rider to the
  // lever or caliper, so a fluid set wrong in the details is caught before the bleed
  for (const b of [mineral, dot]) {
    expect(textOf(bleed.id, 1, b), String(b.brakeFluid)).toMatch(/Shimano usually uses mineral oil, SRAM usually DOT fluid/);
    expect(textOf(bleed.id, 1, b), String(b.brakeFluid)).toMatch(/lever or caliper/);
  }
  // Not sure: the step as the content has it, both fluids and never mix
  expect(bleed.steps.map((_, i) => textOf(bleed.id, i, unsure))).toEqual(bleed.steps);
  expect(bleed.steps.map((_, i) => textOf(bleed.id, i, null))).toEqual(bleed.steps);
  // the check against the lever or caliper stays first
  expect(textOf(bleed.id, 0, mineral)).toBe(bleed.steps[0]);
  const spongy = CARE_TASKS.find((t) => t.id === 'brakes-spongy')!;
  const sp = spongy.steps.map((_, i) => textOf(spongy.id, i, dot)).join(' ');
  expect(sp).toMatch(/DOT fluid/);
  expect(sp).toMatch(/never .*mineral oil/i);
  expect(spongy.steps.map((_, i) => textOf(spongy.id, i, unsure))).toEqual(spongy.steps);
});

test('[BC-STEP-WORDS] electronic gears get the shifting battery instead of the cable\'s barrel adjuster, cable gears the barrel only; not told, both', () => {
  const card = ROAD_CARDS.find((c) => c.id === 'gears-skipping')!;
  const step = card.steps.findIndex((s) => /barrel adjuster/.test(s));
  const electronic = textOf(card.id, step, bike({ shifting: 'electronic' }));
  expect(electronic).toMatch(/shifting battery/);
  expect(electronic).not.toMatch(/barrel|cable gears/i);
  const cable = textOf(card.id, step, bike({ shifting: 'cable' }));
  expect(cable).toMatch(/barrel adjuster/);
  expect(cable).not.toMatch(/battery|electronic/i);
  expect(textOf(card.id, step, bike({}))).toBe(card.steps[step]);
  expect(textOf(card.id, step, bike({ shifting: 'none' }))).toBe(card.steps[step]);
});

test('[BC-STEP-WORDS] every variant belongs to a step that exists and has no banned word; the gears variants are the content\'s own two sentences; each fluid variant names its fluid, says never to mix and, for the bleed, keeps the maker cross-check and the lever or caliper', () => {
  const items = [...CARE_TASKS, ...ROAD_CARDS];
  for (const [id, steps] of Object.entries(STEP_VARIANTS)) {
    const item = items.find((x) => x.id === id);
    expect(item, id).toBeDefined();
    for (const [at, v] of Object.entries(steps)) {
      const original = item!.steps[Number(at)];
      expect(original, `${id} ${at}`).toBeDefined();
      for (const text of Object.values(v.words)) {
        expect(bannedHits(text, false), text).toEqual([]);
        expect(text.trim(), text).toBe(text);
      }
    }
  }
  // the gear card's variants are its own two sentences, cut apart
  const gears = ROAD_CARDS.find((c) => c.id === 'gears-skipping')!;
  for (const text of Object.values(STEP_VARIANTS['gears-skipping']![1]!.words)) expect(gears.steps[1]).toContain(text);
  // the fluid variants: the bike's fluid, never the other, and for the bleed the content's maker cross-check and the lever or caliper
  for (const [id, steps] of Object.entries(STEP_VARIANTS)) {
    for (const v of Object.values(steps)) {
      if (v.by !== 'fluid') continue;
      expect(v.words.mineral, id).toMatch(/details say mineral oil.*never (mix it with )?DOT fluid/);
      expect(v.words.dot, id).toMatch(/details say DOT fluid.*never (mix it with )?mineral oil/);
      if (id === 'brakes-hydraulic-bleed') for (const t of Object.values(v.words)) expect(t).toMatch(/Shimano usually uses mineral oil, SRAM usually DOT fluid.*lever or caliper/);
    }
  }
});

test('[BC-FIT-LINE] the line names what the list is fitted to: the brakes with their kind and fluid, the gears, and every other detail told; nothing told, nothing', () => {
  const line = (b: BikeRecord) => fitWords(careDetails(b), pictureDetails(b).rimBrake, careFluid(b));
  expect(line(bike({ brakes: 'hydraulic-disc', brakeFluid: 'mineral', shifting: 'electronic' }))).toEqual(['hydraulic disc brakes (mineral oil)', 'electronic gears']);
  expect(line(bike({ brakes: 'hydraulic-disc', brakeFluid: 'dot' }))).toEqual(['hydraulic disc brakes (DOT fluid)']);
  expect(line(bike({ brakes: 'hydraulic-disc' }))).toEqual(['hydraulic disc brakes']);
  expect(line(bike({ brakes: 'cable-disc', brakeFluid: 'dot' }))).toEqual(['cable disc brakes']);
  expect(line(bike({ brakes: 'rim', rimBrake: 'caliper' }))).toEqual(['road caliper rim brakes']);
  expect(line(bike({ brakes: 'rim', rimBrake: 'v-brake' }))).toEqual(['V-brakes']);
  expect(line(bike({ brakes: 'rim', rimBrake: 'hydraulic', brakeFluid: 'mineral' }))).toEqual(['hydraulic rim brakes (mineral oil)']);
  expect(line(bike({ brakes: 'rim' }))).toEqual(['rim brakes']);
  expect(line(bike({ brakes: 'other' }))).toEqual(['other brakes']);
  expect(line(bike({ shifting: 'cable' }))).toEqual(['cable gears']);
  expect(line(bike({ shifting: 'none' }))).toEqual(['no gears']);
  expect(line(bike({}))).toEqual([]);
  // every other detail that fits the list is named too, so the line never hides why something is missing
  expect(line(bike({ brakes: 'rim', tyres: 'tubeless', drive: 'belt', shifting: 'cable', suspension: 'front', look: { colour: null, bars: 'flat', ebike: true } })))
    .toEqual(['rim brakes', 'cable gears', 'tubeless tyres', 'a belt drive', 'a suspension fork', 'an e-bike']);
  expect(C.careFitShowing(['hydraulic disc brakes (mineral oil)', 'electronic gears'].join(', '))).toBe('Showing what fits your bike: hydraulic disc brakes (mineral oil), electronic gears.');
  for (const t of [C.careFitShowing('x'), C.careFitAll, C.careFitShowAll, C.careFitMine]) expect(bannedHits(t, false), t).toEqual([]);
});

// Review of PR 129, m1: the line reads true for every gear shifting with every drive. Shifting "No gears" beside a drive with gears is
// never "no gears, a derailleur": a hub or belt bike without a shifter is a single speed, a derailleur says what Shifting is set to.
test('[BC-FIT-LINE] the gears read true for every shifting with every drive: no "no gears" beside gears, a hub with no shifter a single speed', () => {
  const words = (drive: string, shifting: string) => fitWords(careDetails(bike({ drive, shifting })), null, null);
  const want: Record<string, Record<string, string[]>> = {
    derailleur: { cable: ['cable gears', 'a derailleur'], electronic: ['electronic gears', 'a derailleur'], none: ['a derailleur (Shifting set to No gears)'], unknown: ['a derailleur'] },
    'chain-hub': { cable: ['cable gears', 'hub gears'], electronic: ['electronic gears', 'hub gears'], none: ['a single speed'], unknown: ['hub gears or a single speed'] },
    belt: { cable: ['cable gears', 'a belt drive'], electronic: ['electronic gears', 'a belt drive'], none: ['a single-speed belt drive'], unknown: ['a belt drive'] },
    unknown: { cable: ['cable gears'], electronic: ['electronic gears'], none: ['no gears'], unknown: [] },
  };
  for (const [drive, row] of Object.entries(want)) {
    for (const [shifting, expected] of Object.entries(row)) {
      const got = words(drive, shifting);
      expect(got, `${drive} + ${shifting}`).toEqual(expected);
      // "no gears" only ever stands alone, never beside a word for gears
      if (got.includes('no gears')) expect(got.join(' '), `${drive} + ${shifting}`).not.toMatch(/derailleur|hub|belt|single speed/);
    }
  }
});

// ---- The owner's ruling of 14 November 2026: a hydraulic rim brake's spongy lever, and electronic gears' adjusting ----
const fitIds = (b: BikeRecord | null): string[] => fitted(CARE_TASKS, careDetails(b), pictureDetails(b).rimBrake).map((t) => t.id);
const HYDRO_RIM = 'brakes-hydro-rim-spongy';
const E_ADJUST = 'gears-electronic-adjust';

test('[BC-FIT-RIM-KIND] a task for one kind of rim brake shows for that kind and for the kind Not sure (tagged by its kind), never for another kind or other brakes; Show all shows it', () => {
  const task = CARE_TASKS.find((t) => t.id === HYDRO_RIM)!;
  expect(task.applies).toEqual({ brakes: ['rim'] });
  expect(task.rimBrake).toEqual(['hydraulic']);
  expect(fitIds(bike({ brakes: 'rim', rimBrake: 'hydraulic' }))).toContain(HYDRO_RIM);
  for (const rimBrake of ['caliper', 'v-brake']) expect(fitIds(bike({ brakes: 'rim', rimBrake })), rimBrake).not.toContain(HYDRO_RIM);
  for (const brakes of ['hydraulic-disc', 'cable-disc', 'other']) expect(fitIds(bike({ brakes, rimBrake: 'hydraulic' })), brakes).not.toContain(HYDRO_RIM);
  // the kind told: no tag; the kind Not sure, or the brakes Not sure: its brakes tag, which the screen words by the kind
  const tags = (b: BikeRecord | null) => fitted(CARE_TASKS, careDetails(b), pictureDetails(b).rimBrake).find((t) => t.id === HYDRO_RIM)?.tags;
  expect(tags(bike({ brakes: 'rim', rimBrake: 'hydraulic' }))).toEqual([]);
  expect(tags(bike({ brakes: 'rim' }))).toEqual(['brakes']);
  expect(tags(bike({}))).toEqual(['brakes']);
  expect(tags(null)).toEqual(['brakes']);
  // Show all is the list for no bike: it shows, tagged
  expect(fitted(CARE_TASKS, careDetails(null), null).map((t) => t.id)).toContain(HYDRO_RIM);
  // the fit for opening it under Show all follows the kind too: on a V-brake bike it does not fit, so it opens as for no bike
  expect(fitBike(task, careDetails(bike({ brakes: 'rim', rimBrake: 'v-brake' })), 'v-brake').show).toBe(false);
  expect(fitBike(task, careDetails(bike({ brakes: 'rim', rimBrake: 'hydraulic' })), 'hydraulic').show).toBe(true);
  // every other card and task fits as before, whatever the kind of rim brake
  for (const rimBrake of ['caliper', 'v-brake', 'hydraulic', undefined]) {
    const b = bike({ brakes: 'rim', ...(rimBrake ? { rimBrake } : {}) });
    expect(fitIds(b).filter((id) => id !== HYDRO_RIM), String(rimBrake)).toEqual(fitted(CARE_TASKS, careDetails(b)).map((t) => t.id).filter((id) => id !== HYDRO_RIM));
  }
});

test("[BC-HYDRO-RIM-SPONGY] a hydraulic rim brake's spongy lever: pads, leaks, the fluid (Magura rim brakes use mineral oil, never mix), bleed or a shop, never ride until fixed; a told fluid names the bike's own with the Magura cross-check", () => {
  const t = CARE_TASKS.find((x) => x.id === HYDRO_RIM)!;
  expect(t.part).toBe('brakes');
  expect(t.section).toBe('notice');
  expect(t.critical).toBe(true);
  expect(t.who).toBe('shop');
  expect(t.note).toBe('Do not ride until fixed.');
  expect(t.steps).toContain('Bleed the brake, or take it to a shop.');
  expect(t.steps.join(' ')).toMatch(/Magura rim brakes use mineral oil/);
  expect(t.steps.join(' ')).toMatch(/[Nn]ever mix/);
  // review of PR 161, m3: what a leak does on a rim brake: oil on the rim or pads, so clean the rim and replace the pads
  expect(t.steps[1]).toMatch(/leaks; oil on the rim or pads: clean the rim and replace the pads/);
  expect(t.words).toEqual(expect.arrayContaining(['bleed', 'spongy', 'magura']));
  const step = t.steps.findIndex((s) => /Magura/.test(s));
  for (const fluid of ['mineral', 'dot'] as const) {
    const b = bike({ brakes: 'rim', rimBrake: 'hydraulic', brakeFluid: fluid });
    const text = textOf(HYDRO_RIM, step, b);
    if (fluid === 'mineral') {
      expect(text).toMatch(/details say mineral oil: use only mineral oil, never DOT fluid/);
      expect(text).toMatch(/Magura rim brakes use mineral oil: if that does not match your brakes, check the brake's manual/);
    } else {
      // review of PR 161, m2: a told DOT is likelier a slip than a DOT rim brake: the Magura check and the manual come first, and the
      // step never says to use only DOT fluid
      expect(text).toMatch(/details say DOT fluid, but Magura rim brakes use mineral oil: check the brake's manual before any fluid goes in/);
      expect(text).not.toMatch(/use only/);
      expect(text).toMatch(/never mix it with mineral oil/);
    }
    for (const [i, s] of t.steps.entries()) if (i !== step) expect(textOf(HYDRO_RIM, i, b)).toBe(s);
  }
  // not told, or a fluid kept from other brakes: the content's own words
  for (const b of [bike({ brakes: 'rim', rimBrake: 'hydraulic' }), bike({ brakes: 'rim', rimBrake: 'v-brake', brakeFluid: 'dot' }), null]) {
    expect(t.steps.map((s, i) => textOf(HYDRO_RIM, i, b))).toEqual(t.steps);
  }
  for (const s of [t.name, t.signs, ...t.steps, t.tools, t.note!, t.why!]) expect(bannedHits(s, false), s).toEqual([]);
});

test("[BC-E-GEARS-ADJUST] electronic gears' adjusting: the battery first, pairing again, fine-tuning with the maker's app or the shifter buttons, the hanger, a shop; only for derailleur bikes with electronic gears", () => {
  const t = CARE_TASKS.find((x) => x.id === E_ADJUST)!;
  expect(t.part).toBe('gears');
  expect(t.section).toBe('notice');
  expect(t.applies).toEqual({ gears: ['derailleur'], shifting: ['electronic'] });
  expect(t.steps[0]).toMatch(/battery/);
  // review of PR 161, I1: a dead wireless shifter's own coin battery (replaced, not charged) comes before pairing it again
  const shifter = t.steps.find((x) => /wireless shifter/.test(x))!;
  expect(shifter).toMatch(/coin battery you replace, not charge/);
  expect(shifter.search(/battery/)).toBeLessThan(shifter.search(/pair/));
  // I2: the hanger is checked before fine-tuning through every gear (a bent hanger can put the derailleur into the spokes)
  expect(t.steps.findIndex((x) => /hanger/.test(x))).toBeLessThan(t.steps.findIndex((x) => /Fine-tune/.test(x)));
  // m1: the shifter buttons fine-tune only in the maker's adjust mode
  expect(t.steps.find((x) => /Fine-tune/.test(x))).toMatch(/maker's app, or the shifter buttons in its adjust mode \(see its manual\)/);
  expect(t.steps.join(' ')).toMatch(/shop/);
  // no brand's own button steps: the maker's app or manual says how
  expect(t.steps.join(' ')).not.toMatch(/Di2|AXS|Shimano|SRAM|junction|hold the/i);
  expect(t.words).toEqual(expect.arrayContaining(['di2', 'axs', 'adjust gears']));
  expect(fitIds(bike({ drive: 'derailleur', shifting: 'electronic' }))).toContain(E_ADJUST);
  expect(fitIds(bike({ shifting: 'electronic' }))).toContain(E_ADJUST);
  for (const [drive, shifting] of [['derailleur', 'cable'], ['derailleur', 'none'], ['chain-hub', 'electronic'], ['belt', 'electronic']]) {
    expect(fitIds(bike({ drive, shifting })), `${drive} ${shifting}`).not.toContain(E_ADJUST);
  }
  expect(fitIds(null)).toContain(E_ADJUST);
  for (const s of [t.name, t.signs, ...t.steps, t.tools]) expect(bannedHits(s, false), s).toEqual([]);
});
