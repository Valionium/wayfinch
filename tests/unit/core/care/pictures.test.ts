// Bike care's drawings (care pictures design of 7 November 2026, sections 3 and 5): every file used and every use has a file, words for each,
// theme classes only, labels large enough, at most two arrows, and at most 3 KB gzipped.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { idsOf, kindOrder, pictureDetails, picturesFor, STEP_PICTURES, type PictureDetails } from '../../../../src/core/care/pictures.ts';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
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

// The redo (owner's answer 6 of 9 November 2026): a picture not yet redrawn does not ship, its step shows text alone. Batch 1 redrew the
// brakes and the snapped spoke: each brake card and the spoke card shows at least one picture; the other cards come with later batches.
test('[BC-PIC-ROAD] each brake card and the snapped-spoke card has at least one step with a picture (redo, batch 1)', () => {
  for (const id of ['spoke-snapped', 'brake-rub-rim', 'brake-rub-disc', 'brake-weak-rim', 'brake-weak-disc']) {
    const steps = STEP_PICTURES[id] ?? [];
    expect(steps.some((p) => p !== null), id).toBe(true);
  }
});

const D = (o: Partial<PictureDetails> = {}): PictureDetails => ({ brakes: null, rimBrake: null, axle: null, shifting: null, bars: null, ...o });
const ids = (id: string, step: number, d: PictureDetails): string[] => picturesFor(id, step, d).map((p) => p.id);

test("[BC-PIC-DETAILS] the brake's release follows the kind of rim brake, never the bars alone: the bike's own kind first, the others one tap away", () => {
  expect(ids('spoke-snapped', 1, D({ brakes: 'rim', rimBrake: 'v-brake', bars: 'drop' }))).toEqual(['vbrake-open', 'brake-qr-open', 'hydro-rim-open']);
  expect(ids('spoke-snapped', 1, D({ brakes: 'rim', rimBrake: 'hydraulic', bars: 'flat' }))).toEqual(['hydro-rim-open', 'brake-qr-open', 'vbrake-open']);
  expect(ids('spoke-snapped', 1, D({ brakes: 'rim', rimBrake: 'caliper', bars: 'flat' }))).toEqual(['brake-qr-open', 'vbrake-open', 'hydro-rim-open']);
  // kind not told: bars only break the tie (drop-bar levers cannot pull V-brakes); no bars told, the caliper first
  expect(ids('brake-rub-rim', 5, D({ brakes: 'rim', bars: 'flat' }))).toEqual(['vbrake-close', 'brake-qr-close', 'hydro-rim-close']);
  expect(ids('brake-rub-rim', 5, D({ brakes: 'rim', bars: 'drop' }))[0]).toBe('brake-qr-close');
  expect(ids('brake-rub-rim', 5, D())[0]).toBe('brake-qr-close');
  // a hydraulic rim brake has no centring screw: no picture of one
  expect(ids('brake-rub-rim', 3, D({ brakes: 'rim', rimBrake: 'hydraulic' }))).toEqual(['rim-centre-caliper', 'rim-centre-vbrake']);
  expect(picturesFor('brake-rub-rim', 3, D({ brakes: 'rim', rimBrake: 'v-brake' })).map((p) => p.kind)).toEqual(['v-brake', 'caliper']);
});

test('[BC-PIC-DETAILS] the wheel seated follows the axle: its own first; not told, a thru-axle on disc or untold brakes, a quick release on rim brakes', () => {
  expect(ids('brake-rub-disc', 0, D({ axle: 'nuts' }))).toEqual(['wheel-seat-nuts', 'wheel-seat-thru', 'wheel-seat-qr']);
  expect(ids('brake-rub-disc', 0, D({ brakes: 'hydraulic-disc' }))[0]).toBe('wheel-seat-thru');
  expect(ids('brake-rub-disc', 0, D())[0]).toBe('wheel-seat-thru');
  expect(ids('brake-rub-rim', 0, D({ brakes: 'rim' }))[0]).toBe('wheel-seat-qr');
  expect(ids('brake-rub-rim', 0, D({ brakes: 'rim', axle: 'thru' }))[0]).toBe('wheel-seat-thru');
  expect(kindOrder('shifting', D({ shifting: 'electronic' }))).toEqual([]);
  expect(kindOrder('shifting', D())).toEqual(['cable']);
  expect(kindOrder('bars', D({ bars: 'other' }))).toEqual(['drop', 'flat']);
});

test("[BC-PIC-DETAILS] a bike's details for pictures: its brakes, its rim brake's kind only with rim brakes, its axle, its shifting and bars; no bike, all Not sure", () => {
  expect(pictureDetails(null)).toEqual(D());
  const rim = normaliseBike({ id: 'b', brakes: 'rim', rimBrake: 'v-brake', axle: 'qr', shifting: 'cable', look: { colour: null, bars: 'flat', ebike: false } })!;
  expect(pictureDetails(rim)).toEqual({ brakes: 'rim', rimBrake: 'v-brake', axle: 'qr', shifting: 'cable', bars: 'flat' });
  const disc = normaliseBike({ id: 'c', brakes: 'hydraulic-disc', rimBrake: 'v-brake' })!;
  expect(pictureDetails(disc)).toEqual(D({ brakes: 'hydraulic-disc' }));
});

test('[BC-PIC-DETAILS] every kind of every choice has a picture file listed among the step pictures', () => {
  for (const steps of Object.values(STEP_PICTURES)) for (const e of steps) for (const id of idsOf(e)) expect(files, id).toContain(id);
});
