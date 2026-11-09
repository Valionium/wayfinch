// Part names in a step's text that open the parts guide (care pictures design of 7 November 2026, section 4.2): for each card, per step,
// the words that name a part and the part they open. Taken from this data, never guessed from the text, so a test checks each word is in
// its step and each part is in the guide. A part's first mention in a step is the link; at most three per step.
import type { PartId } from './guide.ts';

type L = readonly (readonly [string, PartId])[];
const none: L = [];

export const STEP_PARTS: Readonly<Record<string, readonly L[]>> = {
  'puncture-tube': [none, [['tyre bead', 'bead'], ['rim', 'rim'], ['tube', 'tube']], [['tube', 'tube']], [['tyre', 'tyre'], ['tube', 'tube'], ['rim', 'rim']],
    none, [['tyre', 'tyre'], ['rim', 'rim']], [['tube', 'tube'], ['valve', 'valve'], ['bead', 'bead']]],
  'puncture-tubeless': [none, none, none, none, none, [['spare tube', 'tube'], ['tubeless valve', 'tubeless-valve']], none],
  'chain-broken': [none, [['quick link', 'quick-link']], none, [['rear gears', 'cassette']], none, none],
  'spoke-snapped': [[['spoke', 'spokes']], [['Rim brakes', 'rim-brake'], ['rim', 'rim'], ["brake's quick release", 'brake-qr']], [['Disc brakes', 'caliper']], none,
    [["brake's quick release", 'brake-qr']]],
  'brake-rub-rim': [[['dropouts', 'dropouts'], ["wheel's quick release", 'wheel-qr']], [['tyre bead', 'bead']], [['pad', 'pads'], ['tyre', 'tyre'], ['spokes', 'spokes']],
    [['brake', 'rim-brake']], [["brake's quick release", 'brake-qr']], [["brake's quick release", 'brake-qr']]],
  'brake-rub-disc': [[['axle', 'thru-axle'], ['dropouts', 'dropouts']], [['pad', 'pads']], [['caliper', 'caliper'], ['lever', 'brake-lever']], [['caliper', 'caliper']],
    [['pad adjuster', 'pad-adjuster']]],
  'brake-weak-rim': [[['rim', 'rim'], ['pads', 'pads']], [["brake's quick release", 'brake-qr']], [['barrel adjuster', 'barrel']], [['pads', 'pads'], ['rim', 'rim']],
    [['pads', 'pads']]],
  'brake-weak-disc': [[['lever', 'brake-lever'], ['pads', 'pads']], [['disc', 'disc'], ['pads', 'pads']], [['pad adjuster', 'pad-adjuster']], [['lever', 'brake-lever']], none],
  'gears-skipping': [[['stiff link', 'chain']], [['barrel adjuster', 'barrel']], none, none],
  'bolt-loose': [none, none, none, none],
  'tyre-torn': [[['tube', 'tube']], none, [['tube', 'tube']], none],
  'ebike-no-power': [[['battery', 'battery']], [['contacts', 'battery']], [['battery', 'battery']], [['display', 'display'], ['remote', 'display']], none],
};

export type Segment = string | { text: string; part: PartId };

/** A step's text cut at the first mention of each linked word, in the text's order; words that would overlap an earlier one are left as text. */
export function linkSegments(text: string, links: L): Segment[] {
  const found = links
    .map(([word, part]) => ({ at: text.indexOf(word), word, part }))
    .filter((f) => f.at >= 0)
    .sort((a, b) => a.at - b.at);
  const out: Segment[] = [];
  let from = 0;
  for (const f of found) {
    if (f.at < from) continue;
    if (f.at > from) out.push(text.slice(from, f.at));
    out.push({ text: f.word, part: f.part });
    from = f.at + f.word.length;
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}
