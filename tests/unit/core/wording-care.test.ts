import { expect, test } from 'vitest';
import type { CareKey, CareValue } from '../../../src/core/care/types.ts';
import { C, CARE_TASKS, CARRY, PART_LABEL, ROAD_CARDS, SECTION_LABEL, TAG_LABEL, WHO_LABEL } from '../../../src/core/wording/en-care.ts';
import { CL } from '../../../src/core/wording/en-care-link.ts';
import { bannedHits } from '../../fixtures/banned.ts';

const VALUES: { [K in CareKey]: CareValue[K][] } = {
  brakes: ['rim', 'cable-disc', 'hydraulic-disc'], tyres: ['tubes', 'tubeless'], drive: ['chain', 'belt'], gears: ['derailleur', 'hub'],
  shifting: ['cable', 'electronic'], suspension: ['none', 'front', 'full'], ebike: ['yes', 'no'],
};
/** Every non-empty subset of a key's values, so every tag the screen can show is read. */
const subsets = <V>(vs: V[]): V[][] => vs.reduce<V[][]>((acc, v) => [...acc, ...acc.map((s) => [...s, v]), [v]], []);

function everyString(): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, value] of [...Object.entries(C), ...Object.entries(CL)]) {
    if (typeof value === 'string') out.push([key, value]);
    else for (const args of [[1, 1], [2, 3], [0, 0]] as const) out.push([key, (value as (...a: number[]) => string)(...args)]);
  }
  for (const [k, v] of Object.entries(PART_LABEL)) out.push([`PART_LABEL.${k}`, v]);
  for (const [k, v] of Object.entries(SECTION_LABEL)) out.push([`SECTION_LABEL.${k}`, v]);
  for (const [k, v] of Object.entries(WHO_LABEL)) out.push([`WHO_LABEL.${k}`, v]);
  for (const key of Object.keys(VALUES) as CareKey[]) for (const s of subsets(VALUES[key] as string[])) out.push([`TAG_LABEL.${key}`, TAG_LABEL(key, s as never)]);
  for (const t of CARE_TASKS) {
    for (const text of [t.name, t.signs, t.tools, t.why ?? '', t.note ?? '', t.soft?.tag ?? '', ...t.steps, ...t.words]) out.push([t.id, text]);
  }
  for (const r of ROAD_CARDS) for (const text of [r.problem, r.checkFirst, r.rideOn, ...r.steps, ...r.words]) out.push([r.id, text]);
  for (const c of CARRY) out.push([c.id, c.name]);
  return out;
}

test('[HON-BANNED] no string in en-care.ts (or the care link words) uses a banned word; every key of C and CL starts with "care"', () => {
  for (const key of [...Object.keys(C), ...Object.keys(CL)]) expect(key).toMatch(/^care[A-Z]/);
  const strings = everyString();
  expect(strings.length).toBeGreaterThan(150);
  for (const [key, text] of strings) {
    expect(text, key).not.toMatch(/undefined|NaN/);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

test('[HON-BANNED] "Ride on?" stands in for the banned "safe to ride on" (decision 1): no care string asks whether it is safe', () => {
  for (const [key, text] of everyString()) expect(/safe/i.test(text), key).toBe(false);
});
