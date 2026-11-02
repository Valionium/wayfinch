import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import type { StopFacts } from '../../../../src/core/engines/covers.ts';
import { rainPlan, rainPlans } from '../../../../src/core/engines/rain-plans.ts';
import { thunderNear } from '../../../../src/core/engines/shelter.ts';
import { weatherAnswer, weatherStatus, weatherWindows } from '../../../../src/core/engines/weather.ts';
import type { Place, RainPlan, RainWindow } from '../../../../src/core/types.ts';
import { at, bakery, busStop, cafe, flatRoute, fuelShop, kiosk, pos, restaurant, shelter, station, supermarket, testTrip } from '../../../fixtures/build.ts';
import { forecastOf, momentOf, openAllYear, SAT, stamps, stopFactsOf, SUN, type Moment, type Spell, type StopCase } from './weather-helpers.ts';
import { hoursOf } from './water-helpers.ts';

const KM_PER_MIN = (25 * 0.82) / 1.15 / 60;
const LONG = (): ReturnType<typeof testTrip> => testTrip({ route: flatRoute(300, { stageEnds: [200, 300] }) });
const riding = (km: number, t: string, over: Moment = {}): Moment => ({ trip: LONG(), positions: [pos({ km, at: `${SAT} ${t}` })], now: `${SAT} ${t}`, ...over });
const firstLikely = (f: StopFacts): RainWindow => weatherWindows(f).filter((w) => w.cls === 'likely')[0]!;
const planOf = (c: StopCase): RainPlan => {
  const f = stopFactsOf(c);
  return rainPlan(firstLikely(f), f);
};
const rain = (km: number, from = 6, to = 23): Spell => ({ km, stamps: stamps(SAT, from, to), pp: 80, mm: 1 });
const storm = (km: number, stamp: string, pp = 40): Spell => ({ km, stamps: [stamp], pp, code: 95 });

/** Rain at km 100 for the rider leaving km 60 at 12:00; a cover `lead` minutes of riding before it. */
const kmBefore = (lead: number): number => 100 - lead * KM_PER_MIN;
const BAND: Moment = riding(60, '12:00');

describe('the band', () => {
  test.each([[15], [60], [37]])('[STOP-BAND] %i minutes of riding before m: in', (lead) => {
    const p = planOf({ moment: BAND, spells: [rain(100)], spots: [{ b: cafe('x'), km: kmBefore(lead) }] });
    expect(p.m).toBe(100);
    expect(p.covers).toHaveLength(1);
    expect(p.covers[0]!.km).toBeCloseTo(kmBefore(lead), 6);
  });
  test('[STOP-BAND] exactly 60 minutes is in the band: it stands beside one nearer, not as a fallback', () => {
    const p = planOf({ moment: BAND, spells: [rain(100)], spots: [{ b: cafe('x'), km: kmBefore(60), id: 'n1' }, { b: cafe('x'), km: kmBefore(30), id: 'n2' }] });
    expect(p.covers.map((c) => c.placeId)).toEqual(['n2', 'n1']);
  });
  test('[STOP-BAND] 14 minutes: out, and it is too late even as the fallback', () => {
    expect(planOf({ moment: BAND, spells: [rain(100)], spots: [{ b: cafe('x'), km: kmBefore(14) }] }).covers).toEqual([]);
  });
  test('[STOP-BAND] 61 minutes alone: not in the band, so the fallback names it', () => {
    const p = planOf({ moment: BAND, spells: [rain(100)], spots: [{ b: cafe('x'), km: kmBefore(61) }] });
    expect(p.covers).toHaveLength(1);
  });
  test('[STOP-BAND] 61 minutes beside one in the band: out', () => {
    const p = planOf({ moment: BAND, spells: [rain(100)], spots: [{ b: cafe('x'), km: kmBefore(61), id: 'n1' }, { b: cafe('x'), km: kmBefore(30), id: 'n2' }] });
    expect(p.covers.map((c) => c.placeId)).toEqual(['n2']);
  });
  test('[STOP-BAND] with none in the band: only the latest reached at least 15 minutes before', () => {
    const p = planOf({
      moment: BAND, spells: [rain(100)],
      spots: [{ b: cafe('x'), km: kmBefore(90), id: 'n1' }, { b: cafe('x'), km: kmBefore(70), id: 'n2' }, { b: restaurant('x'), km: kmBefore(10), id: 'n3' }],
    });
    expect(p.covers.map((c) => c.placeId)).toEqual(['n2']);
  });
  test('[STOP-BAND] the lead uses the arrival: a detour counts against it', () => {
    // 16 minutes before on the route, and 800 m off: the ride off the route takes it under 15.
    const p = planOf({ moment: BAND, spells: [rain(100)], spots: [{ b: cafe('x'), km: kmBefore(16), off: 800 }] });
    expect(p.covers).toEqual([]);
  });
  test('[STOP-BAND] the lead is riding time with breaks, from the same arrivals as every card', () => {
    const f = stopFactsOf({ moment: BAND, spells: [rain(100)], spots: [{ b: cafe('x'), km: 90 }] });
    const p = rainPlan(firstLikely(f), f);
    expect(p.covers[0]!.arrival).toEqual(f.schedule.atPlace(f.matches[0]!));
  });
  test('[STOP-BAND] behind the start is not a plan cover', () => {
    const p = planOf({ moment: riding(90, '12:00'), spells: [rain(100)], spots: [{ b: cafe('x'), km: 85 }] });
    expect(p.covers).toEqual([]);
  });
});

