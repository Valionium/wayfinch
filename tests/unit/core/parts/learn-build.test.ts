// How a bike is built, the build-up (design of 14 November 2026, section 4): the steps in the owner's order, each part in exactly one,
// the e-bike's step only on an e-bike, the line on how each step's parts attach, and the drawing as built so far: the shared drawing's
// own markup with every later step's elements left out.
import { expect, test } from 'vitest';
import { bikeArt } from '../../../../src/core/bike/art.ts';
import { paintedArt } from '../../../../src/core/bike/paint.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import { classStep, extrasMarkup, KINDS, kindBike, ownBike, partsOf, stageMarkup, stepLine, stepOf, stepParts, STEPS, stepsOf } from '../../../../src/core/parts/learn.ts';
import type { LearnBike, LearnId } from '../../../../src/core/parts/learn.ts';
import { STEP_LINES, STEP_NAMES, LN } from '../../../../src/core/wording/en-learn.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { elements, setBike, SIZES, STYLES } from '../bike/drawing-set.ts';

test('[BL-STEPS] the build goes frame, fork, wheels, drivetrain, brakes, cockpit, saddle, then the e-bike\'s parts on an e-bike only', () => {
  expect(STEPS).toEqual(['frame', 'fork', 'wheels', 'drive', 'brakes', 'cockpit', 'saddle', 'ebike']);
  expect(stepsOf(kindBike('gravel'))).toEqual(['frame', 'fork', 'wheels', 'drive', 'brakes', 'cockpit', 'saddle']);
  expect(stepsOf(kindBike('ebike'))).toEqual([...STEPS]);
  const none: LearnBike = { ...kindBike('gravel'), spec: { ...kindBike('gravel').spec, brakes: { value: 'none', mark: 'entered' } } };
  expect(stepsOf(none)).not.toContain('brakes');
  for (const kind of KINDS) {
    const bike = kindBike(kind);
    const steps = stepsOf(bike);
    const built = steps.flatMap((s) => stepParts(bike, s));
    // each part in one step, every part of the bike built but the other bikes' valve and pad adjuster, which stay in the list
    expect(new Set(built).size, kind).toBe(built.length);
    expect(partsOf(bike).filter((p) => !built.includes(p)).sort(), kind).toEqual(partsOf(bike).filter((p) => p === 'tubeless-valve' || p === 'pad-adjuster').sort());
    for (const s of steps) {
      expect(stepParts(bike, s).length, `${kind} ${s}`).toBeGreaterThan(0);
      for (const p of stepParts(bike, s)) expect(stepOf(p)).toBe(s);
    }
  }
  // the drivetrain step shows what the bike has: a front derailleur on two chainrings, hub gears, a belt
  expect(stepParts(kindBike('road'), 'drive')).toContain('front-derailleur');
  expect(stepParts(kindBike('city'), 'drive')).toContain('hub-gears');
  expect(stepParts(kindBike('city'), 'drive')).not.toContain('derailleur');
  expect(stepParts(kindBike('ebike'), 'ebike')).toEqual(['motor', 'battery', 'display']);
});

test('[BL-STEPS] each step says in one short line how its parts attach, as this bike has them; the words have no banned word', () => {
  const line = (b: LearnBike, s: Parameters<typeof stepLine>[1]) => STEP_LINES[stepLine(b, s)];
  expect(line(kindBike('gravel'), 'wheels')).toContain('thru-axle');
  expect(line(kindBike('city'), 'wheels')).toContain('quick release');
  expect(line(kindBike('road'), 'drive')).toContain('a derailleur at each end');
  expect(line(kindBike('city'), 'drive')).toContain('hub gears');
  expect(line(kindBike('city'), 'brakes')).toContain('rim brake');
  expect(line(kindBike('gravel'), 'brakes')).toContain('caliper');
  expect(line(kindBike('mtb'), 'fork')).toContain('suspension fork');
  expect(line(kindBike('gravel'), 'cockpit')).toContain('tape');
  expect(line(kindBike('city'), 'cockpit')).toContain('grips');
  const belt: LearnBike = { ...kindBike('city'), spec: { ...kindBike('city').spec, drive: { value: 'belt', mark: 'entered' } } };
  expect(line(belt, 'drive')).toContain('belt');
  const hub: LearnBike = { ...kindBike('ebike'), spec: { ...kindBike('ebike').spec, motor: { value: 'rear-hub', mark: 'entered' } } };
  expect(line(hub, 'ebike')).toContain('hub');
  for (const t of [...Object.values(STEP_LINES), ...Object.values(STEP_NAMES), LN.step(3, 8, 'Wheels'), LN.back, LN.next, LN.again, LN.explore, LN.build, LN.modes, LN.built]) {
    expect(bannedHits(t), t).toEqual([]);
    expect(t.split(/(?<=\.)\s/).length, t).toBeLessThanOrEqual(1);
  }
});

