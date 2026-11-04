// Contract 2 from the co-pilot's side (spec 7.1): the GPX it hands over, what it lists, its limits, and the cleanup. The bag
// planner's side is in qa/contracts.cjs and tests/e2e/app-contracts.spec.ts; both meet in tests/unit/contracts/handoff.test.ts.
import { describe, expect, test } from 'vitest';
import { cleanupHandoff, CP_NS, handOffTrip, handoffGpx, HANDOFF_KEY, settlementNear, tripAttributes } from '../../../src/ui/trip/handoff.ts';
import type { HandoffDeps, HandoffRecord } from '../../../src/ui/trip/handoff.ts';
import { DEFAULT_SETTINGS } from '../../../src/store/rules.ts';
import type { Place } from '../../../src/core/places/types.ts';
import type { Route, Trip } from '../../../src/core/types.ts';

const route = (n = 3, ele: number | null = 100): Route => ({
  id: 'r', name: 'Heidelberg & <Strasbourg>', points: Array.from({ length: n }, (_, i) => ({ lat: 49.4 + i / 1000, lon: 8.69 + i / 1000, ele: ele === null ? null : ele + i, km: i * 0.13 })),
  lengthKm: 0.26, ascentM: 0, stages: [], climbs: [], source: 'gpx', sampleGrid: [], hash: 'ab'.repeat(32),
});
const trip = (r = route()): Trip => ({ route: r, departureDate: null, startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2 });

function deps(over: Partial<HandoffDeps> = {}): HandoffDeps & { records: Map<string, HandoffRecord>; went: string[]; store: Map<string, string> } {
  const records = new Map<string, HandoffRecord>(), went: string[] = [], store = new Map<string, string>();
  return {
    records, went, store,
    now: () => new Date('2026-11-04T10:00:00Z'), randomId: () => '0123456789abcdef0123456789abcdef', places: async () => [],
    putRecord: async (r) => { records.set(r.id, r); }, deleteRecord: async (id) => { records.delete(id); }, listRecords: async () => [...records.values()],
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); }, removeItem: (k) => { store.delete(k); } },
    go: (href) => { went.push(href); },
    ...over,
  };
}

