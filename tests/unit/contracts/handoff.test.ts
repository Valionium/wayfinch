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
type VM = { run: (code: string) => unknown; context: Record<string, unknown>; values: Map<string, string>; nodes: Map<string, { href?: string; textContent?: string }> };
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: (o?: { bike?: boolean }) => VM };
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
