// Bike care's content (sub-project 12, Task 4 and Task 5, the full list): every field of design 3.2, the critical flag, a
// source for every task, and the sources kept out of the app.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { SOURCES } from '../../../../src/core/care/sources.ts';
import type { CareKey, CareValue } from '../../../../src/core/care/types.ts';
import { careDetails, fitted, softTag } from '../../../../src/core/care/fit.ts';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import { C, CARE_TASKS, PARTS, ROAD_CARDS, SECTIONS, WHO_LABEL } from '../../../../src/core/wording/en-care.ts';
import { DRAFT_FIGURES, SETTLED_RANGES } from './draft-figures.ts';
import type { Figure } from './draft-figures.ts';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
/** The Frame & bolts tasks on the steerer, stem or bar bolts (design 3.5: "if unsure, a shop"), from the content draft's ids. */
const CRITICAL_FRAME = ['frame-bolts-check', 'frame-headset-check', 'frame-torque-check', 'frame-creak'];
const VALUES: { [K in CareKey]: readonly CareValue[K][] } = {
  brakes: ['rim', 'cable-disc', 'hydraulic-disc'], tyres: ['tubes', 'tubeless'], drive: ['chain', 'belt'], gears: ['derailleur', 'hub'],
  shifting: ['cable', 'electronic'], suspension: ['none', 'front', 'full'], ebike: ['yes', 'no'],
};
const ROAD_IDS = ROAD_CARDS.map((c) => c.id);
const filled = (s: unknown): boolean => typeof s === 'string' && s.trim().length > 0 && s.trim() === s;

test('[BC-CONTENT] every task has every field of design 3.2 filled; 3 to 6 steps; minutes low <= high; ids unique; parts and sections valid', () => {
  expect(CARE_TASKS.length).toBe(48);
  const ids = CARE_TASKS.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const t of CARE_TASKS) {
    expect(t.id, t.id).toMatch(/^[a-z]+(-[a-z0-9]+)+$/);
    for (const f of [t.name, t.signs, t.tools]) expect(filled(f), `${t.id}: ${f}`).toBe(true);
    expect(PARTS, t.id).toContain(t.part);
    expect(SECTIONS, t.id).toContain(t.section);
    expect(typeof t.alsoWet, t.id).toBe('boolean');
    expect(t.steps.length, t.id).toBeGreaterThanOrEqual(3);
    expect(t.steps.length, t.id).toBeLessThanOrEqual(6);
    for (const s of t.steps) expect(filled(s), `${t.id}: ${s}`).toBe(true);
    if (t.minutes !== null) {
      const [low, high] = t.minutes;
      expect(Number.isInteger(low) && low > 0, t.id).toBe(true);
      expect(low, t.id).toBeLessThanOrEqual(high);
    }
    expect(['you', 'shop', 'you-check'], t.id).toContain(t.who);
    expect(t.why === null || filled(t.why), t.id).toBe(true);
    expect(t.note === null || filled(t.note), t.id).toBe(true);
    // a shop job says why (design 3.1: "with the reason when it is a shop job")
    if (t.who === 'shop') expect(t.why, t.id).not.toBeNull();
    expect(t.words.length, t.id).toBeGreaterThan(0);
    for (const w of t.words) expect(filled(w) && w === w.toLowerCase(), `${t.id}: ${w}`).toBe(true);
    for (const [key, values] of Object.entries(t.applies)) {
      expect(Object.keys(VALUES), t.id).toContain(key);
      expect((values as string[]).length, t.id).toBeGreaterThan(0);
      for (const v of values as string[]) expect(VALUES[key as CareKey] as readonly string[], `${t.id} ${key}`).toContain(v);
    }
  }
});

