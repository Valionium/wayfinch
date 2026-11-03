import { describe, expect, test } from 'vitest';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import type { BagView } from '../../../../src/core/bike/spec.ts';

const bike = (fields: Record<string, unknown>) => normaliseBike({ id: 'b1', ...fields })!;
const plan = (items: BagView['items'], decks: BagView['decks'] = { bar: null, rack: null }): BagView => ({ items, decks, bottles: [] });
const values = (s: ReturnType<typeof resolveBikeSpec>) => ({
  type: s.type.value, rim: s.rimMm.value, front: s.frontMm.value, rear: s.rearMm.value, style: s.style.value, size: s.size.value,
  bars: s.bars.value, fork: s.fork.value, brakes: s.brakes.value, drive: s.drive.value, rack: s.rack.value, ebike: s.ebike.value, colour: s.colour.value,
});

describe('resolveBikeSpec (spec section 7.4): one value per part, marked entered, guessed or default', () => {
  test('[BK-SPEC] no bike and no plan: a gravel bike, 700c x 40 mm, diamond sloping, size M, every part a default', () => {
    const s = resolveBikeSpec(null, null);
    expect(values(s)).toEqual({
      type: 'gravel', rim: 622, front: 40, rear: 40, style: 'diamond-sloping', size: 'M', bars: 'drop', fork: 'rigid', brakes: 'none',
      drive: 'chain', rack: false, ebike: false, colour: null,
    });
    for (const part of ['type', 'rimMm', 'frontMm', 'rearMm', 'style', 'size', 'bars', 'fork', 'brakes', 'drive', 'rack', 'ebike', 'colour', 'geometry'] as const) {
      expect(s[part].mark, part).toBe('default');
    }
    expect(s.geometry.value).toBeNull();
  });

  test('[BK-SPEC] rim diameter: the tyre sizes, then the preserved wheel size, then 622 mm', () => {
    expect(resolveBikeSpec(bike({ frontTyre: '47-584', pressure: { wheel: '29' } }), null).rimMm).toEqual({ value: 584, mark: 'entered' });
    expect(resolveBikeSpec(bike({ rearTyre: '26 x 2.1' }), null).rimMm).toEqual({ value: 559, mark: 'entered' });
    expect(resolveBikeSpec(bike({ frontTyre: 'fast tyres', pressure: { wheel: '650b' } }), null).rimMm).toEqual({ value: 584, mark: 'entered' });
    expect(resolveBikeSpec(bike({ frontTyre: 'fast tyres' }), null).rimMm).toEqual({ value: 622, mark: 'default' });
  });

  test('[BK-SPEC] tyre widths: the tyre sizes, then the preserved printed widths, then the other wheel as a guess, then 40 mm', () => {
    const s = resolveBikeSpec(bike({ frontTyre: '29 x 2.2', pressure: { frontMm: 50, rearMm: 52 } }), null);
    expect(s.frontMm.mark).toBe('entered');
    expect(s.frontMm.value).toBeCloseTo(55.88, 2);
    expect(s.rearMm).toEqual({ value: 52, mark: 'entered' });
    expect(resolveBikeSpec(bike({ pressure: { frontMm: 45 } }), null).rearMm).toEqual({ value: 45, mark: 'guessed' });
    expect(resolveBikeSpec(bike({ name: 'Just a name' }), null).frontMm).toEqual({ value: 40, mark: 'default' });
  });

  test('[BK-SPEC] frame style and size: what was entered, else the type default and M; a size from the number on the frame', () => {
    expect(resolveBikeSpec(bike({ fit: { style: 'compact' } }), null).style).toEqual({ value: 'compact', mark: 'entered' });
    expect(resolveBikeSpec(bike({ fit: { style: 'unknown', size: { kind: 'letter', value: 'L' } } }), null).style).toEqual({ value: 'diamond-sloping', mark: 'default' });
    expect(resolveBikeSpec(bike({}), plan([{ pos: 'rack', L: 15, pair: true, fill: [0.5, 0.5] }])).style).toEqual({ value: 'diamond-level', mark: 'guessed' });
    expect(resolveBikeSpec(bike({ fit: { size: { kind: 'letter', value: 'XL' } } }), null).size).toEqual({ value: 'XL', mark: 'entered' });
    expect(resolveBikeSpec(bike({ fit: { size: { kind: 'cm', value: 54 } } }), null).size).toEqual({ value: 'M', mark: 'entered' });
    expect(resolveBikeSpec(bike({ fit: { size: { kind: 'cm', value: 49 } } }), null).size.value).toBe('XS');
    expect(resolveBikeSpec(bike({ fit: { size: { kind: 'in', value: 20 } } }), null).size.value).toBe('L');
    expect(resolveBikeSpec(bike({ fit: { size: { kind: 'in', value: 17 } } }), null).size.value).toBe('M');
  });

  test('[BK-SPEC] frame points: geometry is always empty in this release, so the style template for the size', () => {
    const s = resolveBikeSpec(bike({ fit: { style: 'trapeze', size: { kind: 'letter', value: 'S' } } }), null);
    expect(s.geometry).toEqual({ value: null, mark: 'default' });
    expect(s.points.mark).toBe('guessed');
    expect(s.points.value.rear[0]).toBeLessThan(0);
    expect(s.points.value.front[0]).toBeGreaterThan(0);
    expect(resolveBikeSpec(null, null).points.mark).toBe('default');
  });

  test('[BK-SPEC] handlebar, fork, brakes, drive, rack, e-bike and colour fall through in order', () => {
    expect(resolveBikeSpec(bike({ look: { bars: 'other' } }), null).bars).toEqual({ value: 'other', mark: 'entered' });
    expect(resolveBikeSpec(bike({ fit: { style: 'full-suspension' } }), null).fork).toEqual({ value: 'suspension', mark: 'guessed' });
    expect(resolveBikeSpec(bike({ fit: { style: 'full-suspension' } }), plan([{ pos: 'fork', L: 3, pair: true, fill: [1, 1] }])).fork.value).toBe('suspension');
    expect(resolveBikeSpec(bike({ frontTyre: '29 x 2.4' }), null).fork).toEqual({ value: 'suspension', mark: 'guessed' });
    expect(resolveBikeSpec(bike({ frontTyre: '29 x 2.4' }), plan([{ pos: 'fork', L: 3, pair: true, fill: [1, 1] }])).fork).toEqual({ value: 'rigid', mark: 'guessed' });
    expect(resolveBikeSpec(bike({ brakes: 'hydraulic-disc' }), null).brakes).toEqual({ value: 'disc', mark: 'entered' });
    expect(resolveBikeSpec(bike({ brakes: 'cable-disc' }), null).brakes.value).toBe('disc');
    expect(resolveBikeSpec(bike({ brakes: 'rim' }), null).brakes).toEqual({ value: 'rim', mark: 'entered' });
    expect(resolveBikeSpec(bike({ brakes: 'other' }), null).brakes).toEqual({ value: 'none', mark: 'entered' });
    expect(resolveBikeSpec(bike({ drive: 'chain-hub' }), null).drive).toEqual({ value: 'hub', mark: 'entered' });
    expect(resolveBikeSpec(bike({ drive: 'belt' }), null).drive).toEqual({ value: 'belt', mark: 'entered' });
    expect(resolveBikeSpec(bike({ drive: 'derailleur' }), null).drive).toEqual({ value: 'derailleur', mark: 'entered' });
    expect(resolveBikeSpec(bike({}), plan([], { bar: null, rack: 'empty' })).rack).toEqual({ value: true, mark: 'entered' });
    expect(resolveBikeSpec(bike({}), plan([{ pos: 'seat', L: 14, fill: 0.5 }])).rack).toEqual({ value: false, mark: 'default' });
    expect(resolveBikeSpec(bike({ look: { ebike: true } }), null).ebike).toEqual({ value: true, mark: 'entered' });
    expect(resolveBikeSpec(bike({ look: { colour: '#2F7D4F' } }), null).colour).toEqual({ value: '#2f7d4f', mark: 'entered' });
  });

  test('[BK-SPEC] where bottles and bags can go follows the bag planner: its cages, top-tube room and frame bag', () => {
    expect(resolveBikeSpec(null, null).mounts).toEqual({ st: true, dt: true, un: true, top: true, frame: true });
    expect(resolveBikeSpec(bike({ fit: { style: 'diamond-level', size: { kind: 'letter', value: 'XS' } } }), null).mounts).toEqual({ st: false, dt: true, un: false, top: true, frame: true });
    expect(resolveBikeSpec(bike({ fit: { style: 'trapeze' } }), null).mounts).toEqual({ st: false, dt: true, un: false, top: false, frame: true });
    expect(resolveBikeSpec(bike({ fit: { style: 'trapeze', topTubeBag: 'yes' } }), null).mounts.top).toBe(true);
    expect(resolveBikeSpec(bike({ fit: { style: 'step-through', bolts: { dt: 'yes' } } }), null).mounts).toEqual({ st: false, dt: true, un: false, top: false, frame: false });
    expect(resolveBikeSpec(bike({ fit: { style: 'compact', bolts: { st: 'no', un: 'yes' } } }), null).mounts).toEqual({ st: false, dt: true, un: true, top: true, frame: true });
  });
});

