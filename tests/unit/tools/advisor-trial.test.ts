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
  // a kept plan that has drifted from a fresh one (placed, then the trip and kit changed), and what happens during one more trial:
  // 0-3 other changes (a packed tick, the kit, the trip, a hidden tab), then Keep or Remove (review of PR 68, I1)
  drift: fc.boolean(), others: fc.array(fc.constantFrom('tick', 'kit', 'trip', 'hide'), { maxLength: 3 }), end: fc.constantFrom('keep', 'remove'), pick: fc.nat(10),
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
    S.placements=null;S.pinned={};S.packed={};S.qty={};applyTripKitDefaults();${CARRY[r.carry as keyof typeof CARRY]}${hand}S.step=2;S.baseNights=S.nights;
    ${r.drift ? 'currentPlan();S.nights=(S.nights+2)%6;{const k=KIT.find(k=>!S.kit[k.id]&&!k.added&&!k.divisible);if(k)S.kit[k.id]=true;}currentPlan();' : ''}`;
}

test('[GA-TRY-SAME] [GA-TRIAL-NO-TRACE] [GA-KEEP] [GA-REMOVE] over 200 generated riders, for every suggestion: Try gives exactly the suggestion\'s items, overflow and back litres; a closing tab writes nothing of it; after Remove, S, the kept plan, every loadcheck:* key and an export are byte for byte as before; and with 0-3 other changes during one more trial, Remove leaves every loadcheck:* key (the summary included) and an export as those changes alone would, and Keep saves the kept bags and their summary', () => {
  // A: the rider's page, where the trials run. B: the same rider's page, given the same other changes but no trial.
  const p = appVM(), twin = appVM();
  // as a page after start-up, its drawing left out; go(n), the step change, is in the start-up part the VM leaves out: here it does what
  // the page's own does with the step and the base nights
  const stub = "renderKit=()=>{};drawRig=()=>{};renderBags=()=>{};closeBagPop=()=>{};renderResult=()=>{};buildThumb=()=>'';DRAFT_READY=true;"
    + 'go=n=>{S.step_prev=S.step;S.step=n;if(n===4&&S.step_prev!==4)S.baseNights=S.nights;};';
  p.run(stub); twin.run(stub);
  const json = (code: string, q: Page = p): unknown => JSON.parse((q.run(`JSON.stringify(${code})`) as string | undefined) ?? 'null');
  const stored = (q: Page = p) => Object.fromEntries([...q.values].filter(([k]) => k.startsWith('loadcheck:')).sort(([a], [b]) => (a < b ? -1 : 1)));
  const exported = (q: Page = p) => { const x = JSON.parse(q.run('exportAll()') as string); delete x.exported; delete x.draft.updatedAt; return JSON.stringify(x); };
  // S (but the step left, which go() keeps for the screen), the plan the page holds and the added kit
  const settled = () => p.run("JSON.stringify([S,currentPlan().items,S.placements,KIT.filter(k=>k.added)],(k,v)=>k==='step_prev'?undefined:v)") as string;
  // the two pages write at different moments: their times aside, what they hold must be the same
  const timeless = (x: unknown) => JSON.stringify(x).replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, 'T').replace(/\\"at\\":\d+/g, '"at":0');
  // The summary's bags as Wayfinch reads them, a pair's fill as one figure: a kept plan read again may split a pair's load between its two
  // bags another way (the planner's own, trial or none), but a trial bag would show as a bag, or as load gone from the others.
  type SumBag = { pos: string; L: number; fill?: number | number[] };
  const sumBags = (raw: string | undefined) => (JSON.parse(raw ?? 'null')?.bags?.items as SumBag[] | undefined ?? [])
    .map((b) => ({ ...b, fill: Array.isArray(b.fill) ? +b.fill.reduce((n, x) => n + x, 0).toFixed(2) : b.fill }));
  // The whole summary (bags, decks, weights, water, every field), its times aside and a pair's fill as one figure.
  const summaryOf = (raw: string | undefined) => { const x = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    return { ...x, at: 0, planUpdatedAt: 0, ...(x.bags ? { bags: { ...(x.bags as object), items: sumBags(raw) } } : {}) }; };
  const keysOf = (q: Page) => { const x = stored(q); return timeless({ ...x, 'loadcheck:summary:v1': summaryOf(x['loadcheck:summary:v1']) }); };
  // a fresh start for one rider: no storage, nothing saved yet
  const start = (q: Page, r: Rider) => {
    q.values.clear();
    q.context.qaBike = JSON.stringify(r.bike);
    q.run(`TRIAL=null;DRAFT_VERSION=null;DRAFT_SIGNATURE=null;DRAFT_PENDING_SERIAL=null;DRAFT_FROZEN=false;S.bikeProfile=normaliseBikeProfile(JSON.parse(qaBike));${riderSetup(r)}flushDraft();`);
  };
  // the same other change on either page: the first kit item packed, a kit item more or less, two nights more, a hidden tab
  const OTHER: Record<string, string> = {
    tick: '{const k=activeKit()[0];if(k){S.packed[k.id]=true;flushDraft();}}',
    kit: '{const k=KIT.find(k=>!k.added&&!k.divisible&&k.id!=="tent");if(k)S.kit[k.id]=!S.kit[k.id];}',
    trip: 'S.nights=(S.nights+2)%6;',
    hide: 'flushDraft();',
  };
  let riders = 0, tries = 0, hands = 0, light = 0, decks = 0, bare = 0, drifted = 0, withOthers = 0;
  fc.assert(fc.property(riderArb, (r) => {
    start(p, r);
    const keys = stored(), out = exported(), state = settled();
    // the search as the view runs it, on the plan's own packing (the view's drawing of each card is GA-ANSWER's, in qa/advisor.cjs)
    p.run(`qaInput=advisorInput(${JSON.stringify(r.style)},${JSON.stringify(r.goal)});qaList=advisorCards(window.WayfinchAdvisor.advise(qaInput));`);
    const n = json('qaList.length') as number;
    riders++;
    if (Object.keys(json('S.pinned') as object).length) hands++;
    if (r.carry === 'light') light++;
    if (r.rackDeck || r.barDeck) decks++;
    if (r.bike === BARE || r.bike === null) bare++;
    if (r.drift && JSON.stringify(json('S.placements&&S.placements.items')) !== JSON.stringify(json('freshPlan().items'))) drifted++;
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
    if (!n) return;
    // one more trial, with the rider's other changes during it, then Keep or Remove; the twin page makes the same changes, no trial
    start(twin, r);
    const k = r.pick % n, what = json(`advisorWhat(qaList[${k}],qaInput)`) as string;
    p.run(`startTrial(qaList[${k}],qaInput)`);
    if (r.others.length) withOthers++;
    for (const o of r.others) {
      p.run(OTHER[o]!); twin.run(OTHER[o]!);
      // the whole summary at every step, not only its bags: decks and weights would show a trial too (re-check of PR 68, N1)
      expect(timeless(summaryOf(p.values.get('loadcheck:summary:v1'))), `${what}, ${o}: the summary is the twin's, no trial in it`).toBe(timeless(summaryOf(twin.values.get('loadcheck:summary:v1'))));
    }
    if (r.end === 'remove') {
      p.run('removeTrial()'); twin.run('flushDraft()');
      expect(keysOf(p), `${what}, ${r.others.join(' ')}, Remove: every loadcheck:* key as with those changes and no trial`).toBe(keysOf(twin));
      expect(timeless(exported()), `${what}: the export too`).toBe(timeless(exported(twin)));
    } else {
      p.run('keepTrial()');
      const draft = JSON.parse(p.values.get('loadcheck:draft')!), summary = JSON.parse(p.values.get('loadcheck:summary:v1')!);
      expect(json('TRIAL')).toBeNull();
      expect(draft.bags, `${what}: Keep saves the kept bags`).toEqual(json('S.bags'));
      expect(timeless({ ...summary, at: 0, planUpdatedAt: 0 }), `${what}: and the summary of the kept plan`).toBe(timeless({ ...(json('loadSummary()') as object), at: 0, planUpdatedAt: 0 }));
    }
  }), { numRuns: 200, seed: 6311 });
  // the generator reaches what the reviewers check: hand placements, Lightweight, the decks, bikes without details, a drifted kept plan,
  // other changes during a trial
  expect(tries, `${tries} suggestions tried over ${riders} riders`).toBeGreaterThanOrEqual(200);
  for (const [what, count] of Object.entries({ hands, light, decks, bare, withOthers })) expect(count, what).toBeGreaterThanOrEqual(30);
  expect(drifted, 'riders whose kept plan differs from a fresh one').toBeGreaterThanOrEqual(25);
}, 600_000);
