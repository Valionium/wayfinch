// The parts guide (care pictures design of 7 November 2026, section 4; the owner's answers of 8 November): 36 parts in six groups, each
// with words, close-ups that exist, mix-ups that exist; the part names in the roadside cards' steps that open it; the close-ups' files.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { PART_PLACES } from '../../../../src/core/bike/part-points.ts';
import type { PictureDetails } from '../../../../src/core/care/pictures.ts';
import { GUIDE, guidePictures, partById } from '../../../../src/core/parts/guide.ts';
import { linkSegments, STEP_PARTS } from '../../../../src/core/parts/links.ts';
import CARE_WORDS from '../../../../src/core/wording/en-care-pictures.json';
import { CARE_TASKS, ROAD_CARDS } from '../../../../src/core/wording/en-care.ts';
import { partsWordsFrom, PG, TAG_WORDS } from '../../../../src/core/wording/en-parts.ts';
import WORDS from '../../../../src/core/wording/en-parts.json';
import { bannedHits } from '../../../fixtures/banned.ts';

const ROOT = fileURLToPath(new URL('../../../../src/tools/care/', import.meta.url));
const PARTS_DIR = join(ROOT, 'parts');
const STEPS_DIR = join(ROOT, 'pictures');
const CSS = readFileSync(join(ROOT, 'pictures.css'), 'utf8');
const svgsIn = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();
const guideFiles = svgsIn(PARTS_DIR);
const stepFiles = svgsIn(STEPS_DIR);
const checked = partsWordsFrom(WORDS, PART_PLACES)!;
const PART_WORDS = checked.parts;
const GUIDE_PICTURE_WORDS = checked.pictures;
const PICTURE_WORDS: Record<string, unknown> = CARE_WORDS.pictures;
const sentences = (t: string): number => t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).length;

test("[PG-DATA] the guide holds the design's 36 parts in its six groups, in order, each with words, close-ups and mix-ups that exist", () => {
  expect(GUIDE.map((p) => p.id)).toEqual([...PART_PLACES]);
  const groups = new Map<string, number>();
  for (const p of GUIDE) groups.set(p.group, (groups.get(p.group) ?? 0) + 1);
  expect([...groups]).toEqual([['steering', 6], ['wheels', 6], ['tyres', 5], ['brakes', 8], ['drive', 8], ['ebike', 3]]);
  expect(checked).not.toBeNull();
  expect(Object.keys(PART_WORDS).sort()).toEqual([...PART_PLACES].sort());
  // the words file is checked whole: a part without its text is no file
  expect(partsWordsFrom({ ...WORDS, parts: { ...WORDS.parts, frame: { name: 'Frame' } } }, PART_PLACES)).toBeNull();
  expect(partsWordsFrom(null, PART_PLACES)).toBeNull();
  // the redo (owner's answer 6 of 9 November 2026): a close-up not yet redrawn does not ship, so a part may have none for now; where its
  // close-ups depend on the bike, it has one for each kind once they are drawn
  for (const p of GUIDE) {
    if (p.by && p.pictures.length > 0) expect(p.pictures.length, p.id).toBeGreaterThanOrEqual(2);
    for (const pic of p.pictures) {
      const inGuide = guideFiles.includes(pic);
      expect(inGuide || stepFiles.includes(pic), `${p.id}: ${pic}`).toBe(true);
      expect(inGuide ? GUIDE_PICTURE_WORDS[pic] : PICTURE_WORDS[pic], `${p.id}: ${pic}`).toBeDefined();
    }
    for (const m of p.mixed) expect(partById(m) !== undefined && m !== p.id, `${p.id}: ${m}`).toBe(true);
    if (p.tag) expect(TAG_WORDS[p.tag], p.id).toBeDefined();
  }
  // The design's two examples (4.1).
  expect(partById('brake-qr')!.mixed).toContain('wheel-qr');
  expect(partById('derailleur')!.mixed).toContain('hanger');
});

const D = (o: Partial<PictureDetails> = {}): PictureDetails => ({ brakes: null, rimBrake: null, axle: null, shifting: null, bars: null, ...o });