describe('the order', () => {
  const m = BAND;
  const go = (spots: StopCase['spots'], roofs: StopCase['roofs'] = []): (string | null)[] =>
    planOf({ moment: m, spells: [rain(100)], spots: spots ?? [], roofs }).covers.map((c) => c.placeId);

  test('[STOP-ORDER] class first', () => {
    expect(go([{ b: shelter(), km: 95, id: 'n5' }, { b: supermarket('x'), km: 90, id: 'n2' }, { b: cafe('x'), km: 86, id: 'n1' }])).toEqual(['n1', 'n2', 'n5']);
  });
  test('[STOP-ORDER] then the latest arrival', () => {
    expect(go([{ b: cafe('x'), km: 86, id: 'n1' }, { b: cafe('x'), km: 90, id: 'n2' }])).toEqual(['n2', 'n1']);
  });
  test('[STOP-ORDER] then the shorter detour', () => {
    const a = { b: cafe('x'), km: 90, off: 1000, id: 'n1' };
    const b = { b: cafe('x'), km: 91.3, off: 0, id: 'n2' };
    const f = stopFactsOf({ moment: m, spells: [rain(100)], spots: [a, b] });
    const [ma, mb] = f.matches;
    expect(Math.abs(f.schedule.atPlace(ma!).getTime() - f.schedule.atPlace(mb!).getTime())).toBeLessThan(1000);
    expect(go([a, b])).toEqual(['n2', 'n1']);
  });
  test('[STOP-ORDER] then the final tie-break', () => {
    expect(go([{ b: cafe('x'), km: 90, id: 'n9' }, { b: cafe('x'), km: 90, id: 'n1' }])).toEqual(['n1', 'n9']);
  });
  test('[STOP-ORDER] up to three', () => {
    expect(go([85, 86, 87, 88, 89].map((km, i) => ({ b: cafe('x'), km, id: `n${i}` })))).toEqual(['n4', 'n3', 'n2']);
  });
  test('[STOP-ORDER] the order of the input decides nothing', () => {
    const list = [85, 86, 87, 88].map((km, i) => ({ b: cafe('x'), km, id: `n${i}` }));
    expect(go(list)).toEqual(go([...list].reverse()));
  });
  test('[STOP-TIE] a shelter without bench and a bus stop, both class 5, both at km 96: the shelter first', () => {
    const f = stopFactsOf({ moment: riding(60, '12:00'), spells: [rain(110)], spots: [{ b: shelter(), km: 96, id: 'n7' }], roofs: [busStop().atKm(96)] });
    const p = rainPlan(firstLikely(f), f);
    expect(p.covers.map((c) => [c.placeId, c.coverClass])).toEqual([['n7', 5], [null, 5]]);
  });
  test('[STOP-TIE] two roofs tied: by latitude, then longitude', () => {
    const a = busStop().atKm(96, { off: 50 });
    const b = busStop().atKm(96, { off: 50, side: 'west' });
    const p = planOf({ moment: riding(60, '12:00'), spells: [rain(110)], roofs: [a, b] });
    expect(p.covers.map((c) => c.roof)).toEqual([b, a]);
  });
});

