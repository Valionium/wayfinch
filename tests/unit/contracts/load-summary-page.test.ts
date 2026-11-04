// Contract 1 from the bag planner's side (spec 7.1): the summary the page writes, worked out with its own functions, run on the page's
// code. Checked against the shared schema and fixtures, the co-pilot's reader, and the field rules over generated plans.
// The page is never printed: only values its functions return are compared.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { bagViewOf } from '../../../src/core/bike/index.ts';
import type { BikeRecord } from '../../../src/core/bike/index.ts';
import type { LoadSummary } from '../../../src/core/types.ts';
import { readLoadSummary } from '../../../src/store/loadcheck-read.ts';

const require = createRequire(import.meta.url);
type VM = { run: (code: string) => unknown };
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: () => VM };
const read = (rel: string): unknown => JSON.parse(readFileSync(join(process.cwd(), 'contracts', rel), 'utf8'));
// The co-pilot's reader reads localStorage; this file runs in Node (the page's bike.js build needs Node's TextEncoder), so a plain one.
const memory = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), removeItem: (k: string) => void memory.delete(k) } });
const validate = new Ajv({ strict: true, allErrors: true }).compile(read('schemas/load-summary.v1.json') as object);

type Item = { pos: string; L: number; fill: number | number[]; pair?: boolean; shape?: number; slot?: string };
type Summary = Record<string, unknown> & {
  bags: { count: number; positions: string[]; items: Item[] }; decks: { bar: string | null; rack: string | null };
  water: { bottles: { slot: string; L: number }[]; cageL: number; extraL: number; totalL: number };
  weight: { kitKg: number; cageWaterKg: number; carriedKg: number; bikeKg: number | null; emptyLuggageKg: number | null; byPositionKg: Record<string, number>; unplacedKg: number };
};

/** A page with a plan set up by `code` (run in the page's own realm), and its summary. */
function summaryOf(code: string): { page: VM; summary: Summary } {
  const page = appVM();
  page.run(`renderBikeProfiles=()=>{};renderKit=()=>{};drawRig=()=>{};DRAFT_READY=true;
    S.place=null;S.place2=null;S.gpx=null;S.kit=Object.fromEntries(KIT.map(k=>[k.id,false]));S.kitTouched={};S.qty={};S.custom={};S.pinned={};S.packed={};
    S.bags=[];S.decks={bar:false,rack:false};S.mode='comfort';S.nights=2;S.sleep='camp';S.foodMode='all';S.month=5;S.bikeProfile=null;S.tyrePressure=null;
    ${code}`);
  return { page, summary: JSON.parse(page.run('JSON.stringify(loadSummary())') as string) as Summary };
}
const sumOf = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

// The fixtures' state: a frame bag, a pair of panniers, two bottles, a loaded rack deck, a bike with its weight and the bags' own weight.
const FULL = `S.bikeProfile=normaliseBikeProfile({id:'bike_m2k9x1_4f7a2c9d',name:'Tourer',pressure:{bikeKg:14}});
  S.tyrePressure=normaliseTyrePressure({bagKg:2.4});
  S.bags=[{uid:1,pos:'frame',L:3,shape:2,userL:true},{uid:2,pos:'rack',L:15,pair:true},{uid:3,pos:'bottle',slot:'st',L:0.5},{uid:4,pos:'bottle',slot:'dt',L:0.75}];
  S.nextUid=5;S.decks={bar:false,rack:true};
  for(const id of ['tent','pad','bag','stove','pot','tubes','pump','tools','jacket','food']) if(S.kit[id]!==undefined) S.kit[id]=true;`;