test("[PG-KINDS] a part's close-ups follow the bike detail that decides them: the bike's own kind first, then the next; never the bars standing in for the brakes", () => {
  const qr = partById('brake-qr')!;
  expect(guidePictures(qr, D({ brakes: 'rim', rimBrake: 'v-brake', bars: 'drop' }))).toEqual(['vbrake-open', 'brake-qr-open']);
  expect(guidePictures(qr, D({ brakes: 'rim', rimBrake: 'hydraulic' }))).toEqual(['hydro-rim-open', 'brake-qr-open']);
  expect(guidePictures(qr, D({ bars: 'flat' }))).toEqual(['vbrake-open', 'brake-qr-open']);
  expect(guidePictures(qr, D())).toEqual(['brake-qr-open', 'vbrake-open']);
  expect(guidePictures(partById('rim-brake')!, D({ brakes: 'rim', rimBrake: 'hydraulic' }))).toEqual(['pg-rim-hydraulic', 'pg-caliper-rim']);
  // pads: the bike's own brakes first; not told, the disc first (the most common modern kind)
  expect(guidePictures(partById('pads')!, D({ brakes: 'rim', bars: 'drop' }))).toEqual(['pg-pads-rim', 'pg-pads-disc']);
  expect(guidePictures(partById('pads')!, D({ brakes: 'hydraulic-disc', bars: 'flat' }))).toEqual(['pg-pads-disc', 'pg-pads-rim']);
  expect(guidePictures(partById('pads')!, D())).toEqual(['pg-pads-disc', 'pg-pads-rim']);
  expect(guidePictures(partById('caliper')!, D())).toEqual(['pg-disc-caliper']);
  // dropouts follow the axle (redo, section 2): a closed hole for a thru-axle first; a slot first when the axle is a quick release or
  // nuts, or not told on rim brakes
  expect(guidePictures(partById('dropouts')!, D())).toEqual(['pg-dropout-thru', 'pg-dropout-qr']);
  expect(guidePictures(partById('dropouts')!, D({ axle: 'qr' }))).toEqual(['pg-dropout-qr', 'pg-dropout-thru']);
  expect(guidePictures(partById('dropouts')!, D({ axle: 'nuts' }))).toEqual(['pg-dropout-qr', 'pg-dropout-thru']);
  expect(guidePictures(partById('dropouts')!, D({ brakes: 'rim' }))).toEqual(['pg-dropout-qr', 'pg-dropout-thru']);
  // the barrel: a caliper's on the brake, a V-brake's on its lever, by the kind of rim brake
  expect(guidePictures(partById('barrel')!, D({ brakes: 'rim', rimBrake: 'v-brake' }))).toEqual(['barrel-vbrake', 'barrel-caliper']);
  expect(guidePictures(partById('barrel')!, D())).toEqual(['barrel-caliper', 'barrel-vbrake']);
  // the chainring: no detail says how many; one ring (1x) first, two (2x) beside it
  expect(guidePictures(partById('chainring')!, D())).toEqual(['pg-chainring-1x', 'pg-chainring-2x']);
  // the chain and gear parts drawn in batch 3 each have their close-up
  for (const [id, pic] of [['chain', 'pg-chain'], ['quick-link', 'quick-link'], ['cassette', 'pg-cassette'], ['derailleur', 'pg-derailleur'],
    ['hanger', 'pg-hanger'], ['gear-cable', 'pg-gear-cable']] as const) expect(partById(id)!.pictures, id).toEqual([pic]);
});

test("[PG-WORDS] each part has a name and two to four plain sentences; the tags and the sheet's words; no banned word", () => {
  for (const [id, w] of Object.entries(PART_WORDS)) {
    expect(w.name.length, id).toBeGreaterThan(2);
    expect(sentences(w.text), `${id}: ${w.text}`).toBeGreaterThanOrEqual(2);
    expect(sentences(w.text), `${id}: ${w.text}`).toBeLessThanOrEqual(4);
    for (const t of [w.name, w.text]) expect(bannedHits(t, false), `${id}: ${t}`).toEqual([]);
  }
  const sheet = [...Object.values(TAG_WORDS), ...Object.values(PG).map((v) => (typeof v === 'function' ? v('Rim') : v))];
  for (const t of sheet) expect(bannedHits(t, false), t).toEqual([]);
  for (const [id, w] of Object.entries(GUIDE_PICTURE_WORDS)) {
    expect(sentences(w.name), id).toBe(1);
    expect(sentences(w.description), `${id}: ${w.description}`).toBeGreaterThanOrEqual(2);
    expect(sentences(w.description), `${id}: ${w.description}`).toBeLessThanOrEqual(4);
    for (const t of [w.name, w.description, w.caption ?? '']) expect(bannedHits(t, false), `${id}: ${t}`).toEqual([]);
  }
});