describe('roofs and places on the route', () => {
  test('[STOP-ROOF-300] on the route itself: at 300 m in the plan, at 301 m not', () => {
    const inside = planOf({ moment: BAND, spells: [rain(100)], roofs: [busStop().atKm(90, { off: 300 })] });
    expect(inside.covers).toHaveLength(1);
    expect(inside.covers[0]!.offRouteM).toBeCloseTo(300, 0);
    const outside = planOf({ moment: BAND, spells: [rain(100)], roofs: [busStop().atKm(90, { off: 301 })] });
    expect(outside.covers).toEqual([]);
  });
  test('[STOP-ROOF-300] a roof with no coordinates is passed over', () => {
    const p = planOf({ moment: BAND, spells: [rain(100)], roofs: [{ kind: 'bus_stop', lat: Number.NaN, lon: Infinity, bench: false }, busStop().atKm(90)] });
    expect(p.covers).toHaveLength(1);
  });
  test('[STOP-ROOF-300] a place with a broken route match is passed over', () => {
    const f = stopFactsOf({ moment: BAND, spells: [rain(100)], spots: [{ b: cafe('x'), km: 90, id: 'n1' }] });
    f.matches.unshift({ placeId: 'n1', km: Number.NaN, offRouteM: 0 }, { placeId: 'n404', km: 90, offRouteM: 0 });
    expect(rainPlan(firstLikely(f), f).covers.map((c) => c.placeId)).toEqual(['n1']);
  });
  test.each(['constructor', '__proto__', 'hasOwnProperty'])('[STOP-NOT-COVER] a place id or tag %s takes down no card', (word) => {
    const f = stopFactsOf({
      moment: BAND, spells: [rain(100)],
      spots: [{ b: cafe('x', { tags: { amenity: word, indoor_seating: word, access: word } }), km: 90, id: 'n1' }, { b: shelter({ tags: { shelter_type: word, bench: word } }), km: 92 }, { b: kiosk('x', { tags: { shop: word } }), km: 93, id: word }],
    });
    f.hours.push(openAllYear(word));
    expect(() => rainPlan(firstLikely(f), f)).not.toThrow();
    expect(rainPlan(firstLikely(f), f).covers.every((c) => c.placeId === 'n1')).toBe(true);
  });
  test('[STOP-NOT-COVER] listed after the covers, marked, never counted', () => {
    const p = planOf({
      moment: BAND, spells: [rain(100)],
      spots: [{ b: cafe('x'), km: 88, id: 'n1' }, { b: cafe('x'), km: 90, id: 'n2' }, { b: station({ platformRoof: null }), km: 92, id: 'n3' }],
      hours: [openAllYear('n1')],
    });
    expect(p.covers.map((c) => c.placeId)).toEqual(['n1']);
    expect(p.notCounted).toEqual([{ placeId: 'n2', km: 90, reason: 'hours unknown' }, { placeId: 'n3', km: 92, reason: 'station, shelter not mapped' }]);
    expect(p.missing).toContain('hours');
  });
  test('[STOP-NOT-COVER] a thunderstorm plan marks unknown-hours buildings, and no station', () => {
    const p = planOf({
      moment: BAND, spells: [storm(100, `${SAT} 15:00`)],
      spots: [{ b: cafe('x'), km: 90, id: 'n2' }, { b: station({ platformRoof: null }), km: 92, id: 'n3' }], hours: [],
    });
    expect(p.notCounted.map((n) => n.placeId)).toEqual(['n2']);
  });
});

