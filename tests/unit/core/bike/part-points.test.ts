// The parts guide's points (care pictures design of 7 November 2026, section 3.4): for every template, handlebar, brake, drive and fork,
// each part's point lies on the part as bikeArt draws it, inside the drawing; a part the drawing lacks has no point; a detail the rider
// never told is drawn so the part shows, and one they told that rules the part out gives no drawing.
import { expect, test } from 'vitest';
import { bikeArt } from '../../../../src/core/bike/art.ts';
import type { P } from '../../../../src/core/bike/art.ts';
import { drawnFor, PART_PLACES, partPoint } from '../../../../src/core/bike/part-points.ts';
import type { PartPlace } from '../../../../src/core/bike/part-points.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import { TEMPLATES } from '../../../../src/core/bike/templates.ts';
import type { BikeSpec } from '../../../../src/core/bike/spec.ts';
import { elements, setBike, SIZES, STYLES } from './drawing-set.ts';

type Shape = { kind: 'path'; pts: P[][] } | { kind: 'circle'; c: P; r: number } | { kind: 'rect'; c: P };

/** The drawn shapes of a bk-* class: a path as its points (curves by their control points), a circle, a rect's centre. */
function shapes(svg: string, cls: string): Shape[] {
  return elements(svg).filter((e) => (e.attrs.class ?? '').split(' ').includes(cls)).map((e): Shape => {
    if (e.tag === 'circle') return { kind: 'circle', c: [Number(e.attrs.cx), Number(e.attrs.cy)], r: Number(e.attrs.r) };
    if (e.tag === 'rect') return { kind: 'rect', c: [Number(e.attrs.x) + Number(e.attrs.width) / 2, Number(e.attrs.y) + Number(e.attrs.height) / 2] };
    const runs: P[][] = [];
    for (const m of (e.attrs.d ?? '').matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
      const nums = (m[2]!.match(/-?[\d.]+/g) ?? []).map(Number);
      if (m[1] === 'M') runs.push([]);
      for (let i = 0; i + 1 < nums.length; i += 2) runs[runs.length - 1]!.push([nums[i]!, nums[i + 1]!]);
    }
    return { kind: 'path', pts: runs };
  });
}

const segDist = (p: P, a: P, b: P): number => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
/** How far the point is from the nearest drawn shape of the class: a path's line, a circle's ring (or centre), a rect's centre. */
function distance(svg: string, cls: string, p: P, centre = false): number {
  let best = Infinity;
  for (const s of shapes(svg, cls)) {
    if (s.kind === 'circle') best = Math.min(best, centre ? Math.hypot(p[0] - s.c[0], p[1] - s.c[1]) : Math.abs(Math.hypot(p[0] - s.c[0], p[1] - s.c[1]) - s.r));
    else if (s.kind === 'rect') best = Math.min(best, Math.hypot(p[0] - s.c[0], p[1] - s.c[1]));
    else for (const run of s.pts) for (let i = 0; i + 1 < run.length; i++) best = Math.min(best, segDist(p, run[i]!, run[i + 1]!));
  }
  return best;
}

/** The drawn part each point must sit on: its class, how near, and whether a circle counts by its centre. */
function onPart(spec: BikeSpec, id: PartPlace): [string, number, boolean?] | 'wheel' {
  const bars = spec.bars.value;
  switch (id) {
    case 'frame': case 'headset': return ['bk-frame', 2.5];
    case 'fork': case 'stanchions': return ['bk-fork', 2.5];
    case 'stem': case 'handlebar': case 'display': return ['bk-bar', 1.5];
    case 'seatpost': return ['bk-post', 1];
    case 'hub': case 'wheel-qr': case 'thru-axle': case 'dropouts': return ['bk-hub', 0.5, true];
    case 'spokes': return ['bk-spokes', 0.5];
    case 'rim': case 'valve': case 'tubeless-valve': return ['bk-rim', 0.5];
    // the wheel (the owner's ruling of 14 November 2026): on the tyre's band, as the tyre, the bead and the tube
    case 'wheel': case 'tyre': case 'bead': case 'tube': return 'wheel';
    case 'brake-lever': return bars === 'drop' ? ['bk-hood', 2.5] : ['bk-grip', 6.5];
    case 'rim-brake': case 'brake-qr': case 'pads': case 'caliper': case 'pad-adjuster': return ['bk-caliper', 2];
    case 'barrel':
      if (spec.brakes.value === 'rim' && bars === 'drop') return ['bk-caliper', 2];
      if (spec.drive.value === 'derailleur' && spec.brakes.value !== 'rim') return ['bk-mech', 1];
      return bars === 'drop' ? ['bk-hood', 2.5] : ['bk-grip', 6.5];
    case 'disc': return ['bk-rotor', 0.5];
    case 'chain': case 'quick-link': return ['bk-chain', 0.5];
    case 'chainring': return ['bk-ring', 0.5];
    case 'cassette': return ['bk-cog', 0.5];
    case 'derailleur': case 'hanger': return ['bk-mech', 1];
    case 'gear-cable': return ['bk-stays', 2];
    case 'hub-gears': return ['bk-hubgear', 0.5, true];
    case 'battery': return ['bk-battery', 0.5];
  }
}