describe('the type, for defaults only (spec section 7.4): first match wins', () => {
  const typeOf = (fields: Record<string, unknown>, p: BagView | null = null) => resolveBikeSpec(bike(fields), p).type;

  test('[BK-TYPE] the seven rules in order', () => {
    expect(typeOf({ fit: { style: 'full-suspension' }, frontTyre: '26 x 4.0' })).toEqual({ value: 'mtb', mark: 'guessed' });
    for (const style of ['trapeze', 'mixte', 'step-through']) expect(typeOf({ fit: { style }, frontTyre: '26 x 4.0' }).value, style).toBe('trekking');
    expect(typeOf({ frontTyre: '90-559' }).value).toBe('fat');
    expect(typeOf({ frontTyre: '89-559' }).value).toBe('mtb');
    expect(typeOf({ frontTyre: '55-622' }).value).toBe('mtb');
    expect(typeOf({ frontTyre: '54-622' }).value).toBe('gravel');
    expect(typeOf({ frontTyre: '32-622' }).value).toBe('road');
    expect(typeOf({ frontTyre: '23-571' }).value).toBe('road');
    expect(typeOf({ frontTyre: '33-622' }).value).toBe('gravel');
    expect(typeOf({ frontTyre: '32-584' }).value).toBe('gravel');
    expect(typeOf({ frontTyre: '28-622', rearTyre: '35-622' }).value).toBe('gravel');
    expect(typeOf({ frontTyre: '28-622' }, plan([{ pos: 'rack', L: 15, pair: true, fill: [0.5, 0.5] }])).value).toBe('road');
    expect(typeOf({}, plan([{ pos: 'rack', L: 15, pair: true, fill: [0.5, 0.5] }]))).toEqual({ value: 'touring', mark: 'guessed' });
    expect(typeOf({}, plan([], { bar: null, rack: 'loaded' })).value).toBe('touring');
    expect(typeOf({ frontTyre: '40-622' })).toEqual({ value: 'gravel', mark: 'default' });
    expect(resolveBikeSpec(null, plan([{ pos: 'rack', L: 15, pair: true, fill: [0.5, 0.5] }])).type.value).toBe('touring');
  });

  test('[BK-TYPE] each type gives its handlebar, frame and fork', () => {
    const d = (fields: Record<string, unknown>, p: BagView | null = null) => {
      const s = resolveBikeSpec(bike(fields), p);
      return [s.type.value, s.bars.value, s.style.value, s.fork.value];
    };
    expect(d({ frontTyre: '28-622' })).toEqual(['road', 'drop', 'diamond-sloping', 'rigid']);
    expect(d({ frontTyre: '40-622' })).toEqual(['gravel', 'drop', 'diamond-sloping', 'rigid']);
    const panniers = plan([{ pos: 'rack', L: 15, pair: true, fill: [0.5, 0.5] }]);
    expect(d({ frontTyre: '40-622' }, panniers)).toEqual(['touring', 'drop', 'diamond-level', 'rigid']);
    expect(d({ frontTyre: '40-622', drive: 'chain-hub' }, panniers)).toEqual(['touring', 'flat', 'diamond-level', 'rigid']);
    expect(d({ frontTyre: '40-622', drive: 'belt' }, panniers)).toEqual(['touring', 'flat', 'diamond-level', 'rigid']);
    expect(d({ fit: { style: 'step-through' } })).toEqual(['trekking', 'flat', 'step-through', 'rigid']);
    expect(d({ frontTyre: '29 x 2.4' })).toEqual(['mtb', 'flat', 'diamond-sloping', 'suspension']);
    expect(d({ frontTyre: '26 x 4.0' })).toEqual(['fat', 'flat', 'diamond-sloping', 'rigid']);
    expect(d({ fit: { style: 'full-suspension' } })).toEqual(['mtb', 'flat', 'full-suspension', 'suspension']);
    // What the rider set wins over the type's default.
    expect(d({ frontTyre: '29 x 2.4', look: { bars: 'drop' }, fit: { style: 'compact' } })).toEqual(['mtb', 'drop', 'compact', 'suspension']);
  });
});
