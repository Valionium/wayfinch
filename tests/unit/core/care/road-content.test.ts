// Roadside repairs and What to carry (sub-project 12, Tasks 6 and 7): every card has every field of design 3.4, the draft's figures
// reach riders in the field they belong to, no step that could hurt a rider, a source for every card and item, and the search finds
// cards in every form of a word as it finds the plain word.
import { expect, test } from 'vitest';
import { careDetails, fitOf } from '../../../../src/core/care/fit.ts';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import { searchCare } from '../../../../src/core/care/search.ts';
import { SOURCES } from '../../../../src/core/care/sources.ts';
import type { CareKey, CareValue, RoadCard } from '../../../../src/core/care/types.ts';
import { CARE_TASKS, CARRY, PART_LABEL, PARTS, ROAD_CARDS } from '../../../../src/core/wording/en-care.ts';
import { CARRY_NAMES, ROAD_CARRY, ROAD_FIGURES, ROAD_STEP_COUNTS } from './road-figures.ts';
import type { RoadFigure } from './road-figures.ts';

const VALUES: { [K in CareKey]: readonly CareValue[K][] } = {
  brakes: ['rim', 'cable-disc', 'hydraulic-disc'], tyres: ['tubes', 'tubeless'], drive: ['chain', 'belt'], gears: ['derailleur', 'hub'],
  shifting: ['cable', 'electronic'], suspension: ['none', 'front', 'full'], ebike: ['yes', 'no'],
};
const filled = (s: unknown): boolean => typeof s === 'string' && s.trim().length > 0 && s.trim() === s;
/** The cards on a brakes part, the wheels, and the steerer, stem and bar bolts: "If unsure, a shop." (decision 5). */
const CRITICAL_CARDS = ['spoke-snapped', 'brake-rub-rim', 'brake-rub-disc', 'brake-weak-rim', 'brake-weak-disc', 'bolt-loose'];

test('[BC-ROAD] the draft has 12 cards, each with every field of design 3.4 filled; 3 to 7 steps; unique ids; valid parts and conditions', () => {
  expect(ROAD_CARDS.map((c) => c.id)).toEqual(Object.keys(ROAD_FIGURES));
  expect(new Set(ROAD_CARDS.map((c) => c.id)).size).toBe(12);
  for (const c of ROAD_CARDS) {
    expect(c.id, c.id).toMatch(/^[a-z]+(-[a-z]+)+$/);
    for (const text of [c.problem, c.checkFirst, c.rideOn]) expect(filled(text), `${c.id}: ${text}`).toBe(true);
    expect(PARTS, c.id).toContain(c.part);
    expect(c.steps.length, c.id).toBeGreaterThanOrEqual(3);
    expect(c.steps.length, c.id).toBeLessThanOrEqual(7);
    expect(c.steps.length, `${c.id} keeps the draft's steps`).toBe(ROAD_STEP_COUNTS[c.id]);
    for (const s of c.steps) expect(filled(s), `${c.id}: ${s}`).toBe(true);
    expect(c.carry.length, c.id).toBeGreaterThan(0);
    expect(c.words.length, c.id).toBeGreaterThan(0);
    for (const w of c.words) expect(filled(w) && w === w.toLowerCase(), `${c.id}: ${w}`).toBe(true);
    for (const [key, values] of Object.entries(c.applies)) {
      expect(Object.keys(VALUES), c.id).toContain(key);
      expect((values as string[]).length, c.id).toBeGreaterThan(0);
      for (const v of values as string[]) expect(VALUES[key as CareKey] as readonly string[], `${c.id} ${key}`).toContain(v);
    }
  }
});

test('[BC-ROAD] every card\'s carry ids exist in CARRY and match the draft; every carry item is used by a card', () => {
  const ids = CARRY.map((c) => c.id);
  for (const c of ROAD_CARDS) {
    for (const id of c.carry) expect(ids, `${c.id}: ${id}`).toContain(id);
    expect(c.carry, c.id).toEqual(ROAD_CARRY[c.id]);
  }
  for (const id of ids) expect(ROAD_CARDS.some((c) => c.carry.includes(id)), id).toBe(true);
});

