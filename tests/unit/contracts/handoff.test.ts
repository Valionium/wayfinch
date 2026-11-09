// Contract 2, the trip handoff, end to end on both apps' code (spec 7.1): the co-pilot's GPX (src/ui/trip/handoff.ts) read and
// applied by the bag planner's own functions (qa/app-vm.cjs). The page is never printed: only values its functions return.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, test } from 'vitest';
import { buildRoute } from '../../../src/core/route/profile.ts';
import { parseGpx } from '../../../src/core/route/gpx.ts';
import type { XmlDocLike } from '../../../src/core/route/gpx.ts';
import { planStages } from '../../../src/core/route/stages.ts';
import type { Pace } from '../../../src/core/route/stages.ts';
import type { Trip, TripStops } from '../../../src/core/types.ts';
import { withStops } from '../../../src/core/route/day-stops.ts';
import { DEFAULT_SETTINGS } from '../../../src/store/rules.ts';
import type { Settings } from '../../../src/store/rules.ts';
import { handoffGpx, tripAttributes } from '../../../src/ui/trip/handoff.ts';
import { loadFixtureRoute } from '../../fixtures/packs/index.ts';

const require = createRequire(import.meta.url);
type VM = { run: (code: string) => unknown; context: Record<string, unknown>; values: Map<string, string>; nodes: Map<string, { href?: string; textContent?: string; innerHTML?: string }>;
  store: unknown; localStorage: { setItem: (key: string, value: string) => void } };
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: (o?: { bike?: boolean; storage?: unknown }) => VM };
const { window } = new JSDOM('');
const parseXml = (s: string): XmlDocLike => new window.DOMParser().parseFromString(s, 'application/xml') as unknown as XmlDocLike;
const ID = '0123456789abcdef0123456789abcdef';

/** The co-pilot's side: a trip on a fixture route, as handOffTrip writes it. */
async function handedOff(id: Parameters<typeof loadFixtureRoute>[0], settings: Partial<Settings> = {}, departureDate: string | null = null, share = 1) {
  const fixture = await loadFixtureRoute(id);
  const points = fixture.points.slice(0, Math.max(2, Math.round(fixture.points.length * share)));   // share < 1: the route's first part only
  const route = await buildRoute(points.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele })), fixture.name, 'gpx');
  const trip: Trip = { route, departureDate, startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2 };
  const all = { ...DEFAULT_SETTINGS, ...settings };
  return { trip, settings: all, gpx: handoffGpx(route, tripAttributes(trip, all, { start: 'Heidelberg', end: 'Strasbourg' })) };
}

/** The bag planner at /tools/bags/#copilot-handoff=<id>, its plan ready, with the co-pilot's database `db` (null: none on this phone). */
function planner(gpx: string | null, opts: { db?: boolean } = {}) {
  const page = appVM({ bike: false });
  const log: string[] = [];
  page.context.DOMParser = window.DOMParser;
  page.context.history = { replaceState: (...a: unknown[]) => log.push(`history:${String(a[2])}`) };
  Object.assign(page.context.location as object, { pathname: '/tools/bags/', search: '', hash: `#copilot-handoff=${ID}` });
  page.context.fetch = (url: string) => { log.push(`fetch:${url}`); return Promise.reject(new Error('offline')); };
  const exists = opts.db !== false;
  (page.context.window as Record<string, unknown>).indexedDB = {
    databases: async () => (exists ? [{ name: 'copilot', version: 1 }] : []),
    open: (name: string) => {
      log.push(`open:${name}`);
      const req: Record<string, unknown> = {};
      setTimeout(() => {
        const db = {
          objectStoreNames: { contains: (s: string) => s === 'handoffs' },
          close: () => log.push('close'),
          transaction: (store: string, mode: string) => {
            log.push(`tx:${store}:${mode}`);
            return { objectStore: () => ({ get: (key: string) => {
              const get: Record<string, unknown> = {};
              setTimeout(() => { get.result = key === ID && gpx ? { id: key, gpx, createdAt: '2026-11-04T10:00:00.000Z' } : undefined; (get.onsuccess as () => void)(); }, 0);
              return get;
            } }) };
          },
        };
        req.result = db;
        (req.onsuccess as () => void)();
      }, 0);
      return req;
    },
  };
  page.values.set('copilot:handoff:v1', JSON.stringify({ app: 'copilot', kind: 'handoff', v: 1, id: ID, createdAt: '2026-11-04T10:00:00.000Z' }));
  page.run(`renderBikeProfiles=()=>{};renderKit=()=>{};drawRig=()=>{};renderBags=()=>{};renderClimate=()=>{};syncGPXControl=()=>{};syncDepartureDate=()=>{};persistBikeProfileSelection=async()=>true;
    S.bags=[{uid:1,pos:'seat',L:14,userL:true},{uid:2,pos:'rack',L:15,pair:true}];S.nextUid=3;S.kit.tent=true;S.kitTouched={tent:true};S.qty={tubes:2};
    S.custom={tent:{L:3.2,kg:1.4,rigid:40}};S.packed={tent:true};S.pinned={tent:'2-0'};S.nights=4;S.month=2;S.pace='steady';S.flatKph=20;S.sleep='camp';
    S.bikeProfile=normaliseBikeProfile({id:'bike_mine',name:'Mine',pressure:{bikeKg:13}});S.tyrePressure=normaliseTyrePressure({bagKg:2});
    applyTripKitDefaults();SETUPS=[{id:'st1',name:'Alps'}];DRAFT_READY=true;`);
  const json = <T>(code: string): T => JSON.parse(page.run(`JSON.stringify(${code})`) as string) as T;
  return { page, log, json };
}
const untouched = `JSON.stringify({bags:S.bags,kit:S.kit.tent,kitTouched:S.kitTouched,custom:S.custom,qty:S.qty,packed:S.packed,pinned:S.pinned,bike:S.bikeProfile,tyre:S.tyrePressure,setups:SETUPS})`;

describe('[C-HANDOFF] the bag planner applies a trip from Wayfinch', () => {
  test('Apply: trip fields set, then the GPX; bags, kit, sizes, ticks, placements, bike, tyre data and setups untouched; the answer written; the fragment goes', async () => {
    const { gpx } = await handedOff('heidelberg-strasbourg', { nights: 2, stay: 'mixed', pace: 'hard', flatKph: 22 }, '2026-06-12');
    const { page, log, json } = planner(gpx);
    expect(await page.run('receiveHandoff()')).toBe(true);
    expect(log.filter((l) => l.startsWith('tx:'))).toEqual(['tx:handoffs:readonly']);
    expect(log).toContain('close');
    expect(json<boolean>('WEIGHT_PROMPT_BLOCKS.handoffBar')).toBe(true);
    const before = page.run(untouched);
    expect(await page.run('applyHandoff()')).toBe(true);
    expect(json('{d:S.departureDate,m:S.month,n:S.nights,s:S.sleep,p:S.pace,f:S.flatKph}')).toEqual({ d: '2026-06-12', m: 5, n: 2, s: 'mixed', p: 'hard', f: 22 });
    expect(json<number>('S.gpx.pts.length')).toBeGreaterThan(100);
    expect(json('[S.place.name,S.place2.name]')).toEqual(['Heidelberg', 'Strasbourg']);
    expect(page.run(untouched)).toBe(before);
    const done = JSON.parse(page.values.get('loadcheck:handoff-done')!) as Record<string, unknown>;
    expect(Object.keys(done)).toEqual(['app', 'kind', 'v', 'id', 'outcome', 'at']);
    expect(done).toMatchObject({ app: 'load-check', kind: 'handoff-done', v: 1, id: ID, outcome: 'applied' });
    expect(log).toContain('history:/tools/bags/');
    // [LC-BACK] after a handoff, Back to Wayfinch goes to Trip; [LC-PRECISION] the names came with it: no lookup at all
    expect(page.nodes.get('backToWayfinch')!.href).toBe('/#/trip');
    expect(log.some((l) => /nominatim|elevation/.test(l))).toBe(false);
  });

  test('never opens a co-pilot database that does not exist; a fragment without a stored handoff, or one answered, applies nothing', async () => {
    const { gpx } = await handedOff('loop');
    const none = planner(gpx, { db: false });
    expect(await none.page.run('receiveHandoff()')).toBe(false);
    expect(none.log.some((l) => l.startsWith('open:'))).toBe(false);
    expect(none.log).toContain('history:/tools/bags/');
    const answered = planner(gpx);
    answered.page.values.set('loadcheck:handoff-done', JSON.stringify({ app: 'load-check', kind: 'handoff-done', v: 1, id: ID, outcome: 'cancelled', at: 'x' }));
    expect(await answered.page.run('receiveHandoff()')).toBe(false);
    expect(answered.log.some((l) => l.startsWith('open:'))).toBe(false);
    const stranger = planner(gpx);
    stranger.page.values.set('copilot:handoff:v1', JSON.stringify({ app: 'copilot', kind: 'handoff', v: 2, id: ID, createdAt: '2026-11-04T10:00:00.000Z' }));
    expect(await stranger.page.run('receiveHandoff()')).toBe(false);
  });
});