test('[BC-CONTENT] every brakes and wheels task, and each steerer, stem and bar-bolt task, is critical; the screen alone says "If unsure, a shop."', () => {
  for (const t of CARE_TASKS) {
    if (t.part === 'brakes' || t.part === 'wheels' || CRITICAL_FRAME.includes(t.id)) expect(t.critical, t.id).toBe(true);
    for (const text of [t.name, t.signs, t.tools, t.why ?? '', t.note ?? '', ...t.steps]) {
      expect(text, t.id).not.toMatch(/if unsure, a shop/i);
      // the draft's provenance marks and disagreements stay with the sources
      expect(text, t.id).not.toMatch(/\(book|book p\.|Disagree:|no source found|S\d+\b/);
    }
  }
  expect(CARE_TASKS.some((t) => CRITICAL_FRAME.includes(t.id))).toBe(true);
});

test('[BC-CONTENT] every task has a sources entry, with a link or a note, and nothing else is listed', () => {
  for (const t of CARE_TASKS) {
    const entry = SOURCES[t.id];
    expect(entry, t.id).toBeDefined();
    expect(entry!.urls.length > 0 || filled(entry!.note), t.id).toBe(true);
    for (const url of entry!.urls) expect(url, t.id).toMatch(/^https:\/\/[^\s]+$/);
  }
  // the cards and carry items (sub-project 12 group 3) have entries too: road-content.test.ts pins them
  expect(Object.keys(SOURCES).filter((k) => !k.startsWith('carry-') && !ROAD_IDS.includes(k)).sort()).toEqual(CARE_TASKS.map((t) => t.id).sort());
});

const sourceFiles = (dir: string): string[] =>
  readdirSync(join(REPO, dir), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    .map((e) => relative(REPO, join(e.parentPath, e.name)).split(sep).join('/'));

test('[BC-SOURCES-PRIVATE] no file under src/tools or src/ui imports src/core/care/sources.ts, nor anything else in src', () => {
  const all = sourceFiles('src');
  expect(all.length).toBeGreaterThan(50);
  for (const f of all) expect(readFileSync(join(REPO, f), 'utf8'), f).not.toMatch(/care\/sources(\.ts)?['"]/);
  expect(all.filter((f) => f.startsWith('src/tools/care/')).length).toBeGreaterThan(0);
});

/** Everything a rider can read of a task once it is open. */
type Task = (typeof CARE_TASKS)[number];
const fieldText = (t: Task, fig: Figure): string => {
  switch (fig.field) {
    case 'name': return t.name;
    case 'signs': return t.signs;
    case 'step': return t.steps[fig.index!] ?? '';
    case 'tools': return t.tools;
    case 'time': return t.minutes ? C.careTime(t.minutes[0], t.minutes[1]) : '';
    case 'note': return t.note ?? '';
    case 'who': return t.why ?? WHO_LABEL[t.who];
  }
};
const riderText = (t: Task): string => [t.name, t.signs, ...t.steps, t.tools, t.minutes ? C.careTime(t.minutes[0], t.minutes[1]) : '', t.note ?? '', t.why ?? WHO_LABEL[t.who]].join('\n').toLowerCase();
/** The draft's figures a task does not show in their own field, and the settled ranges it shows anywhere. */
const missing = (t: Task): string[] => [
  ...(DRAFT_FIGURES[t.id] ?? []).filter((fig) => !fieldText(t, fig).toLowerCase().includes(fig.text.toLowerCase())).map((fig) => `${fig.field}${fig.index ?? ''}: ${fig.text}`),
  ...(SETTLED_RANGES[t.id] ?? []).filter((r) => riderText(t).includes(r)).map((r) => `range: ${r}`),
];

test("[BC-CONTENT] every task's rider-visible text holds each key sentence and figure of its draft row, in the field it belongs to; a settled range never shows (review of PR 58, I1-I3, R2)", () => {
  for (const t of CARE_TASKS) {
    expect(DRAFT_FIGURES[t.id], `${t.id} has no draft figures`).toBeDefined();
    expect(missing(t), t.id).toEqual([]);
  }
});

test('[BC-CONTENT] the figure check is pinned to its field: a step changed to "about 1 mm" fails though the signs still say 1.5 mm; a settled range fails anywhere', () => {
  const disc = CARE_TASKS.find((t) => t.id === 'brakes-pads-disc')!;
  const changed = { ...disc, steps: disc.steps.map((s, i) => (i === 1 ? s.replace('about 1.5 mm', 'about 1 mm') : s)) };
  expect(changed.signs).toContain('about 1.5 mm');
  expect(missing(changed)).toEqual(['step1: about 1.5 mm']);
  const fork = CARE_TASKS.find((t) => t.id === 'susp-fork-service')!;
  expect(missing({ ...fork, note: 'Several hours (some say 100-125 h).' })).toEqual(['range: 100-125']);
});

test('[BC-CONTENT] hub gear oil shows on every chain-hub or belt bike; with shifting none or Not sure it is tagged "If your hub has gears" (the coordinator ruled R3)', () => {
  const hub = (extra: Record<string, unknown>) => {
    const d = careDetails(normaliseBike({ id: 'b1', ...extra }));
    const t = fitted(CARE_TASKS, d).find((x) => x.id === 'gears-hub-oil');
    return t ? { tags: t.tags, soft: softTag(t, d) } : null;
  };
  expect(hub({ drive: 'chain-hub', shifting: 'none' })).toEqual({ tags: [], soft: 'If your hub has gears' });
  expect(hub({ drive: 'belt', shifting: 'none' })).toEqual({ tags: [], soft: 'If your hub has gears' });
  expect(hub({ drive: 'chain-hub' })).toEqual({ tags: [], soft: 'If your hub has gears' });
  expect(hub({ drive: 'chain-hub', shifting: 'cable' })).toEqual({ tags: [], soft: null });
  expect(hub({ drive: 'belt', shifting: 'electronic' })).toEqual({ tags: [], soft: null });
  expect(hub({ drive: 'derailleur', shifting: 'cable' })).toBeNull();
  expect(hub({ drive: 'derailleur', shifting: 'none' })).toBeNull();
  // every other task has no soft tag, whatever the bike
  for (const t of CARE_TASKS.filter((x) => x.id !== 'gears-hub-oil')) expect(softTag(t, careDetails(null)), t.id).toBeNull();
});

// ---- Group 2, Task 5: the full list ----
/** The draft's 49 Care rows in the app's order, less the one row the owner's rules cut. */
const FULL_IDS = [
  'brakes-lever-test', 'susp-wipe-stanchions', 'ebike-charge-indoors',
  'frame-wash', 'chain-dry-lube', 'belt-rinse', 'brakes-rotor-wipe', 'brakes-rim-wipe', 'ebike-dry-contacts',
  'tyres-pressure', 'gears-shift-test', 'chain-wear-check', 'brakes-pads-disc', 'brakes-pads-rim', 'wheels-spokes-check', 'frame-bolts-check',
  'gears-electronic-battery', 'frame-headset-check', 'gears-cables-look',
  'chain-lube', 'tyres-sealant-check', 'belt-inspect', 'ebike-battery-care', 'susp-air-pressure', 'gears-cassette-wear', 'wheels-hubs-check',
  'brakes-rotor-thickness',
  'tyres-sealant-topup', 'susp-lowers-service', 'gears-hub-oil', 'gears-cables-replace', 'susp-fork-service', 'susp-shock-service', 'ebike-service',
  'brakes-cable-disc-service', 'belt-tension', 'frame-torque-check', 'wheels-true-tension', 'chain-deep-clean',
  'brakes-hydraulic-bleed', 'brakes-squeal', 'brakes-spongy', 'chain-replace', 'gears-indexing', 'wheels-wobble', 'tyres-replace', 'frame-creak',
  'ebike-range-drop',
];

test("[BC-CONTENT] the full list holds the draft's Care tasks in its order, 48 of the 49: chain-wipe is cut (owner, 7 Nov: no source for a wipe after every ride)", () => {
  expect(CARE_TASKS.map((t) => t.id)).toEqual(FULL_IDS);
  expect(CARE_TASKS.map((t) => t.id)).not.toContain('chain-wipe');
  // the list is sorted by section, as the screen shows it
  const order = CARE_TASKS.map((t) => SECTIONS.indexOf(t.section));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  for (const t of CARE_TASKS) {
    expect(DRAFT_FIGURES[t.id], `${t.id} has figures`).toBeDefined();
    expect(DRAFT_FIGURES[t.id]!.length, `${t.id} pins at least one figure`).toBeGreaterThan(0);
  }
  expect(Object.keys(DRAFT_FIGURES).sort()).toEqual([...FULL_IDS].sort());
});

test('[BC-PARTS] every part filter has at least one task, and every section has at least one task', () => {
  for (const p of PARTS) expect(CARE_TASKS.some((t) => t.part === p), p).toBe(true);
  for (const s of SECTIONS) expect(CARE_TASKS.some((t) => t.section === s), s).toBe(true);
});

/** Everything a rider reads of a task. */
const readable = (t: Task): string[] => [t.name, t.signs, t.tools, t.why ?? '', t.note ?? '', ...t.steps, t.soft?.tag ?? ''];

test('[BC-CONTENT] the word "snug" appears nowhere in a task, its words or its sources (owner, 7 Nov)', () => {
  for (const t of CARE_TASKS) {
    expect([...readable(t), ...t.words].join(' '), t.id).not.toMatch(/snug/i);
    expect(JSON.stringify(SOURCES[t.id]), t.id).not.toMatch(/snug/i);
  }
});

test("[BC-CONTENT] every quick release is named the brake's or the wheel's (a \"wheel quick release\" counts as the wheel's)", () => {
  let seen = 0;
  for (const t of CARE_TASKS) for (const text of readable(t)) {
    for (const m of text.matchAll(/quick releases?/gi)) {
      seen += 1;
      expect(text.slice(Math.max(0, m.index! - 8), m.index!), `${t.id}: ${text}`).toMatch(/(brake's |wheel's |wheel )$/i);
    }
  }
  expect(seen).toBeGreaterThanOrEqual(2);
});

test('[BC-CONTENT] bolts on brakes, steerer, stem and bar use the torque rule or the twist test; carbon parts never go without a torque wrench (book p. 40)', () => {
  const rule = /torque|twist test|no longer moves/i;
  let seen = 0;
  for (const t of CARE_TASKS) {
    for (const step of t.steps) {
      // a step that tightens or re-torques a brake, steerer, stem, bar or seatpost bolt
      if (/(tighten|torque|re-torque)/i.test(step) && /(brake|caliper|steerer|stem|handlebar|\bbar\b|seatpost)/i.test(step)) {
        seen += 1;
        expect(step, `${t.id}: ${step}`).toMatch(rule);
      }
      // carbon: a torque wrench is named wherever bolts or twisting come up
      if (/carbon/i.test(step) && /(bolt|torque|twist|wrench)/i.test(step)) expect(step, `${t.id}: ${step}`).toMatch(/torque wrench/i);
    }
  }
  expect(seen).toBeGreaterThanOrEqual(4);
  // the cable disc brake's caliper goes to its printed torque, as the roadside card's does
  const cable = CARE_TASKS.find((t) => t.id === 'brakes-cable-disc-service')!;
  expect(cable.steps.join(' ')).toContain('tighten the bolts to the torque printed on the caliper. Without a torque wrench, tighten them evenly until the caliper no longer moves.');
  expect(cable.tools).toContain('torque wrench');
  for (const id of ['frame-torque-check', 'frame-creak']) {
    expect(CARE_TASKS.find((t) => t.id === id)!.steps.join(' '), id).toMatch(/Carbon parts: never without a torque wrench/);
  }
});

test("[BC-CONTENT] steps with no source are cut, never guessed: no \"common sources\" claim on the creak, no yearly interval on the bleed, no evenness check on the brake test (owner's rules, 7 Nov)", () => {
  const creak = CARE_TASKS.find((t) => t.id === 'frame-creak')!;
  expect(readable(creak).join(' ')).not.toMatch(/common source/i);
  const bleed = CARE_TASKS.find((t) => t.id === 'brakes-hydraulic-bleed')!;
  expect(bleed.section).toBe('notice');
  expect(readable(bleed).join(' ')).not.toMatch(/1-2 years|every year|yearly/i);
  const lever = CARE_TASKS.find((t) => t.id === 'brakes-lever-test')!;
  expect(lever.steps.join(' ')).not.toMatch(/slows evenly/i);
  expect(lever.steps.length).toBeGreaterThanOrEqual(3);
});

test("[BC-CONTENT] the rear shock: a rider's check every 20 riding hours, the full service at a shop; Fox about 100 h, never the 100-125 range (owner, 7 Nov)", () => {
  const shock = CARE_TASKS.find((t) => t.id === 'susp-shock-service')!;
  expect(shock.who).toBe('shop');
  expect(shock.steps[0]).toMatch(/check/i);
  expect(shock.steps[0]).toContain('every 20 riding hours');
  expect(shock.steps[0]).not.toMatch(/service/i);
  expect(riderText(shock)).not.toContain('100-125');
  expect(shock.steps.join(' ')).toContain('Fox: about 100 h.');
});

test('[BC-CONTENT] the cable tasks follow decision 4: shifting "none" hides them, Not sure tags them (R3 of the PR 58 re-check, pinned)', () => {
  const ids = (extra: Record<string, unknown>) => fitted(CARE_TASKS, careDetails(normaliseBike({ id: 'b1', ...extra }))).map((t) => t.id);
  expect(ids({ drive: 'derailleur', shifting: 'cable' })).toEqual(expect.arrayContaining(['gears-cables-look', 'gears-cables-replace', 'gears-indexing']));
  for (const id of ['gears-cables-look', 'gears-cables-replace', 'gears-indexing']) expect(ids({ drive: 'derailleur', shifting: 'none' }), id).not.toContain(id);
  expect(fitted(CARE_TASKS, careDetails(null)).find((t) => t.id === 'gears-cables-look')!.tags).toEqual(['shifting']);
  expect(ids({ drive: 'derailleur', shifting: 'electronic' })).not.toContain('gears-cables-look');
});

test('[BC-CONTENT] only brakes, wheels and the four steerer, stem and bar-bolt tasks are critical; every shop task gives its reason', () => {
  const critical = CARE_TASKS.filter((t) => t.critical).map((t) => t.id);
  for (const id of ['brakes-lever-test', 'brakes-hydraulic-bleed', 'brakes-squeal', 'brakes-spongy', 'wheels-hubs-check', 'wheels-true-tension', 'wheels-wobble', 'frame-headset-check', 'frame-torque-check', 'frame-creak']) {
    expect(critical, id).toContain(id);
  }
  for (const t of CARE_TASKS.filter((x) => x.critical)) expect(t.part === 'brakes' || t.part === 'wheels' || CRITICAL_FRAME.includes(t.id), t.id).toBe(true);
  for (const t of CARE_TASKS.filter((x) => x.who === 'shop')) expect(t.why, t.id).not.toBeNull();
});
