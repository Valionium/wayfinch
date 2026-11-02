import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { dayRide } from '../../../src/core/engines/tripday.ts';
import { screen, type Screen } from '../../../src/core/screen/screen.ts';
import type { GridHour, Position, ScreenInputs } from '../../../src/core/types.ts';
import { at } from '../../fixtures/build.ts';
import { clock, sunOf } from '../../gen/clocks.ts';
import { scenario } from '../../gen/scenario.ts';
import { AGES_H, CHANCES, DISTANCES_M, EDGE_MIN, GUSTS_KMH, RAIN_MM, TEMPS_C, ageH, chancePct, distanceM, edgeMin, gustKmh, rainMm, tempC } from '../../gen/thresholds.ts';

const SEED = 20261030;
const DRAWS = 1000;
const sample = <T>(a: fc.Arbitrary<T>, numRuns = DRAWS): T[] => fc.sample(a, { numRuns, seed: SEED });

describe('thresholds first', () => {
  const NUMBERS: [string, fc.Arbitrary<number>, readonly number[]][] = [
    ['rain chance 19/20% and 49/50%', chancePct(), CHANCES],
    ['rain amount 2.4/2.5 mm', rainMm(), RAIN_MM],
    ['temperature 29.9/30.0 C', tempC(), TEMPS_C],
    ['gusts 60 km/h', gustKmh(), GUSTS_KMH],
    ['minutes +-30, 5 and 10 around opening and closing', edgeMin(), EDGE_MIN],
    ['ages 5 and 10 min, 3, 12 and 48 h', ageH(), AGES_H],
    ['100, 300, 500 m, 1, 2, 3, 5 km', distanceM(), DISTANCES_M],
  ];
  test.each(NUMBERS)('[HON-GEN-THRESHOLD] %s: 15-35%% of 1,000 draws', (_name, arb, list) => {
    const on = sample(arb).filter((x) => list.includes(x)).length;
    expect(on / DRAWS).toBeGreaterThanOrEqual(0.15);
    expect(on / DRAWS).toBeLessThanOrEqual(0.35);
  });
  test('[HON-GEN-THRESHOLD] clocks: 04:00, midnight, daily start, sunset, dusk and a stage\'s halfway: 15-35% of 1,000 draws', () => {
    const facts = { departureDate: '2026-10-17', startTime: '08:30', days: 3, tz: 'Europe/Berlin', sun: sunOf({ kind: 'real' }), lat: 49, lon: 8.4, halfwayMin: 150 };
    const on = sample(clock(facts)).filter((m) => m.onThreshold).length;
    expect(on / DRAWS).toBeGreaterThanOrEqual(0.15);
    expect(on / DRAWS).toBeLessThanOrEqual(0.35);
  });
});

