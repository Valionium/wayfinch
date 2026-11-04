// DF-04 (spec 11.4): values generated from the contracts' schemas go through both apps unchanged. Contract 1 (the load summary)
// and Contract 3 (the delete request and its answer); Contract 2, the handoff, has no writer yet (sub-project 6, group 2's cut).
// Each generated value is first checked against its schema, so the generators are held to the schemas too.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { readLoadSummary } from '../../../src/store/loadcheck-read.ts';
import { pendingBagDelete } from '../../../src/ui/you/services.ts';

const memory = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), removeItem: (k: string) => void memory.delete(k) } });
const read = (rel: string): object => JSON.parse(readFileSync(join(process.cwd(), 'contracts', rel), 'utf8')) as object;
const ajv = new Ajv({ strict: true, allErrors: true });
const summarySchema = ajv.compile(read('schemas/load-summary.v1.json'));
const requestSchema = ajv.compile(read('schemas/delete-request.v1.json'));
const appliedSchema = ajv.compile(read('schemas/delete-applied.v1.json'));
const require = createRequire(import.meta.url);
type VM = { run: (code: string) => unknown; context: Record<string, unknown>; values: Map<string, string> };
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: (o?: { bike?: boolean }) => VM };

const iso = fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2030, 0, 1) }).map((t) => new Date(t).toISOString());
const hex32 = fc.stringMatching(/^[0-9a-f]{32}$/);
const kg = fc.integer({ min: 0, max: 5000 }).map((n) => n / 100);
const frac = fc.integer({ min: 0, max: 1000 }).map((n) => n / 1000);
const POSITIONS = ['fork', 'bar', 'top', 'frame', 'bottle', 'seat', 'rack', 'pack'] as const;
const item = fc.record({
  pos: fc.constantFrom('fork', 'bar', 'top', 'frame', 'seat', 'rack', 'pack'), L: fc.integer({ min: 1, max: 400 }).map((n) => n / 10),
  pair: fc.boolean(), shape: fc.integer({ min: 0, max: 3 }), slot: fc.constantFrom('front', 'rear'), f1: frac, f2: frac,
}).map((i) => ({
  pos: i.pos, L: i.L, ...(i.pos === 'top' ? { slot: i.slot } : {}), ...(i.pos === 'frame' ? { shape: i.shape } : {}),
  ...(i.pos === 'fork' || i.pos === 'rack' ? { pair: i.pair, fill: i.pair ? [i.f1, i.f2] : i.f1 } : { fill: i.f1 }),
}));
const deck = fc.constantFrom(null, 'empty', 'loaded');
const fullSummary = fc.record({
  at: iso, planUpdatedAt: iso, nights: fc.integer({ min: 0, max: 30 }), month: fc.integer({ min: 1, max: 12 }),
  departureDate: fc.option(iso.map((s) => s.slice(0, 10)), { nil: null }), mode: fc.constantFrom('comfort', 'light'), foodDays: fc.integer({ min: 1, max: 31 }),
  bikeId: fc.option(fc.stringMatching(/^bike_[a-z0-9]{4,12}$/), { nil: null }),
  items: fc.array(item, { maxLength: 8 }), decks: fc.record({ bar: deck, rack: deck }),
  bottles: fc.array(fc.record({ slot: fc.constantFrom('st', 'dt', 'un'), L: fc.constantFrom(0.5, 0.75, 1) }), { maxLength: 3 }),
  extraL: kg, kitKg: kg, bikeKg: fc.option(kg, { nil: null }), emptyLuggageKg: fc.option(kg, { nil: null }),
  byPosition: fc.array(kg, { minLength: 8, maxLength: 8 }), unplacedKg: kg, waterFilter: fc.boolean(),
}).map((s) => {
  const cageL = +s.bottles.reduce((n, b) => n + b.L, 0).toFixed(2);
  const byPositionKg = Object.fromEntries(POSITIONS.map((p, i) => [p, s.byPosition[i]!]));
  const positions = s.items.flatMap((i) => ('pair' in i && i.pair ? [i.pos, i.pos] : [i.pos]));
  return {
    app: 'load-check', kind: 'load-summary', v: 1, at: s.at, planUpdatedAt: s.planUpdatedAt, nights: s.nights, month: s.month,
    departureDate: s.departureDate, mode: s.mode, foodDays: s.foodDays, bikeId: s.bikeId,
    bags: { count: positions.length, positions, items: s.items }, decks: s.decks,
    water: { bottles: s.bottles, cageL, extraL: s.extraL, totalL: +(cageL + s.extraL).toFixed(2) },
    weight: {
      kitKg: s.kitKg, cageWaterKg: cageL, carriedKg: +(Object.values(byPositionKg).reduce((a, b) => a + b, 0) + s.unplacedKg).toFixed(2),
      bikeKg: s.bikeKg, emptyLuggageKg: s.emptyLuggageKg, byPositionKg, unplacedKg: s.unplacedKg,
    },
    kit: { waterFilter: s.waterFilter },
  };
});
const emptySummary = iso.map((at) => ({ app: 'load-check', kind: 'load-summary', v: 1, at, empty: true }));