describe('[C-SUMMARY-FIXTURES] the page writes what contracts/load-summary holds', () => {
  test('the page\'s summary for each fixture\'s state passes the schema, has the fixture\'s fields and kinds, and the co-pilot reads it', () => {
    const states: Record<string, string> = { full: FULL, 'no-bike-weight': FULL.replace('pressure:{bikeKg:14}', 'pressure:{}').replace('{bagKg:2.4}', '{}'), empty: '' };
    const shape = (x: unknown): unknown => Array.isArray(x) ? x.map(shape).slice(0, 1) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, shape(v)])) : x === null ? null : typeof x;
    for (const [name, code] of Object.entries(states)) {
      const { summary } = summaryOf(code);
      expect(validate(summary), `${name}: ${JSON.stringify(validate.errors)}`).toBe(true);
      const fixture = read(`load-summary/${name}.json`) as Record<string, unknown>;
      expect(Object.keys(summary), name).toEqual(Object.keys(fixture));
      // the same fields with the same kinds of value, nested; the numbers come from the page's own allocation
      const mine = shape(summary) as Record<string, unknown>, theirs = shape(fixture) as Record<string, unknown>;
      for (const key of Object.keys(theirs)) if (!['bags', 'water', 'weight'].includes(key)) expect(mine[key], `${name}.${key}`).toEqual(theirs[key]);
      if (name !== 'empty') {
        for (const part of ['water', 'weight', 'decks', 'kit']) expect(Object.keys(summary[part] as object), `${name}.${part}`).toEqual(Object.keys(fixture[part] as object));
        expect(Object.keys((summary.weight as Summary['weight']).byPositionKg)).toEqual(Object.keys((fixture.weight as Summary['weight']).byPositionKg));
      }
      localStorage.setItem('loadcheck:summary:v1', JSON.stringify(summary));
      expect(readLoadSummary(), `${name}: the co-pilot reads it`).toEqual(summary);
    }
    localStorage.removeItem('loadcheck:summary:v1');
  });

  test('the full state gives the fixture\'s plan: its bags, bottles, decks, month, bike and weights', () => {
    const { summary } = summaryOf(FULL);
    expect(summary).toMatchObject({ nights: 2, month: 6, departureDate: null, mode: 'comfort', foodDays: 3, bikeId: 'bike_m2k9x1_4f7a2c9d', decks: { bar: null, rack: 'loaded' } });
    expect(summary.bags.positions).toEqual(['frame', 'rack', 'rack']);
    expect(summary.bags.count).toBe(3);
    expect(summary.bags.items.map(({ fill, ...rest }) => ({ ...rest, fills: Array.isArray(fill) ? fill.length : 1 }))).toEqual([
      { pos: 'frame', L: 3, shape: 2, fills: 1 }, { pos: 'rack', L: 15, pair: true, fills: 2 }]);
    expect(summary.water).toEqual({ bottles: [{ slot: 'st', L: 0.5 }, { slot: 'dt', L: 0.75 }], cageL: 1.25, extraL: 0, totalL: 1.25 });
    expect(summary.weight).toMatchObject({ cageWaterKg: 1.25, bikeKg: 14, emptyLuggageKg: 2.4 });
    expect(summary.weight.byPositionKg.bottle).toBe(1.25);
    const noWeight = summaryOf(FULL.replace('pressure:{bikeKg:14}', 'pressure:{}').replace('{bagKg:2.4}', '{}')).summary;
    expect(noWeight.weight).toMatchObject({ bikeKg: null, emptyLuggageKg: null });
    expect(summaryOf('').summary).toEqual({ app: 'load-check', kind: 'load-summary', v: 1, at: expect.any(String), empty: true });
  });
});

describe('[C-SUMMARY-ORPHAN] a summary naming a bike no one has', () => {
  test('reads as none: the plan\'s other bike gets no bags; with no bike, none matches none (spec 7.1, 7.4)', () => {
    const { summary } = summaryOf(FULL);
    const orphan = { ...summary, bikeId: 'bike_gone' } as unknown as LoadSummary;
    const other = { id: 'bike_other' } as BikeRecord;
    expect(bagViewOf(orphan, other, ['bike_other'])).toBeNull();
    expect(bagViewOf(orphan, null, [])).toEqual(bagViewOf({ ...orphan, bikeId: null }, null, []));
    expect(bagViewOf({ ...orphan, bikeId: 'bike_other' }, other, ['bike_other'])).not.toBeNull();
  });
});

