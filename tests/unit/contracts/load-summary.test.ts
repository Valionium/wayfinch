import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import { describe, expect, test } from 'vitest';

const read = (rel: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../contracts/${rel}`, import.meta.url)), 'utf8'));
const ajv = new Ajv({ strict: true, allErrors: true });
const validate = ajv.compile(read('schemas/load-summary.v1.json') as object);

type Full = {
  month: number; bags: { count: unknown; items: { fill: unknown; slot?: unknown }[] }; decks: Record<string, unknown>;
  water: { bottles: { slot: unknown }[] }; v: unknown; app: unknown; kind: unknown;
  weight: { carriedKg: number; byPositionKg: Record<string, number>; unplacedKg: number; bikeKg: number | null; emptyLuggageKg: number | null };
  kit: Record<string, unknown>;
};
const full = (): Full => structuredClone(read('load-summary/full.json')) as Full;
const FIXTURES = ['full', 'no-bike-weight', 'empty'];

describe('[C-SUMMARY-SCHEMA] Contract 1, load summary v1', () => {
  test.each(FIXTURES)('the %s fixture passes the schema', (name) => {
    const ok = validate(read(`load-summary/${name}.json`));
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  test('the schema rejects month 0 and month 13, and a month stored the Load Check way', () => {
    for (const month of [0, 13, -1, 6.5, '6']) {
      const s = full();
      s.month = month as number;
      expect(validate(s), `month ${String(month)}`).toBe(false);
    }
    for (const month of [1, 12]) {
      const s = full();
      s.month = month;
      expect(validate(s), `month ${month}`).toBe(true);
    }
  });

  test('the schema rejects bags.count as text, or as a fraction', () => {
    for (const count of ['3', 2.5, -1, null]) {
      const s = full();
      s.bags.count = count;
      expect(validate(s), `count ${String(count)}`).toBe(false);
    }
  });

  test('the schema rejects a wrong envelope', () => {
    for (const [field, value] of [['v', 2], ['v', '1'], ['app', 'copilot'], ['kind', 'packing-list']] as const) {
      const s = full();
      (s as Record<string, unknown>)[field] = value;
      expect(validate(s), `${field} ${String(value)}`).toBe(false);
    }
  });

  test('the schema rejects values out of range in the parts', () => {
    const cases: [string, (s: Full) => void][] = [
      ['fill above 1', (s) => { s.bags.items[0]!.fill = 1.2; }],
      ['a pair with three fills', (s) => { s.bags.items[1]!.fill = [0.1, 0.2, 0.3]; }],
      ['a deck that is neither empty nor loaded', (s) => { s.decks['rack'] = 'full'; }],
      ['a bottle slot that is no slot', (s) => { s.water.bottles[0]!.slot = 'xx'; }],
      ['a top-tube slot that is no slot', (s) => { s.bags.items[0]!.slot = 'middle'; }],
      ['a missing weight block', (s) => { delete (s as Partial<Full>).weight; }],
      ['a position weight as text', (s) => { s.weight.byPositionKg['rack'] = '7' as unknown as number; }],
      ['a missing waterFilter', (s) => { delete s.kit['waterFilter']; }],
      ['a negative carried weight', (s) => { s.weight.carriedKg = -1; }],
    ];
    for (const [name, change] of cases) {
      const s = full();
      change(s);
      expect(validate(s), name).toBe(false);
    }
  });

  test('readers ignore unknown fields, so the schema allows them', () => {
    const s = full();
    (s as Record<string, unknown>)['somethingNew'] = { a: 1 };
    expect(validate(s)).toBe(true);
  });

  test('full.json is the example of section 7.1, unchanged', () => {
    const s = full() as unknown as Record<string, unknown>;
    expect(s).toMatchObject({
      app: 'load-check', kind: 'load-summary', v: 1, at: 'ISO time', planUpdatedAt: 'ISO time', nights: 2, month: 6,
      departureDate: null, mode: 'comfort', foodDays: 2, bikeId: 'bike_m2k9x1_4f7a2c9d',
      bags: { count: 3, positions: ['frame', 'rack', 'rack'] },
      decks: { bar: null, rack: 'loaded' },
      water: { cageL: 1.25, extraL: 0, totalL: 1.25 },
      weight: { kitKg: 8.95, cageWaterKg: 1.25, carriedKg: 10.2, bikeKg: 14, emptyLuggageKg: 2.4, unplacedKg: 0 },
      kit: { waterFilter: false },
    });
    expect(full().bags.items).toEqual([
      { pos: 'frame', L: 3, shape: 2, fill: 0.8 },
      { pos: 'rack', L: 15, pair: true, fill: [0.6, 0.5] },
    ]);
    expect(full().water.bottles).toEqual([{ slot: 'st', L: 0.5 }, { slot: 'dt', L: 0.75 }]);
  });

  test.each(['full', 'no-bike-weight'])('%s: the position weights and the unplaced kit add up to the carried weight within 0.05 kg', (name) => {
    const w = (read(`load-summary/${name}.json`) as Full).weight;
    const sum = Object.values(w.byPositionKg).reduce((a, b) => a + b, 0) + w.unplacedKg;
    expect(Math.abs(sum - w.carriedKg)).toBeLessThanOrEqual(0.05);
  });

  test('empty.json is {app, kind, v, at, empty: true} and nothing else', () => {
    const e = read('load-summary/empty.json') as Record<string, unknown>;
    expect(Object.keys(e).sort()).toEqual(['app', 'at', 'empty', 'kind', 'v']);
    expect(e['empty']).toBe(true);
    expect(e['v']).toBe(1);
  });

  test('a summary marked empty must really be empty: the full parts are refused beside empty: true', () => {
    const s = full() as unknown as Record<string, unknown>;
    s['empty'] = true;
    expect(validate(s)).toBe(false);
    expect(validate({ app: 'load-check', kind: 'load-summary', v: 1, at: 'x', empty: false })).toBe(false);
  });

  test('no-bike-weight.json has no bike weight and no weight for the empty luggage', () => {
    const s = read('load-summary/no-bike-weight.json') as Full;
    expect(s.weight.bikeKg).toBeNull();
    expect(s.weight.emptyLuggageKg).toBeNull();
  });
});