/** The words of a step's line that name a part, and the part each names. */
const NAMED: readonly (readonly [RegExp, LearnId])[] = [
  [/\bframe\b/, 'frame'], [/head tube/, 'head-tube'], [/headset/, 'headset'], [/suspension fork/, 'stanchions'], [/\bfork\b/, 'fork'],
  [/dropouts/, 'dropouts'], [/\bhubs?\b(?! gears)/, 'hub'], [/thru-axle/, 'thru-axle'], [/quick release/, 'wheel-qr'], [/\brim\b/, 'rim'],
  [/bottom bracket/, 'bottom-bracket'], [/\bcranks?\b/, 'crank'], [/chainrings?/, 'chainring'], [/\bchain\b/, 'chain'], [/\bbelt\b/, 'belt'],
  [/rear gears/, 'cassette'], [/\bderailleur\b/, 'derailleur'], [/each end|front derailleur/, 'front-derailleur'], [/hanger/, 'hanger'],
  [/hub gears/, 'hub-gears'], [/caliper/, 'caliper'], [/\bdiscs?\b/, 'disc'], [/rim brake/, 'rim-brake'], [/\blevers?\b/, 'brake-lever'],
  [/\bhose\b|\bcable\b/, 'brake-cable'], [/\bstem\b/, 'stem'], [/\bbar\b/, 'handlebar'], [/\btape\b/, 'bar-tape'], [/\bgrips\b/, 'grips'],
  [/shifters?/, 'shifter'], [/seatpost|\bpost\b/, 'seatpost'], [/seat tube/, 'seat-tube'], [/seat clamp/, 'seat-clamp'], [/saddle/, 'saddle'],
  [/motor/, 'motor'], [/battery/, 'battery'], [/display/, 'display'], [/down tube/, 'down-tube'],
];

function* ownBikes(): Generator<{ name: string; bike: LearnBike }> {
  for (const style of ['diamond-sloping', 'step-through', 'full-suspension']) for (const tyre of ['28-622', '40-622', '60-622', '100-559']) {
    for (const brakes of ['unknown', 'hydraulic-disc', 'cable-disc', 'rim', 'other']) for (const drive of ['unknown', 'derailleur', 'chain-hub', 'belt']) {
      for (const axle of [undefined, 'thru', 'qr', 'nuts']) for (const [bars, ebike, motor, shifting] of [['drop', false, undefined, 'cable'], ['flat', true, 'cranks', 'electronic'], ['other', true, 'rear-hub', 'cable']] as const) {
        const r = setBike(style, 'M', bars, ebike, [tyre, tyre], null, { brakes, drive, shifting, ...(axle ? { axle } : {}) });
        if (motor) r.look = { ...r.look!, motor };
        yield { name: `${style} ${tyre} ${brakes} ${drive} ${axle} ${bars}${ebike ? ` e-bike ${motor}` : ''} ${shifting}`, bike: ownBike(resolveBikeSpec(r, null), r) };
      }
    }
  }
  for (const kind of KINDS) yield { name: kind, bike: kindBike(kind) };
}

