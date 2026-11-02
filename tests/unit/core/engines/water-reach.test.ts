import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { buffer, bufferOfSections, camp, capacityOf, findS1S2, reserve, reserveOfSections, use, useOfSections, waterAnswer, waterNow, type Target, type WaterFacts } from '../../../../src/core/engines/water.ts';
import type { Section } from '../../../../src/core/engines/water-model.ts';
import type { Answer, LoadSummary } from '../../../../src/core/types.ts';
import { at, flatRoute, pos, settlement, shop, tap, testTrip } from '../../../fixtures/build.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { factsOf, hoursOf, SAT, steady, SUN, type Case, type Spot } from './water-helpers.ts';

const textOf = (a: Answer): string => [a.title, a.detail, ...a.basis, ...a.items.flatMap((i) => [i.label, i.detail ?? ''])].join(' | ');
const near = (x: number, want: number, tol = 0.02): void => { expect(Math.abs(x - want)).toBeLessThanOrEqual(tol); };
const tapAt = (km: number, name?: string): Spot => ({ b: tap(name ? { name } : {}), km });
const KPH = 20.5;

describe('the worked examples', () => {
  const sections: Section[] = [
    { hours: 1, powerW: 90, planT: 30, rhPct: 40, airflow: 5, ghi: 800, day: true, elevM: 0 },
    { hours: 1, powerW: 160, planT: 31, rhPct: 38, airflow: 2.5, ghi: 850, day: true, elevM: 0 },
    { hours: 0.5, powerW: 20, planT: 28, rhPct: 45, airflow: 10, ghi: 800, day: true, elevM: 0 },
  ];
  const need = (U: number, breaks: boolean): number =>
    useOfSections(sections, 75, U, breaks) + bufferOfSections(sections, 75, U) + reserveOfSections(sections, false);

  test("[W-EXAMPLE-1] section 6.3's example without breaks", () => {
    near(useOfSections(sections, 75, 1, false), 1.77);
    near(need(1.4, false), 4.25);
    near(need(1.2, false), 3.79);
  });

  test('[W-EXAMPLE-2] the second example, with breaks at the stop rate', () => {
    near(useOfSections(sections, 75, 1, false), 1.7732, 0.0005);
    near(useOfSections(sections, 75, 1, true) - useOfSections(sections, 75, 1, false), 0.0999, 0.0005);
    near(useOfSections(sections, 75, 1, true), 1.87);
    near(bufferOfSections(sections, 75, 1.4), 0.768, 0.001);
    near(bufferOfSections(sections, 75, 1.2), 0.658, 0.001);
    expect(reserveOfSections(sections, false)).toBe(1.0);
    near(need(1.4, true), 4.39);
    near(need(1.2, true), 3.91);
  });

  test('[W-EXAMPLE-2] the buffer is 20% of the riding time once that is over half an hour', () => {
    const long = sections.map((s) => ({ ...s, hours: s.hours * 2 }));
    near(bufferOfSections(long, 75, 1), 1.0966, 0.0005); // 20% of 5 h is 1 h at the climb's rate
    expect(bufferOfSections([], 75, 1.4)).toBe(0);
    expect(useOfSections([], 75, 1.4, true)).toBe(0);
  });
});

describe('use along the route', () => {
  test('[W-EXAMPLE-2] riding at the floor, by hand: 41 km is 2 h at 0.25 L/h, breaks 0.3 h at 0.045 L/h, U = 1.4', () => {
    const f = factsOf({ spots: [tapAt(41)] });
    const { s1 } = findS1S2(f);
    near(use(f, 'now', s1, 'plan'), 1.4 * (2 * 0.25 + 0.3 * 0.045), 0.001);
    near(use(f, 'now', s1, 'median'), 2 * 0.25 + 0.3 * 0.045, 0.001);
    near(buffer(f, 'now', s1), 1.4 * 0.25 * 0.5, 0.0001);
  });

  test('[W-EXAMPLE-2] k scales use and buffer; U scales only the plan', () => {
    const f = factsOf({ spots: [tapAt(41)], profile: { k: 1.5, sumW: 3 } });
    const { s1 } = findS1S2(f);
    near(use(f, 'now', s1, 'plan'), 1.5 * 1.2 * (2 * 0.25 + 0.3 * 0.045), 0.001);
    near(use(f, 'now', s1, 'median'), 1.5 * (2 * 0.25 + 0.3 * 0.045), 0.001);
    near(buffer(f, 'now', s1), 1.5 * 1.2 * 0.25 * 0.5, 0.0001);
  });

  test("[W-EXAMPLE-2] today's correction scales the riding time of today's ride (section 6.2)", () => {
    const f = factsOf({
      spots: [tapAt(141)], now: `${SUN} 15:00`,
      positions: [pos({ km: 80, at: `${SAT} 18:00` }), pos({ km: 90, at: `${SUN} 09:00` }), pos({ km: 110, at: `${SUN} 11:00` })],
    });
    expect(f.ride.r).toBeGreaterThan(1);
    const { s1 } = findS1S2(f);
    near(use(f, 'now', s1, 'plan'), 1.4 * ((31 / KPH) * f.ride.r) * (0.25 + 0.15 * 0.045), 0.002);
  });

  test('[W-EXAMPLE-2] the rejoin leg and the detour count as riding', () => {
    const on = factsOf({ spots: [tapAt(41)] });
    const off = factsOf({ spots: [{ b: tap(), km: 41, off: 500 }] });
    const legH = (1.3 * 0.5) / KPH;
    near(use(off, 'now', findS1S2(off).s1, 'plan') - use(on, 'now', findS1S2(on).s1, 'plan'), 1.4 * legH * (0.25 + 0.15 * 0.045), 0.0005);
    const riding = factsOf({ spots: [tapAt(41)], now: `${SAT} 12:00`, positions: [pos({ km: 10, at: `${SAT} 12:00`, off: 2000 })] });
    const straight = factsOf({ spots: [tapAt(41)], now: `${SAT} 12:00`, positions: [pos({ km: 10, at: `${SAT} 12:00` })] });
    const leg2 = (1.3 * 2) / KPH;
    near(use(riding, 'now', findS1S2(riding).s1, 'plan') - use(straight, 'now', findS1S2(straight).s1, 'plan'), 1.4 * leg2 * (0.25 + 0.15 * 0.045), 0.0005);
  });

  test('[W-EXAMPLE-2] heat raises use through the forecast, and the margin is included', () => {
    const cool = factsOf({ spots: [tapAt(41)] });
    const hot = factsOf({ spots: [tapAt(41)], forecast: steady({ t: 33, rh: 30, ghi: 800 }) });
    expect(use(hot, 'now', findS1S2(hot).s1, 'plan')).toBeGreaterThan(use(cool, 'now', findS1S2(cool).s1, 'plan') * 1.5);
  });

  test('[W-EXAMPLE-2] a tailwind reduces airflow and raises use; a headwind is ignored', () => {
    const base = { spots: [tapAt(41)] };
    const heat = { t: 28, rh: 40, ghi: 700 };
    const still = factsOf({ ...base, forecast: steady(heat) });
    const tail = factsOf({ ...base, forecast: steady({ ...heat, windMs: 5, windFrom: 180 }) }); // the route runs due north
    const head = factsOf({ ...base, forecast: steady({ ...heat, windMs: 5, windFrom: 0 }) });
    const u = (f: WaterFacts): number => use(f, 'now', findS1S2(f).s1, 'plan');
    expect(u(tail)).toBeGreaterThan(u(still));
    near(u(head), u(still), 1e-9);
  });
});