describe('the worked cases', () => {
  test('[STOP-MOVING-RAIN] rain ahead of the rider: a café at km 88 is a cover', () => {
    const trip = testTrip({ flatKph: 33, route: flatRoute(300, { stageEnds: [150, 300] }) });
    const f = stopFactsOf({
      moment: { trip, positions: [pos({ km: 60, at: `${SAT} 14:00` })], now: `${SAT} 14:00` },
      spells: [{ range: [95, 110], stamps: stamps(SAT, 15, 22), pp: 80, mm: 1 }, { km: 90, stamps: stamps(SAT, 12, 22), pp: 5 }],
      opts: { extraKms: [95, 110] },
      spots: [{ b: cafe('x'), km: 88, id: 'n88' }],
    });
    const w = firstLikely(f);
    expect(w.fromKm).toBe(95);
    expect(Math.abs(w.reachAt.getTime() - at(`${SAT} 15:30`).getTime())).toBeLessThanOrEqual(5 * 60_000);
    const p = rainPlan(w, f);
    expect(p.m).toBe(95);
    expect(p.covers.map((c) => c.placeId)).toEqual(['n88']);
  });

  const thunderCase = (): StopFacts => stopFactsOf({
    moment: { positions: [pos({ km: 110, at: `${SAT} 14:00` })], now: `${SAT} 14:00` },
    spells: [storm(140, `${SAT} 15:00`)],
    spots: [{ b: cafe('x', { name: 'Café Lindenhof' }), km: 131, id: 'nC' }, { b: shelter(), km: 135, id: 'nS' }],
    hours: [hoursOf(cafe('x').atKm(131, { id: 'nC' }), [{ from: '07:00', to: '18:00' }])],
  });
  test('[STOP-THUNDER] the plan lists only the café', () => {
    const f = thunderCase();
    const w = firstLikely(f);
    expect(w.kind).toBe('thunder');
    const p = rainPlan(w, f);
    expect(p.covers.map((c) => c.placeId)).toEqual(['nC']);
    expect(p.firstCoverLine).toBe('Open before then: Café Lindenhof, km 131, until 18:00.');
  });
  test('[STOP-THUNDER] Weather is warning, and the card says what the spec shows', () => {
    const f = thunderCase();
    const facts = { ...f, baseline: null, position: f.positions[0]! };
    const windows = weatherWindows(f);
    expect(weatherStatus(facts, windows).status).toBe('warning');
    const a = weatherAnswer(facts, windows, rainPlans(windows, f), null);
    const item = a.items.find((i) => i.label.startsWith('Thunderstorms possible'))!;
    expect(item.label).toBe("Thunderstorms possible km 140, 14:00–15:00. Exact places and times can't be forecast.");
    expect(item.detail).toContain('Roofs, shelters and huts give no protection from lightning.');
    expect(item.detail).toContain('Open before then: Café Lindenhof, km 131, until 18:00.');
    expect(thunderNear(f)).toBe(true);
  });
  test('[STOP-THUNDER] a café that shuts within 30 minutes of arrival is not in a thunderstorm plan', () => {
    const c = cafe('x').atKm(131, { id: 'nC' });
    const p = planOf({
      moment: { positions: [pos({ km: 110, at: `${SAT} 14:00` })], now: `${SAT} 14:00` }, spells: [storm(140, `${SAT} 15:00`)],
      spots: [{ b: cafe('x'), km: 131, id: 'nC' }], hours: [hoursOf(c, [{ from: '07:00', to: '15:20' }])],
    });
    expect(p.covers).toEqual([]);
  });
  test('[STOP-THUNDER-FALL] m at km 90, no cover in the band: the plan lists the shop, never the shelter', () => {
    const p = planOf({
      moment: { trip: testTrip({ route: flatRoute(300, { stageEnds: [150, 300] }) }), now: `${SAT} 08:00` },
      spells: [storm(90, `${SAT} 14:00`)],
      spots: [{ b: fuelShop('24/7'), km: 15.9, id: 'nF' }, { b: shelter({ tags: { bench: 'yes' } }), km: 19.1, id: 'nS' }],
    });
    expect(p.m).toBe(90);
    expect(p.covers.map((c) => c.placeId)).toEqual(['nF']);
  });
  test('[STOP-THUNDER-FALL] with no building at all, the plan lists no roof either, and says so', () => {
    const p = planOf({
      moment: { trip: testTrip({ route: flatRoute(300, { stageEnds: [150, 300] }) }), now: `${SAT} 08:00` },
      spells: [storm(90, `${SAT} 14:00`)],
      spots: [{ b: shelter({ tags: { bench: 'yes' } }), km: 19.1, id: 'nS' }], roofs: [busStop().atKm(20)],
    });
    expect(p.covers).toEqual([]);
    expect(p.none).toMatch(/^No mapped cover before km 90 \(about \d\d:\d\d\)$/);
    expect(p.behind).toBe('No open building mapped behind either');
  });
});

