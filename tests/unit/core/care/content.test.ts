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
  'brakes-lever-test', 'ebike-charge-indoors',
  'frame-wash', 'chain-dry-lube', 'belt-rinse', 'brakes-rotor-wipe', 'brakes-rim-wipe', 'ebike-dry-contacts',
  'tyres-pressure', 'gears-shift-test', 'chain-wear-check', 'brakes-pads-disc', 'brakes-pads-rim', 'wheels-spokes-check', 'frame-bolts-check',
  'gears-electronic-battery', 'frame-headset-check', 'gears-cables-look',
  'chain-lube', 'tyres-sealant-check', 'belt-inspect', 'ebike-battery-care', 'susp-wipe-stanchions', 'susp-air-pressure', 'gears-cassette-wear', 'wheels-hubs-check',
  'brakes-rotor-thickness',
  'tyres-sealant-topup', 'susp-lowers-service', 'gears-hub-oil', 'gears-cables-replace', 'susp-fork-service', 'susp-shock-service', 'ebike-service',
  'brakes-cable-disc-service', 'belt-tension', 'frame-torque-check', 'wheels-true-tension',
  'brakes-hydraulic-bleed', 'brakes-squeal', 'brakes-spongy', 'chain-replace', 'chain-deep-clean', 'gears-indexing', 'wheels-wobble', 'tyres-replace', 'frame-creak',
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
  expect(shock.who).toBe('you-check'); // the coordinator's O4 ruling: the rider checks every 20 h, a shop services
  expect(shock.steps[0]).toMatch(/clean the shock shaft and look for oil/i);
  expect(shock.steps[0]).toContain('Every 20 riding hours');
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
  for (const t of CARE_TASKS.filter((x) => x.critical)) expect(t.part === 'brakes' || t.part === 'wheels' || CRITICAL_FRAME.includes(t.id) || t.id === 'belt-tension', t.id).toBe(true);
  for (const t of CARE_TASKS.filter((x) => x.who === 'shop')) expect(t.why, t.id).not.toBeNull();
});

// ---- Review of PR 67 (sub-project 12, group 2): I1 to I6, the O4 rulings, the cheap minors ----
const task = (id: string): Task => CARE_TASKS.find((t) => t.id === id)!;
const stepsOf = (id: string): string => task(id).steps.join('\n');

test('[BC-CONTENT] I1: after fitting or toeing in pads, the brake bolt or pin goes to the torque printed on the brake (spec 3.4; book pp. 111, 213)', () => {
  expect(task('brakes-pads-rim').steps.at(-1)).toMatch(/then tighten the pad bolt to the torque printed on the brake/);
  expect(stepsOf('brakes-squeal')).toMatch(/toe the pads in slightly, then tighten the pad bolt to the torque printed on the brake/);
  expect(stepsOf('brakes-pads-disc')).toMatch(/refit the pad pin or bolt to its printed torque/);
  // and the tools say so
  for (const id of ['brakes-pads-rim', 'brakes-pads-disc']) expect(task(id).tools, id).toContain('torque wrench');
});

test('[BC-CONTENT] I2: the disc and pads are never touched with fingers in the three tasks that handle them; cleaner goes on a rag, not on the pads', () => {
  for (const id of ['brakes-squeal', 'brakes-pads-disc', 'brakes-rotor-thickness']) {
    expect(task(id).note, id).toContain('Never touch the disc or pads with your fingers.');
    expect(task(id).tools, id).toContain('clean gloves');
  }
  expect(task('brakes-squeal').steps[0]).toBe('Disc: spray disc-brake cleaner on a clean rag, not on the pads, and wipe the disc; check pads for oil.');
});