const classes = new Set([...CSS.matchAll(/\.(cp(?:-[a-z]+)?)\b/g)].map((m) => m[1]!));
const COLOUR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\b(?:black|white|red|orange|blue|green|grey|gray|yellow)\b/i;

test('[PG-FILES] every guide close-up is used by a part and has words; theme classes only, labels at least 11.5, at most three labels and two arrows, at most 3 KB gzipped', () => {
  const used = [...new Set(GUIDE.flatMap((p) => p.pictures).filter((id) => !stepFiles.includes(id)))].sort();
  expect(guideFiles).toEqual(used);
  expect(Object.keys(GUIDE_PICTURE_WORDS).sort()).toEqual(guideFiles);
  // A guide close-up never shares an id with a step picture: both load by id.
  for (const id of guideFiles) expect(stepFiles, id).not.toContain(id);
  for (const id of guideFiles) {
    const s = readFileSync(join(PARTS_DIR, `${id}.svg`), 'utf8');
    expect(s.startsWith('<svg class="cp" viewBox="'), id).toBe(true);
    expect(s, id).not.toMatch(/<style|<script|<image|<foreignObject|\son[a-z]+=|http|xmlns|<title|<desc|role=/i);
    expect(s, id).not.toMatch(COLOUR);
    expect(s, id).not.toMatch(/\s(?:fill|stroke|color|stop-color)="(?!none")/);
    for (const m of s.matchAll(/style="([^"]*)"/g)) expect(m[1], id).not.toMatch(/(?:^|;)\s*(?:fill|stroke|color)\s*:\s*(?!none)/);
    for (const m of s.matchAll(/font-size:\s*([\d.]+)/g)) expect(Number(m[1]), id).toBeGreaterThanOrEqual(11.5);
    for (const m of s.matchAll(/class="([^"]+)"/g)) for (const c of m[1]!.split(/\s+/)) expect(classes.has(c), `${id}: ${c}`).toBe(true);
    expect((s.match(/class="cp-arrow"/g) ?? []).length, id).toBeLessThanOrEqual(2);
    expect((s.match(/<text /g) ?? []).length, `${id}: labels`).toBeLessThanOrEqual(4);
    const size = gzipSync(Buffer.from(s), { level: 9 }).length;
    expect(size, `${id}: ${size} bytes`).toBeLessThanOrEqual(3072);
  }
});

test("[PG-LINKS] every roadside card lists its steps' part names; each is in its step, at most three a step, each opens a guide part", () => {
  expect(Object.keys(STEP_PARTS).sort()).toEqual(ROAD_CARDS.map((c) => c.id).sort());
  const items = new Map([...ROAD_CARDS, ...CARE_TASKS].map((x) => [x.id, x.steps] as const));
  let links = 0;
  for (const [id, steps] of Object.entries(STEP_PARTS)) {
    const text = items.get(id)!;
    expect(steps.length, id).toBe(text.length);
    steps.forEach((step, i) => {
      expect(step.length, `${id} ${i + 1}`).toBeLessThanOrEqual(3);
      const segs = linkSegments(text[i]!, step);
      expect(segs.map((s) => (typeof s === 'string' ? s : s.text)).join(''), `${id} ${i + 1}`).toBe(text[i]);
      const linked = segs.filter((s) => typeof s !== 'string');
      expect(linked.length, `${id} ${i + 1}: every word found once`).toBe(step.length);
      for (const [word, part] of step) {
        expect(text[i]!.includes(word), `${id} ${i + 1}: ${word}`).toBe(true);
        expect(partById(part), `${id} ${i + 1}: ${part}`).toBeDefined();
      }
      links += step.length;
    });
  }
  expect(links).toBeGreaterThan(40);
});

test('[PG-LINKS] a part name is linked at its first mention only, and words that would overlap are left as text', () => {
  expect(linkSegments('the tube and the tube', [['tube', 'tube']])).toEqual(['the ', { text: 'tube', part: 'tube' }, ' and the tube']);
  expect(linkSegments('pad adjuster', [['pad adjuster', 'pad-adjuster'], ['pad', 'pads']])).toEqual([{ text: 'pad adjuster', part: 'pad-adjuster' }]);
  expect(linkSegments('no parts here', [['rim', 'rim']])).toEqual(['no parts here']);
});