describe('[C-HANDOFF] the co-pilot hands the trip over', () => {
  test('GPX 1.1 of every point, heights where known, one <cp:trip> listing only what the rider set, and the route hash', () => {
    const r = route(4);
    r.points[2]!.ele = null;
    const gpx = handoffGpx(r, tripAttributes(trip(r), DEFAULT_SETTINGS, { start: null, end: null }));
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain(`xmlns:cp="${CP_NS}"`);
    expect(gpx.match(/<trkpt /g)!.length).toBe(4);
    expect(gpx.match(/<ele>/g)!.length).toBe(3);
    expect(gpx).toContain('<name>Heidelberg &amp; &lt;Strasbourg&gt;</name>');
    // what shapes the days always goes, nights left to the stage model as its suggestion; date and stay only when set
    expect(gpx).toContain(`<cp:trip v="1" nights="0" nightsFrom="suggested" pace="sporting" flatKph="25" route="${'ab'.repeat(32)}"/>`);
    const set = tripAttributes({ ...trip(r), departureDate: '2026-11-02' }, { ...DEFAULT_SETTINGS, nights: 2, stay: 'accommodation', pace: 'hard', flatKph: 22 }, { start: 'Heidelberg', end: 'Strasbourg' });
    expect(Object.fromEntries(set)).toEqual({ v: '1', nights: '2', departureDate: '2026-11-02', month: '11', sleep: 'indoor', pace: 'hard', flatKph: '22', startName: 'Heidelberg', endName: 'Strasbourg', route: 'ab'.repeat(32) });
  });

  test('the GPX goes to the database, the envelope to localStorage, then the bag planner opens; no loadcheck:* key is written', async () => {
    const d = deps();
    const out = await handOffTrip(trip(), { ...DEFAULT_SETTINGS, nights: 1 }, d);
    expect(out).toEqual({ ok: true, id: '0123456789abcdef0123456789abcdef' });
    expect(d.records.get(out.ok ? out.id : '')!.gpx).toContain('nights="1"');
    expect(JSON.parse(d.store.get(HANDOFF_KEY)!)).toEqual({ app: 'copilot', kind: 'handoff', v: 1, id: '0123456789abcdef0123456789abcdef', createdAt: '2026-11-04T10:00:00.000Z' });
    expect([...d.store.keys()].some((k) => k.startsWith('loadcheck:'))).toBe(false);
    expect(d.went).toEqual(['/tools/bags/#copilot-handoff=0123456789abcdef0123456789abcdef']);
  });

  test('the end names come from the settlements the co-pilot holds, within 5 km; none, no name', async () => {
    const town = (name: string, lat: number, lon: number): Place => ({ id: 'n' + name, kind: 'settlement', name, lat, lon, waterClass: null, indoorOrLimited: false, openingHours: null } as Place);
    expect(settlementNear([town('Far', 50, 9), town('Near', 49.401, 8.691), town('Nearer', 49.4, 8.6901)], { lat: 49.4, lon: 8.69 })).toBe('Nearer');
    expect(settlementNear([town('Far', 50, 9)], { lat: 49.4, lon: 8.69 })).toBeNull();
    const d = deps({ places: async () => [town('Heidelberg', 49.4, 8.69)] });
    await handOffTrip(trip(), DEFAULT_SETTINGS, d);
    expect([...d.records.values()][0]!.gpx).toContain('startName="Heidelberg"');
  });

  test('over 200,000 points nothing is handed off, and it says why; a full localStorage says so and takes the record back', async () => {
    const big = route(200_001);
    const d = deps();
    const out = await handOffTrip(trip(big), DEFAULT_SETTINGS, d);
    expect(out.ok).toBe(false);
    expect(d.records.size).toBe(0);
    expect(d.went).toEqual([]);
    const full = deps();
    full.storage.setItem = () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
    const res = await handOffTrip(trip(), DEFAULT_SETTINGS, full);
    expect(res).toEqual({ ok: false, reason: expect.stringContaining('storage is full') });
    expect(full.records.size).toBe(0);
    expect(full.went).toEqual([]);
  });

  test('the co-pilot deletes its handoff when the bag planner answered for its id, or after 24 hours, and not before', async () => {
    const d = deps();
    await handOffTrip(trip(), DEFAULT_SETTINGS, d);
    expect(await cleanupHandoff(d)).toBe(false);
    d.store.set('loadcheck:handoff-done', JSON.stringify({ app: 'load-check', kind: 'handoff-done', v: 1, id: 'f'.repeat(32), outcome: 'applied', at: 'x' }));
    expect(await cleanupHandoff(d)).toBe(false); // another id
    d.store.set('loadcheck:handoff-done', JSON.stringify({ app: 'load-check', kind: 'handoff-done', v: 1, id: '0123456789abcdef0123456789abcdef', outcome: 'cancelled', at: 'x' }));
    expect(await cleanupHandoff(d)).toBe(true);
    expect(d.records.size).toBe(0);
    expect(d.store.has(HANDOFF_KEY)).toBe(false);
    expect(d.store.has('loadcheck:handoff-done')).toBe(true); // the bag planner's own key stays
    const later = deps();
    await handOffTrip(trip(), DEFAULT_SETTINGS, later);
    later.now = () => new Date('2026-11-05T10:00:01Z');
    expect(await cleanupHandoff(later)).toBe(true);
  });

  test('a second handoff before the first was answered leaves no route behind: the record no envelope points at goes, and after 24 hours the rest (review M5)', async () => {
    const d = deps();
    let n = 0;
    d.randomId = () => String(++n).repeat(32).slice(0, 32);
    await handOffTrip(trip(), DEFAULT_SETTINGS, d);
    await handOffTrip(trip(), DEFAULT_SETTINGS, d);
    expect(d.records.size).toBe(2);
    expect(await cleanupHandoff(d)).toBe(false);
    expect([...d.records.keys()]).toEqual(['2'.repeat(32)]);
    d.now = () => new Date('2026-11-05T10:00:01Z');
    expect(await cleanupHandoff(d)).toBe(true);
    expect(d.records.size).toBe(0);
    expect(d.store.has(HANDOFF_KEY)).toBe(false);
  });
});