describe('no cover', () => {
  const m = riding(85, '14:06');
  const spells = [{ km: 95, stamps: stamps(SAT, 13, 18), pp: 80 }];
  const opts = { extraKms: [95] };

  test('[STOP-NO-COVER] "No mapped cover before km 95 (about 14:40)", and "None mapped behind either"', () => {
    const p = planOf({ moment: m, spells, opts });
    expect(p.covers).toEqual([]);
    expect(p.none).toBe('No mapped cover before km 95 (about 14:40)');
    expect(p.behind).toBe('None mapped behind either');
    expect(p.firstCoverLine).toBeNull();
  });
  test('[STOP-NO-COVER] then the nearest behind, not as part of the plan', () => {
    const p = planOf({ moment: m, spells, opts, spots: [{ b: cafe('x', { name: 'Far' }), km: 40, id: 'n1' }, { b: cafe('x', { name: 'Near' }), km: 70, id: 'n2' }] });
    expect(p.covers).toEqual([]);
    expect(p.none).toBe('No mapped cover before km 95 (about 14:40)');
    expect(p.behind).toContain('Near');
    expect(p.behind).toContain('km 70');
    expect(p.behind).toContain('15 km back');
    expect(p.behind).not.toContain('Far');
  });
  test('[STOP-NO-COVER] a roof behind counts for rain', () => {
    const p = planOf({ moment: m, spells, opts, roofs: [busStop().atKm(80)] });
    expect(p.behind).toContain('km 80');
  });
  test('[STOP-NO-COVER] a thunderstorm: the nearest open building behind, or "No open building mapped behind either"', () => {
    const s = [storm(95, `${SAT} 15:00`)];
    const roofOnly = planOf({ moment: m, spells: s, opts, roofs: [busStop().atKm(80)], spots: [{ b: shelter(), km: 82 }] });
    expect(roofOnly.none).toBe('No mapped cover before km 95 (about 14:40)');
    expect(roofOnly.behind).toBe('No open building mapped behind either');
    const withCafe = planOf({ moment: m, spells: s, opts, roofs: [busStop().atKm(80)], spots: [{ b: cafe('x', { name: 'Back' }), km: 60, id: 'n1' }] });
    expect(withCafe.behind).toContain('Back');
    expect(withCafe.behind).not.toContain('km 80');
  });
  test('[STOP-NO-COVER] a building behind that is closed then is not named', () => {
    const c = cafe('x').atKm(70, { id: 'n1' });
    const p = planOf({ moment: m, spells: [storm(95, `${SAT} 15:00`)], opts, spots: [{ b: cafe('x'), km: 70, id: 'n1' }], hours: [hoursOf(c, [{ from: '07:00', to: '12:00' }])] });
    expect(p.behind).toBe('No open building mapped behind either');
  });
  test('[STOP-NO-COVER] a plan with covers names nothing behind', () => {
    const p = planOf({ moment: BAND, spells: [rain(100)], spots: [{ b: cafe('x'), km: 90 }, { b: cafe('x'), km: 50 }] });
    expect(p.none).toBeNull();
    expect(p.behind).toBeNull();
  });
  test('[STOP-NO-COVER] outside the saved place data it says so, and names places as missing', () => {
    const p = planOf({ moment: m, spells, opts, savedKm: [{ fromKm: 0, toKm: 88 }] });
    expect(p.none).toBe('No place data before km 95. Refresh this stretch.');
    expect(p.missing).toContain('places');
    expect(planOf({ moment: m, spells, opts }).missing).not.toContain('places');
    expect(planOf({ moment: m, spells, opts, savedKm: [] }).missing).toContain('places');
    expect(planOf({ moment: m, spells, opts, savedKm: [{ fromKm: Number.NaN, toKm: Number.NaN }] }).missing).toContain('places');
  });
  test('[STOP-NO-COVER] a small range inside a large one takes nothing away', () => {
    expect(planOf({ moment: m, spells, opts, savedKm: [{ fromKm: 0, toKm: 200 }, { fromKm: 10, toKm: 20 }] }).missing).not.toContain('places');
  });
  test('[STOP-NO-COVER] what the plans are missing, the Weather card names', () => {
    const f = stopFactsOf({ moment: m, spells, opts, savedKm: [{ fromKm: 0, toKm: 88 }] });
    const windows = weatherWindows(f);
    const a = weatherAnswer({ ...f, baseline: null, position: f.positions[0]! }, windows, rainPlans(windows, f), null);
    expect(a.missing).toContain('places');
  });
  test('[STOP-NO-COVER] saved ranges that join count as one', () => {
    expect(planOf({ moment: m, spells, opts, savedKm: [{ fromKm: 90, toKm: 300 }, { fromKm: 0, toKm: 90 }] }).missing).not.toContain('places');
  });
});