describe('[C-HANDOFF-UNDO] Undo and Cancel', () => {
  test('Undo takes back only what Apply changed: ticks, bags and kit changed since stay; a trip field the rider changed keeps the rider\'s value (review I3)', async () => {
    const { gpx } = await handedOff('alpine-pass', { nights: 1, pace: 'hard', flatKph: 22 });
    const { page, json } = planner(gpx);
    await page.run('receiveHandoff()');
    await page.run('applyHandoff()');
    expect(json('[S.nights,S.pace,S.flatKph,!!S.gpx]')).toEqual([1, 'hard', 22, true]);
    page.run("S.packed.pump=true;S.packed.tubes=true;S.bags[0].L=10;S.kit.lock=true;S.kitTouched.lock=true;S.flatKph=27;");
    expect(page.run('undoHandoff()')).toBe(true);
    expect(json('{packed:S.packed,bag:S.bags[0].L,lock:S.kit.lock}')).toEqual({ packed: { tent: true, pump: true, tubes: true }, bag: 10, lock: true });
    expect(json('[S.nights,S.pace,S.flatKph,S.gpx,S.month]')).toEqual([4, 'steady', 27, null, 2]); // the rider's own speed stays
    expect(page.run('undoHandoff()')).toBe(false); // once
  });

  test('Undo after Apply with nothing done since restores the plan byte for byte; Cancel changes nothing but the answer', async () => {
    const { gpx } = await handedOff('alpine-pass', { nights: 1, pace: 'hard' });
    const a = planner(gpx);
    await a.page.run('receiveHandoff()');
    const before = a.page.run('JSON.stringify(captureDraft())');
    await a.page.run('applyHandoff()');
    expect(a.page.run('JSON.stringify(captureDraft())')).not.toBe(before);
    expect(a.page.run('undoHandoff()')).toBe(true);
    expect(a.page.run('JSON.stringify(captureDraft())')).toBe(before);
    const c = planner(gpx);
    await c.page.run('receiveHandoff()');
    const was = c.page.run('JSON.stringify(captureDraft())');
    expect(c.page.run('cancelHandoff()')).toBe(true);
    expect(c.page.run('JSON.stringify(captureDraft())')).toBe(was);
    expect(JSON.parse(c.page.values.get('loadcheck:handoff-done')!)).toMatchObject({ id: ID, outcome: 'cancelled' });
    expect(c.json<boolean>('WEIGHT_PROMPT_BLOCKS.handoffBar')).toBe(false);
  });
});

describe('[C-HANDOFF] what travels, and the bar names it (re-check N1)', () => {
  test('a co-pilot at its defaults keeps the bag planner\'s own pace, speed and stay; the bar names only what it changes', async () => {
    const { gpx } = await handedOff('loop', { nights: 2 });
    const { page, json } = planner(gpx);
    page.run("S.pace='steady';S.flatKph=20;S.sleep='indoor';");
    await page.run('receiveHandoff()');
    const text = String(page.nodes.get('handoffText')!.textContent);
    expect(text).toMatch(/2 nights/);
    expect(text).not.toMatch(/the pace|speed|the stay/);
    await page.run('applyHandoff()');
    expect(json('[S.pace,S.flatKph,S.sleep,S.nights]')).toEqual(['steady', 20, 'indoor', 2]);
  });
  test('a pace, speed and stay the rider set in the co-pilot arrive, and the bar names each', async () => {
    const { gpx } = await handedOff('loop', { nights: 2, pace: 'hard', flatKph: 28, stay: 'mixed' });
    const { page, json } = planner(gpx);
    await page.run('receiveHandoff()');
    const text = String(page.nodes.get('handoffText')!.textContent);
    expect(text).toMatch(/the pace/);
    expect(text).toMatch(/the flat speed/);
    expect(text).toMatch(/the stay/);
    await page.run('applyHandoff()');
    expect(json('[S.pace,S.flatKph,S.sleep]')).toEqual(['hard', 28, 'mixed']);
  });
});

describe('[C-HANDOFF] where the nights came from (review I4)', () => {
  test('nights left to the stage model travel as its suggestion, marked so, and the bar says it is Wayfinch\'s suggestion', async () => {
    const { gpx } = await handedOff('multi-day-800', {});
    expect(gpx).toMatch(/nights="\d+" nightsFrom="suggested" startName=/);
    expect(gpx).not.toMatch(/ pace=| flatKph=/); // pace and speed at the co-pilot's defaults stay home (re-check N1)
    const { page, json } = planner(gpx);
    page.context.qaText = gpx;
    expect(json<{ nightsSuggested?: boolean }>('handoffTrip(qaText)').nightsSuggested).toBe(true);
    await page.run('receiveHandoff()');
    expect(String(page.nodes.get('handoffText')!.textContent)).toMatch(/\d+ nights, as Wayfinch suggests for this route/);
  });
});

