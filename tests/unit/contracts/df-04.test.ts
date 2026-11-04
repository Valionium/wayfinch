// DF-04 (spec 11.4): values generated from the contracts' schemas go through both apps unchanged. Contract 1 (the load summary),
// Contract 2 (the handoff: its envelope, its <cp:trip> and its answer) and Contract 3 (the delete request and its answer).
// Each generated value is first checked against its schema, so the generators are held to the schemas too.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { readLoadSummary } from '../../../src/store/loadcheck-read.ts';
import { pendingBagDelete } from '../../../src/ui/you/services.ts';
import { JSDOM } from 'jsdom';
import { cleanupHandoff, handoffGpx, readEnvelope, tripAttributes } from '../../../src/ui/trip/handoff.ts';
import { DEFAULT_SETTINGS } from '../../../src/store/rules.ts';
import type { Route, Trip } from '../../../src/core/types.ts';

const memory = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), removeItem: (k: string) => void memory.delete(k) } });
const read = (rel: string): object => JSON.parse(readFileSync(join(process.cwd(), 'contracts', rel), 'utf8')) as object;
const ajv = new Ajv({ strict: true, allErrors: true });
const summarySchema = ajv.compile(read('schemas/load-summary.v1.json'));
const requestSchema = ajv.compile(read('schemas/delete-request.v1.json'));
const appliedSchema = ajv.compile(read('schemas/delete-applied.v1.json'));
const envelopeSchema = ajv.compile(read('handoff/handoff.v1.json'));
const doneSchema = ajv.compile(read('handoff/handoff-done.v1.json'));
const cpTripSchema = ajv.compile(read('handoff/cp-trip.v1.json'));
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

describe('[DF-04] Contract 2: the handoff', () => {
  const route = (hash: string): Route => ({
    id: 'r', name: 'R', points: [{ lat: 49.4, lon: 8.69, ele: 110, km: 0 }, { lat: 49.41, lon: 8.7, ele: 120, km: 1.3 }],
    lengthKm: 1.3, ascentM: 10, stages: [], climbs: [], source: 'gpx', sampleGrid: [], hash,
  });
  // names as a settlements layer has them: letters of any script, digits, spaces and the characters XML must escape
  const name = fc.stringMatching(/^[\p{L}\p{N}&"<>'., -]{1,160}$/u).map((n) => n.trim()).filter((n) => n.length > 0);
  const case2 = fc.record({
    hash: fc.stringMatching(/^[0-9a-f]{64}$/), nights: fc.option(fc.integer({ min: 0, max: 30 }), { nil: null }),
    date: fc.option(iso.map((x) => x.slice(0, 10)), { nil: null }), stay: fc.constantFrom('camping', 'mixed', 'accommodation'),
    pace: fc.constantFrom('steady', 'sporting', 'hard'), flatKph: fc.integer({ min: 15, max: 40 }),
    start: fc.option(name, { nil: null }), end: fc.option(name, { nil: null }),
  });
  const SLEEP: Record<string, string> = { camping: 'camp', mixed: 'mixed', accommodation: 'indoor' };
  const page = appVM({ bike: false });
  page.context.DOMParser = new JSDOM('').window.DOMParser;

  test('generated trips: the <cp:trip> the co-pilot writes passes its schema, and the bag planner reads back exactly what was sent', () => {
    fc.assert(fc.property(case2, (c) => {
      const settings = { ...DEFAULT_SETTINGS, nights: c.nights, stay: c.stay as never, pace: c.pace as never, flatKph: c.flatKph };
      const trip: Trip = { route: route(c.hash), departureDate: c.date, startTime: '08:30', flatKph: c.flatKph, stay: c.stay as never, campWaterL: 2 };
      const attributes = tripAttributes(trip, settings, { start: c.start, end: c.end });
      const sent = Object.fromEntries(attributes);
      expect(cpTripSchema(sent), JSON.stringify(cpTripSchema.errors)).toBe(true);
      page.context.qaText = handoffGpx(trip.route, attributes);
      const got = JSON.parse(page.run('JSON.stringify(handoffTrip(qaText))') as string) as Record<string, unknown>;
      const want: Record<string, unknown> = { nights: Number(sent.nights), pace: c.pace, flatKph: c.flatKph, route: c.hash };
      if (c.nights === null) want.nightsSuggested = true;
      if (c.date) { want.departureDate = c.date; want.month = Number(c.date.slice(5, 7)) - 1; }
      if (c.stay !== DEFAULT_SETTINGS.stay) want.sleep = SLEEP[c.stay];
      if (c.start) want.startName = c.start;
      if (c.end) want.endName = c.end;
      expect(got).toEqual(want);
    }), { numRuns: 200, seed: 6304 });
  });

  test('generated envelopes and answers: what one app writes, the other accepts; what the schema refuses, both refuse', () => {
    const envelope = fc.record({ id: hex32, createdAt: iso }).map((e) => ({ app: 'copilot', kind: 'handoff', v: 1, ...e }));
    const changes: [string, unknown][] = [['app', 'load-check'], ['kind', 'handoffs'], ['v', 2], ['id', 'XYZ'], ['createdAt', 'yesterday']];
    fc.assert(fc.property(envelope, fc.option(fc.constantFrom(...changes), { nil: null }), (e, change) => {
      const value = change ? { ...e, [change[0]]: change[1] } : e;
      const valid = envelopeSchema(value);
      expect(valid).toBe(change === null);
      memory.clear();
      localStorage.setItem('copilot:handoff:v1', JSON.stringify(value));
      expect(readEnvelope(localStorage) !== null).toBe(valid);
      page.context.qaText = JSON.stringify(value);
      expect(page.run('validHandoff(JSON.parse(qaText)) !== null')).toBe(valid);
    }), { numRuns: 200, seed: 6305 });
  });

  test('the answer the bag planner writes passes its schema, and the co-pilot then lets its handoff go', async () => {
    for (const outcome of ['applied', 'cancelled']) {
      const page2 = appVM({ bike: false });
      page2.context.history = { replaceState: () => undefined };
      page2.run(`HANDOFF.id='${'c'.repeat(32)}';writeHandoffDone('${outcome}')`);
      const answer = page2.values.get('loadcheck:handoff-done')!;
      expect(doneSchema(JSON.parse(answer)), JSON.stringify(doneSchema.errors)).toBe(true);
      memory.clear();
      localStorage.setItem('copilot:handoff:v1', JSON.stringify({ app: 'copilot', kind: 'handoff', v: 1, id: 'c'.repeat(32), createdAt: new Date().toISOString() }));
      localStorage.setItem('loadcheck:handoff-done', answer);
      const gone: string[] = [];
      expect(await cleanupHandoff({ now: () => new Date(), storage: localStorage, deleteRecord: async (id) => { gone.push(id); } })).toBe(true);
      expect(gone).toEqual(['c'.repeat(32)]);
    }
  });
});