describe('rule 5: rain at the start', () => {
  const m = riding(60, '14:00');
  const atStart = [rain(60), rain(70)];
  test('[STOP-RULE5] no plan; the chip\'s list instead', () => {
    const p = planOf({ moment: m, spells: atStart, spots: [{ b: cafe('x', { name: 'Near' }), km: 62, id: 'n1' }, { b: cafe('x'), km: 64, id: 'n2' }, { b: cafe('x'), km: 50, id: 'n3' }] });
    expect(p.covers).toEqual([]);
    expect(p.none).toBeNull();
    expect(p.behind).toBeNull();
    expect(p.listInstead!.map((c) => c.placeId)).toEqual(['n1', 'n2', 'n3']);
    expect(p.listLines[0]).toContain('Near');
  });
  test('[STOP-RULE5] a later met point with a thunderstorm hour: a thunderstorm plan after the list, with m there', () => {
    const f = stopFactsOf({
      moment: m, spells: [...atStart, { km: 80, stamps: [`${SAT} 15:00`, `${SAT} 16:00`], pp: 40, code: 95 }],
      spots: [{ b: cafe('x'), km: 75, id: 'nC' }, { b: shelter(), km: 72, id: 'nS' }, { b: cafe('x'), km: 62, id: 'nN' }],
    });
    const w = firstLikely(f);
    expect(w.metKms).toEqual([60, 70, 80]);
    const p = rainPlan(w, f);
    expect(p.m).toBe(80);
    expect(p.covers.map((c) => c.placeId)).toEqual(['nC']); // the shelter at km 72 is in the band and is no cover here
    expect(p.listInstead).not.toBeNull();
  });
  test('[STOP-RULE5] a thunderstorm at the start itself gets the list, with the chip\'s thunderstorm rule', () => {
    const p = planOf({
      moment: m, spells: [{ km: 60, stamps: stamps(SAT, 14, 16), pp: 70, code: 95 }, rain(70)],
      spots: [{ b: shelter(), km: 61, id: 'nS' }, { b: shelter(), km: 62, id: 'nT' }, { b: shelter(), km: 63, id: 'nU' }, { b: cafe('x', { name: 'Far' }), km: 90, id: 'nC' }],
    });
    expect(p.covers).toEqual([]);
    expect(p.none).toBeNull();
    expect(p.m).toBe(60);
    expect(p.listInstead![0]!.placeId).toBe('nC');
    expect(p.listInstead!.filter((c) => c.coverClass > 2).every((c) => c.lightning)).toBe(true);
    expect(p.listLines.some((l) => l.includes('Roofs, shelters and huts give no protection from lightning.'))).toBe(true);
  });
  test('[STOP-RULE5] a storm at the start and further on: m is the first later point with a storm', () => {
    const p = planOf({ moment: m, spells: [{ km: 60, stamps: stamps(SAT, 14, 16), pp: 70, code: 95 }, { km: 70, stamps: stamps(SAT, 14, 16), pp: 70 }, { km: 80, stamps: stamps(SAT, 15, 16), pp: 70, code: 95 }], spots: [{ b: cafe('x'), km: 75 }] });
    expect(p.m).toBe(80);
    expect(p.covers).toHaveLength(1);
    expect(p.listInstead).not.toBeNull();
  });
  test('[STOP-RULE5] with rain at the start, a second window further on still has its own plan', () => {
    const f = stopFactsOf({ moment: m, spells: [rain(60), rain(110)], spots: [{ b: cafe('x'), km: 100, id: 'n1' }] });
    const [first, second] = rainPlans(weatherWindows(f), f);
    expect(first!.listInstead).not.toBeNull();
    expect(second!.listInstead).toBeNull();
    expect(second!.covers.map((c) => c.placeId)).toEqual(['n1']);
  });
  test('[STOP-RULE5] a window further on, with no rain at the start, has its own plan', () => {
    const p = planOf({ moment: m, spells: [rain(100)], spots: [{ b: cafe('x'), km: 90 }] });
    expect(p.listInstead).toBeNull();
    expect(p.covers).toHaveLength(1);
  });
  test('[STOP-LATER-START] after the ride at 22:24, rain at tomorrow\'s 14:00 departure: a café 2 km ahead, open 07:00–19:00, is in the list', () => {
    const trip = testTrip({ startTime: '14:00' });
    const c = cafe('x').atKm(82, { id: 'nC' });
    const f = stopFactsOf({
      moment: { trip, positions: [pos({ km: 80, at: `${SAT} 22:24` })], now: `${SAT} 22:24`, plan: { date: SAT, backToTodayAt: null } },
      spells: [{ km: 80, stamps: [`${SUN} 15:00`], pp: 80 }],
      spots: [{ b: cafe('x'), km: 82, id: 'nC' }],
      hours: [hoursOf(c, [{ from: `${SUN} 07:00`, to: `${SUN} 19:00` }])],
    });
    expect(f.ride.phase).toBe('after-ride');
    expect(f.ride.departure).toEqual(at(`${SUN} 14:00`));
    const p = rainPlan(firstLikely(f), f);
    expect(p.covers).toEqual([]);
    expect(p.listInstead!.map((x) => x.placeId)).toEqual(['nC']);
    expect(p.listInstead![0]!.arrival.getTime()).toBeGreaterThan(at(`${SUN} 14:00`).getTime());
  });
  test('[STOP-LATER-START] and it is out when it is shut at that departure', () => {
    const trip = testTrip({ startTime: '14:00' });
    const c = cafe('x').atKm(82, { id: 'nC' });
    const f = stopFactsOf({
      moment: { trip, positions: [pos({ km: 80, at: `${SAT} 22:24` })], now: `${SAT} 22:24`, plan: { date: SAT, backToTodayAt: null } },
      spells: [{ km: 80, stamps: [`${SUN} 15:00`], pp: 80 }], spots: [{ b: cafe('x'), km: 82, id: 'nC' }],
      hours: [hoursOf(c, [{ from: `${SAT} 22:00`, to: `${SAT} 23:00` }])],
    });
    expect(rainPlan(firstLikely(f), f).listInstead).toEqual([]);
  });
});

