// The stops on Trip's height profile (guided Trip design §6): every icon is one Ahead's strip would show on that day of the stage plan.
import { describe, expect, test } from 'vitest';
import { instantAt } from '../../../../src/core/answers/time.ts';
import { buildScreen } from '../../../../src/core/screen/screen.ts';
import { routeStops } from '../../../../src/core/screen/route-stops.ts';
import type { ScreenInputs } from '../../../../src/core/types.ts';
import { cafe, lodging, pos, tap } from '../../../fixtures/build.ts';
import { FRI, RAINY_SPOTS, rainyStop, SAT } from '../../ui/ahead-fixture.ts';

/** The 165 km rainy fixture in two days (km 0 to 70, 70 to 165), with places on both days. */
const twoDays = (): ScreenInputs => rainyStop({
  now: '2026-10-14 18:00', positions: [],
  spots: [...RAINY_SPOTS, { b: tap({ name: 'Brunnen Wiesloch' }), km: 22 }, { b: cafe('Mo-Su 07:00-19:00', { name: 'Café Sonne' }), km: 47 }],
});
const kindKm = (icons: { kind: string; km: number }[]) => icons.map((i) => `${i.kind}@${i.km}`);

describe('routeStops', () => {
  test('[TRIP-STOPS] day 1 is the strip of the departure morning, day 2 the strip of the next morning at the night stop; joined in route order', () => {
    const i = twoDays();
    const stops = routeStops(i);
    const zone = i.routeZones[0]!.timeZone;
    // The morning of each day, an hour before the daily start; on day 2 the rider is at the night stop, set by hand a minute before.
    const morning = (date: string): Date => new Date(instantAt(date, i.trip.startTime, zone).getTime() - 3_600_000);
    const day1 = buildScreen({ ...i, positions: [], now: morning(FRI) }).screen.strip;
    const atStop = { ...pos({ km: 70, at: `${SAT} 06:00`, manual: true }), at: new Date(morning(SAT).getTime() - 60_000) };
    const day2 = buildScreen({ ...i, positions: [atStop], now: morning(SAT) }).screen.strip;
    expect(day1.endKm).toBe(70);
    expect([day2.startKm, day2.endKm]).toEqual([70, 165]);
    expect(day1.icons.length).toBeGreaterThan(0);
    expect(day2.icons.length).toBeGreaterThan(0);
    const joined = [...day1.icons, ...day2.icons.filter((x) => !day1.icons.some((y) => y.kind === x.kind && y.km === x.km))];
    expect(kindKm(stops)).toEqual(kindKm(joined));
    expect(stops.map((s) => s.km)).toEqual([...stops.map((s) => s.km)].sort((a, b) => a - b));
    // The name of the place at that kilometre is the stop's name: the name alone, not the card's line about it.
    expect(stops.find((s) => s.kind === 'food' && s.km === 47)?.label).toBe('Café Sonne');
    expect(stops.find((s) => s.kind === 'water' && s.km === 22)?.label).toBe('Brunnen Wiesloch');
    const names = new Set(i.places.map((p) => p.name));
    for (const s of stops) expect(s.label === null || names.has(s.label), `${s.kind} at ${s.km}: ${s.label}`).toBe(true);
    expect(stops.filter((s) => s.label !== null).length).toBeGreaterThan(2);
  });

  test('[TRIP-STOPS] a trip with no date plans from today; a route with nothing saved has no stops; nothing throws', () => {
    const i = twoDays();
    expect(routeStops({ ...i, trip: { ...i.trip, departureDate: null } }).length).toBeGreaterThan(0);
    expect(routeStops({ ...i, places: [], matches: [], hours: [], savedKm: [], forecast: null, roofs: [] })).toEqual([]);
    expect(routeStops({ ...i, trip: { ...i.trip, route: { ...i.trip.route, stages: [] } } }).length).toBeGreaterThan(0);
  });

  test('[TRIP-STOPS] a stop’s name is the name of that stop: a tap and a hotel matched at the same km each keep their own', () => {
    const i = rainyStop({
      now: '2026-10-14 18:00', positions: [],
      spots: [...RAINY_SPOTS, { b: lodging({ name: 'Hotel Krone' }), km: 22 }, { b: tap({ name: 'Brunnen Wiesloch' }), km: 22 }],
    });
    const stops = routeStops(i);
    expect(stops.find((s) => s.kind === 'water' && s.km === 22)?.label).toBe('Brunnen Wiesloch');
    for (const s of stops.filter((x) => x.km === 22 && x.kind !== 'sleep')) expect(s.label).not.toBe('Hotel Krone');
  });
});
