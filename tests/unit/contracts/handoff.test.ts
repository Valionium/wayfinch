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
import type { Trip } from '../../../src/core/types.ts';
import { DEFAULT_SETTINGS } from '../../../src/store/rules.ts';
import type { Settings } from '../../../src/store/rules.ts';
import { handoffGpx, tripAttributes } from '../../../src/ui/trip/handoff.ts';
import { loadFixtureRoute } from '../../fixtures/packs/index.ts';

const require = createRequire(import.meta.url);
type VM = { run: (code: string) => unknown; context: Record<string, unknown>; values: Map<string, string>; nodes: Map<string, { href?: string; textContent?: string }>;
  store: unknown; localStorage: { setItem: (key: string, value: string) => void } };
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: (o?: { bike?: boolean; storage?: unknown }) => VM };
const { window } = new JSDOM('');
const parseXml = (s: string): XmlDocLike => new window.DOMParser().parseFromString(s, 'application/xml') as unknown as XmlDocLike;
const ID = '0123456789abcdef0123456789abcdef';

/** The co-pilot's side: a trip on a fixture route, as handOffTrip writes it. */
async function handedOff(id: Parameters<typeof loadFixtureRoute>[0], settings: Partial<Settings> = {}, departureDate: string | null = null) {
  const fixture = await loadFixtureRoute(id);
  const route = await buildRoute(fixture.points.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele })), fixture.name, 'gpx');
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
    expect(JSON.parse(page.values.get('loadcheck:setups')!).length).toBe(2);
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
    expect(JSON.parse(page.values.get('loadcheck:setups')!).map((s: { id: string }) => s.id)).toEqual(['t_x']);
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
    const kept = JSON.parse(page.values.get('loadcheck:setups')!).find((s: { id: string }) => s.id === made);
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
    expect(JSON.parse(page.values.get('loadcheck:setups')!).map((s: { id: string }) => s.id)).toEqual([made]);
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

  test('whichever single write of Plan bags for this trip, its Undo, the setup made before or its Undo fails, no saved setup is lost and the bar says the save did not reach storage (review of PR 80, I-1)', async () => {
    const handed = await handedOff('heidelberg-strasbourg', { nights: 2 }, '2026-06-12');
    const many = (n: number, prefix: string, extra: Record<string, unknown> = {}) =>
      `Array.from({length:${n}},(_,i)=>${qaSetup('X', extra).replace("id:'X'", `id:'${prefix}'+i`).replace("name:'Setup X'", `name:'Setup ${prefix}'+i`)})`;
    const made = { saved: '2026-11-06', forRoute: { hash: handed.trip.route.hash, name: 'Heidelberg → Strasbourg', departureDate: '2026-06-12' } };
    // 34 saved setups: 3 general ones of the chosen bike, 30 trip setups and the one made for this route on 6 Nov; the plan here is
    // none of them, so a "Before" copy is made
    const library = `[${qaSetup('t_made', made)},...${many(3, 'g', { kind: 'general' })},...${many(30, 't')}]`;
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
      await p.page.run(`SETUPS=${library};store.set(SETUP_KEY,SETUPS)`);
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
    let cases = 0;
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
        expect(page.run('SETUPS_STORED'), label).toBe(false);
        expect(String(page.nodes.get('handoffText')!.textContent), label).toMatch(/did not reach storage/);
        cases++;
      }
    }
    expect(cases).toBeGreaterThanOrEqual(8);
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