describe('[C-HANDOFF-ROUTE] the same route in both apps', () => {
  test('the 800 km fixture, handed off: the same distance, ascent and stage ends in both apps; its hash kept, and replaced by any other route', async () => {
    for (const nights of [null, 3, 6]) {
      const { trip, gpx, settings } = await handedOff('multi-day-800', { nights, pace: 'sporting' as Pace });
      const { page, json } = planner(gpx);
      await page.run('receiveHandoff()');
      expect(await page.run('applyHandoff()')).toBe(true);
      const mine = json<{ km: number; ascent: number; ends: number[] }>('{km:planRoute().distanceKm,ascent:S.gpx.ascent,ends:nightStops().slice(1).map(s=>s.kmExact)}');
      // the co-pilot's own plan of the route it handed over, read back from that GPX
      const parsed = parseGpx(gpx, parseXml);
      const route = await buildRoute(parsed.points, parsed.name, 'gpx');
      // the co-pilot's own plan: nights left to the stage model are its suggestion (review I4)
      const planned = settings.nights ?? planStages(route, { flatKph: 25, pace: 'sporting', nights: 0 }).suggestedNights;
      expect(json('S.nights')).toBe(planned);
      const plan = planStages(route, { flatKph: 25, pace: 'sporting', nights: planned });
      expect(route.hash).toBe(trip.route.hash);
      expect(mine.km).toBe(route.lengthKm);
      expect(mine.ascent).toBe(route.ascentM);
      expect(mine.ends).toEqual(plan.map((s) => s.endKm));
      // gpx.copilotRoute stored with the plan's route, through normalisePlan; any other route change replaces it
      expect(json('normalisePlan(captureDraft()).gpx.copilotRoute')).toBe(trip.route.hash);
      const other = (await handedOff('loop')).gpx;
      page.context.qaOther = other;
      await page.run("loadGPX(qaOther,'other.gpx',null,{handoff:{start:null,end:null}})");
      expect(json('"copilotRoute" in S.gpx')).toBe(false);
    }
  }, 120_000);

  test('contracts/handoff/heidelberg-strasbourg.gpx is what the co-pilot writes for that trip, and both apps read it alike', async () => {
    const { gpx } = await handedOff('heidelberg-strasbourg', { nights: 2, stay: 'mixed', pace: 'hard', flatKph: 22 }, '2026-06-12');
    const fixture = readFileSync(join(process.cwd(), 'contracts', 'handoff', 'heidelberg-strasbourg.gpx'), 'utf8');
    expect(gpx === fixture).toBe(true);
    const { page, json } = planner(fixture);
    page.context.qaText = fixture;
    expect(json('handoffTrip(qaText)')).toEqual({ nights: 2, departureDate: '2026-06-12', month: 5, sleep: 'mixed', pace: 'hard', flatKph: 22,
      startName: 'Heidelberg', endName: 'Strasbourg', route: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });
});

describe('[TRIP-DAY-STOPS] days that end where you can sleep travel to the bag planner (owner, 9 Nov 2026)', () => {
  test("the trip's stops travel as the days' ends and names; the bag planner ends its days there; other nights there split by effort again", async () => {
    const base = await handedOff('multi-day-800', { nights: 3, pace: 'sporting' as Pace });
    const plan = [...planStages(base.trip.route, { flatKph: 25, pace: 'sporting', nights: 3 })];
    const ends = [plan[0]!.endKm + 3.2, plan[1]!.endKm, plan[2]!.endKm - 4.1];
    const stops: TripStops = { routeId: base.trip.route.id, basis: plan.slice(0, -1).map((x) => x.endKm), days: [
      { placeId: 'n1', km: ends[0]!, name: 'Camping "Am See"', town: 'Lahr', by: 'auto' },
      { placeId: null, km: plan[1]!.endKm, name: null, town: null, by: 'auto' },
      { placeId: 'n3', km: ends[2]!, name: 'Hotel Krone', town: null, by: 'rider' },
    ] };
    const route = { ...base.trip.route, stages: withStops(base.trip.route, plan, stops, 25) };
    const trip = { ...base.trip, route, stops };
    const gpx = handoffGpx(route, tripAttributes(trip, base.settings, { start: 'A', end: 'B' }));
    const { page, json } = planner(gpx);
    page.context.qaText = gpx;
    expect(json('handoffTrip(qaText)')).toMatchObject({ nights: 3, stops: ends, stopNames: ['Camping "Am See"', null, 'Hotel Krone'] });
    await page.run('receiveHandoff()');
    expect(String(page.nodes.get('handoffText')!.textContent)).toMatch(/where each day ends/);
    expect(await page.run('applyHandoff()')).toBe(true);
    const days = json<{ km: number; name: string | null }[]>('nightStops().slice(1,-1).map(s=>({km:s.kmExact,name:s.name}))');
    days.forEach((d, i) => expect(d.km).toBeCloseTo(ends[i]!, 6));
    expect(days.map((d) => d.name)).toEqual(['Camping "Am See"', null, 'Hotel Krone']);
    // kept with the plan's route, and gone with another number of nights or another route
    expect(json('normalisePlan(captureDraft()).gpx.copilotStops.length')).toBe(3);
    page.run('S.nights=2;');
    const two = json<number[]>('nightStops().slice(1,-1).map(s=>s.kmExact)');
    expect(two).toHaveLength(2);
    expect(two[0]).not.toBeCloseTo(ends[0]!, 1);
    const other = (await handedOff('loop')).gpx;
    page.context.qaOther = other;
    await page.run("loadGPX(qaOther,'other.gpx',null,{handoff:{start:null,end:null}})");
    expect(json('"copilotStops" in S.gpx')).toBe(false);
  }, 120_000);

  test('a trip without stops, or whose days no longer end at them, sends none', async () => {
    const { gpx, trip, settings } = await handedOff('multi-day-800', { nights: 3, pace: 'sporting' as Pace });
    expect(gpx).not.toMatch(/ stops=/);
    const plan = [...planStages(trip.route, { flatKph: 25, pace: 'sporting', nights: 3 })];
    const stale: TripStops = { routeId: trip.route.id, basis: plan.slice(0, -1).map((x) => x.endKm), days: plan.slice(0, -1).map((x) => ({ placeId: 'p', km: x.endKm + 2, name: 'X', town: null, by: 'auto' as const })) };
    expect(handoffGpx(trip.route, tripAttributes({ ...trip, route: { ...trip.route, stages: plan }, stops: stale }, settings, { start: null, end: null }))).not.toMatch(/ stops=/);
  });
});

// The guided Trip, part 2 (design §3.3, the owner's answers 1 and 3 of 8 Nov 2026): a trip of one night or more goes straight into
// the full Bag planner at Bags, with everything predicted, as a new trip setup made from the chosen bike's general setup.
const qaSetup = (id: string, extra: Record<string, unknown> = {}) => `normaliseSetup({...captureDraft(),id:'${id}',name:'Setup ${id}',saved:'2026-10-30',predicted:{mounted:35,kit:31,spare:4,spilled:0,kg:14},thumb:'',...${JSON.stringify(extra)}})`;
function longPlanner(gpx: string) {
  const p = planner(gpx);
  p.page.run('go=n=>{S.step=n;};buildThumb=()=>"";SETUPS=[];S.step=4;');
  return p;
}
describe('[TRIP-BAGS-LONG] a trip of one night or more: straight into the full Bag planner at Bags, everything predicted', () => {
  test('the bar offers Plan bags for this trip; the tap keeps the plan there as a setup, makes a trip setup for the route and opens Bags', async () => {
    const { gpx } = await handedOff('heidelberg-strasbourg', { nights: 2, stay: 'mixed', pace: 'hard', flatKph: 22 }, '2026-06-12');
    const { page, json } = longPlanner(gpx);
    expect(await page.run('receiveHandoff()')).toBe(true);
    expect(json<boolean>('handoffLong(HANDOFF.trip)')).toBe(true);
    expect(String(page.nodes.get('handoffText')!.textContent)).toMatch(/Plan bags for this trip/);
    const draftBefore = page.run('JSON.stringify(captureDraft())');
    expect(await page.run('planTripBags()')).toBe(true);
    // the trip went in as Apply puts it in
    expect(json('{d:S.departureDate,n:S.nights,s:S.sleep,p:S.pace,f:S.flatKph}')).toEqual({ d: '2026-06-12', n: 2, s: 'mixed', p: 'hard', f: 22 });
    expect(json('[S.place.name,S.place2.name]')).toEqual(['Heidelberg', 'Strasbourg']);
    expect(json<number>('S.step')).toBe(2);
    // what was there is kept: the plan before, saved as a trip setup; then the new trip setup, first in the list
    const setups = json<Array<Record<string, unknown>>>('SETUPS');
    expect(setups.map((s) => s.name)).toEqual(['Heidelberg → Strasbourg, 12 Jun', expect.stringMatching(/^Before Heidelberg → Strasbourg, \d{1,2} [A-Z][a-z]{2}$/)]);
    expect(setups.every((s) => s.kind === undefined)).toBe(true);
    const before = json<Record<string, unknown>>('SETUPS[1]');
    const kept = page.run(`(()=>{const p=normalisePlan(SETUPS[1]);return planSameKey(p);})()`);
    page.context.qaBefore = draftBefore;
    expect(kept).toBe(page.run('planSameKey(JSON.parse(qaBefore))'));
    expect(before.thumb).toBe('');
    const made = setups[0]!;
    expect(made.forRoute).toEqual({ hash: json('S.gpx.copilotRoute'), name: 'Heidelberg → Strasbourg', departureDate: '2026-06-12' });
    expect(made.thumb).toBe('');
    expect(made.base).toBeUndefined(); // no general setup: from the plan that was there
    // predicted: a fresh packing by the frozen selection, ticks start empty, the untouched kit follows the trip, the rider's own stays
    expect(json('[S.packed,S.kit.tent,S.kitTouched]')).toEqual([{}, true, { tent: true }]);
    expect(json('SETUPS[0].packed')).toEqual({});
    expect(json('S.bags.map(b=>b.uid)')).toEqual([1, 2]);
    expect(json<string>('normalisePlan(SETUPS[0]).gpx.copilotRoute')).toMatch(/^[0-9a-f]{64}$/);
    // the answer is written and Back goes to Trip, as with Apply
    expect(JSON.parse(page.values.get('loadcheck:handoff-done')!)).toMatchObject({ id: ID, outcome: 'applied' });
    expect(page.nodes.get('backToWayfinch')!.href).toBe('/#/trip');
    expect(String(page.nodes.get('handoffText')!.textContent)).toMatch(/^Planned for Heidelberg → Strasbourg/);
    expect(json<number>('storedSetupsLocal().length')).toBe(2);
  });

  test('the chosen bike\'s general setup is the foundation (the default one first, else the newest); it is never changed; another bike\'s is not used', async () => {
    const { gpx } = await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12');
    const { page, json } = longPlanner(gpx);
    page.run(`(()=>{const mine=S.bikeProfile,other=normaliseBikeProfile({id:'bike_other',name:'Other'});
      const was=JSON.stringify(S.bags);
      S.bags=[{uid:1,pos:'bar',L:9},{uid:2,pos:'frame',L:4.5}];S.nextUid=3;const g1=${qaSetup('g_old', { kind: 'general', saved: '2026-09-01' })};
      S.bags=[{uid:1,pos:'seat',L:10}];S.nextUid=2;const g2=${qaSetup('g_new', { kind: 'general', saved: '2026-10-01' })};
      S.bikeProfile=other;S.bags=[{uid:1,pos:'rack',L:20,pair:true}];const g3=${qaSetup('g_other', { kind: 'general', saved: '2026-10-20' })};
      S.bikeProfile=mine;S.bags=JSON.parse(was);S.nextUid=3;SETUPS=[g3,g2,g1];})()`);
    const generals = page.run('JSON.stringify(SETUPS)');
    await page.run('receiveHandoff()');
    expect(json<string>('tripFoundation().id')).toBe('g_new');
    page.run(`SETUPS.find(s=>s.id==='g_old').isDefault=true;`);
    expect(json<string>('tripFoundation().id')).toBe('g_old');
    page.run(`delete SETUPS.find(s=>s.id==='g_old').isDefault;`);
    expect(await page.run('planTripBags()')).toBe(true);
    expect(json('S.bags.map(b=>[b.pos,b.L])')).toEqual([['seat', 10]]);
    expect(json('SETUPS[0].base')).toBe('g_new');
    expect(json('S.bikeProfile.id')).toBe('bike_mine');
    // the general setups are as they were, byte for byte (the owner: a trip setup never updates its general setup)
    expect(page.run(`JSON.stringify(SETUPS.filter(s=>setupKind(s)==='general'))`)).toBe(generals);
  });

  test('nothing is kept twice: a plan already saved as a setup gets no "Before" copy', async () => {
    const { gpx } = await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12');
    const { page, json } = longPlanner(gpx);
    page.run(`SETUPS=[${qaSetup('t_same')}];`);
    await page.run('receiveHandoff()');
    await page.run('planTripBags()');
    expect(json('SETUPS.map(s=>s.id)')).toEqual([expect.stringMatching(/^st_/), 't_same']);
  });

  test('Undo goes back to the plan that was there, byte for byte, and takes the setups it made away again', async () => {
    const { gpx } = await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12');
    const { page, json } = longPlanner(gpx);
    page.run(`SETUPS=[${qaSetup('t_x', { kind: 'general' })}];S.bags.push({uid:3,pos:'bar',L:9});S.nextUid=4;`);
    await page.run('receiveHandoff()');
    const before = page.run('JSON.stringify(captureDraft())'), setups = page.run('JSON.stringify(SETUPS)');
    await page.run('planTripBags()');
    expect(json<number>('SETUPS.length')).toBe(3);
    expect(await page.run('undoTripBags()')).toBe(true);
    expect(page.run('JSON.stringify(captureDraft())')).toBe(before);
    expect(page.run('JSON.stringify(SETUPS)')).toBe(setups);
    expect(json('storedSetupsLocal().map(s=>s.id)')).toEqual(['t_x']);
    expect(await page.run('undoTripBags()')).toBe(false);
  });

  test('Undo never deletes a setup the rider changed and never drops later work (review of PR 80, I2)', async () => {
    const { gpx } = await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12');
    const { page, json } = longPlanner(gpx);
    await page.run('receiveHandoff()');
    await page.run('planTripBags()');
    const made = json<string>('SETUPS[0].id');
    // the rider goes on at Bags: a bag added and a tick; the new trip setup marked general, with a note of the rider's own
    page.run('S.bags.push({uid:9,pos:"bar",L:9});S.nextUid=10;S.packed={tent:true};');
    expect(await page.run(`setSetupKind('${made}','general')`)).toBe(true);
    expect(await page.run(`saveSetupNote('${made}','Our own note')`)).toBe(true);
    const work = page.run('JSON.stringify(captureDraft())');
    // Undo is still on the bar: it now takes nothing away
    expect(await page.run('undoTripBags()')).toBe(false);
    expect(page.run('JSON.stringify(captureDraft())')).toBe(work);
    expect(json('S.bags.some(b=>b.uid===9)')).toBe(true);
    expect(json('S.packed')).toEqual({ tent: true });
    const kept = json(`storedSetupsLocal().find(s=>s.id==='${made}')`);
    expect(kept).toMatchObject({ kind: 'general', note: 'Our own note' });
    expect(json<number>('SETUPS.length')).toBe(2);
    expect(String(page.nodes.get('handoffText')!.textContent)).toMatch(/changed since/);
  });

  test('Undo with the plan untouched brings the plan back, but keeps a made setup the rider changed and says so (review of PR 80, I2)', async () => {
    const { gpx } = await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12');
    const { page, json } = longPlanner(gpx);
    await page.run('receiveHandoff()');
    const before = page.run('JSON.stringify(captureDraft())');
    await page.run('planTripBags()');
    const made = json<string>('SETUPS[0].id'), keptBefore = json<string>('SETUPS[1].id');
    expect(await page.run(`renameSetup('${made}','Our Vosges trip')`)).toBe(true);
    expect(await page.run('undoTripBags()')).toBe(true);
    expect(page.run('JSON.stringify(captureDraft())')).toBe(before);
    // the renamed setup stays; the "Before" copy, untouched, goes
    expect(json('SETUPS.map(s=>[s.id,s.name])')).toEqual([[made, 'Our Vosges trip']]);
    expect(json('storedSetupsLocal().map(s=>s.id)')).toEqual([made]);
    expect(json(`SETUPS.some(s=>s.id==='${keptBefore}')`)).toBe(false);
    expect(String(page.nodes.get('handoffText')!.textContent)).toMatch(/Our Vosges trip/);
  });

  test('Undo of "Open the setup made on …" never drops later work either (review of PR 80, I2)', async () => {
    const handed = await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12');
    const { page, json } = longPlanner(handed.gpx);
    page.run(`SETUPS=[${qaSetup('t_made', { saved: '2026-11-06', forRoute: { hash: handed.trip.route.hash, name: 'Heidelberg → Strasbourg', departureDate: '2026-06-12' } })}];S.bags.push({uid:3,pos:'bar',L:9});S.nextUid=4;`);
    await page.run('receiveHandoff()');
    await page.run('reuseTripSetup()');
    page.run('S.bags.push({uid:9,pos:"frame",L:4});S.nextUid=10;');
    const work = page.run('JSON.stringify(captureDraft())');
    expect(await page.run('undoTripBags()')).toBe(false);
    expect(page.run('JSON.stringify(captureDraft())')).toBe(work);
    expect(json<number>('SETUPS.length')).toBe(2);
  });

  test('Undo after another tab wrote setups takes the "Before" copy away too, and names no change the rider never made (review of PR 80, m-3)', async () => {
    const { gpx } = await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12');
    const { page, json } = longPlanner(gpx);
    await page.run('receiveHandoff()');
    const before = page.run('JSON.stringify(captureDraft())');
    await page.run('planTripBags()');
    expect(json<number>('SETUPS.length')).toBe(2);
    // another tab of the bag planner saves a setup of its own; this tab follows, each setup as it reads back from storage
    const other = appVM({ bike: false, storage: page.store });
    other.run('DRAFT_READY=true;buildThumb=()=>"";SETUPS=storedSetupsLocal();SETUPS.forEach(x=>SETUPS_SEEN.add(x.id));');
    await other.run(`saveSetup('From the other tab','')`);
    expect(json<string[]>('SETUPS.map(s=>s.name)')).toContain('From the other tab');
    expect(await page.run('undoTripBags()')).toBe(true);
    expect(page.run('JSON.stringify(captureDraft())')).toBe(before);
    expect(json('SETUPS.map(s=>s.name)')).toEqual(['From the other tab']);
    expect(String(page.nodes.get('handoffText')!.textContent)).not.toMatch(/changed/);
  });

  test('whichever single write of Plan bags for this trip, its Undo, the setup made before or its Undo fails, no saved setup is lost and the bar says the save did not reach storage exactly when the store does not hold what the tab holds (review of PR 80, I-1; fix round 2, m-B)', async () => {
    const handed = await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12');
    const many = (n: number, prefix: string, extra: Record<string, unknown> = {}) =>
      `Array.from({length:${n}},(_,i)=>${qaSetup('X', extra).replace("id:'X'", `id:'${prefix}'+i`).replace("name:'Setup X'", `name:'Setup ${prefix}'+i`)})`;
    const made = { saved: '2026-11-06', forRoute: { hash: handed.trip.route.hash, name: 'Heidelberg → Strasbourg', departureDate: '2026-06-12' } };
    // 34 saved setups: 15 trip setups an older page saved (in the list it reads), and 3 general ones of the chosen bike, 15 trip setups
    // and the one made for this route on 6 Nov, which this page added (the second list); the plan here is none of them, so a "Before"
    // copy is made
    const older = `${many(15, 'o')}.map(s=>{for(const f of SETUP_MARK_FIELDS) delete s[f];return s;})`;
    const library = `[${qaSetup('t_made', made)},...${many(3, 'g', { kind: 'general' })},...${many(15, 't')}]`;
    // the three setup keys, which only the setup write writes (the ledger is also written for other keys, at times that vary; the
    // QA suite fails it in turn too)
    const KEYS = ['loadcheck:setups', 'loadcheck:setups-more:v1', 'loadcheck:setup-marks:v1'];
    const failAt = (page: VM, n: number) => {
      const put = page.localStorage.setItem, log = { count: 0, failed: '' };
      page.localStorage.setItem = function (this: unknown, key: string, value: string) {
        if (KEYS.includes(key) && log.count++ === n) { log.failed = key; throw new Error('QuotaExceededError'); }
        return put.call(this, key, value);
      };
      return log;
    };
    const stored = (page: VM) => {
      const fresh = appVM({ bike: false });
      for (const [k, v] of page.values) fresh.values.set(k, v);
      return JSON.parse(fresh.run('JSON.stringify(storedSetupsLocal().map(s=>s.id))') as string) as string[];
    };
    const start = async () => {
      const p = longPlanner(handed.gpx);
      await p.page.run(`window.localStorage.setItem(SETUP_KEY,JSON.stringify(${older}));SETUPS=[...${library},...storedSetupsLocal()];store.set(SETUP_KEY,SETUPS)`);
      p.page.run('S.bags.push({uid:3,pos:"bar",L:9});S.nextUid=4;');
      await p.page.run('receiveHandoff()');
      return p;
    };
    const ids = stored((await start()).page);
    expect(ids.length).toBe(34);
    const flows: [string, string | null, string][] = [
      ['Plan bags for this trip', null, 'planTripBags()'],
      ['its Undo', 'planTripBags()', 'undoTripBags()'],
      ['Open the setup made on 6 Nov', null, 'reuseTripSetup()'],
      ['its Undo', 'reuseTripSetup()', 'undoTripBags()'],
    ];
    let cases = 0, notHeld = 0;
    for (const [what, prep, code] of flows) {
      const dry = await start();
      if (prep) expect(await dry.page.run(prep)).toBe(true);
      const count = failAt(dry.page, Infinity);
      expect(await dry.page.run(code)).toBe(true);
      expect(count.count).toBeGreaterThan(0);
      for (let n = 0; n < count.count; n++) {
        const { page } = await start();
        if (prep) await page.run(prep);
        const log = failAt(page, n);
        await page.run(code);
        const label = `${what}, write ${n + 1} of ${count.count} (${log.failed}) fails`;
        expect(log.failed, label).not.toBe('');
        const now = stored(page);
        expect(ids.filter((id) => !now.includes(id)), label).toEqual([]);
        // the page says so exactly when the store does not hold what the tab holds (fix round 2 of PR 80, m-B)
        const held = page.run(`(()=>{const by=l=>JSON.stringify(l.map(s=>JSON.stringify(normaliseSetup(s))).sort());return by(SETUPS)===by(storedSetupsLocal());})()`);
        expect(page.run('SETUPS_STORED'), label).toBe(held);
        if (held) expect(String(page.nodes.get('handoffText')!.textContent), label).not.toMatch(/did not reach storage/);
        else { expect(String(page.nodes.get('handoffText')!.textContent), label).toMatch(/did not reach storage/); notHeld++; }
        cases++;
      }
    }
    expect(cases).toBeGreaterThanOrEqual(8);
    expect(notHeld).toBeGreaterThan(0);
  }, 120_000);

  test('the bar promises a kept plan only when it will keep one (review of PR 80, m2)', async () => {
    const { gpx } = await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12');
    const fresh = longPlanner(gpx);
    await fresh.page.run('receiveHandoff()');
    expect(String(fresh.page.nodes.get('handoffText')!.textContent)).toMatch(/Your plan now is kept as a setup/);
    const same = longPlanner(gpx);
    same.page.run(`SETUPS=[${qaSetup('t_same')}];`);
    await same.page.run('receiveHandoff()');
    expect(String(same.page.nodes.get('handoffText')!.textContent)).not.toMatch(/kept as a setup/);
    expect(String(same.page.nodes.get('handoffText')!.textContent)).toMatch(/already saved as Setup t_same/);
  });

  test('"Open the setup made on …" names the trip\'s nights and date when they differ from the setup\'s (review of PR 80, m4)', async () => {
    const handed = await handedOff('heidelberg-strasbourg', { nights: 3 }, '2026-06-12');
    const { page } = longPlanner(handed.gpx);
    page.run(`S.nights=2;S.departureDate='2026-06-05';S.month=5;SETUPS=[${qaSetup('t_made', { saved: '2026-11-06', forRoute: { hash: handed.trip.route.hash, name: 'Heidelberg → Strasbourg', departureDate: '2026-06-05' } })}];`);
    await page.run('receiveHandoff()');
    await page.run('reuseTripSetup()');
    expect(String(page.nodes.get('handoffText')!.textContent)).toMatch(/made for 2 nights from 5 Jun; this trip has 3 nights from 12 Jun/);
  });

  test('a trip setup already made for this route is offered again; with 40 trip setups nothing changes and the bar says why', async () => {
    const handed = await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12');
    const { page, json } = longPlanner(handed.gpx);
    const route = handed.trip.route.hash;
    page.run(`SETUPS=[${qaSetup('t_made', { saved: '2026-11-06', forRoute: { hash: route, name: 'Heidelberg → Strasbourg', departureDate: '2026-06-12' } })}];`);
    await page.run('receiveHandoff()');
    expect(json<string>('HANDOFF.reuse')).toBe('t_made');
    expect(String(page.nodes.get('handoffText')!.textContent)).toMatch(/the setup made on 6 Nov/);
    expect(await page.run('reuseTripSetup()')).toBe(true);
    expect(json('[S.step,SETUPS.length]')).toEqual([2, 1]);
    expect(JSON.parse(page.values.get('loadcheck:handoff-done')!)).toMatchObject({ outcome: 'applied' });
    const full = longPlanner(handed.gpx);
    full.page.run(`SETUPS=Array.from({length:40},(_,i)=>${qaSetup('t_full').replace("id:'t_full'", "id:'t'+i")});`);
    await full.page.run('receiveHandoff()');
    const draft = full.page.run('JSON.stringify(captureDraft())');
    expect(await full.page.run('planTripBags()')).toBe(false);
    expect(full.page.run('JSON.stringify(captureDraft())')).toBe(draft);
    expect(String(full.page.nodes.get('handoffText')!.textContent)).toMatch(/40 trip setups/);
  });
});

// The small view (the owner's answer 4 of 8 Nov 2026): a day ride (0 nights) gets exactly the drawn bike with its bags at the top
// of the Check step, the bags tappable, and the list of what is in each bag, with the same functions; nothing else.
describe('[TRIP-SMALL] a day ride: the small view of the same Bag planner', () => {
  test('Plan bags for this trip on a day ride makes the trip setup as for a long trip and opens the small view at Check; the full planner is one tap away with the same plan', async () => {
    const { gpx } = await handedOff('loop', { nights: 0 });
    const { page, json } = longPlanner(gpx);
    await page.run('receiveHandoff()');
    expect(json<boolean>('handoffLong(HANDOFF.trip)')).toBe(false);
    expect(String(page.nodes.get('handoffText')!.textContent)).toMatch(/Plan bags for this trip/);
    expect(await page.run('planTripBags()')).toBe(true);
    expect(json('[S.step,S.nights,SMALL_VIEW]')).toEqual([4, 0, true]);
    expect(json<boolean>('$("smallHead").hidden')).toBe(false);
    // nothing else: no question about the bike's maximum weight over it (it waits for the full planner)
    expect(json<boolean>('weightPromptBlocked()')).toBe(true);
    expect(String(page.nodes.get('smallTripLine')!.textContent)).toMatch(/day ride/);
    expect(json('SETUPS[0].forRoute.hash')).toMatch(/^[0-9a-f]{64}$/);
    // the view is never stored: not in the draft, not in the setup
    expect(page.run('JSON.stringify(captureDraft())')).not.toMatch(/small/i);
    expect(JSON.stringify(json('SETUPS[0]'))).not.toMatch(/"small/i);
    // the same plan object in both views, byte for byte (bag selection Decision 1: one plan object)
    const inSmall = page.run('JSON.stringify(currentPlan())'), draft = page.run('JSON.stringify(captureDraft())');
    expect(page.run('openFullPlanner()')).toBe(true);
    expect(json('[S.step,SMALL_VIEW]')).toEqual([4, false]);
    expect(json<boolean>('$("smallHead").hidden')).toBe(true);
    expect(json<boolean>('weightPromptBlocked()')).toBe(false);
    expect(page.run('JSON.stringify(currentPlan())')).toBe(inSmall);
    expect(page.run('JSON.stringify(captureDraft())')).toBe(draft);
    expect(page.run('openFullPlanner()')).toBe(false);
  });

  test('Undo from the small view brings the plan back and leaves the small view; a long trip never opens it', async () => {
    const day = longPlanner((await handedOff('loop', { nights: 0 })).gpx);
    await day.page.run('receiveHandoff()');
    const before = day.page.run('JSON.stringify(captureDraft())');
    await day.page.run('planTripBags()');
    expect(await day.page.run('undoTripBags()')).toBe(true);
    expect(day.json<boolean>('SMALL_VIEW')).toBe(false);
    expect(day.page.run('JSON.stringify(captureDraft())')).toBe(before);
    const long = longPlanner((await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12')).gpx);
    await long.page.run('receiveHandoff()');
    await long.page.run('planTripBags()');
    expect(long.json('[S.step,SMALL_VIEW]')).toEqual([2, false]);
  });
});

// A day ride the owner tried on 9 Nov 2026 (about 40 km, a few hundred metres of climbing, 0 nights, no bike saved, a general setup
// "November · 0 nights" with no bags): the plan came out with 0 L mounted and 8.82 L of kit over. A day ride's plan must be one to ride
// with: the day's essentials, sized to the ride by the planner's own rules, and bags that hold them; the rider's setups never change.
/** The bag planner with no bike and no bags, a handed-off day ride on part of the loop fixture (or another whole route), departing on `date`. */
async function dayRide(date: string, opts: { route?: Parameters<typeof loadFixtureRoute>[0] } = {}) {
  // the owner's kind of ride: the loop's first 40 km or so (the whole loop is about 100 km)
  const { gpx } = await handedOff(opts.route ?? 'loop', { nights: 0 }, date, opts.route ? 1 : 0.4);
  const p = longPlanner(gpx);
  p.page.run(`S.bags=[];S.nextUid=1;S.bikeProfile=null;S.kit={};S.kitTouched={};S.custom={};S.qty={};S.packed={};S.pinned={};applyTripKitDefaults();`);
  return p;
}
const ESSENTIALS = ['docs', 'cash', 'phone', 'snacks', 'tool', 'pump', 'levers', 'firstaid', 'rain'];
describe('[TRIP-DAY-BAGS] a day ride from Wayfinch gets a plan to ride with (owner, 9 Nov 2026)', () => {
  test('a general setup with no bags is never the foundation; the bar says why it was passed over, and that setup stays byte for byte', async () => {
    const { page, json } = await dayRide('2026-11-15');
    page.run(`SETUPS=[${qaSetup('g_empty', { kind: 'general', name: 'November · 0 nights' })}];`);
    const setups = page.run('JSON.stringify(SETUPS)');
    expect(json('(SETUPS[0].bags||[]).length')).toBe(0);
    await page.run('receiveHandoff()');
    expect(json('tripFoundation()')).toBeNull();
    expect(String(page.nodes.get('handoffText')!.textContent)).not.toMatch(/from your general setup/);
    expect(await page.run('planTripBags()')).toBe(true);
    expect(json('"base" in SETUPS[0]')).toBe(false);
    expect(String(page.nodes.get('handoffText')!.textContent)).toMatch(/November · 0 nights has no bags/);
    expect(page.run(`JSON.stringify(SETUPS.filter(s=>s.id==='g_empty'))`)).toBe(setups);
  });

  test('with no bags anywhere, it proposes the smallest setup the planner\'s own rules fill: one bottle, a top tube bag and/or a frame bag, a seat pack only when they cannot hold the day kit; nothing is over', async () => {
    const { page, json } = await dayRide('2026-11-15');
    await page.run('receiveHandoff()');
    expect(await page.run('planTripBags()')).toBe(true);
    const bags = json<Array<{ pos: string; slot?: string; L: number }>>('S.bags');
    // water: one bottle, on the down tube, the roomiest mount (owner, 9 Nov 2026: "and one bottle of water")
    expect(bags.filter((b) => b.pos === 'bottle').map((b) => b.slot)).toEqual(['dt']);
    expect(json<number>('waterL()')).toBeGreaterThan(0.5);
    // the bags only from the top tube bag, the frame bag and the seat pack (owner, 9 Nov 2026: "It's always top tube and frame bag")
    for (const b of bags) expect(['bottle', 'top', 'frame', 'seat']).toContain(b.pos);
    // nothing over, and the whole kit in bags
    expect(json('currentPlan().spill.map(k=>k.id)')).toEqual([]);
    expect(json<number>('capL()')).toBeGreaterThanOrEqual(json<number>('kitL()'));
    // and everything that must be reached at the roadside within reach (the selection's own reach rule)
    expect(json('currentPlan().reach.outOfReach')).toEqual([]);
    // smallest: without any one of the added bags, something would be over or out of reach, or the phone out of its own bags
    const extras = bags.filter((b) => b.pos !== 'bottle').map((b) => b.pos);
    for (const pos of extras)
      expect(json<number>(`(p=>p.spill.length+p.reach.outOfReach.length+phoneOffPref(p))(freshPlan({bags:S.bags.filter(b=>b.pos!=='${pos}'),placements:null}))`), `without the ${pos} bag`).toBeGreaterThan(0);
    // the bar names what it proposed
    expect(String(page.nodes.get('handoffText')!.textContent)).toMatch(/top tube bag/i);
    // the setup made for the trip holds the same bags
    expect(json('SETUPS[0].bags')).toEqual(bags);
  });

  test('the day\'s kit is the essentials, sized to the riding time; layers and sun kit follow the packing check\'s own weather and season rules', async () => {
    const nov = await dayRide('2026-11-15');
    await nov.page.run('receiveHandoff()');
    await nov.page.run('planTripBags()');
    const on = (p: typeof nov, id: string) => p.json<boolean>(`carrying('${id}')`);
    for (const id of ESSENTIALS) expect(on(nov, id), id).toBe(true);
    expect(on(nov, 'tubes') || on(nov, 'plugs')).toBe(true);
    // a short ride: no lock, no power bank, no day of meals (ride snacks instead), nothing for the night
    for (const id of ['lock', 'bank', 'food', 'base1', 'socks', 'wash', 'teeth', 'cables', 'towel', 'quilt', 'tent'])
      expect(on(nov, id), id).toBe(false);
    expect(nov.json<number>('planRoute().hoursDay')).toBeLessThan(4);
    // the packing check asks for nothing the start left out, and the layers are exactly what its rules ask for: for a day ride by
    // the day's temperature over the riding hours (owner, 9 Nov 2026: "Yes, by day temp"), not the month's coldest night
    expect(nov.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toEqual([]);
    const c = nov.json<{ nightCold: number | null; dayMean: number | null }>('tripClimate()');
    expect(c.nightCold).not.toBeNull();
    const day = nov.json<number>('dayRideTemp(tripClimate())');
    expect(day).toBe(Math.round((c.nightCold! + c.dayMean!) / 2));
    // the jacket, when the day calls for it, is worn, not packed (owner, 9 Nov 2026: "Worn, one spare tube")
    expect(on(nov, 'puffy')).toBe(false);
    expect(nov.json<boolean>('dayRideWearsJacket()')).toBe(day < 8);   // worn only below 8 °C (owner, 9 Nov 2026: "Below 8 °C")
    expect(on(nov, 'gloves')).toBe(day < 5);
    expect([nov.json<boolean>('dayRideWearsJacket()'), on(nov, 'gloves')]).toEqual([true, true]);   // a cold November day still calls for both
    expect([on(nov, 'shades'), on(nov, 'sun')]).toEqual([false, false]);   // November: no sun season
    const jun = await dayRide('2026-06-20');
    await jun.page.run('receiveHandoff()');
    await jun.page.run('planTripBags()');
    expect([on(jun, 'shades'), on(jun, 'sun')]).toEqual([true, true]);
    expect(jun.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toEqual([]);
    // a long day in the saddle: a day of food and the power bank come along
    const long = await dayRide('2026-06-20', { route: 'heidelberg-strasbourg' });
    await long.page.run('receiveHandoff()');
    await long.page.run('planTripBags()');
    expect(long.json<number>('planRoute().hoursDay')).toBeGreaterThan(6);
    expect([on(long, 'food'), on(long, 'bank')]).toEqual([true, true]);
    // rain is likely on this route in June: the rain trousers come along, so the check asks for nothing here either (review of PR 92, M1)
    expect(long.json<number>('tripClimate().wetChance')).toBeGreaterThan(33);
    expect(on(long, 'rainpants')).toBe(true);
    expect(long.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toEqual([]);
  });

  test('a hot July day ride packs no insulated jacket and no long gloves, and the check does not ask for them; a night out keeps the night rule (owner, 9 Nov 2026; review of PR 92, I1)', async () => {
    const jul = await dayRide('2026-07-20');
    await jul.page.run('receiveHandoff()');
    await jul.page.run('planTripBags()');
    const c = jul.json<{ nightCold: number; dayHot: number }>('tripClimate()');
    expect(c.dayHot).toBeGreaterThanOrEqual(32);   // warm days to 32 °C
    expect(c.nightCold).toBeLessThan(11);          // while the month's cold nights alone would still call for the jacket
    expect(jul.json<boolean>(`carrying('puffy')`)).toBe(false);
    expect(jul.json<boolean>('dayRideWearsJacket()')).toBe(false);
    expect(jul.json<boolean>(`carrying('gloves')`)).toBe(false);
    expect(jul.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toEqual([]);
    expect(jul.json<boolean>('$("smallWear").hidden')).toBe(true);
    // the same weather with one night: the evening counts, and the check asks for the jacket by the night as before
    jul.page.run('S.nights=1;');
    expect(jul.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toContain('puffy');
    expect(jul.json<string>(`audit().miss.find(m=>m.ids.includes('puffy')).d`)).toMatch(/^Nights drop to about/);
    jul.page.run('S.nights=0;');
    // a cold November day ride: the jacket is worn (owner, 9 Nov 2026: "Worn, one spare tube"), so the check does not ask to pack it,
    // and the small view says to wear it, in one line
    const nov = await dayRide('2026-11-15');
    await nov.page.run('receiveHandoff()');
    await nov.page.run('planTripBags()');
    expect(nov.json<boolean>(`carrying('puffy')`)).toBe(false);
    expect(nov.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toEqual([]);
    expect(nov.json<boolean>('$("smallWear").hidden')).toBe(false);
    expect(String(nov.page.nodes.get('smallWear')!.textContent)).toBe('Wear: insulated jacket.');
    // packed by the rider in the full planner, it is in a bag again, and the wear line goes
    nov.page.run('S.kit.puffy=true;S.kitTouched.puffy=true;renderSmallBags();');
    expect(nov.json<boolean>('$("smallWear").hidden')).toBe(true);
  });

  test('a bike with no bottle mounts still carries water on a day ride: in a bag the planner\'s own placement rules choose, and the water line says where (review of PR 92, I2)', async () => {
    for (const fit of [{ style: 'diamond', bolts: { st: 'no', dt: 'no', un: 'no' } }, { style: 'step-through' }]) {
      const p = await dayRide('2026-11-15');
      p.page.run(`S.bikeProfile=normaliseBikeProfile({id:'b_nocage',name:'No cages',fit:${JSON.stringify(fit)}});applyTripKitDefaults();`);
      await p.page.run('receiveHandoff()');
      expect(await p.page.run('planTripBags()')).toBe(true);
      expect(p.json<number>('liveBottles().length'), fit.style).toBe(0);
      expect(p.json<boolean>(`carrying('water')`), fit.style).toBe(true);
      expect(p.json('currentPlan().spill.map(k=>k.id)'), fit.style).toEqual([]);
      const bag = p.json<string>(`getChecklistModel(currentPlan()).groups.find(g=>g.items.some(r=>r.id==='water')).title`);
      expect(String(p.page.nodes.get('smallWater')!.textContent), fit.style).toBe(`Water: a bottle in the ${bag.toLowerCase()}, since this bike has no bottle cage mounts.`);
      expect(String(p.page.nodes.get('smallBagList')!.innerHTML)).toMatch(/<li>Water bottle<\/li>/);
    }
    // with bottle cages, the bottles carry the water and no extra water goes in a bag
    const caged = await dayRide('2026-11-15');
    await caged.page.run('receiveHandoff()');
    await caged.page.run('planTripBags()');
    expect(caged.json<number>('liveBottles().length')).toBe(1);
    expect(caged.json<boolean>(`carrying('water')`)).toBe(false);
  });

  test('the phone rides in a bag it is meant for (top tube or frame bag), not under the jackets in the seat pack (review of PR 92, I3)', async () => {
    const { page, json } = await dayRide('2026-11-15');
    await page.run('receiveHandoff()');
    await page.run('planTripBags()');
    const phoneIn = json<string>(`(P=>P.units[P.items.phone[0][0]].pos)(currentPlan())`);
    expect(['top', 'frame']).toContain(phoneIn);
    expect(json('currentPlan().spill.map(k=>k.id)')).toEqual([]);
    expect(json('currentPlan().reach.outOfReach')).toEqual([]);
  });

  test('an afternoon ride gets a top tube bag and/or a frame bag and one bottle; the seat pack only when those truly cannot hold the day kit (owner, 9 Nov 2026)', async () => {
    // "No one on an afternoon ride uses the seat pack. It's always top tube and frame bag, and mostly only one, and one bottle of water."
    // the owner's ride in July: the day kit fits the top tube and frame bags, so no seat pack
    const jul = await dayRide('2026-07-20');
    await jul.page.run('receiveHandoff()');
    expect(await jul.page.run('planTripBags()')).toBe(true);
    expect(jul.json<number>('dayRideHours()')).toBeLessThanOrEqual(jul.json<number>('PACE.hard.hours'));
    expect(jul.json('S.bags.filter(b=>isBottle(b.pos)).map(b=>b.slot)')).toEqual(['dt']);
    const julPos = jul.json<string[]>('gearBags().map(b=>b.pos)');
    expect(julPos.every((p) => p === 'top' || p === 'frame')).toBe(true);
    expect(julPos.length).toBeGreaterThan(0);
    expect(jul.json('currentPlan().spill.map(k=>k.id)')).toEqual([]);
    expect(String(jul.page.nodes.get('smallWater')!.textContent)).toBe('Water: one bottle (0.75 L) in the frame cage. Refill on the way.');
    expect(julPos.sort()).toEqual(['frame', 'top']);   // the July case as before the jacket and tube ruling
    // and in November: the jacket is worn and one spare tube rides (owner, 9 Nov 2026: "Worn, one spare tube"), so the day kit fits
    // the top tube and frame bags too: one bottle, no seat pack, no handlebar roll
    const nov = await dayRide('2026-11-15');
    await nov.page.run('receiveHandoff()');
    await nov.page.run('planTripBags()');
    expect(nov.json('S.bags.filter(b=>isBottle(b.pos)).map(b=>b.slot)')).toEqual(['dt']);
    const novPos = nov.json<string[]>('gearBags().map(b=>b.pos)');
    expect(novPos.length).toBeGreaterThan(0);
    expect(novPos.every((p) => p === 'top' || p === 'frame')).toBe(true);
    expect(nov.json('currentPlan().spill.map(k=>k.id)')).toEqual([]);
  });

  test('the insulated jacket is worn on a day ride only below 8 °C; a mild April day neither wears nor packs it (owner, 9 Nov 2026: "Below 8 °C")', async () => {
    const apr = await dayRide('2026-04-15');
    await apr.page.run('receiveHandoff()');
    await apr.page.run('planTripBags()');
    const c = apr.json<{ dayMean: number }>('tripClimate()');
    expect(c.dayMean).toBe(16);   // the usual high of an April day here
    const t = apr.json<number>('dayRideTemp(tripClimate())');
    expect(t).toBeGreaterThanOrEqual(8);
    expect(apr.json<boolean>('dayRideWearsJacket()')).toBe(false);
    expect(apr.json<boolean>(`carrying('puffy')`)).toBe(false);
    expect(apr.json<boolean>('$("smallWear").hidden')).toBe(true);
    expect(apr.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toEqual([]);
    expect(apr.json<string>('climateConsequence(true)')).not.toMatch(/insulated jacket/);
    // November, about 4 °C over the riding hours: worn
    const nov = await dayRide('2026-11-15');
    await nov.page.run('receiveHandoff()');
    await nov.page.run('planTripBags()');
    expect(nov.json<number>('dayRideTemp(tripClimate())')).toBeLessThan(8);
    expect(nov.json<boolean>('dayRideWearsJacket()')).toBe(true);
    expect(String(nov.page.nodes.get('smallWear')!.textContent)).toBe('Wear: insulated jacket.');
    // one night in April: the night rule as before, the jacket asked for by the cold night
    apr.page.run('S.nights=1;');
    expect(apr.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toContain('puffy');
  });

  test('in the full planner the day ride\'s tube reads as what it is, one tube for a day ride, never "×2" or the rider\'s own size; with nights it is two tubes again (review of PR 95, I1)', async () => {
    const p = await dayRide('2026-11-15');
    await p.page.run('receiveHandoff()');
    await p.page.run('planTripBags()');
    expect(p.page.run('openFullPlanner()')).toBe(true);
    expect(p.json<string>(`kitName(kitById('tubes'))`)).toBe('Spare tube (one, for a day ride)');
    const row = p.json<{ name: string }>(`getChecklistModel(currentPlan()).groups.flatMap(g=>g.items).find(r=>r.id==='tubes')`);
    expect(row.name).toBe('Spare tube (one, for a day ride)');
    expect(p.json<boolean>(`kitSizeIsRiders(kitById('tubes'))`)).toBe(false);
    // the trip gets nights: the day size goes, two tubes again, under the frozen KIT name
    p.page.run('S.nights=2;applyTripKitDefaults();');
    expect(p.json('S.custom.tubes ?? null')).toBeNull();
    expect(p.json<number>(`itemL(kitById('tubes'))`)).toBe(0.7);
    expect(p.json<string>(`kitName(kitById('tubes'))`)).toBe('Spare tubes ×2');
    // a size the rider set stays through any change of nights, and is the rider's
    const own = await dayRide('2026-11-15');
    own.page.run(`S.custom.tubes={L:0.5,kg:0.2,rigid:0};S.nights=2;applyTripKitDefaults();`);
    expect(own.json('S.custom.tubes')).toEqual({ L: 0.5, kg: 0.2, rigid: 0 });
    expect(own.json<boolean>(`kitSizeIsRiders(kitById('tubes'))`)).toBe(true);
  });

  test('a day ride carries one spare tube, not two, and the small view names it so; a trip with a night keeps two (owner, 9 Nov 2026)', async () => {
    const nov = await dayRide('2026-11-15');
    await nov.page.run('receiveHandoff()');
    await nov.page.run('planTripBags()');
    expect(nov.json<boolean>(`carrying('tubes')`)).toBe(true);
    expect(nov.json<number>(`itemL(kitById('tubes'))`)).toBe(0.35);
    expect(nov.json<number>(`itemKg(kitById('tubes'))`)).toBeCloseTo(0.18, 2);
    expect(String(nov.page.nodes.get('smallBagList')!.innerHTML)).toMatch(/<li>Spare tube<\/li>/);
    expect(String(nov.page.nodes.get('smallBagList')!.innerHTML)).not.toMatch(/Spare tubes ×2/);
    expect(nov.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toEqual([]);
    // Undo gives the plan back exactly, the tube's size included
    const back = await dayRide('2026-11-15');
    await back.page.run('receiveHandoff()');
    const before = back.page.run('JSON.stringify(captureDraft())');
    await back.page.run('planTripBags()');
    expect(await back.page.run('undoTripBags()')).toBe(true);
    expect(back.page.run('JSON.stringify(captureDraft())')).toBe(before);
    // a size the rider set is the rider's: it stays
    const own = await dayRide('2026-11-15');
    own.page.run(`S.custom.tubes={L:0.5,kg:0.2,rigid:0};`);
    await own.page.run('receiveHandoff()');
    await own.page.run('planTripBags()');
    expect(own.json('S.custom.tubes')).toEqual({ L: 0.5, kg: 0.2, rigid: 0 });
    // one night in November: two tubes and the jacket packed, as before
    const night = longPlanner((await handedOff('loop', { nights: 1 }, '2026-11-15', 0.4)).gpx);
    night.page.run(`S.bags=[];S.nextUid=1;S.bikeProfile=null;S.kit={};S.kitTouched={};S.custom={};S.qty={};S.packed={};S.pinned={};applyTripKitDefaults();`);
    await night.page.run('receiveHandoff()');
    await night.page.run('planTripBags()');
    expect(night.json('S.nights')).toBe(1);
    expect(night.json<number>(`itemL(kitById('tubes'))`)).toBe(0.7);
    expect(night.json<boolean>(`carrying('puffy')`)).toBe(true);
  });

  test('a very long single push (beyond the hard pace\'s dawn-to-dusk day) may take the seat pack and both cages, as before', async () => {
    const long = await dayRide('2026-06-20', { route: 'heidelberg-strasbourg' });
    await long.page.run('receiveHandoff()');
    await long.page.run('planTripBags()');
    expect(long.json<number>('dayRideHours()')).toBeGreaterThan(long.json<number>('PACE.hard.hours'));
    expect(long.json('S.bags.filter(b=>isBottle(b.pos)).map(b=>b.slot).sort()')).toEqual(['dt', 'st']);
    expect(long.json<string[]>('gearBags().map(b=>b.pos)')).toContain('seat');
    expect(String(long.page.nodes.get('smallWater')!.textContent)).toBe('Water: 2 bottles (1.25 L) in the frame cages. Refill on the way.');
    expect(long.json('currentPlan().spill.map(k=>k.id)')).toEqual([]);
  });

  test('the small view\'s water line names the bottles and where they are, never an amount planned for the ride; each bag is a heading, not a landmark (review of PR 92, M2, M5)', async () => {
    const { page } = await dayRide('2026-11-15');
    await page.run('receiveHandoff()');
    await page.run('planTripBags()');
    expect(String(page.nodes.get('smallWater')!.textContent)).toBe('Water: one bottle (0.75 L) in the frame cage. Refill on the way.');
    const list = String(page.nodes.get('smallBagList')!.innerHTML);
    expect(list).toMatch(/<h3>/);
    expect(list).not.toMatch(/<section|aria-label/);
  });

  test('the rider\'s own bags in the plan here are used, never replaced; Undo brings back the plan and the setups exactly', async () => {
    const { page, json } = await dayRide('2026-11-15');
    page.run(`S.bags=[{uid:1,pos:'frame',L:5},{uid:2,pos:'seat',L:8}];S.nextUid=3;SETUPS=[${qaSetup('t_mine')}];`);
    await page.run('receiveHandoff()');
    const before = page.run('JSON.stringify(captureDraft())'), setups = page.run('JSON.stringify(SETUPS)');
    expect(await page.run('planTripBags()')).toBe(true);
    expect(json('S.bags.map(b=>[b.uid,b.pos,b.L])')).toEqual([[1, 'frame', 5], [2, 'seat', 8]]);
    expect(await page.run('undoTripBags()')).toBe(true);
    expect(page.run('JSON.stringify(captureDraft())')).toBe(before);
    expect(page.run('JSON.stringify(SETUPS)')).toBe(setups);
  });

  test('when even the whole typical setup cannot hold the kit, the small view says what is over and what to do, in one line', async () => {
    const { page, json } = await dayRide('2026-11-15');
    // nine pairs (it was six): the day kit is smaller since the jacket is worn and one tube rides (owner, 9 Nov 2026)
    page.run(`S.kit.shoes=true;S.kitTouched.shoes=true;S.qty.shoes=9;`);
    await page.run('receiveHandoff()');
    expect(await page.run('planTripBags()')).toBe(true);
    expect(json<number>('currentPlan().spill.length')).toBeGreaterThan(0);
    const line = String(page.nodes.get('smallOver')!.textContent);
    expect(line).toMatch(/Camp or spare shoes/);
    expect(line).toMatch(/Open the full Bag planner/);
  });
});
