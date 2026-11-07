// Bike care's content (sub-project 12, Task 4 on the sample; Task 5 on the full list): every field of design 3.2, the critical flag, a
// source for every task, and the sources kept out of the app.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { SOURCES } from '../../../../src/core/care/sources.ts';
import type { CareKey, CareValue } from '../../../../src/core/care/types.ts';
import { careDetails, fitted, softTag } from '../../../../src/core/care/fit.ts';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import { C, CARE_TASKS, PARTS, SECTIONS, WHO_LABEL } from '../../../../src/core/wording/en-care.ts';
import { DRAFT_FIGURES, SETTLED_RANGES } from './draft-figures.ts';
import type { Figure } from './draft-figures.ts';

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
  // every other sample task has no soft tag, whatever the bike
  for (const t of CARE_TASKS.filter((x) => x.id !== 'gears-hub-oil')) expect(softTag(t, careDetails(null)), t.id).toBeNull();
});