describe('the reserve', () => {
  const reserveAt = (t: number): 0.5 | 1.0 => {
    const f = factsOf({ spots: [tapAt(20)], forecast: steady({ t }) });
    return reserve(f, 'now', findS1S2(f).s1);
  };
  test('[W-R0] 0.5 L at 29.9 °C planning; 1.0 L at 30.0 °C', () => {
    expect(reserveAt(28.9)).toBe(0.5);
    expect(reserveAt(29)).toBe(1.0);
  });
  test('[W-R0] 1.0 L with more than 2 h of riding between settlements; exactly 2 h stays 0.5 L', () => {
    const towns = (kms: number[]): Spot[] => kms.map((km) => ({ b: settlement(`t${km}`), km }));
    const of = (list: number[], s1Km: number): 0.5 | 1.0 => {
      const f = factsOf({ spots: [...towns(list), tapAt(s1Km)] });
      return reserve(f, 'now', findS1S2(f).s1);
    };
    expect(of([10, 51], 60)).toBe(0.5); // km 0-10, 10-51 (exactly 2 h), 51-60
    expect(of([10, 51.5], 60)).toBe(1.0);
    expect(of([], 41)).toBe(0.5);
    expect(of([], 42)).toBe(1.0);
  });
  test('[W-R0] a broken temperature reads as hot', () => {
    expect(reserveOfSections([{ hours: 1, powerW: 90, planT: NaN, rhPct: 40, airflow: 5, ghi: 0, day: true, elevM: 0 }], false)).toBe(1.0);
  });
  test('[W-R0] over an empty stretch: 0.5 L', () => {
    const f = factsOf({ spots: [tapAt(0)] });
    expect(reserve(f, 'now', findS1S2(f).s1)).toBe(0.5);
  });
});

describe('camp water', () => {
  const across = { spots: [tapAt(60), tapAt(100), tapAt(170), tapAt(240)] };
  const targets = (c: Case): { f: WaterFacts; at: (km: number) => Target } => {
    const f = factsOf(c);
    return { f, at: (km) => ({ kind: 'end', km }) };
  };
  test('[W-CAMP] per trip night between A and B at a camping or mixed stop', () => {
    const { f, at: to } = targets(across);
    expect(camp(f, 'now', to(60))).toBe(0);
    expect(camp(f, 'now', to(100))).toBe(2);
    expect(camp(f, 'now', to(170))).toBe(4);
    expect(camp(f, 'now', to(240))).toBe(6);
    expect(camp(f, 100, to(170))).toBe(2);
  });
  test('[W-CAMP] mixed counts; accommodation does not', () => {
    const mixed = targets({ ...across, trip: testTrip({ stay: 'mixed' }) });
    expect(camp(mixed.f, 'now', mixed.at(100))).toBe(2);
    const inn = targets({ ...across, trip: testTrip({ stay: 'accommodation', campWaterL: 2 }) });
    expect(camp(inn.f, 'now', inn.at(100))).toBe(0);
  });
  test('[W-CAMP] arriving at the stop itself: the night is not between; leaving it: it is', () => {
    const { f, at: to } = targets(across);
    expect(camp(f, 'now', to(78))).toBe(0);
    expect(camp(f, 78, to(100))).toBe(2);
  });
  test('[W-CAMP] the night before day 1 does not count', () => {
    const before = targets({ ...across, now: '2026-10-16 20:00' });
    expect(before.f.ride.phase).toBe('before-trip');
    expect(camp(before.f, 'now', before.at(60))).toBe(0);
  });
  test('[W-CAMP] after the ride, tonight is first', () => {
    const after = targets({ ...across, now: `${SAT} 19:30`, positions: [pos({ km: 78, at: `${SAT} 18:00` })] });
    expect(after.f.ride.phase).toBe('after-ride');
    expect(camp(after.f, 'now', after.at(100))).toBe(2);
    expect(camp(after.f, 'now', after.at(170))).toBe(4);
  });
});

// Saturday 09:00 from km 0, planning 20 °C: every riding rate is the 0.25 L/h floor, so the plan is 0.35 L/h.
const need = (f: WaterFacts, a: 'now' | Target, b: Target): number => use(f, a, b, 'plan') + buffer(f, a, b) + reserve(f, a, b) + camp(f, a, b);

