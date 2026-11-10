// Two kinds of e-bike motor (owner, 9 Nov 2026: "make the motors round … so we have two types of motors"): Bike details asks "Where is
// the motor?" for an e-bike: at the cranks (a mid-drive, drawn as a round housing round the bottom bracket), in the rear hub or in the
// front hub (a fat round hub at that wheel's centre). Not set draws it at the cranks. Only an answer is stored, so a bike from before
// keeps its bytes.
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';
import { bikeArt } from '../../../../src/core/bike/art.ts';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import { elements } from './drawing-set.ts';

const require = createRequire(import.meta.url);
const { appVM } = require('../../../../qa/app-vm.cjs') as { appVM: () => { run: (code: string) => unknown } };

const bike = (look: Record<string, unknown> | null, style = 'diamond-sloping') =>
  normaliseBike({ id: 'b1', fit: { style, size: { kind: 'letter', value: 'M' } }, ...(look ? { look } : {}) });
const motors = (svg: string) => elements(svg).filter((e) => (e.attrs.class ?? '').split(' ').includes('bk-motor'));
const circleAt = (svg: string, cls: string) => elements(svg).filter((e) => e.tag === 'circle' && e.attrs.class === cls).map((e) => ({ cx: +e.attrs.cx!, cy: +e.attrs.cy!, r: +e.attrs.r! }));