test("[BC-CONTENT] I3: a wheel taken out is put back fully and its quick release closed (wheel's, or the axle nuts tight) in the hub check and the tyre replacement; tyres-replace keeps to 6 steps and a split final step", () => {
  const back = /Refit the wheel fully in the dropouts and close the wheel's quick release, or tighten the axle nuts; check it as before each ride\./;
  expect(task('wheels-hubs-check').steps.at(-1)).toMatch(back);
  expect(task('wheels-hubs-check').steps.length).toBeLessThanOrEqual(6);
  const t = task('tyres-replace');
  expect(t.steps.at(-1)).toBe("Pump to the pressure on the sidewall, then refit the wheel fully in the dropouts and close the wheel's quick release, or tighten the axle nuts; check it as before each ride.");
  expect(t.steps.length).toBe(6);


  expect(t.steps.some((s) => /squeeze the sides of the tyre together/.test(s) && !/pump/i.test(s))).toBe(true);
  // the first step no longer repeats the signs word for word
  expect(t.steps[0]).not.toMatch(/^Look at the tread for wear and at the sidewalls for cracks/);
});

test('[BC-CONTENT] I4: belt tension is critical, and its axle and tensioner bolts go to the printed torque', () => {
  expect(task('belt-tension').critical).toBe(true);
  expect(task('belt-tension').steps.at(-1)).toBe('Retighten the axle and tensioner bolts to the torque printed on the frame or hub; check the wheel sits straight in the frame.');
  expect(task('belt-tension').tools).toContain('torque wrench');
});

test('[BC-CONTENT] I5: the deep clean keeps degreaser off brake discs, pads and rims, rejoins the chain, and sits under When you notice', () => {
  const t = task('chain-deep-clean');
  expect(t.section).toBe('notice');
  expect(t.steps.join('\n')).toContain('keep degreaser off brake discs, pads and rims');
  expect(t.steps).toContain('If you took the chain off, rejoin it and flex the link as in "Replace a worn chain" steps 3-4.');
  expect(t.steps.indexOf('Then lube the chain.')).toBeGreaterThan(t.steps.findIndex((x) => /^If you took the chain off, rejoin it/.test(x)));
  expect(t.steps.length).toBe(5);
  // the signs are the trigger now there is no interval
  expect(t.signs).toContain('gritty chain');
});

test('[BC-CONTENT] I6: the sealant check lets the air out before the valve core comes out, and ends with the core refitted and the tyre pumped up', () => {
  const s = task('tyres-sealant-check').steps;
  expect(s[1]).toBe('Or let the air out, remove the valve core and look in (tool needed).');
  expect(s.some((x) => /^Refit the core and pump up\.$/.test(x))).toBe(true);
  expect(s.indexOf('Refit the core and pump up.')).toBeGreaterThan(1);
  expect(s.length).toBeLessThanOrEqual(6);
});

test("[BC-CONTENT] the coordinator's O4 defaults: the fork wipe is monthly; the shock's 20 h check says what to check and is the rider's; the bleed's sign has no old fluid; the disc measuring says which caliper; the contacts job is in the note", () => {
  const w = task('susp-wipe-stanchions');
  expect(w.section).toBe('month');
  expect(w.steps.join(' ')).toContain('Look for oil leaking at the seals.');
  const shock = task('susp-shock-service');
  expect(shock.who).toBe('you-check');
  expect(shock.why).toBe('Yourself to check every 20 h; shop to service');
  expect(shock.steps[0]).toBe('Every 20 riding hours, clean the shock shaft and look for oil at its seal.');
  expect(shock.steps.join(' ')).toContain('Fox: about 100 h.');
  expect(task('brakes-hydraulic-bleed').signs).not.toMatch(/fluid old/);
  expect(task('brakes-hydraulic-bleed').section).toBe('notice');
  const disc = task('brakes-rotor-thickness').steps.join(' ');
  expect(disc).toContain('a measuring caliper (not the brake caliper)');
  expect(disc).toContain('replace the disc at once if aluminium shows');
  const dry = task('ebike-dry-contacts');
  expect(dry.steps[0]).not.toMatch(/Every 6 months/);
  expect(dry.note).toContain('Every 6 months also clean battery and bike contacts with a dry cloth.');
  // the truing and indexing joins stay, the tyre join does not
  expect(task('wheels-true-tension').steps.length).toBe(6);
  expect(task('gears-indexing').steps.length).toBe(6);
});