// The mass-accounting cases of the retired tyre-pressure suite, on the summary's weights: kit, cage water counted full, food modes,
// the light mode, a spilled item, and a backpack's load.
describe('[C-SUMMARY-INVARIANT] the summary\'s weights', () => {
  const kit = (code: string) => summaryOf(`S.bags=[{uid:1,pos:'seat',L:14},{uid:2,pos:'bottle',slot:'st',L:0.75},{uid:3,pos:'bottleU',slot:'un',L:0.5}];S.nextUid=4;${code}`).summary;
  test('kit, food modes and the light mode count as the page counts them; cage water is counted full', () => {
    const base = kit("S.kit.tubes=true;S.qty.tubes=3;S.custom.tubes={L:.2,kg:.3,rigid:0};S.kit.food=true;S.custom.food={L:.3,kg:.4,rigid:0};S.kit.water=true;S.custom.water={L:1.5,kg:1.5,rigid:0}");
    expect(base.weight.kitKg).toBeCloseTo(0.9 + 1.2 + 1.5, 6);
    expect(base.water.cageL).toBe(1.25);
    expect(base.water.extraL).toBe(1.5);
    expect(base.weight.cageWaterKg).toBe(1.25);
    expect(base.weight.carriedKg).toBeCloseTo(3.6 + 1.25, 2); // kit and cage water; the bags' own weight is a field of its own
    const food = (mode: string, nights: number) => kit(`S.kit.food=true;S.custom.food={L:.3,kg:.4,rigid:0};S.foodMode=${mode};S.nights=${nights}`).weight.kitKg;
    expect(food('1', 2)).toBeCloseTo(0.4, 6);
    expect(food('2', 2)).toBeCloseTo(0.8, 6);
    expect(food('"all"', 4)).toBeCloseTo(2, 6);
    const comfort = kit("S.kit.pillow=true;S.custom.pillow={L:.5,kg:.2,rigid:0};S.kit.tubes=true;S.custom.tubes={L:.2,kg:.3,rigid:0}");
    const light = kit("S.kit.pillow=true;S.custom.pillow={L:.5,kg:.2,rigid:0};S.kit.tubes=true;S.custom.tubes={L:.2,kg:.3,rigid:0};S.mode='light'");
    expect(comfort.weight.kitKg).toBeCloseTo(0.5, 6);
    expect(light.weight.kitKg).toBeCloseTo(0.3, 6);
  });
  test('a spilled item still counts, as unplaced; a backpack\'s load is under pack', () => {
    const spilled = summaryOf("S.bags=[{uid:1,pos:'frame',L:.5,shape:2,userL:true}];S.nextUid=2;S.kit.tubes=true;S.qty.tubes=3;S.custom.tubes={L:.2,kg:.3,rigid:0}").summary;
    expect(spilled.weight.unplacedKg).toBeGreaterThan(0);
    expect(sumOf(spilled.weight.byPositionKg) + spilled.weight.unplacedKg).toBeCloseTo(spilled.weight.carriedKg, 1);
    const pack = summaryOf("S.bags=[{uid:1,pos:'frame',L:.5,shape:2,userL:true},{uid:2,pos:'pack',L:.5,userL:true}];S.nextUid=3;S.kit.tubes=true;S.qty.tubes=3;S.custom.tubes={L:.2,kg:.3,rigid:0}").summary;
    expect(pack.weight.byPositionKg.pack).toBeGreaterThan(0);
  });

  const POS = ['top', 'frame', 'fork', 'bar', 'seat', 'rack', 'pack'] as const;
  const bag = fc.record({
    pos: fc.constantFrom(...POS, 'bottle', 'bottleU'),
    L: fc.constantFrom(0.5, 1, 2, 3, 5, 8, 12, 15, 20),
    pair: fc.boolean(),
    slot: fc.constantFrom('front', 'rear', 'st', 'dt'),
  });
  const plan = fc.record({
    bags: fc.array(bag, { maxLength: 8 }),
    kit: fc.subarray(['tent', 'pad', 'bag', 'stove', 'pot', 'tubes', 'pump', 'tools', 'jacket', 'food', 'water', 'pillow', 'shoes', 'towel', 'lock']),
    nights: fc.integer({ min: 0, max: 6 }),
    mode: fc.constantFrom('comfort', 'light'),
    decks: fc.record({ bar: fc.boolean(), rack: fc.boolean() }),
    style: fc.constantFrom('unknown', 'diamond-level', 'compact', 'trapeze', 'mixte', 'step-through', 'full-suspension'),
    size: fc.constantFrom('XS', 'S', 'M', 'L', 'XL'),
    bolts: fc.constantFrom('yes', 'no', 'unknown'),
  });
  type Gen = { bags: { pos: string; L: number; pair: boolean; slot: string }[]; kit: string[]; nights: number; mode: string; decks: { bar: boolean; rack: boolean }; style: string; size: string; bolts: string };
  const codeFor = (p: Gen): string => {
    const bags = p.bags.map((b, i) => {
      const bottle = b.pos === 'bottle' || b.pos === 'bottleU';
      const slot = b.pos === 'bottleU' ? 'un' : bottle ? (b.slot === 'st' || b.slot === 'dt' ? b.slot : 'st') : b.pos === 'top' ? (b.slot === 'rear' ? 'rear' : 'front') : undefined;
      return { uid: i + 1, pos: b.pos, L: bottle ? Math.min(b.L, 1) : b.L, ...(b.pair && (b.pos === 'fork' || b.pos === 'rack') ? { pair: true } : {}), ...(slot ? { slot } : {}) };
    });
    return `S.bags=${JSON.stringify(bags)};S.nextUid=${bags.length + 1};S.decks=${JSON.stringify(p.decks)};S.nights=${p.nights};S.mode='${p.mode}';
      for(const id of ${JSON.stringify(p.kit)}) if(S.kit[id]!==undefined) S.kit[id]=true;
      S.bikeProfile=normaliseBikeProfile({id:'gen',name:'Gen',fit:{style:'${p.style}',size:{kind:'letter',value:'${p.size}'},bolts:{st:'${p.bolts}',dt:'${p.bolts}',un:'${p.bolts}'}}});`;
  };

  test('over generated plans: the sum by position plus unplaced is carried within 0.05; count is items plus pairs; what the frame can\'t take is left out everywhere; one pannier half is one entry', () => {
    fc.assert(fc.property(plan, (p) => {
      const { page, summary } = summaryOf(codeFor(p));
      expect(validate(summary), JSON.stringify(validate.errors)).toBe(true);
      if ('empty' in summary) { expect(p.bags.length).toBe(0); return; }
      const w = summary.weight;
      expect(Math.abs(sumOf(w.byPositionKg) + w.unplacedKg - w.carriedKg)).toBeLessThanOrEqual(0.05);
      expect(summary.bags.count).toBe(summary.bags.items.length + summary.bags.items.filter((i) => i.pair === true).length);
      expect(summary.bags.positions.length).toBe(summary.bags.count);
      for (const i of summary.bags.items) {
        if (i.pair === true) expect(Array.isArray(i.fill) && i.fill.length === 2).toBe(true);
        else expect(typeof i.fill).toBe('number');
      }
      // left out everywhere: the plan without the bags and bottles the frame can't take gives the same summary
      const unusable = page.run('JSON.stringify(S.bags.filter(b=>!bagSpec(b).usable).map(b=>b.uid))') as string;
      if (unusable !== '[]') {
        const without = summaryOf(`${codeFor(p)};S.bags=S.bags.filter(b=>!${unusable}.includes(b.uid));`).summary;
        const bare = (s: Record<string, unknown>) => JSON.stringify({ ...s, at: null, planUpdatedAt: null });
        if (!('empty' in without)) expect(bare(without)).toBe(bare(summary));
      }
    }), { numRuns: 120, seed: 6022 });
  }, 120_000);
});