describe('which windows get a plan', () => {
  test('[WX-POSSIBLE] possible rain gets no plan', () => {
    const f = stopFactsOf({ moment: BAND, spells: [{ km: 100, stamps: stamps(SAT, 12, 18), pp: 40, mm: 4 }], spots: [{ b: cafe('x'), km: 90 }] });
    const windows = weatherWindows(f);
    expect(windows.map((w) => w.cls)).toEqual(['possible']);
    expect(rainPlans(windows, f)).toEqual([]);
  });
  test('[WX-POSSIBLE] a 40% hour with a storm code is a thunderstorm window, and has a plan', () => {
    const f = stopFactsOf({ moment: BAND, spells: [storm(100, `${SAT} 15:00`)], spots: [{ b: cafe('x'), km: 90 }] });
    expect(rainPlans(weatherWindows(f), f)).toHaveLength(1);
  });
  test('[WX-TWO-NUMBERS] 93% with 0.0 mm has its plan', () => {
    const f = stopFactsOf({ moment: BAND, spells: [{ km: 100, stamps: stamps(SAT, 12, 18), pp: 93, mm: 0 }], spots: [{ b: cafe('x'), km: 90 }] });
    expect(rainPlans(weatherWindows(f), f)[0]!.covers).toHaveLength(1);
  });
  test('[WX-WINDOW-STOP] no plan for a later day\'s window', () => {
    const f = stopFactsOf({ moment: { now: `${SAT} 08:00` }, spells: [{ km: 90, stamps: stamps(SUN, 8, 11), pp: 90, code: 95 }], spots: [{ b: cafe('x'), km: 85 }], opts: { fetchedAt: `${SAT} 07:00` } });
    const windows = weatherWindows(f);
    expect(windows).toHaveLength(1);
    expect(rainPlans(windows, f)).toEqual([]);
  });
  test('[WX-WARN-THUNDER] a storm at the arrival at the day\'s stop: a thunderstorm plan, for every stay type', () => {
    for (const stay of ['camping', 'mixed', 'accommodation'] as const) {
      const f = stopFactsOf({ moment: { trip: testTrip({ stay }), now: `${SAT} 08:00` }, spells: [storm(78, `${SAT} 13:00`)], spots: [{ b: shelter(), km: 70 }, { b: cafe('x'), km: 68, id: 'nC' }] });
      expect(rainPlans(weatherWindows(f), f)[0]!.covers.map((c) => c.placeId)).toEqual(['nC']);
    }
  });
  test('[WX-DETAIL] beyond 48 h, no plan', () => {
    const f = stopFactsOf({ moment: { now: '2026-10-14 08:00' }, spells: [{ km: 20, stamps: stamps(SAT, 9, 11), pp: 80 }], opts: { from: '2026-10-14 01:00', fetchedAt: '2026-10-14 07:00' }, spots: [{ b: cafe('x'), km: 10 }] });
    expect(weatherWindows(f)).toHaveLength(1);
    expect(rainPlans(weatherWindows(f), f)).toEqual([]);
  });
  test('[STOP-RULE5] with no forecast there is no plan', () => {
    const f = stopFactsOf({ forecast: null, spots: [{ b: cafe('x'), km: 10 }] });
    expect(rainPlans(weatherWindows(f), f)).toEqual([]);
  });
});

describe('an approximate position', () => {
  test('[STOP-APPROX] a cover inside the radius is never a plan cover, even when the band would take it', () => {
    const p = planOf({
      moment: { trip: LONG(), positions: [pos({ km: 100, at: `${SAT} 12:00`, acc: 2000 })], now: `${SAT} 12:00` },
      spells: [rain(110)], spots: [{ b: cafe('x'), km: 100, id: 'nIn' }, { b: cafe('x'), km: 103, id: 'nOut' }],
    });
    expect(p.covers.map((c) => c.placeId)).toEqual(['nOut']);
  });
  test('[STOP-APPROX] at either edge of the radius, too: and it is not the fallback', () => {
    const edge = planOf({
      moment: { trip: LONG(), positions: [pos({ km: 100, at: `${SAT} 12:00`, acc: 2000 })], now: `${SAT} 12:00` },
      spells: [rain(110)], spots: [{ b: cafe('x'), km: 98, id: 'n1' }, { b: cafe('x'), km: 102, id: 'n2' }],
    });
    expect(edge.covers).toEqual([]);
  });
  test('[STOP-APPROX] places behind are measured from the far edge of the radius', () => {
    const p = planOf({
      moment: { trip: LONG(), positions: [pos({ km: 100, at: `${SAT} 12:00`, acc: 2000 })], now: `${SAT} 12:00` },
      spells: [rain(110)], spots: [{ b: cafe('x', { name: 'Back' }), km: 90, id: 'n1' }],
    });
    expect(p.behind).toContain('12 km back');
  });
});