describe('[DF-04] Contract 1: the load summary', () => {
  test('a generated summary, written as the bag planner writes it, reads back byte for byte in the co-pilot; so does an empty one', () => {
    fc.assert(fc.property(fc.oneof(fullSummary, emptySummary), (summary) => {
      expect(summarySchema(summary), JSON.stringify(summarySchema.errors)).toBe(true);
      const text = JSON.stringify(summary);
      localStorage.setItem('loadcheck:summary:v1', text);
      expect(JSON.stringify(readLoadSummary())).toBe(text);
    }), { numRuns: 300, seed: 6301 });
  });
});

describe('[DF-04] Contract 3: the delete request and its answer', () => {
  const request = fc.record({ id: hex32, createdAt: iso }).map((r) => ({ app: 'copilot', kind: 'delete-request', v: 1, id: r.id, createdAt: r.createdAt }));

  test('a generated request: the co-pilot holds it pending, the bag planner reads it unchanged and answers with a delete-applied the co-pilot accepts', () => {
    fc.assert(fc.property(request, (r) => {
      expect(requestSchema(r), JSON.stringify(requestSchema.errors)).toBe(true);
      memory.clear();
      const text = JSON.stringify(r);
      localStorage.setItem('copilot:delete-request:v1', text);
      expect(pendingBagDelete()).toEqual({ id: r.id });
      const page = appVM({ bike: false });
      page.values.set('copilot:delete-request:v1', text);
      expect(page.run('JSON.stringify(validDeleteRequest(readLocalJson(DELETE_REQUEST_KEY)))')).toBe(text);
      expect(page.run('applyDeleteRequest()')).toBe(true);
      const answer = page.values.get('loadcheck:delete-applied')!;
      expect(appliedSchema(JSON.parse(answer)), JSON.stringify(appliedSchema.errors)).toBe(true);
      localStorage.setItem('loadcheck:delete-applied', answer);
      expect(pendingBagDelete()).toBeNull();
      expect(localStorage.getItem('copilot:delete-request:v1')).toBeNull();
    }), { numRuns: 100, seed: 6302 });
  }, 120_000);

  test('a value the schema refuses is refused by both apps alike', () => {
    const page = appVM({ bike: false });
    const changes: [string, unknown][] = [['app', 'load-check'], ['kind', 'delete'], ['v', 2], ['id', 'ABC'], ['id', 'x'.repeat(32)]];
    const broken = fc.tuple(request, fc.constantFrom(...changes)).map(([r, [k, v]]) => ({ ...r, [k]: v }));
    fc.assert(fc.property(broken, (r) => {
      expect(requestSchema(r)).toBe(false);
      memory.clear();
      localStorage.setItem('copilot:delete-request:v1', JSON.stringify(r));
      expect(pendingBagDelete()).toBeNull();
      page.context.qaText = JSON.stringify(r);
      expect(page.run('validDeleteRequest(JSON.parse(qaText))')).toBeNull();
    }), { numRuns: 100, seed: 6303 });
  });
});
