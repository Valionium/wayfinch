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
import { bannedHits } from '../../fixtures/banned.ts';
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
// the first aid kit is not among them on a short day ride (owner, 10 Nov 2026: "No first aid kit for short ride"; TRIP-DAY-SHORT)
const ESSENTIALS = ['docs', 'cash', 'phone', 'snacks', 'tool', 'pump', 'levers', 'rain'];
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
    // smallest: without any one of the added bags, something would be over or out of reach, or the phone out of its own bags; the 1.2 L
    // top tube bag is the day ride's first bag (owner, 9 Nov 2026: the top tube bag first, the frame bag only if things are still over),
    // so only the bags added after it are checked
    const extras = bags.filter((b) => b.pos !== 'bottle' && b.pos !== 'top').map((b) => b.pos);
    expect(bags.filter((b) => b.pos === 'top').map((b) => b.L)).toEqual([1.2]);
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
    // and, a short ride, no first aid kit (owner, 10 Nov 2026: "No first aid kit for short ride")
    for (const id of ['lock', 'bank', 'food', 'firstaid', 'base1', 'socks', 'wash', 'teeth', 'cables', 'towel', 'quilt', 'tent'])
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
    // a short ride wears the long gloves the day calls for, not packed (owner, 10 Nov 2026)
    expect(on(nov, 'gloves')).toBe(false);
    expect(nov.json<boolean>('shortDayPutOn().gloves')).toBe(day < 5);
    expect([nov.json<boolean>('dayRideWearsJacket()'), nov.json<boolean>('shortDayPutOn().gloves')]).toEqual([true, true]);   // a cold November day still calls for both
    expect([on(nov, 'shades'), on(nov, 'sun')]).toEqual([false, false]);   // November: no sun season
    const jun = await dayRide('2026-06-20');
    await jun.page.run('receiveHandoff()');
    await jun.page.run('planTripBags()');
    // the sunglasses come; the sunscreen of a short ride is put on before leaving, not packed (owner, 10 Nov 2026)
    expect([on(jun, 'shades'), on(jun, 'sun'), jun.json<boolean>('shortDayPutOn().sun')]).toEqual([true, false, true]);
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

  test('sunglasses on a day ride are April to September: the start, the packing check and what the day leaves at home agree (review of PR 103)', async () => {
    for (const [date, packed] of [['2026-03-20', false], ['2026-04-10', true], ['2026-09-20', true], ['2026-10-10', false]] as const) {
      const ride = await dayRide(date);
      await ride.page.run('receiveHandoff()');
      await ride.page.run('planTripBags()');
      expect([date, ride.json<boolean>("carrying('shades')"), ride.json<boolean>('daySunny()')]).toEqual([date, packed, packed]);
      expect([date, ride.json<string[]>('audit().miss.flatMap(m=>m.ids)').includes('shades')]).toEqual([date, false]);
    }
  });

  test('a multi-day trip keeps its own sunglasses season: March and October, with sunglasses not packed, still get the reminder (review of PR 113)', async () => {
    for (const [date, asked] of [['2026-03-20', true], ['2026-10-10', true]] as const) {
      const { gpx } = await handedOff('loop', { nights: 2 }, date, 0.4);
      const p = longPlanner(gpx);
      await p.page.run('receiveHandoff()');
      p.page.run("S.kit.shades=false;S.kitTouched.shades=true;");
      expect([date, p.json<number>('S.nights') > 0, p.json<boolean>("carrying('shades')"), p.json<string[]>('audit().miss.flatMap(m=>m.ids)').includes('shades')]).toEqual([date, true, false, asked]);
    }
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
    // no jacket, no gloves; a short ride in the sun season puts the sunscreen on before leaving (owner, 10 Nov 2026)
    expect(String(jul.page.nodes.get('smallWear')!.textContent)).toBe('Put on before you go: sunscreen.');
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
    // and the long gloves of a short ride, worn (owner, 10 Nov 2026)
    expect(String(nov.page.nodes.get('smallWear')!.textContent)).toBe('Wear: insulated jacket and long gloves.');
    // packed by the rider in the full planner (the jacket, and since 10 Nov 2026 the worn gloves too), they are in a bag again, and the
    // wear line goes
    nov.page.run('S.kit.puffy=true;S.kitTouched.puffy=true;S.kit.gloves=true;S.kitTouched.gloves=true;renderSmallBags();');
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
    // with the pockets counted (owner, 9 Nov 2026) the phone rides in the bib shorts pocket; a plan with both pockets off, in one of its bags
    const worn = await dayRide('2026-11-15');
    await worn.page.run('receiveHandoff()');
    await worn.page.run('planTripBags()');
    expect(worn.json('pocketPlaces().phone')).toBe('bib');
    const { page, json } = await dayRide('2026-11-15');
    page.run('S.pockets={jersey:false,bib:false};');
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
    expect(julPos.sort()).toEqual(['top']);   // the top tube bag alone since the short-ride rulings (owner, 10 Nov 2026)
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
    // no jacket; a short ride in the sun season puts the sunscreen on before leaving (owner, 10 Nov 2026)
    expect(String(apr.page.nodes.get('smallWear')!.textContent)).toBe('Put on before you go: sunscreen.');
    expect(apr.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toEqual([]);
    expect(apr.json<string>('climateConsequence(true)')).not.toMatch(/insulated jacket/);
    // November, about 4 °C over the riding hours: worn
    const nov = await dayRide('2026-11-15');
    await nov.page.run('receiveHandoff()');
    await nov.page.run('planTripBags()');
    expect(nov.json<number>('dayRideTemp(tripClimate())')).toBeLessThan(8);
    expect(nov.json<boolean>('dayRideWearsJacket()')).toBe(true);
    // and the long gloves of a short ride, worn (owner, 10 Nov 2026)
    expect(String(nov.page.nodes.get('smallWear')!.textContent)).toBe('Wear: insulated jacket and long gloves.');
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

  test('a bottle in the frame: the day ride\'s frame bag is the half shape that leaves room for it, never a bigger one over the bottle (owner, 9 Nov 2026)', async () => {
    // "for the small planner, the frame bag should be fitted accordingly to the bottle"
    for (const date of ['2026-11-15', '2026-07-20']) {
      const p = await dayRide(date);
      // with both pockets off, so the top tube bag alone cannot hold the day kit (since the short-ride rulings of 10 Nov 2026 it can
      // with them on) and the frame bag comes in
      p.page.run('S.pockets={jersey:false,bib:false};');
      await p.page.run('receiveHandoff()');
      expect(await p.page.run('planTripBags()')).toBe(true);
      expect(p.json('S.bags.filter(b=>isBottle(b.pos)).map(b=>b.slot)'), date).toEqual(['dt']);
      const frame = p.json<{ L: number; shape?: number } | null>(`S.bags.find(b=>b.pos==='frame') || null`);
      expect(frame, date).not.toBeNull();
      expect(p.json<number>(`frameShapeIdx(S.bags.find(b=>b.pos==='frame'))`), date).toBe(2);
      // the half shape's own size or, since the owner's rule of 9 Nov 2026 (the extra goes into the frame bag), a larger half frame bag up
      // to 4.5 L where the frame's details do not set its size
      expect(frame!.L, date).toBeGreaterThanOrEqual(p.json<number>('frameShapeL(2)'));
      expect(frame!.L, date).toBeLessThanOrEqual(4.5);
      expect(p.json<string[]>('gearBags().map(b=>b.pos)').sort(), date).toEqual(['frame', 'top']);
      expect(p.json('currentPlan().spill.map(k=>k.id)'), date).toEqual([]);
      // nothing needed to be left at home for these rides
      expect(p.json('dayLeftAtHome()'), date).toEqual([]);
      expect(p.json<boolean>('$("smallLeft").hidden'), date).toBe(true);
      for (const id of ESSENTIALS) expect(p.json<boolean>(`carrying('${id}')`), `${date} ${id}`).toBe(true);
    }
    // a bike with only a seat-tube mount: the bottle goes there, and the frame bag is the half shape again
    const st = await dayRide('2026-07-20');
    st.page.run(`S.bikeProfile=normaliseBikeProfile({id:'b_st',name:'ST only',fit:{style:'diamond',bolts:{st:'yes',dt:'no',un:'no'}}});applyTripKitDefaults();S.pockets={jersey:false,bib:false};`);   // pockets off, as above
    await st.page.run('receiveHandoff()');
    await st.page.run('planTripBags()');
    expect(st.json('S.bags.filter(b=>isBottle(b.pos)).map(b=>b.slot)')).toEqual(['st']);
    expect(st.json<number>(`frameShapeIdx(S.bags.find(b=>b.pos==='frame'))`)).toBe(2);
  });

  test('when the day kit does not fit beside the bottle, the least essential things stay at home before any bag is added, and the small view says so in one line (owner, 9 Nov 2026)', async () => {
    // the rider's own light down jacket, packed (1.5 L, the rider's size), makes the kit a little too big for the 1.2 L top tube bag and
    // even the largest half frame bag (4.5 L). Since the frame bag beside the bottle grows (owner, 9 Nov 2026: the extra goes into the
    // frame bag) and a short ride packs no first aid kit (owner, 10 Nov 2026), smaller things fit without leaving anything at home, so the
    // case is a bigger item, on a sunny April day.
    // A rider whose plan has both pockets off (owner, 9 Nov 2026: two switches the rider can turn off): with them on, the cap rides in a
    // pocket and nothing needs to stay at home.
    const p = await dayRide('2026-04-15');
    // since the short ride's sunscreen and gloves are not packed (owner, 10 Nov 2026), the jacket and the rider's earbuds together
    p.page.run(`S.kit.puffy=true;S.kitTouched.puffy=true;S.custom.puffy={L:1.5,kg:0.3,rigid:0};S.kit.buds=true;S.kitTouched.buds=true;S.pockets={jersey:false,bib:false};`);
    await p.page.run('receiveHandoff()');
    const before = p.page.run('JSON.stringify(captureDraft())'), setups = p.page.run('JSON.stringify(SETUPS)');
    expect(await p.page.run('planTripBags()')).toBe(true);
    expect(p.json<string[]>('gearBags().map(b=>b.pos)')).not.toContain('seat');
    expect(p.json('currentPlan().spill.map(k=>k.id)')).toEqual([]);
    expect(p.json('dayLeftAtHome()')).toEqual(['cap']);
    expect(p.json<boolean>(`carrying('cap')`)).toBe(false);
    expect(p.json<boolean>(`carrying('puffy')`)).toBe(true);   // the rider's own choice stays
    for (const id of ESSENTIALS) expect(p.json<boolean>(`carrying('${id}')`), id).toBe(true);
    expect(p.json<boolean>('$("smallLeft").hidden')).toBe(false);
    expect(String(p.page.nodes.get('smallLeft')!.textContent)).toBe('Left at home: cap or buff.');
    // Undo gives the plan and the setups back exactly
    expect(await p.page.run('undoTripBags()')).toBe(true);
    expect(p.page.run('JSON.stringify(captureDraft())')).toBe(before);
    expect(p.page.run('JSON.stringify(SETUPS)')).toBe(setups);
    // the order: never water, ID, cash, phone, first aid, the repair kit, the rain jacket or snacks
    const order = p.json<string[]>('DAY_LEAVE_ORDER.map(x=>x.id)');
    expect(order[0]).toBe('cap');
    for (const id of ['water', 'docs', 'cash', 'phone', 'firstaid', 'tool', 'tubes', 'pump', 'levers', 'link', 'chaintl', 'patch', 'plugs', 'rain', 'snacks'])
      expect(order, id).not.toContain(id);
  });

  test('the day ride\'s top tube bag is the typical 1.2 L, never grown; what it does not hold goes in the half-shape frame bag beside the bottle, which grows to the smallest size that leaves nothing over, up to 4.5 L (owner, 9 Nov 2026: a top tube bag is usually 1.2 L; the extra goes into the frame bag)', async () => {
    const tops = (p: Awaited<ReturnType<typeof dayRide>>) => p.json<number[]>(`S.bags.filter(b=>b.pos==='top').map(b=>b.L)`);
    for (const date of ['2026-04-15', '2026-07-20', '2026-10-15', '2026-11-15']) {
      // the owner's kind of ride, about 39 km: it was proposed a 2 L top tube bag
      const { gpx } = await handedOff('loop', { nights: 0 }, date, 0.39);
      const p = longPlanner(gpx);
      p.page.run(`S.bags=[];S.nextUid=1;S.bikeProfile=null;S.kit={};S.kitTouched={};S.custom={};S.qty={};S.packed={};S.pinned={};applyTripKitDefaults();`);
      await p.page.run('receiveHandoff()');
      expect(await p.page.run('planTripBags()')).toBe(true);
      expect(tops(p), date).toEqual([1.2]);
      expect(p.json('currentPlan().spill.map(k=>k.id)'), date).toEqual([]);
      expect(p.json('currentPlan().reach.outOfReach'), date).toEqual([]);
      // the frame bag beside the bottle only when the top tube bag leaves something over (owner, 9 Nov 2026: the frame bag only when
      // really necessary), in the half shape, a size from the half shape's own up to 4.5 L in steps of 0.5 L, the smallest that does it
      const frame = p.json<{ L: number } | null>(`S.bags.find(b=>b.pos==='frame') || null`);
      if (frame) {
        expect(p.json<number>(`(t=>t.spill.length+t.reach.outOfReach.length)(freshPlan({bags:S.bags.filter(b=>b.pos!=='frame'),placements:null}))`), date).toBeGreaterThan(0);
        expect(p.json<number>(`frameShapeIdx(S.bags.find(b=>b.pos==='frame'))`), date).toBe(2);
        const half = p.json<number>(`withInputs({bags:S.bags.filter(b=>isBottle(b.pos))},()=>frameShapeL(2))`);
        expect(frame.L, date).toBeGreaterThanOrEqual(half);
        expect(frame.L, date).toBeLessThanOrEqual(4.5);
        expect(((frame.L - half) * 2) % 1, date).toBe(0);
        if (frame.L > half)   // the smallest such size: half a litre less and something is over
          expect(p.json<number>(`(t=>t.spill.length+t.reach.outOfReach.length)(freshPlan({bags:S.bags.map(b=>b.pos==='frame'?{...b,L:b.L-0.5}:b),placements:null}))`), date).toBeGreaterThan(0);
      }
      expect(p.json('dayLeftAtHome()'), date).toEqual([]);
      for (const id of ESSENTIALS) expect(p.json<boolean>(`carrying('${id}')`), `${date} ${id}`).toBe(true);
      expect(p.json('SETUPS[0].bags'), date).toEqual(p.json('S.bags'));
      // a longer afternoon ride, about 60 km: whatever else it needs, the top tube bag is still 1.2 L
      const long = longPlanner((await handedOff('loop', { nights: 0 }, date, 0.6)).gpx);
      long.page.run(`S.bags=[];S.nextUid=1;S.bikeProfile=null;S.kit={};S.kitTouched={};S.custom={};S.qty={};S.packed={};S.pinned={};applyTripKitDefaults();`);
      await long.page.run('receiveHandoff()');
      expect(await long.page.run('planTripBags()')).toBe(true);
      expect(tops(long), `${date} 60 km`).toEqual([1.2]);
      expect(long.json('currentPlan().spill.map(k=>k.id)'), `${date} 60 km`).toEqual([]);
    }
    // a bike whose frame details set the half shape's size (the frozen bagSpec reads it from the frame): the half bag keeps that size
    const bike = await dayRide('2026-11-15');
    bike.page.run(`S.bikeProfile=normaliseBikeProfile({id:'b_m',name:'Medium',fit:{style:'diamond-sloping',size:{kind:'letter',value:'M'},bolts:{st:'yes',dt:'yes'}}});applyTripKitDefaults();`);
    await bike.page.run('receiveHandoff()');
    expect(await bike.page.run('planTripBags()')).toBe(true);
    // A medium frame's half shape is 3 L; with the pockets counted (owner, 9 Nov 2026) the 1.2 L top tube bag and it hold the day kit,
    // with no seat pack. Any frame bag is the frame's own half size.
    expect(tops(bike)).toEqual([1.2]);
    expect(bike.json<string[]>('gearBags().map(b=>b.pos)')).not.toContain('seat');
    const frame = bike.json<{ L: number } | null>(`S.bags.find(b=>b.pos==='frame') || null`);
    if (frame) expect(frame.L).toBe(bike.json<number>(`withInputs({bags:S.bags.filter(b=>isBottle(b.pos))},()=>frameShapeL(2))`));
    expect(bike.json('currentPlan().spill.map(k=>k.id)')).toEqual([]);
    // the full planner's own new top tube bag keeps its frozen size
    expect(bike.json<number>('POSITIONS.top.defL')).toBe(1);
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

// Pockets on a day ride (owner, 9 Nov 2026): riders on an afternoon ride mostly wear bib shorts and a jersey with pockets, so the small
// things ride there, counted as carried room, not as bags; the frame bag only when really necessary.
describe('[TRIP-DAY-POCKETS] a day ride counts the jersey and bib shorts pockets as carried room (owner, 9 Nov 2026)', () => {
  const planned = async (date: string, share = 0.39, setup = '') => {
    const { gpx } = await handedOff('loop', { nights: 0 }, date, share);
    const p = longPlanner(gpx);
    p.page.run(`S.bags=[];S.nextUid=1;S.bikeProfile=null;S.kit={};S.kitTouched={};S.custom={};S.qty={};S.packed={};S.pinned={};${setup}applyTripKitDefaults();`);
    await p.page.run('receiveHandoff()');
    expect(await p.page.run('planTripBags()')).toBe(true);
    return p;
  };
  type Places = Record<string, 'jersey' | 'bib'>;
  type Planned = Awaited<ReturnType<typeof planned>>;
  const carriedL = (p: Planned) => p.json<number>(`+KIT.filter(k=>carrying(k.id)&&!deckedIds().includes(k.id)).reduce((n,k)=>n+itemL(k),0).toFixed(2)`);

  test('both pockets on by default; only small, light things go in them, within each pocket\'s room; they are in no bag, and the litres add up', async () => {
    for (const date of ['2026-04-15', '2026-07-20', '2026-11-15']) {
      const p = await planned(date);
      expect(p.json('S.pockets'), date).toMatchObject({ jersey: true, bib: true });
      const places = p.json<Places>('pocketPlaces()');
      expect(places.phone, date).toBeDefined();   // the phone rides in a pocket
      const room = { jersey: 0, bib: 0 };
      for (const [id, where] of Object.entries(places)) {
        const L = p.json<number>(`itemL(kitById('${id}'))`), kg = p.json<number>(`itemKg(kitById('${id}'))`);
        // the packable rain jacket rides in the jersey by kind (owner, 10 Nov 2026), up to 1.2 L; anything else 0.6 L at most
        expect(L, id).toBeLessThanOrEqual(where === 'bib' ? 0.2 : id === 'rain' ? 1.2 : 0.6);
        expect(kg, id).toBeLessThanOrEqual(0.35);
        expect(p.json<boolean>(`carrying('${id}')`), id).toBe(true);
        room[where] += L;
      }
      expect(room.jersey, date).toBeLessThanOrEqual(2.1 + 1e-9);
      expect(room.bib, date).toBeLessThanOrEqual(0.5 + 1e-9);
      // in no bag: not in the plan's bags, nothing over
      const inBags = p.json<string[]>('Object.keys(currentPlan().items)');
      for (const id of Object.keys(places)) expect(inBags, `${date} ${id}`).not.toContain(id);
      expect(p.json('currentPlan().spill.map(k=>k.id)'), date).toEqual([]);
      // the litres add up: what is in the bags plus what is in the pockets is everything carried
      const pocketL = Object.keys(places).reduce((n, id) => n + p.json<number>(`itemL(kitById('${id}'))`), 0);
      expect(p.json<number>('kitL()') + pocketL, date).toBeCloseTo(carriedL(p), 2);
      expect(p.json<number>('capL()'), date).toBeGreaterThanOrEqual(p.json<number>('kitL()'));
      // the packing check asks for nothing that rides in a pocket
      expect(p.json<string[]>('audit().miss.flatMap(m=>m.ids)'), date).toEqual([]);
    }
  });

  test('a plain line names what rides in each pocket; two switches, Jersey pockets and Bib shorts pockets, both on', async () => {
    const p = await planned('2026-11-15');
    const places = p.json<Places>('pocketPlaces()');
    const box = p.page.nodes.get('smallPockets')!;
    expect(p.json<boolean>(`$("smallPockets").hidden`)).toBe(false);
    // each thing by its short name (KIT's "ID, cards, insurance" would read as three things), joined with "and"
    const name = (id: string) => p.json<string>(`POCKET_NAMES['${id}']`);
    const and = (a: string[]) => (a.length < 2 ? a[0] : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
    const of = (w: string) => Object.keys(places).filter((id) => places[id] === w).map(name);
    const jersey = of('jersey'), bib = of('bib');
    expect(jersey.length + bib.length).toBeGreaterThan(0);
    const line = String(box.innerHTML).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (jersey.length) expect(line).toContain(`In your jersey pockets: ${and(jersey)}.`);
    if (bib.length) expect(line).toContain(`In your bib shorts pocket: ${and(bib)}.`);
    expect(line).toMatch(/In your bib shorts pocket: phone/);
    expect(bannedHits(line)).toEqual([]);
    for (const [pocket, label] of [['jersey', 'Jersey pockets'], ['bib', 'Bib shorts pockets']])
      expect(String(box.innerHTML)).toMatch(new RegExp(`<label class="pocket-switch"><input type="checkbox" role="switch" data-pocket="${pocket}" checked> ${label}</label>`));
  });

  test('a switch turned off puts those things back in the bags; the choice is stored with the plan and comes back as it was', async () => {
    const p = await planned('2026-11-15');
    const jersey = Object.entries(p.json<Places>('pocketPlaces()')).filter(([, w]) => w === 'jersey').map(([id]) => id);
    expect(jersey.length).toBeGreaterThan(0);
    p.page.run(`setPocket('jersey',false)`);
    expect(p.json('S.pockets')).toMatchObject({ jersey: false, bib: true });
    const now = p.json<Places>('pocketPlaces()');
    for (const id of jersey) {
      expect(now[id] === 'jersey', id).toBe(false);
      // back in a bag, in the other pocket, or named as over
      const placed = p.json<string[]>('Object.keys(currentPlan().items)').includes(id) || now[id] === 'bib' || p.json<string[]>('currentPlan().spill.map(k=>k.id)').includes(id);
      expect(placed, id).toBe(true);
    }
    // stored with the plan, in the planner's own draft, and read back exactly
    const draft = p.json<{ pockets: unknown }>('captureDraft()');
    expect(draft.pockets).toMatchObject({ jersey: false, bib: true });
    p.page.run(`S.pockets={jersey:true,bib:true};restorePlan(${JSON.stringify(draft)},true)`);
    expect(p.json('S.pockets')).toEqual(draft.pockets);
    // both off: nothing in pockets, the switches still there to turn them back on
    p.page.run(`setPocket('bib',false)`);
    expect(p.json('pocketPlaces()')).toEqual({});
    expect(String(p.page.nodes.get('smallPockets')!.innerHTML)).toMatch(/data-pocket="jersey"/);
  });

  test('a switch, off or on, plans the day ride\'s bags again by the same rule and the line says so; hand placements stay; bags the rider changed are never re-sized', async () => {
    // coordinator's decision, 10 Nov 2026: turning a pocket off or on is the rider's own visible action. About 60 km, over 4 hours, so the
    // frame bag is proposed (the 39 km ride takes the top tube bag alone since the short-ride rulings)
    const p = await planned('2026-11-15', 0.6);
    const gear = () => p.json<Array<{ uid: number; pos: string; L: number }>>('gearBags().map(b=>({uid:b.uid,pos:b.pos,L:b.L}))');
    const before = gear();
    const frame = before.find((b) => b.pos === 'frame')!;
    expect(frame).toBeDefined();
    // a hand placement: the multitool into the frame bag
    p.page.run(`S.pinned.tool='${frame.uid}-0';`);
    expect(p.json('recordOfPin("tool")')).toBe('kept');
    p.page.run(`setPocket('jersey',false)`);
    const off = gear();
    // the same rule: the 1.2 L top tube bag first, the half frame bag only for what is still over, the seat pack last; nothing over
    expect(off.filter((b) => b.pos === 'top').map((b) => b.L)).toEqual([1.2]);
    expect(p.json('currentPlan().spill.map(k=>k.id)')).toEqual([]);
    // a bag that stays keeps its number, so the hand placement into it stays
    expect(off.find((b) => b.pos === 'frame')?.uid).toBe(frame.uid);
    expect(p.json('S.pinned.tool')).toBe(`${frame.uid}-0`);
    expect(p.json('recordOfPin("tool")')).toBe('kept');
    const words = () => String(p.page.nodes.get('smallPockets')!.innerHTML).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(words()).toContain('Bags planned again for your pockets:');
    expect(bannedHits(words())).toEqual([]);
    // on again: the bags of before
    p.page.run(`setPocket('jersey',true)`);
    expect(gear().map(({ pos, L }) => ({ pos, L }))).toEqual(before.map(({ pos, L }) => ({ pos, L })));
    expect(p.json('currentPlan().spill.map(k=>k.id)')).toEqual([]);
    // a size the rider set by hand: the bags stay as the rider set them, the line says so
    p.page.run(`(b=>{b.L=5;b.userL=true;})(S.bags.find(b=>b.pos==='frame'))`);
    const mine = gear();
    p.page.run(`setPocket('bib',false)`);
    expect(gear()).toEqual(mine);
    expect(words()).toContain('Your bags stay as you set them.');
    expect(words()).not.toContain('Bags planned again');
  });

  test('a packable rain jacket and a mini pump ride in the jersey\'s back pockets (owner, 10 Nov 2026); the bags hold the rest, the 1.2 L top tube bag first, the frame bag only if still over', async () => {
    for (const date of ['2026-04-15', '2026-07-20', '2026-11-15']) {
      const p = await planned(date);
      const places = p.json<Places>('pocketPlaces()');
      expect(places.rain, date).toBe('jersey');
      expect(places.pump, date).toBe('jersey');
      expect(places.phone, date).toBe('bib');
      // the jersey's three back pockets hold 2.1 L in all; what does not fit there goes in the bags, as before
      const jerseyL = Object.keys(places).filter((id) => places[id] === 'jersey').reduce((n, id) => n + p.json<number>(`itemL(kitById('${id}'))`), 0);
      expect(jerseyL, date).toBeLessThanOrEqual(2.1 + 1e-9);
      expect(p.json<number[]>(`S.bags.filter(b=>b.pos==='top').map(b=>b.L)`), date).toEqual([1.2]);
      expect(p.json('currentPlan().spill.map(k=>k.id)'), date).toEqual([]);
      if (p.json<boolean>(`S.bags.some(b=>b.pos==='frame')`))
        expect(p.json<number>(`(t=>t.spill.length+t.reach.outOfReach.length)(freshPlan({bags:S.bags.filter(b=>b.pos!=='frame'),placements:null}))`), date).toBeGreaterThan(0);
      const words = String(p.page.nodes.get('smallPockets')!.innerHTML).replace(/<[^>]+>/g, ' ');
      expect(words, date).toMatch(/In your jersey pockets: [^.]*rain jacket[^.]*pump/);
    }
    // a heavy budget shell (2 L, 0.45 kg) is no pocket's: it stays in a bag
    const shell = await planned('2026-11-15', 0.39, `S.custom.rain={L:2,kg:0.45,rigid:0};`);
    expect(shell.json('pocketPlaces().rain ?? null')).toBeNull();
    expect(shell.json<string[]>('Object.keys(currentPlan().items)')).toContain('rain');
  });

  test('review of PR 106, I1: a bag the rider measured (its inside length) is the rider\'s: a switch never re-plans it, and the line says so', async () => {
    const p = await planned('2026-11-15', 0.6);   // over 4 hours: the frame bag is proposed
    p.page.run(`S.bags.find(b=>b.pos==='frame').longestCm=28;`);
    const mine = p.json('S.bags');
    p.page.run(`setPocket('jersey',false)`);
    expect(p.json('S.bags')).toEqual(mine);
    const words = String(p.page.nodes.get('smallPockets')!.innerHTML).replace(/<[^>]+>/g, ' ');
    expect(words).toContain('Your bags stay as you set them.');
    p.page.run(`setPocket('jersey',true)`);
    expect(p.json('S.bags')).toEqual(mine);
  });

  test('review of PR 106, I2: a hand placement survives a switch that takes its bag away and a later one that brings it back', async () => {
    // the reviewer's case: a saved medium frame (half frame bag fixed at 3 L), the multitool placed in the frame bag by hand
    // about 60 km, over 4 hours, so the frame bag is proposed
    const p = await planned('2026-11-15', 0.6, `S.bikeProfile=normaliseBikeProfile({id:'b_m',name:'Medium',fit:{style:'diamond-sloping',size:{kind:'letter',value:'M'},bolts:{st:'yes',dt:'yes'}}});`);
    const frame = p.json<number>(`S.bags.find(b=>b.pos==='frame').uid`);
    p.page.run(`S.pinned.tool='${frame}-0';`);
    expect(p.json('recordOfPin("tool")')).toBe('kept');
    p.page.run(`setPocket('jersey',false)`);
    p.page.run(`setPocket('jersey',true)`);
    // the bags of before, the frame bag under its own number, and the multitool in it again
    expect(p.json<number>(`S.bags.find(b=>b.pos==='frame').uid`)).toBe(frame);
    expect(p.json('S.pinned.tool')).toBe(`${frame}-0`);
    expect(p.json('recordOfPin("tool")')).toBe('kept');
    expect(p.json('currentPlan().spill.map(k=>k.id)')).toEqual([]);
    // the numbers a switch keeps for this come back from the draft too
    const draft = p.json<{ pockets: { uids?: Record<string, number> } }>('captureDraft()');
    expect(draft.pockets.uids?.frame).toBe(frame);
  });

  test('review of PR 106, M1 and M2: the packing checklist lists what rides in the pockets, and the kit figures say the pockets are not in them', async () => {
    const p = await planned('2026-11-15');
    const places = p.json<Places>('pocketPlaces()');
    const groups = p.json<Array<{ id: string; title: string; items: Array<{ id: string; placementLabel: string }> }>>('getChecklistModel().groups');
    const pockets = groups.find((g) => g.id === 'pockets')!;
    expect(pockets.title).toBe('In your pockets');
    expect(pockets.items.map((r) => r.id).sort()).toEqual(Object.keys(places).sort());
    for (const row of pockets.items) expect(row.placementLabel, row.id).toBe(places[row.id] === 'jersey' ? 'Jersey pockets' : 'Bib shorts pocket');
    // the small view names them in its own line, not as a bag
    expect(String(p.page.nodes.get('smallBagList')!.innerHTML)).not.toContain('In your pockets');
    // the kit's weight sent to Wayfinch is the whole kit, the pockets included; what the bike carries stays the bags'
    const all = p.json<number>(`+KIT.filter(k=>carrying(k.id)).reduce((n,k)=>n+itemKg(k),0).toFixed(2)`);
    expect(p.json<number>('loadSummary().weight.kitKg')).toBeCloseTo(all, 2);
    // the full planner's kit figures say what they leave out
    const pocketL = +Object.keys(places).reduce((n, id) => n + p.json<number>(`itemL(kitById('${id}'))`), 0).toFixed(2);
    expect(p.json<string>('pocketsLeftOut()')).toContain(`Not counted here: what rides in your jersey and bib shorts pockets (${pocketL} L,`);
    // both of the packing check's kit figures, Kit volume and Kit + water, carry that line in their explanation
    expect(readFileSync(join(process.cwd(), 'public', 'tools', 'bags', 'index.html'), 'utf8').split('pocketsLeftOut()').length - 1).toBeGreaterThanOrEqual(3);
  });

  test('re-check of PR 106, R1: after the plan is reopened (a reload, Back to Trip and back), a switch still plans the proposed bags again', async () => {
    const p = await planned('2026-11-15');
    // reopening reads the plan back through the page's own normalising, which orders each bag's fields its own way
    p.page.run('restorePlan(JSON.parse(JSON.stringify(captureDraft())),true)');
    p.page.run(`setPocket('jersey',false)`);
    const words = String(p.page.nodes.get('smallPockets')!.innerHTML).replace(/<[^>]+>/g, ' ');
    expect(words).toContain('Bags planned again for your pockets:');
    expect(words).not.toContain('Your bags stay as you set them.');
  });

  test('re-check of PR 106, R2: what rides in the pockets can be ticked in the packing checklist, and its totals count it', async () => {
    const p = await planned('2026-11-15');
    const places = Object.keys(p.json<Places>('pocketPlaces()'));
    expect(places).toContain('rain');
    const before = p.json<{ items: number; packed: number }>('getChecklistModel().totals');
    const bags = p.json<number>(`getChecklistModel().groups.filter(g=>g.id!=='pockets').reduce((n,g)=>n+g.items.length,0)`);
    expect(before.items).toBe(bags + places.length);
    expect(p.json<string[]>('getChecklistModel().items.map(r=>r.id)')).toEqual(expect.arrayContaining(places));
    expect(p.json<boolean>(`setPackedItem('rain',true)`)).toBe(true);
    expect(p.json('S.packed.rain')).toBe(true);
    const row = p.json<{ packed: boolean }>(`getChecklistModel().groups.find(g=>g.id==='pockets').items.find(r=>r.id==='rain')`);
    expect(row.packed).toBe(true);
    expect(p.json<number>('getChecklistModel().totals.packed')).toBe(before.packed + 1);
    // stored with the plan, as any tick
    expect(p.json('captureDraft().packed.rain')).toBe(true);
  });

  test('a saved plan without pockets reopens without them; a night, no pockets', async () => {
    const p = await planned('2026-11-15');
    const draft = p.json<Record<string, unknown>>('captureDraft()');
    delete draft.pockets;
    p.page.run(`restorePlan(${JSON.stringify(draft)},true)`);
    expect(p.json('S.pockets ?? null')).toBeNull();
    expect(p.json('pocketPlaces()')).toEqual({});
    expect(p.json<string>('JSON.stringify(captureDraft())')).not.toMatch(/"pockets"/);
    // a night: the pockets are not counted, whatever the plan says
    const night = longPlanner((await handedOff('loop', { nights: 1 }, '2026-11-15', 0.4)).gpx);
    night.page.run(`S.bags=[];S.nextUid=1;S.bikeProfile=null;S.kit={};S.kitTouched={};S.custom={};S.qty={};S.packed={};S.pinned={};applyTripKitDefaults();`);
    await night.page.run('receiveHandoff()');
    await night.page.run('planTripBags()');
    expect(night.json('S.pockets ?? null')).toBeNull();
    night.page.run('S.pockets={jersey:true,bib:true};');
    expect(night.json('pocketPlaces()')).toEqual({});
  });

  test('bags: the 1.2 L top tube bag first, the half frame bag beside the bottle only if things are still over; a saved medium frame no longer needs the seat pack', async () => {
    for (const date of ['2026-04-15', '2026-07-20', '2026-10-15', '2026-11-15']) {
      const p = await planned(date);
      const gear = p.json<Array<{ pos: string; L: number }>>('gearBags().map(b=>({pos:b.pos,L:b.L}))');
      expect(gear.filter((b) => b.pos === 'top').map((b) => b.L), date).toEqual([1.2]);
      expect(gear.map((b) => b.pos), date).not.toContain('seat');
      expect(p.json('currentPlan().spill.map(k=>k.id)'), date).toEqual([]);
      if (gear.some((b) => b.pos === 'frame'))   // only when the top tube bag alone leaves something over
        expect(p.json<number>(`(t=>t.spill.length+t.reach.outOfReach.length)(freshPlan({bags:S.bags.filter(b=>b.pos!=='frame'),placements:null}))`), date).toBeGreaterThan(0);
    }
    const bike = await planned('2026-11-15', 0.39, `S.bikeProfile=normaliseBikeProfile({id:'b_m',name:'Medium',fit:{style:'diamond-sloping',size:{kind:'letter',value:'M'},bolts:{st:'yes',dt:'yes'}}});`);
    expect(bike.json<string[]>('gearBags().map(b=>b.pos)')).not.toContain('seat');
    expect(bike.json('currentPlan().spill.map(k=>k.id)')).toEqual([]);
    expect(bike.json<number[]>(`S.bags.filter(b=>b.pos==='top').map(b=>b.L)`)).toEqual([1.2]);
  });
});

// The owner's answers of 10 Nov 2026 to the review's 39 km questions: "No first aid kit for short ride", and "Sunglasses are in jersey
// pocket or attached to helmet".
describe('[TRIP-DAY-SHORT] a short day ride packs no first aid kit; on a day ride the sunglasses ride in the jersey or on the helmet, never in a bag (owner, 10 Nov 2026)', () => {
  const planned = async (date: string, share = 0.39, setup = '', route?: Parameters<typeof loadFixtureRoute>[0]) => {
    const { gpx } = await handedOff(route ?? 'loop', { nights: 0 }, date, share);
    const p = longPlanner(gpx);
    p.page.run(`S.bags=[];S.nextUid=1;S.bikeProfile=null;S.kit={};S.kitTouched={};S.custom={};S.qty={};S.packed={};S.pinned={};${setup}applyTripKitDefaults();`);
    await p.page.run('receiveHandoff()');
    expect(await p.page.run('planTripBags()')).toBe(true);
    return p;
  };

  test('a day ride of half a day or less (the steady pace\'s 4 hours, the day that needs no meals) packs no first aid kit, and the packing check does not ask for one; a longer day ride keeps it', async () => {
    for (const date of ['2026-04-15', '2026-07-20', '2026-11-15']) {
      const p = await planned(date);
      expect(p.json<number>('dayRideHours()'), date).toBeLessThanOrEqual(p.json<number>('PACE.steady.hours'));
      expect(p.json<boolean>(`carrying('firstaid')`), date).toBe(false);
      expect(p.json<string[]>('audit().miss.flatMap(m=>m.ids)'), date).not.toContain('firstaid');
      expect(p.json<string[]>('audit().miss.flatMap(m=>m.ids)'), date).toEqual([]);
    }
    // the whole Heidelberg to Strasbourg route in one day: far more than 4 hours, so the first aid kit rides
    const long = await planned('2026-07-20', 1, '', 'heidelberg-strasbourg');
    expect(long.json<number>('dayRideHours()')).toBeGreaterThan(long.json<number>('PACE.steady.hours'));
    expect(long.json<boolean>(`carrying('firstaid')`)).toBe(true);
    // a rider who ticks it on a short ride keeps it: it is the rider's choice
    const own = await planned('2026-07-20', 0.39, `S.kit.firstaid=true;S.kitTouched.firstaid=true;`);
    expect(own.json<boolean>(`carrying('firstaid')`)).toBe(true);
  });

  test('a short day ride: sunscreen is put on before leaving and the long gloves are worn, both said, neither packed; a longer day ride packs them as before (owner, 10 Nov 2026)', async () => {
    const wear = (p: Awaited<ReturnType<typeof planned>>) => String(p.page.nodes.get('smallWear')!.textContent);
    // July: the sunscreen season
    const jul = await planned('2026-07-20');
    expect(jul.json<boolean>(`carrying('sun')`)).toBe(false);
    expect(jul.json<boolean>('$("smallWear").hidden')).toBe(false);
    expect(wear(jul)).toContain('Put on before you go: sunscreen.');
    expect(jul.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toEqual([]);
    // November: the riding hours are below 5 °C, so the long gloves are called for: worn, beside the jacket
    const nov = await planned('2026-11-15');
    expect(nov.json<number>('dayRideTemp(tripClimate())')).toBeLessThan(5);
    expect(nov.json<boolean>(`carrying('gloves')`)).toBe(false);
    expect(wear(nov)).toBe('Wear: insulated jacket and long gloves.');
    expect(nov.json<string[]>('audit().miss.flatMap(m=>m.ids)')).toEqual([]);
    expect(bannedHits(wear(jul) + ' ' + wear(nov))).toEqual([]);
    // the full planner says it too, in the place's note
    expect(nov.json<string>('climateConsequence(true)')).toMatch(/long gloves: worn, not packed/);
    expect(jul.json<string>('climateConsequence(true)')).toMatch(/sunscreen: put it on before you go/i);
    // the whole Heidelberg to Strasbourg route in one day (far beyond 4 hours): packed as before
    const longJul = await planned('2026-07-20', 1, '', 'heidelberg-strasbourg');
    expect(longJul.json<boolean>(`carrying('sun')`)).toBe(true);
    expect(wear(longJul)).not.toContain('sunscreen');
    const longNov = await planned('2026-11-15', 1, '', 'heidelberg-strasbourg');
    if (longNov.json<number>('dayRideTemp(tripClimate())') < 5) expect(longNov.json<boolean>(`carrying('gloves')`)).toBe(true);
  });

  test('the 39 km rides and the saved medium frame now take the 1.2 L top tube bag alone (owner, 10 Nov 2026)', async () => {
    for (const [date, setup] of [['2026-04-15', ''], ['2026-07-20', ''], ['2026-10-15', ''], ['2026-11-15', ''],
      ['2026-11-15', `S.bikeProfile=normaliseBikeProfile({id:'b_m',name:'Medium',fit:{style:'diamond-sloping',size:{kind:'letter',value:'M'},bolts:{st:'yes',dt:'yes'}}});`]] as const) {
      const p = await planned(date, 0.39, setup);
      const at = `${date}${setup ? ' medium frame' : ''}`;
      expect(p.json('gearBags().map(b=>b.pos+":"+b.L)'), at).toEqual(['top:1.2']);
      expect(p.json('currentPlan().spill.map(k=>k.id)'), at).toEqual([]);
      expect(p.json('dayLeftAtHome()'), at).toEqual([]);
      expect(p.json<string[]>('audit().miss.flatMap(m=>m.ids)'), at).toEqual([]);
    }
  });

  test('the sunglasses never go in a bag: in the jersey pockets when they have room, else on the helmet, said in the line; with the jersey pockets off, on the helmet', async () => {
    const p = await planned('2026-07-20');
    expect(p.json<boolean>(`carrying('shades')`)).toBe(true);
    const where = p.json<string>('pocketPlaces().shades');
    expect(['jersey', 'helmet']).toContain(where);
    expect(p.json<string[]>('Object.keys(currentPlan().items)')).not.toContain('shades');
    const words = () => String(p.page.nodes.get('smallPockets')!.innerHTML).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (where === 'helmet') expect(words()).toContain('On your helmet: sunglasses.');
    else expect(words()).toMatch(/In your jersey pockets: [^.]*sunglasses/);
    p.page.run(`setPocket('jersey',false)`);
    expect(p.json('pocketPlaces().shades')).toBe('helmet');
    expect(p.json<string[]>('Object.keys(currentPlan().items)')).not.toContain('shades');
    expect(words()).toContain('On your helmet: sunglasses.');
    // listed as carried in the packing checklist, not in a bag
    const row = p.json<{ placementLabel: string }>(`getChecklistModel().groups.find(g=>g.id==='pockets').items.find(r=>r.id==='shades')`);
    expect(row.placementLabel).toBe('On your helmet');
    expect(bannedHits(words())).toEqual([]);
  });
});