test('[BC-ROAD] brakes, wheels and bolt cards are critical, no other is; the screen alone says "If unsure, a shop." and no provenance mark is in the text', () => {
  expect(ROAD_CARDS.filter((c) => c.critical).map((c) => c.id).sort()).toEqual([...CRITICAL_CARDS].sort());
  for (const c of ROAD_CARDS) {
    if (c.part === 'brakes') expect(c.critical, c.id).toBe(true);
    for (const text of [c.problem, c.checkFirst, c.rideOn, ...c.steps, ...c.words]) {
      expect(text, c.id).not.toMatch(/(^|[.!?] )If unsure, a shop./);
      expect(text, c.id).not.toMatch(/\(book|book p\.|Disagree:|no source found|\bS\d+\b/);
    }
  }
});

test('[BC-ROAD] "Ride on?" stands in for "safe to ride on": every card has an answer, and the ones that fail ask for a stop or a walk', () => {
  for (const c of ROAD_CARDS) expect(c.rideOn, c.id).toMatch(/\b(stop|walk)\b/i);
  const ebike = ROAD_CARDS.find((c) => c.id === 'ebike-no-power')!;
  expect(ebike.rideOn).toContain('Stop if the motor smells hot');
});

/** Where the draft's figure must be found: its own field of the card. */
const cardField = (c: RoadCard, fig: RoadFigure): string => {
  switch (fig.field) {
    case 'problem': return c.problem;
    case 'checkFirst': return c.checkFirst;
    case 'rideOn': return c.rideOn;
    case 'step': return c.steps[fig.index!] ?? '';
  }
};
const cardMissing = (c: RoadCard): string[] =>
  (ROAD_FIGURES[c.id] ?? []).filter((fig) => !cardField(c, fig).toLowerCase().includes(fig.text.toLowerCase())).map((fig) => `${fig.field}${fig.index ?? ''}: ${fig.text}`);

test('[BC-ROAD] every card holds each key sentence and figure of its draft row, in the field it belongs to (as PR 58 re-check R2)', () => {
  for (const c of ROAD_CARDS) {
    expect(ROAD_FIGURES[c.id], `${c.id} has no draft figures`).toBeDefined();
    expect(cardMissing(c), c.id).toEqual([]);
  }
});

test('[BC-ROAD] the figure check is pinned to its field: a figure moved to another field fails', () => {
  const card = ROAD_CARDS.find((c) => c.id === 'puncture-tube')!;
  // "Stop if the tyre has a cut or bulge" moved into the first step: its own field no longer holds it
  const moved = { ...card, rideOn: 'Fine if it holds air.', steps: card.steps.map((s, i) => (i === 0 ? `${s} Stop if the tyre has a cut or bulge.` : s)) };
  expect(cardMissing(moved)).toEqual(['rideOn: Stop if the tyre has a cut or bulge']);
  const rub = ROAD_CARDS.find((c) => c.id === 'brake-rub-rim')!;
  expect(cardMissing({ ...rub, steps: rub.steps.map((s, i) => (i === 4 ? 'Open the quick release and ride.' : s)) })).toEqual(["step4: Open the brake's quick release only if you must and ride slowly", 'step4: Until you close it again, this brake works much less: ride slowly and use the other brake.']);
});

test('[BC-ROAD] nothing that could hurt a rider: no flame, solvent, penetrating oil, forcing a wheel straight, or a lever used as a tyre lever', () => {
  const hazards = /\b(flame|burn(ing|t)?|lighter|solvent|degreaser|spirit|penetrating|petrol|white spirit|straighten|hammer)\b|force (it|the|a)\b|hit (it|the) .*ground|quick.release (lever )?(as|for) (a )?(tyre )?lever/i;
  for (const c of ROAD_CARDS) for (const text of [c.problem, c.checkFirst, c.rideOn, ...c.steps, ...c.words]) expect(text, c.id).not.toMatch(hazards);
  for (const c of CARRY) expect(c.name, c.id).not.toMatch(hazards);
  // the unsourced centring-screw detail is cut (decision 6): the draft's "no source found"
  expect(ROAD_CARDS.find((c) => c.id === 'brake-rub-rim')!.steps.join(' ')).not.toMatch(/centring screw/i);
});

test('[BC-CARRY] the draft\'s carry items, in its order and words; the clean cloth is back (PR 59 review I3); ids start "carry-" and are unique', () => {
  expect(CARRY.map((c) => [c.id, c.name])).toEqual(CARRY_NAMES);
  expect(new Set(CARRY.map((c) => c.id)).size).toBe(CARRY.length);
  expect(CARRY.filter((c) => /cloth|rag/i.test(c.name)).map((c) => c.id)).toEqual(['carry-cloth']);
});

test('[BC-CARRY] each item\'s conditions are the draft\'s: tubes and tubeless carry a spare tube, only tubes a patch kit, only tubeless plugs and a knife, chain bikes a quick link and chain tool, e-bikes a charger', () => {
  const applies = Object.fromEntries(CARRY.map((c) => [c.id, c.applies]));
  expect(applies).toEqual({
    'carry-spare-tube': { tyres: ['tubes', 'tubeless'] }, 'carry-tyre-levers': {}, 'carry-pump': {}, 'carry-patch-kit': { tyres: ['tubes'] },
    'carry-plug-kit': { tyres: ['tubeless'] }, 'carry-knife': { tyres: ['tubeless'] }, 'carry-tyre-boot': {}, 'carry-quick-link': { drive: ['chain'] },
    'carry-chain-tool': { drive: ['chain'] }, 'carry-multi-tool': {}, 'carry-zip-ties': {}, 'carry-spoke-key': {}, 'carry-cloth': {}, 'carry-charger': { ebike: ['yes'] },
  });
});

const allText = (c: RoadCard): string[] => [c.problem, c.checkFirst, ...c.steps, c.rideOn];

test('[BC-ROAD] no card says "quick release" without "brake\'s" or "wheel\'s" before it (review of PR 59, C1)', () => {
  let seen = 0;
  for (const c of ROAD_CARDS) for (const t of allText(c)) {
    for (const m of t.matchAll(/quick release/gi)) {
      seen += 1;
      expect(t.slice(Math.max(0, m.index! - 8), m.index!), c.id + ': ' + t).toMatch(/(brake|wheel)'s $/i);
    }
  }
  expect(seen).toBeGreaterThanOrEqual(5);
});

test("[BC-ROAD] every card that opens the brake's quick release says it works much less until closed, and has a step to close it again (review of PR 59, I1)", () => {
  const opening = ROAD_CARDS.filter((c) => c.steps.some((s) => /open the brake's quick release/i.test(s)));
  expect(opening.map((c) => c.id)).toEqual(['spoke-snapped', 'brake-rub-rim']);
  for (const c of opening) {
    const i = c.steps.findIndex((s) => /open the brake's quick release/i.test(s));
    expect(c.steps[i], c.id).toContain('Until you close it again, this brake works much less: ride slowly and use the other brake.');
    expect(c.steps.at(-1), c.id).toMatch(/close the brake's quick release once the wheel is fixed./i);
  }
  const spoke = ROAD_CARDS.find((c) => c.id === 'spoke-snapped')!;
  // rim brakes only: disc riders get their own step, and no step tells everybody to open a brake release
  expect(spoke.steps.filter((s) => /quick release/i.test(s)).every((s) => /^Rim brakes:/.test(s))).toBe(true);
  expect(spoke.steps.some((s) => s.startsWith('Disc brakes: check the wheel turns without touching the brake'))).toBe(true);
});

test('[BC-ROAD] a step that wipes names a cloth the card carries; the disc card never touches the disc with fingers (review of PR 59, I3)', () => {
  const wiping = ROAD_CARDS.filter((c) => c.steps.some((s) => /\bwipe\b/i.test(s)));
  expect(wiping.map((c) => c.id)).toEqual(['brake-weak-rim', 'brake-weak-disc', 'ebike-no-power']);
  for (const c of wiping) expect(c.carry, c.id).toContain('carry-cloth');
  expect(ROAD_CARDS.find((c) => c.id === 'brake-weak-disc')!.steps.join(' ')).toContain('Never touch the disc or pads with your fingers');
});

test('[BC-ROAD] bolt-loose puts the carbon warning first, and tightens only to the printed torque; no unsourced feel-based instruction (review of PR 59, I4)', () => {
  const steps = ROAD_CARDS.find((c) => c.id === 'bolt-loose')!.steps;
  const carbon = steps.findIndex((s) => /carbon/i.test(s));
  const tighten = steps.findIndex((s) => /tighten/i.test(s));
  expect(carbon).toBe(0);
  expect(carbon).toBeLessThan(tighten);
  expect(steps.join(' ')).not.toMatch(/until firm|not forced/i);
});

test("[BC-ROAD] a tubeless tyre's spare tube needs the whole tubeless valve out, not only its core (review of PR 59, I2)", () => {
  const steps = ROAD_CARDS.find((c) => c.id === 'puncture-tubeless')!.steps.join(' ');
  expect(steps).toContain('remove the tubeless valve');
  expect(steps).not.toMatch(/valve core/i);
});

test("[BC-ROAD] the torn-tyre card is hidden on tubular bikes, and each fitted card's carry items all fit the same bike (review of PR 59, M2)", () => {
  const tyres = ['unknown', 'tubes', 'tubeless', 'other'];
  const drives = ['unknown', 'derailleur', 'chain-hub', 'belt'];
  let checked = 0;
  for (const t of tyres) for (const d of drives) for (const ebike of [null, true, false]) for (const brakes of ['unknown', 'rim', 'hydraulic-disc', 'other']) {
    const details = careDetails(normaliseBike({ id: 'b1', tyres: t, drive: d, brakes, ...(ebike === null ? {} : { look: { colour: null, bars: null, ebike } }) }));
    const fits = (applies: RoadCard['applies']) => fitOf(applies, details).show;
    if (t === 'other') expect(ROAD_CARDS.filter((c) => fits(c.applies)).map((c) => c.id)).not.toContain('tyre-torn');
    for (const c of ROAD_CARDS.filter((x) => fits(x.applies))) {
      for (const id of c.carry) { expect(fits(CARRY.find((x) => x.id === id)!.applies), c.id + ' ' + id + ' ' + t + ' ' + d).toBe(true); checked += 1; }
    }
  }
  expect(checked).toBeGreaterThan(1000);
});

test('[BC-ROAD] every card and carry item has a sources entry (a link or a note); the entries are the tasks, the cards and the items, nothing else', () => {
  for (const id of [...ROAD_CARDS.map((c) => c.id), ...CARRY.map((c) => c.id)]) {
    const entry = SOURCES[id];
    expect(entry, id).toBeDefined();
    expect(entry!.urls.length > 0 || filled(entry!.note), id).toBe(true);
    for (const url of entry!.urls) expect(url, id).toMatch(/^https:\/\/[^\s]+$/);
  }
  expect(Object.keys(SOURCES).sort()).toEqual([...CARE_TASKS.map((t) => t.id), ...ROAD_CARDS.map((c) => c.id), ...CARRY.map((c) => c.id)].sort());
});

// ---- search ----
const text = (c: RoadCard): string[] => [c.problem, PART_LABEL[c.part], ...c.words];
const find = (q: string): string[] => searchCare(q, ROAD_CARDS, text).map((c) => c.id);

test('[BC-ROAD-SEARCH] "puncture" finds both puncture cards, and nothing else; the cards\' words find them', () => {
  expect(find('puncture')).toEqual(['puncture-tube', 'puncture-tubeless']);
  expect(find('flat')).toEqual(['puncture-tube', 'puncture-tubeless']);
  expect(find('snapped')).toContain('chain-broken');
  expect(find('rattle')).toEqual(['bolt-loose']);
  expect(find('hissing')).toEqual(['puncture-tubeless']);
  expect(find('zzz')).toEqual([]);
});

test('[BC-ROAD-SEARCH] "no brakes" lists the brake-failure cards first, in the content\'s order, and not the rubbing card that only has "noisy" (review of PR 59, M3)', () => {
  expect(find('no brakes')).toEqual(['brake-weak-rim', 'brake-weak-disc']);
  expect(find('no brake')).toEqual(['brake-weak-rim', 'brake-weak-disc']);
  // a short word still finds by its start when it is the one being typed
  expect(find('noi')).toContain('brake-rub-disc');
  expect(find('no')).toContain('brake-weak-rim');
  expect(find('brakes')[0]).toBe('brake-rub-rim');
});

test('[BC-ROAD-SEARCH] every form of a word finds what its plain word finds on the cards (review of PR 58, R1)', () => {
  const pairs: [string, string][] = [
    ['punctures', 'puncture'], ['Punctured', 'puncture'], ['  PUNCTURE ', 'puncture'], ['puncturé', 'puncture'], ['flats', 'flat'], ['flatted', 'flat'],
    ['rubbing', 'rub'], ['rubbed', 'rub'], ['rubs', 'rub'], ['skipping', 'skip'], ['skips', 'skip'], ['slips', 'slip'], ['slipping', 'slip'],
    ['spokes', 'spoke'], ['batteries', 'battery'], ['brakes', 'brake'], ['jumping', 'jump'], ['jumps', 'jump'], ['fading', 'fade'], ['fades', 'fade'],
    ['leaking', 'leak'], ['leaks', 'leak'], ['bulging', 'bulge'], ['bulges', 'bulge'], ['tubes', 'tube'], ['patches', 'patch'], ['patching', 'patch'],
    ['rattling', 'rattle'], ['rattles', 'rattle'], ['hissing', 'hiss'], ['plugs', 'plug'], ['plugged', 'plug'], ['bolts', 'bolt'], ['cuts', 'cut'],
  ];
  for (const [form, base] of pairs) {
    expect(find(base).length, `${base} finds a card (two empty results prove nothing)`).toBeGreaterThan(0);
    expect(find(form), `${form} / ${base}`).toEqual(find(base));
  }
  // and not more: a short stem never start-matches
  expect(find('spring')).toEqual([]);
  expect(find('shoes')).toEqual([]);
});
