// Trial bags (sub-project 13, group 3, Task 7; decision 7), the heart of it, over generated riders on the bag planner page's own code: a
// trial bag that is not kept leaves no trace. Here, not in qa/advisor.cjs (which holds the hand-made cases), because 200 real searches
// take about a minute and a half, and qa/run-all.cjs runs inside LC-QA-ALL's time. Fixed seed. Nothing here prints the page.
import { createRequire } from 'node:module';
import fc from 'fast-check';
import { expect, test } from 'vitest';

type Page = { run: (code: string) => unknown; context: Record<string, unknown>; values: Map<string, string> };
const require = createRequire(import.meta.url);
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: () => Page };

const FULL = { id: 'full', name: 'Full details', fit: { style: 'diamond-level', size: { kind: 'letter', value: 'M' }, bolts: { st: 'yes', dt: 'yes', un: 'no' },
  topTubeBag: 'yes', triangleCm: { top: 55, seat: 48, down: 62 }, seatGapCm: 30, barWidthCm: 50 }, rackMounts: 'yes' };
const BARE = { id: 'bare', name: 'Bare' };
const STEP = { id: 'step', name: 'Step-through', fit: { style: 'step-through' }, rackMounts: 'no' };
const XS = { id: 'xs', name: 'Small', fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'XS' }, bolts: { st: 'yes', dt: 'yes' } } };
const GRAVEL = { id: 'gravel', name: 'Gravel', fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' }, bolts: { st: 'yes', dt: 'yes' } }, rackMounts: 'no' };
const TOURER = { id: 'tourer', name: 'Tourer', fit: { style: 'diamond-level', size: { kind: 'letter', value: 'L' } }, rackMounts: 'yes' };
// Each item's lightest or bulkiest tier, as the questionnaire's light and a lot take them (decision 5).
const CARRY = {
  light: "S.mode='light';S.custom=Object.fromEntries(KIT.filter(k=>k.tiers).map(k=>{const t=[...k.tiers].sort((a,b)=>a.kg-b.kg||a.L-b.L)[0];return [k.id,{L:t.L,kg:t.kg,rigid:t.rigid}];}));",
  average: "S.mode='comfort';S.custom={};",
  lot: "S.mode='comfort';S.custom=Object.fromEntries(KIT.filter(k=>k.tiers).map(k=>{const t=[...k.tiers].sort((a,b)=>b.L-a.L||b.kg-a.kg)[0];return [k.id,{L:t.L,kg:t.kg,rigid:t.rigid}];}));",
};

const opt = <T>(a: fc.Arbitrary<T>) => fc.option(a, { nil: null });
const riderArb = fc.record({
  bike: fc.constantFrom<object | null>(FULL, BARE, STEP, XS, GRAVEL, TOURER, null),
  top: opt(fc.constantFrom(0.5, 1, 1.5, 2)), frame: opt(fc.constantFrom(0, 1, 2)), fork: opt(fc.record({ L: fc.constantFrom(2, 3, 5), pair: fc.boolean() })),
  bar: opt(fc.constantFrom(5, 8, 12, 15)), seat: opt(fc.constantFrom(4, 8, 10, 14, 16)), rack: opt(fc.record({ L: fc.constantFrom(10, 15, 20, 25), pair: fc.boolean() })),
  pack: opt(fc.constantFrom(10, 15, 20, 30)), bottles: fc.integer({ min: 0, max: 2 }),
  rackDeck: fc.boolean(), barDeck: fc.boolean(), nights: fc.integer({ min: 0, max: 5 }), sleep: fc.constantFrom('camp', 'indoor'),
  carry: fc.constantFrom('light', 'average', 'lot'), hand: opt(fc.nat(50)),
  style: fc.constantFrom('bags', 'bags-first', 'panniers'), goal: fc.constantFrom('handling', 'backpack'),
}).filter((r) => r.top !== null || r.frame !== null || !!r.fork || !!r.bar || !!r.seat || !!r.rack || !!r.pack);
type Rider = typeof riderArb extends fc.Arbitrary<infer R> ? R : never;

function riderSetup(r: Rider): string {
  const bags: object[] = [];
  const add = (b: object) => bags.push({ uid: bags.length + 1, ...b });
  if (r.top !== null) add({ pos: 'top', slot: 'front', L: r.top });
  if (r.frame !== null) add({ pos: 'frame', shape: r.frame, L: [6, 4.5, 3][r.frame] });
  if (r.fork) add({ pos: 'fork', L: r.fork.L, ...(r.fork.pair ? { pair: true } : {}) });
  if (r.bar) add({ pos: 'bar', L: r.bar });
  if (r.seat) add({ pos: 'seat', L: r.seat });
  if (r.rack) add({ pos: 'rack', L: r.rack.L, ...(r.rack.pair ? { pair: true } : {}) });
  if (r.pack) add({ pos: 'pack', L: r.pack });
  for (let i = 0; i < r.bottles; i++) add({ pos: 'bottle', slot: ['dt', 'st'][i], L: 0.75 });
  // a hand placement: an item of the trip's kit into one of the rider's bags (never a bottle)
  const hand = r.hand === null ? '' : `{const k=activeKit().filter(k=>!k.divisible),b=S.bags.filter(b=>!b.pos.startsWith('bottle'));
    if(k.length&&b.length)S.pinned={[k[${r.hand}%k.length].id]:b[${r.hand}%b.length].uid+'-0'};}`;
  return `S.bags=${JSON.stringify(bags)};S.nextUid=${bags.length + 1};S.decks={bar:${r.barDeck},rack:${r.rackDeck}};S.nights=${r.nights};S.sleep='${r.sleep}';
    S.placements=null;S.pinned={};S.packed={};S.qty={};applyTripKitDefaults();${CARRY[r.carry as keyof typeof CARRY]}${hand}S.step=2;`;
}

test('[GA-TRY-SAME] [GA-TRIAL-NO-TRACE] over 200 generated riders, for every suggestion: Try gives exactly the suggestion\'s items, overflow and back litres; a closing tab writes nothing of it; after Remove, S, the kept plan, every loadcheck:* key and an export are byte for byte as before', () => {
  const p = appVM();
  // as a page after start-up, its drawing left out; go(n), the step change, is in the start-up part the VM leaves out
  p.run("renderKit=()=>{};drawRig=()=>{};renderBags=()=>{};closeBagPop=()=>{};buildThumb=()=>'';go=n=>{S.step=n;};DRAFT_READY=true;");
  const json = (code: string): unknown => JSON.parse((p.run(`JSON.stringify(${code})`) as string | undefined) ?? 'null');
  const stored = () => Object.fromEntries([...p.values].filter(([k]) => k.startsWith('loadcheck:')).sort(([a], [b]) => (a < b ? -1 : 1)));
  const exported = () => { const x = JSON.parse(p.run('exportAll()') as string); delete x.exported; delete x.draft.updatedAt; return JSON.stringify(x); };
  const settled = () => p.run('currentPlan(),JSON.stringify([S,PLAN_CACHE.sig,KIT.filter(k=>k.added)])') as string;
  let riders = 0, tries = 0, hands = 0, light = 0, decks = 0, bare = 0;
  fc.assert(fc.property(riderArb, (r) => {
    p.context.qaBike = JSON.stringify(r.bike);
    p.run(`S.bikeProfile=normaliseBikeProfile(JSON.parse(qaBike));${riderSetup(r)}flushDraft();`);
    const keys = stored(), out = exported(), state = settled();
    // the search as the view runs it, on the plan's own packing (the view's drawing of each card is GA-ANSWER's, in qa/advisor.cjs)
    p.run(`qaInput=advisorInput(${JSON.stringify(r.style)},${JSON.stringify(r.goal)});qaList=advisorCards(window.WayfinchAdvisor.advise(qaInput));`);
    const n = json('qaList.length') as number;
    riders++;
    if (Object.keys(json('S.pinned') as object).length) hands++;
    if (r.carry === 'light') light++;
    if (r.rackDeck || r.barDeck) decks++;
    if (r.bike === BARE || r.bike === null) bare++;
    for (let i = 0; i < n; i++) {
      const s = json(`(()=>{const s=qaList[${i}];return {items:s.result.items,overL:s.result.overL,backL:s.result.backL,spill:s.result.spillIds,what:advisorWhat(s,qaInput)};})()`) as
        { items: unknown; overL: number; backL: number; spill: string[]; what: string };
      expect(json(`startTrial(qaList[${i}],qaInput)`), s.what).toBe(true);
      tries++;
      const plan = json('(()=>{const a=currentPlan();return {items:a.items,overL:a.summary.overL,backL:backOf(a),spill:[...new Set(a.spill.map(k=>k.id))]};})()') as typeof s;
      expect(plan.items, `${s.what}: the same items`).toEqual(s.items);
      expect(plan.overL, `${s.what}: the same overflow`).toBe(s.overL);
      expect(plan.backL, `${s.what}: the same back litres`).toBe(s.backL);
      expect(plan.spill, `${s.what}: the same items left over`).toEqual(s.spill);
      p.run('flushDraft()');   // the tab is hidden or closed
      expect(stored(), `${s.what}: a closing tab writes nothing of the trial`).toEqual(keys);
      expect(exported(), `${s.what}: an export carries nothing of it`).toBe(out);
      p.run('removeTrial()');
      expect(settled(), `${s.what}: S and the kept plan as before`).toBe(state);
      expect(stored(), `${s.what}: every loadcheck:* key as before`).toEqual(keys);
      expect(exported(), `${s.what}: the export as before`).toBe(out);
    }
  }), { numRuns: 200, seed: 6311 });
  // the generator reaches what the reviewer checks: hand placements, Lightweight, the decks, bikes without details
  expect(tries, `${tries} suggestions tried over ${riders} riders`).toBeGreaterThanOrEqual(200);
  for (const [what, count] of Object.entries({ hands, light, decks, bare })) expect(count, what).toBeGreaterThanOrEqual(30);
}, 600_000);
