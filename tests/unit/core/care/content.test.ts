// Bike care's content (sub-project 12, Task 4 on the sample; Task 5 on the full list): every field of design 3.2, the critical flag, a
// source for every task, and the sources kept out of the app.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { SOURCES } from '../../../../src/core/care/sources.ts';
import type { CareKey, CareValue } from '../../../../src/core/care/types.ts';
import { careDetails, fitted } from '../../../../src/core/care/fit.ts';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import { C, CARE_TASKS, PARTS, SECTIONS, WHO_LABEL } from '../../../../src/core/wording/en-care.ts';
import { DRAFT_FIGURES, SETTLED_RANGES } from './draft-figures.ts';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
/** The Frame & bolts tasks on the steerer, stem or bar bolts (design 3.5: "if unsure, a shop"), from the content draft's ids. */
const CRITICAL_FRAME = ['frame-bolts-check', 'frame-headset-check', 'frame-torque-check', 'frame-creak'];
const VALUES: { [K in CareKey]: readonly CareValue[K][] } = {
  brakes: ['rim', 'cable-disc', 'hydraulic-disc'], tyres: ['tubes', 'tubeless'], drive: ['chain', 'belt'], gears: ['derailleur', 'hub'],
  shifting: ['cable', 'electronic'], suspension: ['none', 'front', 'full'], ebike: ['yes', 'no'],
};
const filled = (s: unknown): boolean => typeof s === 'string' && s.trim().length > 0 && s.trim() === s;

test('[BC-CONTENT] every task has every field of design 3.2 filled; 3 to 6 steps; minutes low <= high; ids unique; parts and sections valid', () => {
  expect(CARE_TASKS.length).toBeGreaterThanOrEqual(9);
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
  expect(Object.keys(SOURCES).sort()).toEqual(CARE_TASKS.map((t) => t.id).sort());
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
const riderText = (t: (typeof CARE_TASKS)[number]): string => [
  t.name, t.signs, ...t.steps, t.tools, t.minutes ? C.careTime(t.minutes[0], t.minutes[1]) : '', t.note ?? '', t.why ?? WHO_LABEL[t.who],
].join('\n').toLowerCase();

test("[BC-CONTENT] every task's rider-visible text holds each key sentence and figure of its draft row; a settled range never shows (review of PR 58, I1-I3)", () => {
  for (const t of CARE_TASKS) {
    const want = DRAFT_FIGURES[t.id];
    expect(want, `${t.id} has no draft figures`).toBeDefined();
    const text = riderText(t);
    for (const fact of want!) expect(text, `${t.id}: ${fact}`).toContain(fact.toLowerCase());
    for (const range of SETTLED_RANGES[t.id] ?? []) expect(text, `${t.id}: ${range}`).not.toContain(range);
  }
});

test('[BC-CONTENT] a single speed (chain-hub or belt, no shifting) gets no hub gear oil task; hub gears on a cable or electronic shifter do (review of PR 58, M2)', () => {
  const ids = (extra: Record<string, unknown>) => fitted(CARE_TASKS, careDetails(normaliseBike({ id: 'b1', ...extra }))).map((t) => t.id);
  expect(ids({ drive: 'chain-hub', shifting: 'none' })).not.toContain('gears-hub-oil');
  expect(ids({ drive: 'belt', shifting: 'none' })).not.toContain('gears-hub-oil');
  expect(ids({ drive: 'chain-hub', shifting: 'cable' })).toContain('gears-hub-oil');
  expect(ids({ drive: 'belt', shifting: 'electronic' })).toContain('gears-hub-oil');
  expect(ids({ drive: 'derailleur', shifting: 'cable' })).not.toContain('gears-hub-oil');
  // shifting Not sure: shown, tagged
  const unsure = fitted(CARE_TASKS, careDetails(normaliseBike({ id: 'b1', drive: 'chain-hub' }))).find((t) => t.id === 'gears-hub-oil');
  expect(unsure?.tags).toEqual(['shifting']);
});