describe('the decision table', () => {
  test('[W-REACH-WARN] W_arr(S1) below Buffer + R0 + Camp: warning, with the amount', () => {
    const f = factsOf({ spots: [tapAt(41, 'Kehl')], litres: 1.2 });
    const a = waterAnswer(f);
    const { s1 } = findS1S2(f);
    expect(a.status).toBe('warning');
    expect(a.title).toMatch(/^Not enough water to reach Kehl with a reserve — you need about [\d.]+ L\.$/);
    const said = Number(/about ([\d.]+) L/.exec(a.title)![1]);
    near(said, need(f, 'now', s1), 0.1);
    expect(said).toBeGreaterThanOrEqual(need(f, 'now', s1));
    expect(a.detail).toContain('shade, cooler hours, an easier pace');
  });

  test('[W-REACH-WARN] just above the line is no warning; just below is', () => {
    const base: Case = { spots: [tapAt(41, 'Kehl'), tapAt(50, 'Bühl')] };
    const f0 = factsOf(base);
    const line = need(f0, 'now', findS1S2(f0).s1);
    expect(waterAnswer(factsOf({ ...base, litres: line + 0.001 })).status).not.toBe('warning');
    expect(waterAnswer(factsOf({ ...base, litres: line - 0.001 })).status).toBe('warning');
  });

  test('[W-REACH-WARN] uncertain sources nearby are listed', () => {
    const a = waterAnswer(factsOf({ spots: [{ b: tap({ waterClass: 'B', name: 'Spring' }), km: 20 }, tapAt(41, 'Kehl')], litres: 0.2 }));
    expect(a.status).toBe('warning');
    const item = a.items.find((i) => i.label.includes('Spring'))!;
    expect(item.status).toBe('unknown');
    expect(item.detail).toContain('water not verified');
  });

  test('[W-REACH-FILLUP] Need(S1 to S2) above C: action, fill up completely, and the bottles line', () => {
    const f = factsOf({ spots: [tapAt(10, 'Kehl'), tapAt(77, 'Bühl')], profile: { capacityL: 1.25 }, litres: 2 });
    const { s1, s2 } = findS1S2(f);
    const short = need(f, s1, s2) - 1.25;
    const a = waterAnswer(f);
    expect(a.status).toBe('action');
    expect(a.title).toMatch(/^Refill at Kehl and fill up completely — it's the last reliable water for 67 km\. Carry [\d.]+ L extra\.$/);
    const said = Number(/Carry ([\d.]+) L extra/.exec(a.title)![1]);
    near(said, short, 0.1);
    expect(said).toBeGreaterThanOrEqual(short);
    expect(a.detail).toContain(`Your bottles hold 1.25 L. Carry ${said} L extra from Kehl.`);
    expect(W_BOTTLES).toBe('Your bottles hold 2.75 L. Carry 1.5 L extra from Kehl.');
  });

  test('[W-REACH-REFILL] W_arr(S2) short: action, fill to min(C, Need(S1 to S2))', () => {
    const f = factsOf({ spots: [tapAt(10, 'Kehl'), tapAt(50, 'Bühl')], litres: 1.2, profile: { capacityL: 3 } });
    const { s1, s2 } = findS1S2(f);
    const x = Math.min(3, need(f, s1, s2));
    const a = waterAnswer(f);
    expect(a.status).toBe('action');
    expect(a.title).toMatch(/^Refill at Kehl \(\+10 km · about 09:\d\d\): fill to [\d.]+ L$/);
    const said = Number(/fill to ([\d.]+) L/.exec(a.title)![1]);
    near(said, x, 0.1);
    expect(said).toBeGreaterThanOrEqual(x);
    expect(x).toBeLessThan(3);
  });

  test('[W-REACH-REFILL] the amount is never above the bottles, even once rounded up', () => {
    const spots2 = [tapAt(5, 'Kehl'), tapAt(30, 'Bühl')];
    const f0 = factsOf({ spots: spots2 });
    const { s1, s2 } = findS1S2(f0);
    const capacityL = need(f0, s1, s2) + 0.001; // just holds it, so the row above does not apply
    const a = waterAnswer(factsOf({ spots: spots2, litres: 0.9, profile: { capacityL } }));
    expect(a.title).toMatch(/fill to/);
    expect(Number(/fill to ([\d.]+) L/.exec(a.title)![1])).toBeLessThanOrEqual(capacityL + 0.005);
  });

  test('[W-REACH-EDGE] S2 at the data edge: action, refresh or carry, and missing places', () => {
    const f = factsOf({ spots: [tapAt(10)], litres: 3, savedKm: [{ fromKm: 0, toKm: 40 }, { fromKm: 75, toKm: 300 }] });
    const { s1, s2 } = findS1S2(f);
    expect(s1.kind).toBe('place');
    expect(s2).toEqual({ kind: 'edge', km: 40 });
    const a = waterAnswer(f);
    expect(a.status).toBe('action');
    expect(a.title).toBe('No place data after km 40 — refresh this stretch, or carry for 35 km.');
    expect(a.missing).toContain('places');
  });

  test('[W-REACH-EDGE] S1 at the data edge: the first, fourth and last rows only', () => {
    const f = factsOf({ litres: 3, savedKm: [{ fromKm: 0, toKm: 10 }] });
    expect(findS1S2(f).s1).toEqual({ kind: 'edge', km: 10 });
    const a = waterAnswer(f);
    expect(a.status).toBe('action');
    expect(a.title).toBe('No place data after km 10 — refresh this stretch, or carry for 290 km.');
    expect(a.missing).toContain('places');
    expect(waterAnswer(factsOf({ litres: 0.1, savedKm: [{ fromKm: 0, toKm: 10 }] })).status).toBe('warning');
  });

  test('[W-REACH-EDGE] a place past the edge is not used, and no saved data at all is an edge at the start', () => {
    const f = factsOf({ spots: [tapAt(60)], savedKm: [{ fromKm: 0, toKm: 40 }, { fromKm: 50, toKm: 300 }] });
    expect(findS1S2(f).s1).toEqual({ kind: 'edge', km: 40 });
    const none = factsOf({ spots: [tapAt(60)], savedKm: [] });
    expect(findS1S2(none).s1).toEqual({ kind: 'edge', km: 0 });
    expect(waterAnswer(none).missing).toContain('places');
  });

  test('[W-REACH-EDGE] touching packs leave no edge between them', () => {
    const f = factsOf({ spots: [tapAt(60)], savedKm: [{ fromKm: 40, toKm: 300 }, { fromKm: 0, toKm: 40 }] });
    expect(findS1S2(f).s1.kind).toBe('place');
  });

  test('[W-REACH-FINE] otherwise fine: enough to reach S2, refilling at S1 optional', () => {
    const a = waterAnswer(factsOf({ spots: [tapAt(10, 'Kehl'), tapAt(30, 'Bühl')], litres: 3 }));
    expect(a.status).toBe('fine');
    expect(a.title).toBe('Enough to reach Bühl — refilling at Kehl is optional.');
  });

  test('[W-REACH-FINE] a target that uses a rider past a shop judges it at the arrival', () => {
    const p = shop('x', { id: 'n42', name: 'Kaufen' }).atKm(41);
    const hours = hoursOf(p, [{ from: '08:00', to: '20:00' }]);
    const a = factsOf({ spots: [{ b: shop('x', { name: 'Kaufen' }), km: 41, id: 'n42' }], hours: [hours] });
    const { s1 } = findS1S2(a);
    expect(s1.kind).toBe('place');
    const shut = factsOf({ spots: [{ b: shop('x', { name: 'Kaufen' }), km: 41, id: 'n42' }], hours: [hoursOf(p, [{ from: '08:00', to: '10:30' }])] });
    expect(findS1S2(shut).s1.kind).toBe('end');
  });
});

const W_BOTTLES = 'Your bottles hold 2.75 L. Carry 1.5 L extra from Kehl.';

describe('no source', () => {
  test('[W-NO-SOURCE] none before E: says so with the distance', () => {
    const a = waterAnswer(factsOf({ litres: 3, now: `${SAT} 12:00`, positions: [pos({ km: 280, at: `${SAT} 12:00` })] }));
    expect(textOf(a)).toContain('No mapped reliable water for the next 20 km');
  });
  test('[W-NO-SOURCE] never fine at a data edge', () => {
    for (const litres of [0, 1, 3, 10, 100]) expect(waterAnswer(factsOf({ litres, savedKm: [{ fromKm: 0, toKm: 20 }] })).status).not.toBe('fine');
  });
  test('[W-NO-SOURCE] fine at the route end only with the reserve: "Enough to the end."', () => {
    const near20 = (litres: number): Case => ({ litres, trip: testTrip({ route: flatRoute(20) }), now: `${SAT} 09:00` });
    const f = factsOf(near20(3));
    const { s1 } = findS1S2(f);
    expect(s1.kind).toBe('end');
    const line = need(f, 'now', s1);
    const ok = waterAnswer(factsOf(near20(line + 0.01)));
    expect(ok.status).toBe('fine');
    expect(ok.title).toBe('Enough to the end.');
    expect(waterAnswer(factsOf(near20(line - 0.01))).status).toBe('warning');
  });
  test('[W-NO-SOURCE] S1 real and S2 at the route end, with enough: "Enough to the end."', () => {
    const a = waterAnswer(factsOf({ trip: testTrip({ route: flatRoute(20) }), spots: [tapAt(10)], litres: 3 }));
    expect(a.status).toBe('fine');
    expect(a.title).toBe('Enough to the end.');
  });
  test('[W-NO-SOURCE] standing at the route end', () => {
    const c: Case = { now: `${SAT} 20:00`, positions: [pos({ km: 300, at: `${SAT} 19:00` })] };
    expect(waterAnswer(factsOf({ ...c, litres: 1 })).status).toBe('fine');
    expect(waterAnswer(factsOf({ ...c, litres: 0.2 })).status).toBe('warning');
  });
});

describe('capacity', () => {
  const summary = (totalL: number): LoadSummary => ({
    app: 'load-check', kind: 'load-summary', v: 1, at: 'x', planUpdatedAt: 'x', nights: 1, month: 7, departureDate: null, mode: 'comfort', foodDays: 1, bikeId: null,
    bags: { count: 0, positions: [], items: [] }, decks: { bar: null, rack: null },
    water: { bottles: [], cageL: totalL, extraL: 0, totalL },
    weight: { kitKg: 5, cageWaterKg: 1, carriedKg: 6, bikeKg: null, emptyLuggageKg: null, byPositionKg: { fork: 0, bar: 0, top: 0, frame: 0, bottle: 0, seat: 0, rack: 0, pack: 0 }, unplacedKg: 0 },
    kit: { waterFilter: false },
  });
  test('[W-NO-CAPACITY] the summary total, else You, else none', () => {
    expect(capacityOf(factsOf({ summary: summary(2.75), profile: { capacityL: 1 } }))).toBe(2.75);
    expect(capacityOf(factsOf({ summary: summary(0), profile: { capacityL: 1 } }))).toBe(1);
    expect(capacityOf(factsOf({ summary: { app: 'load-check', kind: 'load-summary', v: 1, at: 'x', empty: true }, profile: { capacityL: 1 } }))).toBe(1);
    expect(capacityOf(factsOf({ profile: { capacityL: null } }))).toBeNull();
    expect(capacityOf(factsOf({ profile: { capacityL: 0 } }))).toBeNull();
  });
  test('[W-NO-CAPACITY] a capacity that is not a number is none', () => {
    for (const capacityL of [NaN, Infinity, -1]) expect(capacityOf(factsOf({ profile: { capacityL } }))).toBeNull();
    expect(capacityOf(factsOf({ summary: summary(NaN), profile: { capacityL: 1 } }))).toBe(1);
    expect(capacityOf(factsOf({ summary: summary(Infinity), profile: { capacityL: null } }))).toBeNull();
  });
  test('[W-NO-CAPACITY] none: the card is unknown, names capacity, and asks for it', () => {
    const a = waterAnswer(factsOf({ spots: [tapAt(10), tapAt(20)], litres: 3, profile: { capacityL: null } }));
    expect(a.status).toBe('unknown');
    expect(a.title).toBe('Enter the water you can carry (You) to plan refills.');
    expect(a.missing).toContain('capacity');
  });
  test('[W-NO-CAPACITY] none: the warning row still applies', () => {
    const a = waterAnswer(factsOf({ spots: [tapAt(41, 'Kehl')], litres: 0.2, profile: { capacityL: null } }));
    expect(a.status).toBe('warning');
    expect(a.title).toContain('Not enough water to reach Kehl');
    expect(a.missing).toContain('capacity');
  });
});

describe("tonight's water", () => {
  const campAt78: Case = { now: `${SAT} 18:30`, positions: [pos({ km: 78, at: `${SAT} 18:00` })], litres: 1.0, profile: { capacityL: 5 } };

  test('[W-TONIGHT] the tap 200 m ahead is S1: action, asks to refill, not "Not enough"', () => {
    const f = factsOf({ ...campAt78, spots: [tapAt(78.2, 'Camp tap'), tapAt(100, 'Town')] });
    expect(f.ride.phase).toBe('after-ride');
    const { s1, s2 } = findS1S2(f);
    expect(s1.kind === 'place' && s1.place.name).toBe('Camp tap');
    expect(s1.kind === 'place' && s1.tonight).toBe(true);
    const a = waterAnswer(f);
    expect(a.status).toBe('action');
    expect(a.title).toMatch(/^Refill at Camp tap \(\+0\.2 km · about 18:3\d\): fill to [\d.]+ L$/);
    expect(a.title).not.toContain('Not enough');
    // S2 is on tomorrow's ride.
    expect(s2.kind === 'place' && s2.place.name).toBe('Town');
    expect(s2.kind === 'place' && s2.arrival.getTime()).toBeGreaterThan(at(`${SUN} 08:30`).getTime());
  });

  test("[W-TONIGHT] tonight's camp water counts in Need(S1 to S2) and in Camp(now to S2), not in Camp(now to S1)", () => {
    const f = factsOf({ ...campAt78, spots: [tapAt(78.2), tapAt(100)] });
    const { s1, s2 } = findS1S2(f);
    expect(camp(f, 'now', s1)).toBe(0);
    expect(camp(f, s1, s2)).toBe(2);
    expect(camp(f, 'now', s2)).toBe(2);
  });

  test('[W-TONIGHT] behind reads "0.3 km back", timed for riding back now', () => {
    const f = factsOf({ ...campAt78, spots: [tapAt(77.7, 'Camp tap'), tapAt(100, 'Town')] });
    const { s1 } = findS1S2(f);
    expect(s1.kind === 'place' && s1.back).toBe(true);
    const minutes = ((0.3 / KPH) * 60 * 1.15);
    expect(s1.kind === 'place' && Math.abs(s1.arrival.getTime() - at(`${SAT} 18:30`).getTime() - minutes * 60_000)).toBeLessThan(1000);
    const a = waterAnswer(f);
    expect(a.status).toBe('action');
    expect(a.title).toContain('0.3 km back');
  });

  test('[W-TONIGHT] within 1 km, the nearest; beyond it, no tonight\'s water', () => {
    const near2 = factsOf({ ...campAt78, spots: [tapAt(78.9, 'Far'), tapAt(77.6, 'Close')] });
    const a = findS1S2(near2).s1;
    expect(a.kind === 'place' && a.place.name).toBe('Close');
    const none = factsOf({ ...campAt78, spots: [tapAt(79.2, 'Tomorrow')] });
    const b = findS1S2(none).s1;
    expect(b.kind === 'place' && b.tonight).toBe(false);
  });

  test("[W-TONIGHT] S2 is another source than S1, and leave-by's tomorrowOnly ignores tonight's water", () => {
    const f = factsOf({ ...campAt78, spots: [tapAt(78.2, 'Camp tap'), tapAt(100, 'Town'), tapAt(120, 'Next')] });
    const { s1, s2 } = findS1S2(f, { tomorrowOnly: true });
    // The tap 200 m ahead lies on tomorrow's ride too, timed for tomorrow.
    expect(s1.kind === 'place' && s1.tonight).toBe(false);
    expect(s1.kind === 'place' && s1.arrival.getTime()).toBeGreaterThan(at(`${SUN} 08:00`).getTime());
    expect(s2.kind === 'place' && s2.place.name).toBe('Town');
    const behind = factsOf({ ...campAt78, spots: [tapAt(77.7, 'Camp tap'), tapAt(100, 'Town')] });
    const t = findS1S2(behind, { tomorrowOnly: true }).s1;
    expect(t.kind === 'place' && t.place.name).toBe('Town');
  });

  test("[W-TONIGHT] a tap inside an approximate position's radius still counts tonight", () => {
    const f = factsOf({ now: `${SAT} 18:30`, positions: [pos({ km: 78, at: `${SAT} 18:00`, acc: 800 })], litres: 1, profile: { capacityL: 5 }, spots: [tapAt(78.2, 'Camp tap'), tapAt(100, 'Town')] });
    expect(f.ride.phase).toBe('after-ride');
    const { s1 } = findS1S2(f);
    expect(s1.kind === 'place' && s1.place.name).toBe('Camp tap');
  });
});

test('[W-OUTBACK] on an out-and-back, the same tap is the next water on both legs', () => {
  const route = flatRoute(100, { stageEnds: [50] });
  const trip = testTrip({ route });
  const spot: Spot[] = [{ b: tap({ name: 'Middle' }), km: [20, 80], id: 'n7' }];
  const out = factsOf({ trip, spots: spot, now: `${SAT} 09:00`, positions: [pos({ km: 10, at: `${SAT} 09:00` })] });
  const back = factsOf({ trip, spots: spot, now: `${SAT} 13:00`, positions: [pos({ km: 60, at: `${SAT} 13:00` })] });
  const a = findS1S2(out).s1;
  const b = findS1S2(back).s1;
  expect(a.kind === 'place' && a.place.id).toBe('n7');
  expect(a.km).toBe(20);
  expect(b.kind === 'place' && b.place.id).toBe('n7');
  expect(b.km).toBe(80);
  // On the way out, S2 is the same tap on the way back.
  expect(findS1S2(out).s2.km).toBe(80);
});

describe('unconfirmed water', () => {
  const asked = 'Confirm your water to check the next stretch';
  test('[W-UNCONFIRMED] nothing known: unknown, asks to confirm, never fine', () => {
    const a = waterAnswer(factsOf({ litres: null, spots: [tapAt(10), tapAt(20)] }));
    expect(a.status).toBe('unknown');
    expect(a.title).toBe(asked);
    expect(textOf(a)).not.toContain('Still about');
  });
  test('[W-UNCONFIRMED] the default: last confirmed minus use at SR_plan', () => {
    const f = factsOf({ now: `${SAT} 10:00`, confirmedAt: `${SAT} 09:00`, litres: 0.95, confirmed: false, spots: [tapAt(10), tapAt(20)] });
    const now = waterNow(f);
    expect(now.confirmed).toBe(false);
    near(now.confirmed === false ? now.stillAbout! : -1, 0.6, 0.001); // 0.35 L/h for an hour
    const a = waterAnswer(f);
    expect(a.status).toBe('unknown');
    expect(a.title).toBe(asked);
    expect(textOf(a)).toContain('Still about 0.6 L?');
  });
  test('[W-UNCONFIRMED] never below 0', () => {
    const f = factsOf({ now: `${SAT} 11:00`, confirmedAt: `${SAT} 09:00`, litres: 0.1, confirmed: false });
    const now = waterNow(f);
    expect(now.confirmed === false && now.stillAbout).toBe(0);
    expect(textOf(waterAnswer(f))).toContain('Still about 0 L?');
  });
  test('[W-UNCONFIRMED] dropped after 3 h', () => {
    const inTime = factsOf({ now: `${SAT} 12:00`, confirmedAt: `${SAT} 09:00`, litres: 3, confirmed: false });
    const late = factsOf({ now: `${SAT} 12:01`, confirmedAt: `${SAT} 09:00`, litres: 3, confirmed: false });
    expect(waterNow(inTime)).toMatchObject({ confirmed: false });
    expect(waterNow(inTime).confirmed === false && (waterNow(inTime) as { stillAbout: number }).stillAbout).toBeGreaterThan(0);
    expect(waterNow(late)).toEqual({ confirmed: false, stillAbout: null });
    expect(textOf(waterAnswer(late))).not.toContain('Still about');
  });
  test('[W-UNCONFIRMED] dropped after a night', () => {
    const f = factsOf({ now: `${SUN} 00:30`, confirmedAt: `${SAT} 23:00`, litres: 3, confirmed: false, positions: [pos({ km: 78, at: `${SAT} 18:00` })] });
    expect(waterNow(f)).toEqual({ confirmed: false, stillAbout: null });
  });
  test('[W-UNCONFIRMED] dropped once past a reliable source', () => {
    const positions = [pos({ km: 10, at: `${SAT} 09:00` }), pos({ km: 30, at: `${SAT} 10:00` })];
    const c: Case = { now: `${SAT} 10:00`, confirmedAt: `${SAT} 09:00`, litres: 3, confirmed: false, positions };
    expect(waterNow(factsOf({ ...c, spots: [tapAt(20)] }))).toEqual({ confirmed: false, stillAbout: null });
    expect(waterNow(factsOf({ ...c, spots: [tapAt(40)] })).confirmed).toBe(false);
    expect((waterNow(factsOf({ ...c, spots: [tapAt(40)] })) as { stillAbout: number }).stillAbout).toBeGreaterThan(0);
    // An uncertain source does not count as passed.
    expect((waterNow(factsOf({ ...c, spots: [{ b: tap({ waterClass: 'C' }), km: 20 }] })) as { stillAbout: number }).stillAbout).toBeGreaterThan(0);
  });
  test('[W-UNCONFIRMED] a confirmed value counts as W0 only for as long as it can be true', () => {
    // An hour on, the water drunk since is gone from W0, whatever the store says.
    const f = factsOf({ now: `${SAT} 10:00`, confirmedAt: `${SAT} 09:00`, litres: 2 });
    const now = waterNow(f);
    expect(now.confirmed).toBe(true);
    near(now.confirmed ? now.litres : -1, 1.65, 0.001);
    // Past 3 hours, a night or a source, it must be confirmed again.
    expect(waterNow(factsOf({ now: `${SAT} 12:01`, confirmedAt: `${SAT} 09:00`, litres: 2 }))).toEqual({ confirmed: false, stillAbout: null });
    expect(waterAnswer(factsOf({ now: `${SAT} 12:01`, confirmedAt: `${SAT} 09:00`, litres: 9, spots: [tapAt(10), tapAt(20)] })).status).toBe('unknown');
  });
  test('[W-UNCONFIRMED] a clock behind the confirmation: age 0', () => {
    const now = waterNow(factsOf({ now: `${SAT} 09:00`, confirmedAt: `${SAT} 10:00`, litres: 2 }));
    expect(now).toEqual({ confirmed: true, litres: 2 });
  });
  fcTest.prop([fc.double({ min: 0, max: 50, noNaN: true }), fc.integer({ min: 0, max: 170 })])('[W-UNCONFIRMED] property: unconfirmed is never fine', (litres, minutes) => {
    const a = waterAnswer(factsOf({ now: new Date(at(`${SAT} 09:00`).getTime() + minutes * 60_000), confirmedAt: `${SAT} 09:00`, litres, confirmed: false, spots: [tapAt(10), tapAt(20)] }));
    expect(a.status).toBe('unknown');
  });
});

describe('an approximate position', () => {
  const c: Case = { now: `${SAT} 12:00`, positions: [pos({ km: 76, at: `${SAT} 12:00`, acc: 800 })], litres: 3 };
  test('[W-APPROX] +-800 m at km 76: use is measured from km 75.2', () => {
    const f = factsOf({ ...c, spots: [tapAt(90)] });
    expect(f.ride.startKm).toBeCloseTo(75.2, 9);
    near(use(f, 'now', findS1S2(f).s1, 'plan'), 1.4 * (14.8 / KPH) * (0.25 + 0.15 * 0.045), 0.001);
  });
  test('[W-APPROX] a tap at km 76.3 is never S1 or S2, and reads "near you, may be behind"', () => {
    const f = factsOf({ ...c, spots: [tapAt(76.3, 'Near'), tapAt(90, 'A'), tapAt(100, 'B')] });
    const { s1, s2 } = findS1S2(f);
    expect(s1.kind === 'place' && s1.place.name).toBe('A');
    expect(s2.kind === 'place' && s2.place.name).toBe('B');
    const item = waterAnswer(f).items.find((i) => i.label.includes('Near'))!;
    expect(item.detail).toContain('near you, may be behind');
    const only = factsOf({ ...c, spots: [tapAt(76.3, 'Near')] });
    expect(findS1S2(only).s1.kind).toBe('end');
  });
  test('[W-APPROX] the radius ends: km 75.2 and 76.8 are inside, 75.1 is behind, 76.9 is ahead', () => {
    const s1Name = (km: number): string | null => {
      const t = findS1S2(factsOf({ ...c, spots: [tapAt(km, `k${km}`)] })).s1;
      return t.kind === 'place' ? t.place.name : null;
    };
    expect(s1Name(75.2)).toBeNull();
    expect(s1Name(76.8)).toBeNull();
    expect(s1Name(75.1)).toBeNull();
    expect(s1Name(76.9)).toBe('k76.9');
  });
});

describe('degenerate stops', () => {
  test('[W-ZERO] 0 L with a tap at the position: finite numbers, no negative distance, the first matching row', () => {
    const f = factsOf({ now: `${SAT} 12:00`, positions: [pos({ km: 30, at: `${SAT} 12:00` })], spots: [tapAt(30, 'Here'), tapAt(60)], litres: 0 });
    const { s1 } = findS1S2(f);
    expect(s1.km).toBe(30);
    for (const x of [use(f, 'now', s1, 'plan'), buffer(f, 'now', s1), reserve(f, 'now', s1), camp(f, 'now', s1)]) {
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
    }
    expect(use(f, 'now', s1, 'plan')).toBe(0);
    expect(buffer(f, 'now', s1)).toBe(0);
    const a = waterAnswer(f);
    expect(a.status).toBe('warning');
    expect(a.title).toContain('Not enough water to reach Here');
    expect(a.title).toContain('0.5 L');
    expect(a.title).not.toMatch(/NaN|Infinity|-\d/);
  });
  test('[W-ZERO] capacity below the reserve: the warning lists uncertain sources, no crash', () => {
    const a = waterAnswer(factsOf({ spots: [{ b: tap({ waterClass: 'C', name: 'Spring' }), km: 20 }, tapAt(60, 'Far')], litres: 0.1, profile: { capacityL: 0.3 } }));
    expect(a.status).toBe('warning');
    expect(a.items.some((i) => i.label.includes('Spring'))).toBe(true);
  });
  test('[W-ZERO] when the water needed to reach S1 exceeds C, the warning lists the uncertain sources before S1 only', () => {
    const a = waterAnswer(factsOf({
      spots: [{ b: tap({ waterClass: 'C', name: 'Before' }), km: 20 }, tapAt(60, 'Far'), { b: tap({ waterClass: 'C', name: 'After' }), km: 70 }],
      litres: 0.1, profile: { capacityL: 0.3 },
    }));
    expect(a.items.some((i) => i.label.includes('Before'))).toBe(true);
    expect(a.items.some((i) => i.label.includes('After'))).toBe(false);
  });
  test('[W-ZERO] a route of under a kilometre', () => {
    const a = waterAnswer(factsOf({ trip: testTrip({ route: flatRoute(0.5) }), litres: 1 }));
    expect(a.status).toBe('fine');
    expect(a.title).toBe('Enough to the end.');
  });
});

describe('what the card never claims', () => {
  const cases: Case[] = [
    { spots: [tapAt(41, 'Kehl')], litres: 0.5 },
    { spots: [tapAt(10, 'Kehl'), tapAt(77, 'Bühl')], profile: { capacityL: 1.25 } },
    { spots: [tapAt(10, 'Kehl'), tapAt(50, 'Bühl')], litres: 1.2 },
    { spots: [tapAt(10, 'Kehl'), tapAt(30, 'Bühl')], litres: 3 },
    { spots: [tapAt(10)], litres: 3, savedKm: [{ fromKm: 0, toKm: 40 }] },
    { litres: null },
    { spots: [{ b: tap({ waterClass: 'C' }), km: 5 }, { b: tap({ waterClass: 'B' }), km: 6 }], litres: 0.1, profile: { capacityL: null } },
    { litres: 2, forecast: null },
  ];
  test('[W-NEVER-CLAIM] banned words, on every row', () => {
    for (const c of cases) expect(bannedHits(textOf(waterAnswer(factsOf(c))))).toEqual([]);
  });
  test('[W-NEVER-CLAIM] says "estimate", shows a range and the calibration status', () => {
    const a = waterAnswer(factsOf({ spots: [tapAt(41, 'Kehl'), tapAt(60)], litres: 3 }));
    expect(textOf(a)).toMatch(/[Ee]stimate/);
    expect(a.detail).toMatch(/expected [\d.]+ L, planned [\d.]+ L/);
    expect(a.detail).toContain('not calibrated yet');
    expect(waterAnswer(factsOf({ spots: [tapAt(41), tapAt(60)], litres: 3, profile: { sumW: 1 } })).detail).toContain('partly calibrated');
    expect(waterAnswer(factsOf({ spots: [tapAt(41), tapAt(60)], litres: 3, profile: { sumW: 3 } })).detail).toContain('calibrated from your rides');
  });
  test('[W-NEVER-CLAIM] the range is to S1: expected at k x SR_model, planned at k x U x SR_model', () => {
    const f = factsOf({ spots: [tapAt(41), tapAt(60)], litres: 3 });
    const { s1 } = findS1S2(f);
    const m = /expected ([\d.]+) L, planned ([\d.]+) L/.exec(waterAnswer(f).detail)!;
    near(Number(m[1]), use(f, 'now', s1, 'median'), 0.05);
    near(Number(m[2]), use(f, 'now', s1, 'plan'), 0.05);
  });
  test('[W-NEVER-CLAIM] the weather basis says what it stands on', () => {
    expect(waterAnswer(factsOf({ forecast: null })).basis.join(' ')).toContain('no weather data — assumes a hot day');
    expect(waterAnswer(factsOf({ forecast: null })).missing).toContain('weather');
    const far = waterAnswer(factsOf({ forecast: null, baseline: { years: 'x', points: [{ km: 0, eleM: 100, month: 10, p10LowC: 5, meanLowC: 7, p90HighC: 20, meanHighC: 15, rainDays: 8 }] } }));
    expect(far.basis.join(' ')).toContain('seasonal estimate');
    expect(far.missing).not.toContain('weather');
  });
  test('[W-RANGE] the card carries the label when outside the validated range, and for an e-bike', () => {
    expect(waterAnswer(factsOf({ spots: [tapAt(10), tapAt(20)], forecast: steady({ t: 41 }), litres: 3 })).detail).toContain('outside the validated range');
    expect(waterAnswer(factsOf({ spots: [tapAt(10), tapAt(20)], litres: 3 })).detail).not.toContain('outside the validated range');
    const e = waterAnswer(factsOf({ spots: [tapAt(10), tapAt(20)], litres: 3, profile: { ebike: true } }));
    expect(e.detail).toContain('outside the validated range');
    expect(e.status).toBe('fine'); // the carrying advice stays
  });
});

describe('no departure date', () => {
  const noDate = (c: Case): WaterFacts => factsOf({ ...c, trip: testTrip({ departureDate: null }) });
  test('[W-REACH-FINE] never fine: the date is named as missing', () => {
    const a = waterAnswer(noDate({ spots: [tapAt(10), tapAt(20)], litres: 3 }));
    expect(a.status).toBe('unknown');
    expect(a.title).toBe('Set your departure date to check this stretch.');
    expect(a.missing).toContain('date');
  });
  test('[W-REACH-FINE] shops and hours do not count without a date, and the texts give distances only', () => {
    const p = shop('x').atKm(10);
    const f = noDate({ spots: [{ b: shop('x'), km: 10 }, tapAt(50, 'Bühl')], hours: [hoursOf(p, [{ from: '2026-01-01 00:00', to: '2027-01-01 00:00' }])] });
    const { s1 } = findS1S2(f);
    expect(s1.kind === 'place' && s1.place.name).toBe('Bühl');
    const a = waterAnswer(noDate({ spots: [tapAt(10, 'Kehl'), tapAt(50, 'Bühl')], litres: 2.2 }));
    expect(a.title).toMatch(/^Refill at Kehl \(\+10 km\): fill to [\d.]+ L$/);
    expect(a.stamp?.at).toBeUndefined();
  });
});

describe('a broken number never reads as good', () => {
  const good: Case = { spots: [tapAt(10), tapAt(30)], litres: 3 };
  test('[W-REACH-FINE] the good case is fine, so the rest prove something', () => {
    expect(waterAnswer(factsOf(good)).status).toBe('fine');
  });
  test('[W-REACH-FINE] water left: NaN, Infinity, negative', () => {
    for (const litres of [NaN, Infinity, -Infinity, -1]) {
      const a = waterAnswer(factsOf({ ...good, litres }));
      expect(a.status).toBe('unknown');
      expect(a.title).toBe('Confirm your water to check the next stretch');
    }
    expect(waterAnswer(factsOf({ ...good, confirmedAt: new Date(NaN) })).status).toBe('unknown');
  });
  test('[W-REACH-FINE] capacity: NaN and Infinity count as none', () => {
    for (const capacityL of [NaN, Infinity]) {
      const a = waterAnswer(factsOf({ ...good, profile: { capacityL } }));
      expect(a.status).toBe('unknown');
      expect(a.missing).toContain('capacity');
    }
  });
  test('[W-REACH-FINE] speed: NaN, 0, negative and Infinity do not throw and are not fine', () => {
    for (const flatKph of [NaN, 0, -20, Infinity]) {
      const a = waterAnswer(factsOf({ ...good, trip: testTrip({ flatKph }) }));
      expect(a.status).toBe('unknown');
      expect(a.title).toContain("can't be worked out");
    }
  });
  test('[W-REACH-FINE] the personal factor: NaN, 0, Infinity', () => {
    for (const k of [NaN, 0, -1, Infinity]) expect(waterAnswer(factsOf({ ...good, profile: { k } })).status).toBe('unknown');
  });
  test('[W-REACH-FINE] camp water: NaN or negative can not lower the need', () => {
    for (const campWaterL of [NaN, -5, Infinity]) expect(waterAnswer(factsOf({ ...good, trip: testTrip({ campWaterL }) })).status).toBe('unknown');
  });
  test('[W-REACH-FINE] weight: NaN falls back to 75 kg, and the sum of weights to U = 1.4', () => {
    const f0 = factsOf(good);
    const f = factsOf({ ...good, profile: { weightKg: NaN, sumW: NaN } });
    expect(use(f, 'now', findS1S2(f).s2, 'plan')).toBeCloseTo(use(f0, 'now', findS1S2(f0).s2, 'plan'), 9);
  });
  test('[W-REACH-FINE] a forecast of NaN falls back to the hot-day assumption', () => {
    const a = waterAnswer(factsOf({ ...good, forecast: steady({ t: NaN }) }));
    expect(a.basis.join(' ')).toContain('no weather data — assumes a hot day');
    const f = factsOf({ ...good, forecast: steady({ t: NaN }) });
    expect(Number.isFinite(use(f, 'now', findS1S2(f).s2, 'plan'))).toBe(true);
  });
  test('[W-REACH-FINE] a route length of NaN is not fine', () => {
    const route = { ...flatRoute(300, { stageEnds: [78, 150, 222] }), lengthKm: NaN };
    expect(waterAnswer(factsOf({ ...good, trip: testTrip({ route }) })).status).toBe('unknown');
  });
  test('[W-REACH-FINE] broken saved ranges and matches are ignored: no data, not good data', () => {
    const a = factsOf({ ...good, savedKm: [{ fromKm: NaN, toKm: NaN }] });
    expect(findS1S2(a).s1.kind).toBe('edge');
    expect(waterAnswer(a).status).not.toBe('fine');
    const c = factsOf(good);
    expect(findS1S2({ ...c, matches: c.matches.map((m) => ({ ...m, km: NaN })) }).s1.kind).toBe('end');
    const d = factsOf(good);
    expect(findS1S2({ ...d, matches: d.matches.map((m) => ({ ...m, offRouteM: NaN })) }).s1.kind).toBe('end');
  });
});

describe('what the rate reads', () => {
  test('[W-EXAMPLE-2] a climb costs more than the flat floor: gradient goes into the power', () => {
    const flat = flatRoute(100, { stageEnds: [50] });
    const route = { ...flat, ascentM: 1200, points: flat.points.map((p) => ({ ...p, ele: 100 + Math.min(p.km, 20) * 60 })) };
    const f = factsOf({ trip: testTrip({ route }), spots: [tapAt(20)] });
    const { s1 } = findS1S2(f);
    const hours = f.schedule.ridingMinBetween(0, 20) / 60;
    expect(hours).toBeGreaterThan(2.5); // 20 km and 1,200 m of climbing
    // At the floor the buffer would be 1.4 x 0.25 x 20% of the riding time. Climbing 6% is well above it.
    expect(buffer(f, 'now', s1) / (1.4 * 0.2 * hours)).toBeGreaterThan(0.3);
  });

  test('[W-VALID-SUN] sun counts by day only, as the sun source says', () => {
    const f = factsOf({ spots: [tapAt(41)], forecast: steady({ t: 29, rh: 40, ghi: 800 }) });
    const { s1 } = findS1S2(f);
    const dark = { ...f, sun: () => ({ dawn: null, sunrise: null, sunset: null, dusk: null, lightAllNight: false }) };
    const light = { ...f, sun: () => ({ dawn: null, sunrise: null, sunset: null, dusk: null, lightAllNight: true }) };
    expect(use(dark, 'now', s1, 'plan')).toBeLessThan(use(f, 'now', s1, 'plan'));
    expect(use(light, 'now', s1, 'plan')).toBeCloseTo(use(f, 'now', s1, 'plan'), 9);
  });

  test("[W-TONIGHT] with an approximate position, tonight's water behind is measured from km + accuracy", () => {
    const f = factsOf({ now: `${SAT} 18:30`, positions: [pos({ km: 78, at: `${SAT} 18:00`, acc: 800 })], litres: 2, spots: [tapAt(77, 'Back'), tapAt(100, 'Town')] });
    const { s1 } = findS1S2(f);
    expect(s1.kind === 'place' && s1.back).toBe(true);
    near(use(f, 'now', s1, 'plan'), 1.4 * (1.8 / KPH) * f.ride.r * (0.25 + 0.15 * 0.045), 0.001);
    expect(waterAnswer(f).items[0]!.detail).toContain('1.8 km back');
  });

  test('[W-REACH-FINE] figures that come out non-finite are not fine, whichever input they came from', () => {
    const flat = flatRoute(300, { stageEnds: [78, 150, 222] });
    const badHeight = { ...flat, points: flat.points.map((p) => ({ ...p, ele: NaN })) };
    const a = waterAnswer(factsOf({ spots: [tapAt(10), tapAt(30)], litres: 3, trip: testTrip({ route: badHeight }) }));
    expect(a.status).toBe('unknown');
    expect(a.title).toContain("can't be worked out");
    const baseline = { years: 'x', points: [{ km: 0, eleM: NaN, month: 10, p10LowC: 5, meanLowC: 7, p90HighC: 20, meanHighC: 15, rainDays: 8 }] };
    const b = waterAnswer(factsOf({ spots: [{ b: tap({ seasonal: 'no' }), km: 10 }, { b: tap({ seasonal: 'no' }), km: 30, side: 'west' }], litres: 3, forecast: null, baseline }));
    expect(b.status).toBe('unknown');
  });
});

describe('what the card names as missing or old', () => {
  test('[W-LABELS] hours not worked out, or outside the window, for a shop on the way', () => {
    const p = shop('x').atKm(30);
    const spotsShop: Spot[] = [{ b: shop('x'), km: 30 }, tapAt(60)];
    expect(waterAnswer(factsOf({ spots: spotsShop })).missing).toContain('hours');
    const inWindow = hoursOf(p, [{ from: '08:00', to: '18:00' }]);
    expect(waterAnswer(factsOf({ spots: spotsShop, hours: [inWindow] })).missing).not.toContain('hours');
    const ended = { ...inWindow, windowEnd: at(`${SAT} 08:00`), spans: [] };
    expect(waterAnswer(factsOf({ spots: spotsShop, hours: [ended] })).missing).toContain('hours');
    // An outdoor tap decides without hours.
    expect(waterAnswer(factsOf({ spots: [tapAt(30), tapAt(60)] })).missing).not.toContain('hours');
  });
  test('[W-LABELS] heights: a route with points without a height', () => {
    expect(waterAnswer(factsOf({ trip: testTrip({ route: flatRoute(300, { stageEnds: [78], ele: null }) }) })).missing).toContain('heights');
    expect(waterAnswer(factsOf()).missing).not.toContain('heights');
  });
  test('[W-LABELS] a forecast over 12 h old is marked stale, and its date and the data date are given', () => {
    const f = steady({ from: '2026-10-16 00:00' });
    const noon = waterAnswer(factsOf({ forecast: { ...f, fetchedAt: at(`${SAT} 08:00`) }, spots: [tapAt(30)] }));
    expect(noon.freshness.stale).toBe(false);
    expect(noon.freshness.dataDates['weather']).toBe(at(`${SAT} 08:00`).toISOString());
    expect(noon.freshness.dataDates['places']).toBe('2026-10-26');
    expect(waterAnswer(factsOf({ forecast: { ...f, fetchedAt: at('2026-10-16 20:00') } })).freshness.stale).toBe(true);
    expect(waterAnswer(factsOf({ forecast: { ...f, fetchedAt: new Date(NaN) } })).freshness.stale).toBe(true);
  });
});

// ---- Properties over generated routes, weather and water levels ----------------------------------------------------

type Gen = {
  length: number; tapKms: number[]; litres: number; capacity: number | null; t: number; rh: number; ghi: number; flatKph: number;
  posKm: number | null; hour: number; savedTo: number | null; k: number; sumW: number; dayTwo: boolean; stay: 'camping' | 'mixed' | 'accommodation';
};
const gen = fc.record<Gen>({
  length: fc.integer({ min: 40, max: 320 }),
  tapKms: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 8 }),
  litres: fc.double({ min: 0, max: 8, noNaN: true }),
  capacity: fc.option(fc.double({ min: 0.5, max: 8, noNaN: true }), { nil: null }),
  t: fc.double({ min: 0, max: 38, noNaN: true }), rh: fc.double({ min: 10, max: 95, noNaN: true }), ghi: fc.double({ min: 0, max: 900, noNaN: true }),
  flatKph: fc.double({ min: 15, max: 40, noNaN: true }),
  posKm: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
  hour: fc.integer({ min: 6, max: 21 }),
  savedTo: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
  k: fc.double({ min: 0.6, max: 2, noNaN: true }), sumW: fc.double({ min: 0, max: 5, noNaN: true }),
  dayTwo: fc.boolean(), stay: fc.constantFrom('camping', 'mixed', 'accommodation'),
});