describe('the property', () => {
  type Spec = { rainKm: number; thunder: boolean; riderKm: number; covers: { km: number; kind: number; off: number; closes: number | null }[] };
  const spec: fc.Arbitrary<Spec> = fc.record({
    rainKm: fc.constantFrom(50, 60, 70, 80, 90, 100),
    thunder: fc.boolean(),
    riderKm: fc.constantFrom(0, 3, 10, 22),
    covers: fc.array(fc.record({
      km: fc.double({ min: 0, max: 110, noNaN: true }), kind: fc.integer({ min: 0, max: 5 }), off: fc.integer({ min: 0, max: 450 }),
      closes: fc.option(fc.integer({ min: 9, max: 22 }), { nil: null }),
    }), { maxLength: 12 }),
  });
  const build = (s: Spec): StopFacts => {
    const trip = testTrip({ route: flatRoute(300, { stageEnds: [200, 300] }) });
    const spots: StopCase['spots'] = [];
    const hours: StopFacts['hours'] = [];
    const roofs: NonNullable<StopCase['roofs']> = [];
    s.covers.forEach((c, i) => {
      const id = `n${i}`;
      if (c.kind === 5) { roofs.push(busStop({ bench: i % 2 === 0 }).atKm(c.km, { off: c.off })); return; }
      const b = [cafe('x'), bakery('x'), shelter(), shelter({ tags: { shelter_type: 'lean_to' } }), kiosk('x')][c.kind]!;
      spots.push({ b, km: c.km, off: c.off, id });
      const p: Place = b.atKm(c.km, { id });
      if (c.closes === null) return; // unknown hours: never counted
      hours.push(hoursOf(p, [{ from: '06:00', to: `${String(c.closes).padStart(2, '0')}:00` }]));
    });
    const spell: Spell = s.thunder ? { km: s.rainKm, stamps: stamps(SAT, 6, 23), pp: 30, code: 95 } : { km: s.rainKm, stamps: stamps(SAT, 6, 23), pp: 80 };
    const positions = s.riderKm === 0 ? [] : [pos({ km: s.riderKm, at: `${SAT} 09:00` })];
    return stopFactsOf({ moment: { trip, positions, now: `${SAT} 09:00` }, spells: [spell], spots, roofs, hours });
  };

  fcTest.prop([spec], { numRuns: 100 })('[STOP-PROPERTY] plan covers obey the band, the hours and the roof rules; nothing unknown is suggested', (s) => {
    const f = build(s);
    const unknownIds = new Set(f.places.filter((p) => !f.hours.some((h) => h.placeId === p.id)).map((p) => p.id));
    const places = new Map(f.places.map((p) => [p.id, p]));
    for (const p of rainPlans(weatherWindows(f), f)) {
      const tm = f.schedule.atKm(p.m).getTime();
      const leads = p.covers.map((c) => (tm - c.arrival.getTime()) / 60_000);
      const inBand = leads.filter((l) => l >= 15 - 1e-6 && l <= 60 + 1e-6);
      expect(p.covers.length).toBeLessThanOrEqual(3);
      if (p.covers.length > 0 && inBand.length < p.covers.length) {
        // The fallback: one cover alone, at least 15 minutes before.
        expect(p.covers).toHaveLength(1);
        expect(leads[0]!).toBeGreaterThanOrEqual(15 - 1e-6);
      }
      for (const c of p.covers) {
        if (c.placeId && c.coverClass <= 2) expect(unknownIds.has(c.placeId)).toBe(false);
        if (c.placeId) expect(places.get(c.placeId)!.tags['shop']).not.toBe('kiosk');
        if (c.coverClass > 2) expect(c.offRouteM).toBeLessThanOrEqual(300);
        if (c.coverClass <= 2) {
          const h = f.hours.find((x) => x.placeId === c.placeId)!;
          const span = h.spans.find((x) => x.from.getTime() <= c.arrival.getTime() && x.to.getTime() > c.arrival.getTime())!;
          expect(span.state).toBe('open');
          expect(span.to.getTime()).toBeGreaterThanOrEqual(c.arrival.getTime() + 30 * 60_000);
        }
        if (p.window.kind === 'thunder') {
          expect(c.coverClass).toBeLessThanOrEqual(2);
          expect(c.roof).toBeNull();
        }
      }
    }
  });

  test('[STOP-PROPERTY] the generator reaches covers, fallbacks and thunderstorm plans', () => {
    const sample = fc.sample(spec, { numRuns: 300, seed: 7 });
    let covers = 0;
    let thunder = 0;
    for (const s of sample) {
      const f = build(s);
      for (const p of rainPlans(weatherWindows(f), f)) {
        covers += p.covers.length;
        if (p.window.kind === 'thunder' && p.covers.length > 0) thunder++;
      }
    }
    expect(covers).toBeGreaterThan(50);
    expect(thunder).toBeGreaterThan(10);
  });
});

describe('forecasts with holes', () => {
  test('[STOP-RULE5] windows from an empty forecast give no plans and no throw', () => {
    const c = momentOf();
    const f = stopFactsOf({ forecast: { ...forecastOf(c.trip.route), grid: [] } });
    expect(rainPlans(weatherWindows(f), f)).toEqual([]);
  });
});
