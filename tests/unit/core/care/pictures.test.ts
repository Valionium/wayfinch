// Bike care's drawings (care pictures design of 7 November 2026, sections 3 and 5): every file used and every use has a file, words for each,
// theme classes only, labels large enough, at most two arrows, and at most 3 KB gzipped.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { idsOf, STEP_PICTURES } from '../../../../src/core/care/pictures.ts';
import { PICTURE_WORDS } from '../../../../src/core/wording/en-care-pictures.ts';
import { CARE_TASKS, ROAD_CARDS } from '../../../../src/core/wording/en-care.ts';
import { bannedHits } from '../../../fixtures/banned.ts';

const DIR = fileURLToPath(new URL('../../../../src/tools/care/pictures/', import.meta.url));
const CSS = readFileSync(fileURLToPath(new URL('../../../../src/tools/care/pictures.css', import.meta.url)), 'utf8');
const files = readdirSync(DIR).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
const svg = (id: string): string => readFileSync(join(DIR, `${id}.svg`), 'utf8');
const used = [...new Set(Object.values(STEP_PICTURES).flat().flatMap(idsOf))].sort();
/** The classes the shared stylesheet gives, and the font size of each text class. */
const classes = new Set([...CSS.matchAll(/\.(cp(?:-[a-z]+)?)\b/g)].map((m) => m[1]!));
const COLOUR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\b(?:black|white|red|orange|blue|green|grey|gray|yellow)\b/i;

test('[BC-PIC-FILES] every picture file is used by a step, and every step\'s picture has a file and words', () => {
  expect(files.length).toBeGreaterThan(0);
  expect(files).toEqual(used);
  expect(Object.keys(PICTURE_WORDS).sort()).toEqual(files);
  const items = new Map<string, number>([...ROAD_CARDS, ...CARE_TASKS].map((x) => [x.id, x.steps.length]));
  for (const [id, steps] of Object.entries(STEP_PICTURES)) {
    expect(items.has(id), id).toBe(true);
    expect(steps.length, id).toBe(items.get(id));
  }
});

test('[BC-PIC-FILES] each picture has a one-sentence name and a description of two to four sentences, with no banned word', () => {
  for (const [id, w] of Object.entries(PICTURE_WORDS)) {
    expect(w.name.split(/(?<=\.)\s/).length, id).toBe(1);
    const sentences = w.description.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).length;
    expect(sentences, `${id}: ${sentences}`).toBeGreaterThanOrEqual(2);
    expect(sentences, `${id}: ${sentences}`).toBeLessThanOrEqual(4);
    for (const text of [w.name, w.description, w.caption ?? '']) expect(bannedHits(text, false), `${id}: ${text}`).toEqual([]);
  }
});

test('[BC-PIC-FILES] a picture uses the theme classes only: no colour value, no style block, no http; labels at least 11.5; at most two arrows; at most 3 KB gzipped', () => {
  expect(CSS).not.toMatch(COLOUR);
  for (const m of CSS.matchAll(/font-size:\s*([\d.]+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(11.5);
  for (const id of files) {
    const s = svg(id);
    expect(s.startsWith('<svg class="cp" viewBox="'), id).toBe(true);
    expect(s, id).not.toMatch(/<style|<script|<image|<foreignObject|\son[a-z]+=|http|xmlns|<title|<desc|role=/i);
    expect(s, id).not.toMatch(COLOUR);
    expect(s, id).not.toMatch(/\s(?:fill|stroke|color|stop-color)="(?!none")/);
    for (const m of s.matchAll(/style="([^"]*)"/g)) expect(m[1], id).not.toMatch(/(?:^|;)\s*(?:fill|stroke|color)\s*:\s*(?!none)/);
    for (const m of s.matchAll(/font-size:\s*([\d.]+)/g)) expect(Number(m[1]), id).toBeGreaterThanOrEqual(11.5);
    for (const m of s.matchAll(/class="([^"]+)"/g)) for (const c of m[1]!.split(/\s+/)) expect(classes.has(c), `${id}: ${c}`).toBe(true);
    expect((s.match(/class="cp-arrow"/g) ?? []).length, id).toBeLessThanOrEqual(2);
    const size = gzipSync(Buffer.from(s), { level: 9 }).length;
    expect(size, `${id}: ${size} bytes`).toBeLessThanOrEqual(3072);
  }
});