function* bikes(): Generator<{ name: string; spec: BikeSpec }> {
  for (const style of STYLES) for (const size of SIZES) for (const bars of ['drop', 'flat', 'other']) {
    for (const [brakes, drive, ebike] of [['rim', 'derailleur', false], ['hydraulic-disc', 'chain-hub', true], ['cable-disc', 'belt', false], ['unknown', 'unknown', false]] as const) {
      const bike = setBike(style, size, bars, ebike, ['', ''], null, { brakes, drive });
      yield { name: `${style} ${size} ${bars} ${brakes} ${drive}${ebike ? ' e-bike' : ''}`, spec: resolveBikeSpec(bike, null) };
    }
  }
}

test('[PG-POINTS] every guide part sits on its drawn part, inside the drawing, for every template, size, handlebar, brake and drive', () => {
  expect(PART_PLACES.length).toBe(37);
  // part-points names the one template with a curved down tube rather than reading TEMPLATES
  expect(Object.entries(TEMPLATES).filter(([, t]) => t.step !== undefined).map(([k]) => k)).toEqual(['step-through']);
  let checked = 0;
  for (const { name, spec } of bikes()) {
    for (const id of PART_PLACES) {
      const shown = drawnFor(spec, id);
      if (!shown) continue;
      const { svg, anchors } = bikeArt(shown, null);
      const p = partPoint(shown, anchors, id);
      expect(p, `${name}: ${id}`).not.toBeNull();
      expect(p![0], `${name}: ${id}`).toBeGreaterThanOrEqual(0);
      expect(p![0], `${name}: ${id}`).toBeLessThanOrEqual(320);
      expect(p![1], `${name}: ${id}`).toBeGreaterThanOrEqual(0);
      expect(p![1], `${name}: ${id}`).toBeLessThanOrEqual(150);
      const want = onPart(shown, id);
      if (want === 'wheel') {
        const w = anchors.wheels.front;
        const d = Math.hypot(p![0] - w.cx, p![1] - w.cy);
        expect(d, `${name}: ${id}`).toBeGreaterThan((shown.rimMm.value / 2) * anchors.scale);
        expect(d, `${name}: ${id}`).toBeLessThan(w.r);
      } else {
        const [cls, near, centre] = want;
        expect(distance(svg, cls, p!, centre), `${name}: ${id} on ${cls}`).toBeLessThanOrEqual(near);
      }
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(5000);
});

test('[PG-POINTS] a part the drawing lacks has no point; an untold detail is drawn so the part shows; a told one that rules it out gives no drawing', () => {
  const spec = (fields: Record<string, unknown>, ebike: boolean | null = false): BikeSpec =>
    resolveBikeSpec(setBike('diamond-sloping', 'M', 'drop', ebike ?? false, ['', ''], null, fields), null);
  const rim = spec({ brakes: 'rim', drive: 'derailleur' });
  expect(partPoint(rim, bikeArt(rim, null).anchors, 'caliper')).toBeNull();
  expect(drawnFor(rim, 'caliper')).toBeNull();
  expect(drawnFor(rim, 'hub-gears')).toBeNull();
  expect(drawnFor(rim, 'battery')).toBeNull();
  expect(drawnFor(rim, 'brake-qr')).toBe(rim);
  expect(drawnFor(rim, 'pads')!.brakes.value).toBe('rim');
  const disc = spec({ brakes: 'hydraulic-disc', drive: 'belt' });
  expect(drawnFor(disc, 'brake-qr')).toBeNull();
  expect(drawnFor(disc, 'pads')!.brakes.value).toBe('disc');
  expect(drawnFor(disc, 'chain')).toBeNull();
  // Not told: brakes, drive and the e-bike are drawn as the part needs, marked as a guess.
  const untold = resolveBikeSpec(null, null);
  for (const id of PART_PLACES) {
    const shown = drawnFor(untold, id);
    expect(shown, id).not.toBeNull();
    expect(partPoint(shown!, bikeArt(shown!, null).anchors, id), id).not.toBeNull();
  }
  expect(drawnFor(untold, 'brake-qr')!.brakes).toEqual({ value: 'rim', mark: 'guessed' });
  expect(drawnFor(untold, 'hub-gears')!.drive).toEqual({ value: 'hub', mark: 'guessed' });
  expect(drawnFor(untold, 'stanchions')!.fork).toEqual({ value: 'suspension', mark: 'guessed' });
  expect(drawnFor(untold, 'frame')).toBe(untold);
});