test('[BL-STEPS] on every bike, by type, drive, brakes, axle, bars and motor, each step\'s line names only parts that bike has, and its brakes are a step', () => {
  let checked = 0;
  for (const { name, bike } of ownBikes()) {
    const parts = partsOf(bike);
    const steps = stepsOf(bike);
    expect(steps, name).toContain('brakes');
    for (const s of steps) {
      const line = STEP_LINES[stepLine(bike, s)].toLowerCase();
      for (const [re, id] of NAMED) if (re.test(line)) expect(parts, `${name}, ${s}: "${line}" names ${id}`).toContain(id);
      checked += 1;
    }
  }
  expect(checked).toBeGreaterThan(10_000);
  // the wheels as they are held: hub gears' rear wheel on nuts, a quick release in front of a city bike
  expect(STEP_LINES[stepLine(kindBike('city'), 'wheels')]).toMatch(/nuts/);
  expect(STEP_LINES[stepLine(kindBike('city'), 'wheels')]).toMatch(/quick release/);
  expect(STEP_LINES[stepLine(kindBike('gravel'), 'wheels')]).not.toMatch(/nuts/);
});

const classesOf = (svg: string): string[] => elements(svg).flatMap((e) => (e.attrs.class ?? '').split(' ').filter((c) => c.startsWith('bk-')));

test('[BL-STAGE] the drawing as built: every element of a later step left out, a casing with its painted part, the last step the whole drawing', () => {
  for (const style of STYLES) for (const size of SIZES) for (const bars of ['drop', 'flat', 'other']) for (const ebike of [false, true]) {
    for (const colour of [null, '#2f6fb5']) {
      const spec = resolveBikeSpec(setBike(style, size, bars, ebike, ['', ''], colour, { brakes: ebike ? 'rim' : 'hydraulic-disc', drive: ebike ? 'chain-hub' : 'derailleur' }), null);
      const { svg } = bikeArt(spec, null);
      const name = `${style} ${size} ${bars}${ebike ? ' e-bike' : ''} ${colour}`;
      // every class the drawing draws belongs to a step (casings go with the part after them)
      for (const c of classesOf(svg)) if (!/^bk(-casing.*|-paint)?$/.test(c)) expect(classStep(c), `${name}: ${c}`).toBeDefined();
      expect(stageMarkup(svg, 'ebike'), name).toBe(svg);
      for (const [i, upto] of STEPS.entries()) {
        const out = stageMarkup(svg, upto);
        const shown = classesOf(out).filter((c) => classStep(c));
        for (const c of shown) expect(STEPS.indexOf(classStep(c)!), `${name} at ${upto}: ${c}`).toBeLessThanOrEqual(i);
        // a casing stays only with its part
        const casings = (out.match(/class="bk-casing/g) ?? []).length;
        const painted = (out.match(/class="bk-paint /g) ?? []).length;
        expect(casings, `${name} at ${upto}`).toBe(painted);
        // nothing of an earlier step is lost
        for (const c of classesOf(svg).filter((x) => classStep(x) && STEPS.indexOf(classStep(x)!) <= i)) expect(shown, `${name} at ${upto}`).toContain(c);
      }
      const frame = stageMarkup(svg, 'frame');
      expect(frame).toContain('bk-frame');
      expect(frame).not.toMatch(/bk-(fork|tyre|chain|bar|saddle)\b/);
    }
  }
});

test('[BL-STAGE] a painted bike (pattern, own fork) builds up the same way; the page\'s own pieces come with their steps', () => {
  const spec = resolveBikeSpec(setBike('diamond-sloping', 'M', 'drop', false, ['', ''], '#2f6fb5'), null);
  const paint = { pattern: 'fade-h', colours: ['#e8b200', null], fork: { kind: 'own', colour: '#111111' }, rimMm: 40 } as unknown as Parameters<typeof paintedArt>[3];
  const { svg } = paintedArt(spec, null, {}, paint);
  const frame = stageMarkup(svg, 'frame');
  expect(frame).toContain('<defs>');
  expect(frame).not.toContain('bk-rimband');
  expect(frame).not.toContain('bk-fork');
  expect(stageMarkup(svg, 'wheels')).toContain('bk-rimband');
  const road = kindBike('road');
  const a = bikeArt(road.spec, null).anchors;
  expect(extrasMarkup(road, a, 'wheels')).toBe('');
  expect(extrasMarkup(road, a, 'drive')).toContain('bl-fmech');
  expect(extrasMarkup(road, a, 'drive')).not.toContain('bl-cable');
  expect(extrasMarkup(road, a, 'brakes')).toContain('bl-cable');
});