function build(g: Gen): WaterFacts {
  const ends = [0.25, 0.5, 0.75].map((x) => Math.round(g.length * x));
  const trip = testTrip({ route: flatRoute(g.length, { stageEnds: ends }), flatKph: g.flatKph, stay: g.stay });
  const date = g.dayTwo ? SUN : SAT;
  const now = `${date} ${String(g.hour).padStart(2, '0')}:00`;
  const positions = g.posKm === null ? [] : [pos({ km: g.posKm * g.length, at: now })];
  return factsOf({
    trip, now, positions, litres: g.litres, profile: { capacityL: g.capacity, k: g.k, sumW: g.sumW },
    forecast: steady({ t: g.t, rh: g.rh, ghi: g.ghi }), spots: g.tapKms.map((x) => tapAt(x * g.length)),
    savedKm: [{ fromKm: 0, toKm: g.savedTo === null ? g.length : g.savedTo * g.length }],
  });
}

describe('the reach rule over generated moments', () => {
  /** The spec's table, written out on its own from the exported terms. */
  function table(f: WaterFacts): Answer['status'] {
    const w0 = (waterNow(f) as { litres: number }).litres;
    const { s1, s2 } = findS1S2(f);
    const c = capacityOf(f);
    const short = (p: Target): boolean => w0 - use(f, 'now', p, 'plan') < buffer(f, 'now', p) + reserve(f, 'now', p) + camp(f, 'now', p);
    if (short(s1)) return 'warning';
    if (c === null) return 'unknown';
    if (s1.kind === 'place') {
      if (need(f, s1, s2) > c) return 'action';
      if (short(s2)) return 'action';
    }
    if (s1.kind === 'edge' || s2.kind === 'edge') return 'action';
    return 'fine';
  }

  fcTest.prop([gen])('[W-REACH-FINE] the card follows the table, first match wins', (g) => {
    const f = build(g);
    expect(waterAnswer(f).status).toBe(table(f));
  });

  fcTest.prop([gen])('[W-REACH-FINE] fine only with W_arr(S2) at or above Buffer + R0 + Camp, and never at a data edge', (g) => {
    const f = build(g);
    const a = waterAnswer(f);
    if (a.status !== 'fine') return;
    const { s1, s2 } = findS1S2(f);
    expect(s1.kind).not.toBe('edge');
    expect(s2.kind).not.toBe('edge');
    const w0 = (waterNow(f) as { litres: number }).litres;
    expect(w0 - use(f, 'now', s2, 'plan')).toBeGreaterThanOrEqual(buffer(f, 'now', s2) + reserve(f, 'now', s2) + camp(f, 'now', s2));
  });

  fcTest.prop([gen])('[W-DRY-STRETCH] a dry stretch after S1 longer than capacity gives "fill up completely" unless the warning row applies, never fine', (g) => {
    const f = build(g);
    const { s1, s2 } = findS1S2(f);
    const c = capacityOf(f);
    if (s1.kind !== 'place' || c === null || !(need(f, s1, s2) > c)) return;
    const a = waterAnswer(f);
    expect(a.status).not.toBe('fine');
    if (a.status !== 'warning') {
      expect(a.status).toBe('action');
      expect(a.title).toContain('fill up completely');
      expect(a.detail).toContain('Your bottles hold');
    }
  });

  fcTest.prop([gen])('[W-NO-CAPACITY] no capacity: only the warning row, otherwise unknown naming capacity, never fine', (g) => {
    const f = build({ ...g, capacity: null });
    const a = waterAnswer(f);
    expect(a.status).not.toBe('fine');
    expect(a.status).not.toBe('action');
    expect(a.missing).toContain('capacity');
    if (a.status === 'unknown') expect(a.title).toBe('Enter the water you can carry (You) to plan refills.');
  });

  fcTest.prop([gen])('[W-NO-SOURCE] with no source before E: never fine at the edge, fine at the end only with the reserve', (g) => {
    const f = build({ ...g, tapKms: [], capacity: g.capacity ?? 3 });
    const a = waterAnswer(f);
    const { s1 } = findS1S2(f);
    if (s1.km > f.ride.startKm + 0.05) expect(textOf(a)).toContain('No mapped reliable water for the next');
    if (s1.kind === 'edge') expect(a.status).not.toBe('fine');
    if (a.status === 'fine') {
      const w0 = (waterNow(f) as { litres: number }).litres;
      expect(w0 - use(f, 'now', s1, 'plan')).toBeGreaterThanOrEqual(buffer(f, 'now', s1) + reserve(f, 'now', s1) + camp(f, 'now', s1));
    }
  });

  fcTest.prop([gen])('[W-ZERO] every figure is finite and never negative, and the title never shows a broken number', (g) => {
    const f = build(g);
    const { s1, s2 } = findS1S2(f);
    for (const target of [s1, s2]) {
      for (const x of [use(f, 'now', target, 'plan'), use(f, 'now', target, 'median'), buffer(f, 'now', target), reserve(f, 'now', target), camp(f, 'now', target)]) {
        expect(Number.isFinite(x)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
      }
    }
    expect(textOf(waterAnswer(f))).not.toMatch(/NaN|Infinity|undefined/);
  });

  fcTest.prop([gen, fc.constantFrom(NaN, Infinity, -Infinity)])('[W-REACH-FINE] any one broken input: never fine', (g, bad) => {
    const f = build(g);
    const broken: WaterFacts[] = [
      { ...f, waterLeft: { litres: bad, at: f.now, confirmed: true } },
      { ...f, profile: { ...f.profile, k: bad } },
      { ...f, trip: { ...f.trip, flatKph: bad } },
      { ...f, trip: { ...f.trip, campWaterL: bad } },
    ];
    for (const b of broken) expect(waterAnswer(b).status).not.toBe('fine');
  });
});