describe('variety over 1,000 scenarios', () => {
  // One set, so the expensive part runs once.
  const all: ScreenInputs[] = sample(scenario());
  const seen = (test: (i: ScreenInputs) => boolean): number => all.filter(test).length;
  const lastUsable = (i: ScreenInputs): Position | undefined => i.positions.at(-1);
  const anyHour = (i: ScreenInputs, test: (h: GridHour) => boolean): boolean => (i.forecast?.grid ?? []).some((g) => g.hours.some(test));
  const phases = (): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const i of all.filter((x) => x.routeZones[0]?.timeZone !== 'constructor')) {
      try {
        const r = dayRide(i.trip, i.positions, i.planTomorrow, i.routeEndDate, i.now, { sun: i.sun, routeZones: i.routeZones }, i.dayStarts);
        out[r.phase] = (out[r.phase] ?? 0) + 1;
      } catch {
        out['threw'] = (out['threw'] ?? 0) + 1;
      }
    }
    return out;
  };

  test('[HON-GEN-VARIETY] route shapes: loops, out-and-backs, crossings, missing heights, very short', () => {
    for (const shape of ['line', 'loop', 'out-and-back', 'crossing']) expect(seen((i) => i.trip.route.id.startsWith(`gen-${shape}`))).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.trip.route.points.every((p) => p.ele === null))).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.trip.route.points.some((p) => p.ele === null) && i.trip.route.points.some((p) => p.ele !== null))).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.trip.route.climbs.length > 0)).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.trip.route.lengthKm < 3)).toBeGreaterThanOrEqual(10);
    expect(seen((i) => i.trip.route.stages.length >= 4)).toBeGreaterThanOrEqual(30);
  });
  test('[HON-GEN-VARIETY] every phase', () => {
    const p = phases();
    for (const phase of ['before-trip', 'before-ride', 'riding', 'after-ride', 'route-end']) expect(p[phase] ?? 0, JSON.stringify(p)).toBeGreaterThanOrEqual(20);
    expect(p['threw'] ?? 0, 'with a real zone the trip day never throws').toBe(0);
  });
  test('[HON-GEN-VARIETY] positions: 5 m to 2 km, manual, on stage ends, over 5 km off, at home, none, past the end', () => {
    expect(seen((i) => lastUsable(i)?.accuracyM === 5)).toBeGreaterThanOrEqual(1);
    expect(seen((i) => i.positions.some((p) => p.accuracyM === 2000))).toBeGreaterThanOrEqual(5);
    expect(seen((i) => i.positions.some((p) => p.source === 'manual'))).toBeGreaterThanOrEqual(20);
    expect(seen((i) => i.positions.some((p) => i.trip.route.stages.some((s) => s.endKm === p.km && s.endKm < i.trip.route.lengthKm)))).toBeGreaterThanOrEqual(20);
    expect(seen((i) => i.positions.some((p) => p.offRouteM > 5000 && Number.isFinite(p.offRouteM)))).toBeGreaterThanOrEqual(20);
    expect(seen((i) => i.positions.some((p) => p.offRouteM === 40_000) && i.trip.departureDate !== null && i.now < at(`${i.trip.departureDate} 00:00`))).toBeGreaterThanOrEqual(1);
    expect(seen((i) => i.positions.length === 0)).toBeGreaterThanOrEqual(20);
    expect(seen((i) => i.positions.some((p) => p.km > i.trip.route.lengthKm))).toBeGreaterThanOrEqual(5);
    expect(seen((i) => i.positions.some((p) => p.at > i.now))).toBeGreaterThanOrEqual(5);
  });
  test('[HON-GEN-VARIETY] clocks from the day before departure to after the route end', () => {
    expect(seen((i) => i.trip.departureDate !== null && i.now < at(`${i.trip.departureDate} 00:00`))).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.trip.departureDate !== null && i.now.getTime() > at(`${i.trip.departureDate} 00:00`).getTime() + (i.trip.route.stages.length + 0.1) * 86_400_000)).toBeGreaterThanOrEqual(10);
    expect(seen((i) => i.trip.departureDate === null)).toBeGreaterThanOrEqual(20);
  });
  test('[HON-GEN-VARIETY] weather codes 80-82, 95, 96, 97, 99; hourly and 15-minute; stale fetches', () => {
    for (const code of [80, 81, 82, 95, 96, 97, 99]) expect(seen((i) => anyHour(i, (h) => h.code === code)), `code ${code}`).toBeGreaterThanOrEqual(10);
    expect(seen((i) => i.forecast?.has15 === true)).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.forecast?.has15 === false)).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.forecast !== null && i.now.getTime() - i.forecast.fetchedAt.getTime() > 12 * 3_600_000)).toBeGreaterThanOrEqual(30);
  });
  test('[HON-GEN-VARIETY] forecasts empty, partial, out of order, ending mid-ride, with a broken first hour', () => {
    expect(seen((i) => i.forecast === null)).toBeGreaterThanOrEqual(10);
    expect(seen((i) => i.forecast?.grid.length === 0)).toBeGreaterThanOrEqual(10);
    expect(seen((i) => i.forecast !== null && i.forecast.grid.length > 0 && i.forecast.grid.length < i.trip.route.sampleGrid.length)).toBeGreaterThanOrEqual(10);
    expect(seen((i) => (i.forecast?.grid ?? []).some((g) => g.hours.length > 1 && g.hours[0]!.at > g.hours[1]!.at))).toBeGreaterThanOrEqual(10);
    expect(seen((i) => (i.forecast?.grid ?? []).some((g) => g.hours[0] && !Number.isFinite(g.hours[0].at.getTime())))).toBeGreaterThanOrEqual(5);
    expect(seen((i) => anyHour(i, (h) => h.pp === null))).toBeGreaterThanOrEqual(10);
    expect(seen((i) => (i.forecast?.grid ?? []).some((g) => g.hours.length > 0 && g.hours.length <= 30))).toBeGreaterThanOrEqual(10);
  });
  test('[HON-GEN-VARIETY] grid kilometres that do not line up with stage ends', () => {
    expect(seen((i) => i.trip.route.stages.some((s) => s.endKm < i.trip.route.lengthKm && !i.trip.route.sampleGrid.includes(s.endKm)))).toBeGreaterThanOrEqual(100);
  });
  test('[HON-GEN-VARIETY] a place reached twice: one match per pass, never deduped', () => {
    const twice = (i: ScreenInputs): boolean => {
      const counts = new Map<string, number>();
      for (const m of i.matches) counts.set(m.placeId, (counts.get(m.placeId) ?? 0) + 1);
      return [...counts.values()].some((n) => n >= 2);
    };
    expect(seen((i) => i.trip.route.id.startsWith('gen-out-and-back') && twice(i))).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.trip.route.id.startsWith('gen-loop') && twice(i))).toBeGreaterThanOrEqual(1);
  });
  test('[HON-GEN-VARIETY] odd map tags, selector-only and PH hours', () => {
    const own = (o: object, key: string): boolean => Object.hasOwn(o, key);
    expect(seen((i) => i.places.some((p) => own(p.tags, '__proto__')))).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.places.some((p) => p.tags['shop'] === 'constructor'))).toBeGreaterThanOrEqual(10);
    expect(seen((i) => i.places.some((p) => p.seasonal === 'constructor' || p.name === 'constructor'))).toBeGreaterThanOrEqual(10);
    expect(seen((i) => i.places.some((p) => p.openingHours === 'Mo-Fr' || p.openingHours === 'Mar-Oct' || p.openingHours === 'Mo-Su open'))).toBeGreaterThanOrEqual(10);
    expect(seen((i) => i.places.some((p) => /\bPH\b/.test(p.openingHours ?? '')))).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.routeZones.some((z) => z.timeZone === 'constructor' || z.country === '__proto__'))).toBeGreaterThanOrEqual(10);
  });
  test('[HON-GEN-VARIETY] NaN, Infinity and dates that are none, and a broken first item', () => {
    expect(seen((i) => !Number.isFinite(i.now.getTime()))).toBeGreaterThanOrEqual(1);
    expect(seen((i) => !Number.isFinite(i.trip.flatKph))).toBeGreaterThanOrEqual(1);
    expect(seen((i) => i.places[0] !== undefined && !Number.isFinite(i.places[0].lat))).toBeGreaterThanOrEqual(5);
    expect(seen((i) => i.positions[0] !== undefined && !Number.isFinite(i.positions[0].at.getTime()))).toBeGreaterThanOrEqual(1);
    expect(seen((i) => i.rescuePoints[0] !== undefined && !Number.isFinite(i.rescuePoints[0].lat))).toBeGreaterThanOrEqual(1);
    expect(seen((i) => i.waterLeft !== null && !Number.isFinite(i.waterLeft.litres))).toBeGreaterThanOrEqual(10);
  });
  test('[HON-GEN-VARIETY] hours worked out, not worked out, and on a threshold of the arrival', () => {
    expect(seen((i) => i.hours.length === 0 && i.places.length > 0)).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.hours.some((h) => h.spans.some((x) => x.state === 'possibly-closed')))).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.hours.some((h) => h.spans.some((x) => x.state === 'unknown')))).toBeGreaterThanOrEqual(30);
    expect(seen((i) => i.hours.some((h) => h.windowEnd < i.now))).toBeGreaterThanOrEqual(10);
    expect(seen((i) => i.savedKm.length === 0)).toBeGreaterThanOrEqual(10);
  });
  test('[HON-GEN-VARIETY] the screens reach the rules: storms, wait or go, last chances, gaps, plans, every Water status', () => {
    const screens = all.map((i) => screen(i));
    const count = (t: (s: Screen) => boolean): number => screens.filter(t).length;
    for (const kind of ['likely', 'possible', 'thunder']) expect(count((s) => s.strip.bands.some((b) => b.kind === kind)), kind).toBeGreaterThanOrEqual(20);
    expect(count((s) => s.cards.weather.status === 'warning')).toBeGreaterThanOrEqual(30);
    expect(count((s) => s.cards.weather.title.startsWith('Rain likely here'))).toBeGreaterThanOrEqual(30);
    expect(count((s) => /^(Waiting|Leaving)|wait/i.test(s.cards.weather.items[0]?.label ?? ''))).toBeGreaterThanOrEqual(20);
    expect(count((s) => s.strip.icons.some((x) => x.kind === 'cover'))).toBeGreaterThanOrEqual(20);
    for (const kind of ['water', 'food', 'sleep']) expect(count((s) => s.strip.icons.some((x) => x.kind === kind)), kind).toBeGreaterThanOrEqual(50);
    expect(count((s) => s.cards.food.title.startsWith('Last open'))).toBeGreaterThanOrEqual(30);
    expect(count((s) => s.cards.food.title.startsWith('Stop idea'))).toBeGreaterThanOrEqual(20);
    for (const status of ['fine', 'action', 'warning', 'unknown'] as const) expect(count((s) => s.cards.water.status === status), status).toBeGreaterThanOrEqual(30);
    expect(count((s) => s.cards.daylight.status === 'warning')).toBeGreaterThanOrEqual(30);
    expect(count((s) => s.cards.sleep.status === 'fine')).toBeGreaterThanOrEqual(30);
    for (const chip of ['bike', 'pharmacy', 'train', 'toilets'] as const) expect(count((s) => s.chips[chip].status === 'fine'), chip).toBeGreaterThanOrEqual(30);
    expect(count((s) => s.notes.some((n) => /5 km/.test(n)))).toBeGreaterThanOrEqual(20);
  }, 120_000);
  test('[HON-GEN-VARIETY] the sun: real, stubbed, light all night, none, broken', () => {
    const kinds = new Set(all.map((i) => (i.sun as unknown as { spec: { kind: string } }).spec.kind));
    expect([...kinds].sort()).toEqual(['broken', 'light-all-night', 'no-sun', 'real', 'stub']);
  });
});