describe('two kinds of e-bike motor (owner, 9 Nov 2026)', () => {
  test('[BK-MOTOR] the look keeps where the motor is only as an answer: at the cranks, in the rear hub or in the front hub; anything else is no field', () => {
    for (const motor of ['cranks', 'rear-hub', 'front-hub'] as const) {
      expect(bike({ colour: '#2563b8', bars: 'flat', ebike: true, motor })!.look).toEqual({ colour: '#2563b8', bars: 'flat', ebike: true, motor });
      // a look with only the motor set is still a look
      expect(bike({ motor })!.look).toEqual({ colour: null, bars: null, ebike: null, motor });
    }
    for (const motor of ['', 'mid', 'hub', 'unknown', 'not-sure', 7, null, true, { at: 'rear' }]) {
      const look = bike({ colour: '#2563b8', bars: 'flat', ebike: true, motor })!.look!;
      expect(look, String(motor)).toEqual({ colour: '#2563b8', bars: 'flat', ebike: true });
      expect(Object.keys(look)).not.toContain('motor');
      expect(bike({ motor })!.look, String(motor)).toBeNull();
    }
    // a bike from before reads byte for byte as it did: no motor key appears
    const before = { colour: '#c62f2a', bars: 'drop', ebike: true, paint: { pattern: 'marble', colours: ['#6b3fa0', '#1f7f80'], fork: null, rimMm: 50 } };
    expect(JSON.stringify(bike(before)!.look)).toBe(JSON.stringify(before));
    // the motor sits after the e-bike, before the paint, in both readers
    expect(Object.keys(bike({ ...before, motor: 'rear-hub' })!.look!)).toEqual(['colour', 'bars', 'ebike', 'motor', 'paint']);
  });

  test('[BK-MOTOR] the bag planner\'s own reader keeps the motor exactly as the app\'s does', () => {
    const page = appVM();
    for (const motor of ['cranks', 'rear-hub', 'front-hub', 'mid', null, 3, undefined]) {
      const raw = { id: 'b1', name: 'E', look: { colour: '#2563b8', bars: 'flat', ebike: true, motor, paint: { pattern: 'stripes', colours: ['#1d1d1f', null] } } };
      expect(page.run(`JSON.stringify(normaliseBikeProfile(${JSON.stringify(raw)}))`), String(motor)).toBe(JSON.stringify(normaliseBike(raw)));
    }
  });

  test('[BK-MOTOR] the spec reads the motor: entered from the look, at the cranks by default', () => {
    expect(resolveBikeSpec(bike({ ebike: true, motor: 'rear-hub' }), null).motor).toEqual({ value: 'rear-hub', mark: 'entered' });
    expect(resolveBikeSpec(bike({ ebike: true, motor: 'front-hub' }), null).motor).toEqual({ value: 'front-hub', mark: 'entered' });
    expect(resolveBikeSpec(bike({ ebike: true }), null).motor).toEqual({ value: 'cranks', mark: 'default' });
    expect(resolveBikeSpec(null, null).motor).toEqual({ value: 'cranks', mark: 'default' });
  });

  test('[BK-MOTOR] a mid-drive is a round housing round the bottom bracket; a hub motor a fat round hub at that wheel\'s centre; no box', () => {
    for (const style of ['diamond-sloping', 'step-through', 'full-suspension', 'trapeze']) {
      const draw = (motor?: string) => {
        const art = bikeArt(resolveBikeSpec(bike({ ebike: true, ...(motor ? { motor } : {}) }, style), null), null);
        return { svg: art.svg, a: art.anchors };
      };
      for (const motor of [undefined, 'cranks', 'rear-hub', 'front-hub']) {
        const { svg, a } = draw(motor);
        const m = motors(svg);
        expect(m.length, `${style} ${motor}`).toBe(1);
        expect(m[0]!.tag, `${style} ${motor}: round, never a box`).toBe('circle');
        const c = { cx: +m[0]!.attrs.cx!, cy: +m[0]!.attrs.cy!, r: +m[0]!.attrs.r! };
        const at = motor === 'rear-hub' ? a.points.rear : motor === 'front-hub' ? a.points.front : a.points.bb;
        expect(c.cx, `${style} ${motor}`).toBeCloseTo(at[0], 1);
        expect(c.cy, `${style} ${motor}`).toBeCloseTo(at[1], 1);
        if (!motor || motor === 'cranks') {
          // round the crank axle: bigger than the bottom bracket, inside the chainring, drawn under the ring and the crank
          const [bb] = circleAt(svg, 'bk-bb');
          const [ring] = circleAt(svg, 'bk-ring');
          expect(c.r).toBeGreaterThan(bb!.r * 1.6);
          expect(c.r).toBeLessThan(ring!.r);
          expect(svg.indexOf('bk-motor')).toBeLessThan(svg.indexOf('bk-ring'));
          expect(svg.indexOf('bk-motor')).toBeLessThan(svg.indexOf('bk-crank'));
        } else {
          // fat: well over the plain hub, inside the rim; under the cog and chain, which drive it from the side
          const hubs = circleAt(svg, 'bk-hub');
          expect(c.r).toBeGreaterThan(hubs[0]!.r * 2.5);
          expect(c.r).toBeLessThan(a.wheels.rear.r * 0.5);
          if (motor === 'rear-hub') expect(svg.indexOf('bk-motor')).toBeLessThan(Math.min(svg.indexOf('bk-chain') >= 0 ? svg.indexOf('bk-chain') : Infinity, svg.indexOf('bk-cog')));
        }
        // the battery stays on the down tube whatever the motor
        expect(elements(svg).filter((e) => e.attrs.class === 'bk-battery').length).toBe(1);
      }
      // each place draws differently: the drawings are not mixed up by the drawing's cache
      expect(new Set([draw().svg, draw('rear-hub').svg, draw('front-hub').svg]).size).toBe(3);
      expect(draw().svg).toBe(draw('cranks').svg);
    }
  });

  test('[BK-MOTOR] no e-bike, no motor: an answer left from an e-bike draws nothing, and the drawing is as before', () => {
    for (const ebike of [false, null]) {
      const plain = bikeArt(resolveBikeSpec(bike({ ebike }), null), null).svg;
      expect(motors(plain)).toHaveLength(0);
      expect(bikeArt(resolveBikeSpec(bike({ ebike, motor: 'rear-hub' }), null), null).svg).toBe(plain);
    }
  });
});
