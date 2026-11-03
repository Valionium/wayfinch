import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { haversineKm } from '../../../../src/core/geo/haversine.ts';
import { COUNTRIES } from '../../../../src/core/places/countries.ts';
import { assembleRoute } from '../../../../src/core/route/profile.ts';
import { routeZones, zoneAt } from '../../../../src/core/route/zones.ts';
import type { BoundaryFile } from '../../../../src/core/route/zones.ts';
import { screen } from '../../../../src/core/screen/screen.ts';
import type { Route, ZoneSpan } from '../../../../src/core/types.ts';
import { W } from '../../../../src/core/wording/en.ts';
import { usableZones } from '../../../../src/store/rules.ts';
import { COUNTRY_JOBS } from '../../../../pipeline/config.ts';
import { pos, sun, testTrip } from '../../../fixtures/build.ts';
import { loadFixtureRoute } from '../../../fixtures/packs/index.ts';

const file = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../public/data/boundaries.v1.json', import.meta.url)), 'utf8')) as BoundaryFile;

const routeThrough = (points: [number, number][]): Route => assembleRoute(points.map(([lat, lon]) => ({ lat, lon, ele: null })), 'test', 'planned');
/** Points every `stepKm` or so on the straight line between two places. */
function line(a: [number, number], b: [number, number], steps = 200): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps]);
}

describe('real places', () => {
  const cases: [string, number, number, string, string][] = [
    ['Heidelberg', 49.4094, 8.6942, 'DE', 'DE-BW'],
    ['Strasbourg', 48.5734, 7.7521, 'FR', 'FR-67'],
    ['Augsburg centre', 48.369, 10.898, 'DE', 'DE-BY-Augsburg'],
    ['Munich', 48.137, 11.575, 'DE', 'DE-BY'],
    ['Metz', 49.1193, 6.1757, 'FR', 'FR-57'],
    ['Paris', 48.8566, 2.3522, 'FR', 'FR'],
    ['Innsbruck', 47.2692, 11.4041, 'AT', 'AT-7'],
    ['Basel', 47.5596, 7.5886, 'CH', 'CH-BS'],
    ['Warsaw', 52.2297, 21.0122, 'PL', 'PL'],
    ['Copenhagen', 55.6761, 12.5683, 'DK', 'DK'],
  ];
  test.each(cases)('[BND-POINTS] %s', (_name, lat, lon, country, holidayZone) => {
    const z = zoneAt(lat, lon, file);
    expect(z).toEqual({ country, holidayZone, timeZone: COUNTRIES[country as keyof typeof COUNTRIES].timeZone });
  });

  test('[BND-POINTS] every first-release zone is Europe/… and known to Intl', () => {
    expect(file.areas.length).toBeGreaterThan(10);
    for (const a of file.areas) {
      expect(a.timeZone).toMatch(/^Europe\//);
      expect(() => new Intl.DateTimeFormat('en', { timeZone: a.timeZone })).not.toThrow();
    }
  });

  // The pipeline's own sentinels: real places that must land where they belong, in each of the ten countries.
  const inside = Object.entries(COUNTRY_JOBS).flatMap(([cc, job]) => job.sentinels.inside.map((s) => [cc, ...s] as const));
  const outside = Object.entries(COUNTRY_JOBS).flatMap(([cc, job]) => job.sentinels.outside.map((s) => [cc, ...s] as const));
  test.each(inside)('[BND-POINTS] sentinel: inside %s, %s', (cc, _name, lat, lon, zone) => {
    const z = zoneAt(lat, lon, file);
    expect(z?.country).toBe(cc);
    if (zone !== null) expect(z?.holidayZone).toBe(zone);
  });
  test.each(outside)('[BND-POINTS] sentinel: outside %s, %s', (cc, _name, lat, lon) => {
    expect(zoneAt(lat, lon, file)?.country).not.toBe(cc);
  });
});

describe('both sides of real borders', () => {
  // Pairs of real town centres across a border, each a few kilometres or less from it. Coordinates are of the town halls or
  // market squares, read off OpenStreetMap, and each is checked on its own.
  const pairs: [string, number, number, string, string, number, number, string][] = [
    ['Kehl', 48.5726, 7.8156, 'DE', 'Strasbourg', 48.5734, 7.7521, 'FR'],
    ['Weil am Rhein', 47.5947, 7.6208, 'DE', 'Basel', 47.5596, 7.5886, 'CH'],
    ['Weil am Rhein', 47.5947, 7.6208, 'DE', 'Saint-Louis', 47.5897, 7.5597, 'FR'],
    ['Konstanz', 47.6633, 9.1753, 'DE', 'Kreuzlingen', 47.6455, 9.1740, 'CH'],
    ['Freilassing', 47.8371, 12.9770, 'DE', 'Salzburg', 47.8095, 13.055, 'AT'],
    ['Lindau', 47.5460, 9.6840, 'DE', 'Bregenz', 47.5031, 9.7471, 'AT'],
    ['Simbach am Inn', 48.2650, 13.0233, 'DE', 'Braunau am Inn', 48.2565, 13.0434, 'AT'],
    ['Aachen', 50.7753, 6.0839, 'DE', 'Vaals', 50.7717, 6.0186, 'NL'],
    ['Aachen', 50.7753, 6.0839, 'DE', 'Eupen', 50.6281, 6.0360, 'BE'],
    ['Frankfurt (Oder)', 52.3471, 14.5506, 'DE', 'Słubice', 52.3506, 14.5606, 'PL'],
    ['Görlitz', 51.1558, 14.9880, 'DE', 'Zgorzelec', 51.1490, 15.0093, 'PL'],
    ['Flensburg', 54.7833, 9.4333, 'DE', 'Padborg', 54.8256, 9.3607, 'DK'],
    ['Perl', 49.4716, 6.3836, 'DE', 'Schengen', 49.4708, 6.3614, 'LU'],
    ['Waldsassen', 50.0013, 12.3060, 'DE', 'Cheb', 50.0796, 12.3739, 'CZ'],
    ['Cieszyn', 49.7500, 18.6327, 'PL', 'Český Těšín', 49.7461, 18.6264, 'CZ'],
    ['Kufstein', 47.5833, 12.1667, 'AT', 'Kiefersfelden', 47.6130, 12.1920, 'DE'],
    ['Lille', 50.6292, 3.0573, 'FR', 'Mouscron', 50.7445, 3.2069, 'BE'],
    ['Annemasse', 46.1958, 6.2354, 'FR', 'Geneva', 46.2044, 6.1432, 'CH'],
    ['Maastricht', 50.8514, 5.691, 'NL', 'Lanaken', 50.8930, 5.6470, 'BE'],
    ['Enschede', 52.2215, 6.8937, 'NL', 'Gronau', 52.2124, 7.0239, 'DE'],
    ['Longwy', 49.5197, 5.7606, 'FR', 'Pétange', 49.5581, 5.8806, 'LU'],
  ];
  test.each(pairs)('[BND-BORDER] %s and %s', (_a, aLat, aLon, aCountry, _b, bLat, bLon, bCountry) => {
    expect(zoneAt(aLat, aLon, file)?.country).toBe(aCountry);
    expect(zoneAt(bLat, bLon, file)?.country).toBe(bCountry);
  });

  // Büsingen is German, wholly inside Switzerland, and the pipeline's sentinels hold it to that. Alsace-Moselle has its own holidays.
  test('[BND-BORDER] an exclave and a zone edge land on the right side', () => {
    expect(zoneAt(47.697, 8.69, file)).toMatchObject({ country: 'DE', holidayZone: 'DE-BW' });
    expect(zoneAt(47.6964, 8.6349, file)).toMatchObject({ country: 'CH', holidayZone: 'CH-SH' }); // Schaffhausen
    expect(zoneAt(48.9379, 8.4044, file)).toMatchObject({ country: 'DE' });
    expect(zoneAt(48.6921, 6.1844, file)).toMatchObject({ country: 'FR', holidayZone: 'FR' }); // Nancy, outside Alsace-Moselle
    expect(zoneAt(48.0794, 7.3585, file)).toMatchObject({ country: 'FR', holidayZone: 'FR-68' }); // Colmar
    expect(zoneAt(48.4, 10.72, file)).toMatchObject({ country: 'DE', holidayZone: 'DE-BY' }); // west of Augsburg's boundary
  });
});

describe('spans along a route', () => {
  test('[BND-BORDER] Heidelberg → Strasbourg has one country change, within 3 km of the Rhine crossing', async () => {
    const f = await loadFixtureRoute('heidelberg-strasbourg');
    const route = assembleRoute(f.points, f.name, 'gpx');
    const spans = routeZones(route, file);
    const countries = spans.map((s) => s.country).filter((c, i, l) => c !== l[i - 1]);
    expect(countries).toEqual(['DE', 'FR']);
    const cut = spans.find((s) => s.country === 'FR')!.fromKm;
    const p = route.points.reduce((best, q) => (Math.abs(q.km - cut) < Math.abs(best.km - cut) ? q : best));
    // The Rhine at Kehl and at the Pflimlin bridge south of it: the fixture crosses one of the two.
    const rhine = [{ lat: 48.5728, lon: 7.8065 }, { lat: 48.5456, lon: 7.8046 }];
    expect(Math.min(...rhine.map((r) => haversineKm(p, r)))).toBeLessThan(3);
    expect(spans.at(-1)!.holidayZone).toBe('FR-67');
    expect(spans[0]!.holidayZone).toBe('DE-BW');
  });

  test('[BND-BORDER] a border between two far points is still found, near where it lies', () => {
    const route = routeThrough([[48.5726, 8.3], [48.5734, 7.3]]); // 73 km with no point in between
    const spans = routeZones(route, file);
    expect(spans.map((s) => s.country)).toEqual(['DE', 'FR']);
    const cut = spans[0]!.toKm;
    // The Rhine lies at about 7.80°E on this latitude: (8.3 − 7.80) of the whole degree.
    expect(Math.abs(cut - route.lengthKm * 0.5)).toBeLessThan(3);
  });

  test('[BND-BORDER] a route exactly along a border has no span under 100 m', () => {
    // Follow the first long German ring edge there is between DE and CH, zigzagging over it by 30 m.
    const de = file.areas.filter((a) => a.country === 'DE').flatMap((a) => a.rings);
    const ch = new Set(file.areas.filter((a) => a.country === 'CH').flatMap((a) => a.rings).flat().map((c) => c.join()));
    const shared = de.map((r) => r.filter((c) => ch.has(c.join()))).sort((a, b) => b.length - a.length)[0]!;
    expect(shared.length).toBeGreaterThan(20);
    const zigzag = shared.slice(0, 60).map(([lon, lat], i): [number, number] => [lat!, lon! + (i % 2 === 0 ? 0.0004 : -0.0004)]);
    const route = routeThrough(zigzag);
    const spans = routeZones(route, file);
    expect(spans.length).toBeGreaterThan(0);
    for (const s of spans) expect(s.toKm - s.fromKm).toBeGreaterThanOrEqual(0.1);
  });

  const box = fc.record({
    lat: fc.double({ min: 44, max: 56, noNaN: true }), lon: fc.double({ min: 0, max: 22, noNaN: true }),
    dLat: fc.double({ min: -1.5, max: 1.5, noNaN: true }), dLon: fc.double({ min: -1.5, max: 1.5, noNaN: true }), n: fc.integer({ min: 2, max: 40 }),
  });
  test('[BND-BORDER] property: spans cover the route with no gap or overlap, none under 100 m unless it is the whole route', () => {
    fc.assert(fc.property(box, ({ lat, lon, dLat, dLon, n }) => {
      const route = routeThrough(line([lat, lon], [lat + dLat, lon + dLon], n));
      const spans = routeZones(route, file);
      expect(spans[0]!.fromKm).toBe(0);
      expect(spans.at(-1)!.toKm).toBe(route.lengthKm);
      spans.forEach((s, i) => {
        if (i > 0) expect(s.fromKm).toBe(spans[i - 1]!.toKm);
        expect(s.toKm).toBeGreaterThanOrEqual(s.fromKm);
        if (spans.length > 1) expect(s.toKm - s.fromKm).toBeGreaterThanOrEqual(0.1);
        const neighbour = spans[i + 1];
        if (neighbour) expect(`${neighbour.country}|${neighbour.holidayZone}|${neighbour.timeZone}`).not.toBe(`${s.country}|${s.holidayZone}|${s.timeZone}`);
      });
      // What the store would hand on: one bad span would cost the whole list.
      expect(usableZones(spans)).toEqual(spans);
    }), { seed: 20261103 });
  });
});

describe('outside the first-release countries', () => {
  test('[BND-OUTSIDE] a point in Italy is in no area', () => {
    expect(zoneAt(45.4642, 9.19, file)).toBeNull(); // Milan
    expect(zoneAt(46.0, 11.0, file)).toBeNull(); // Trento's valleys
  });

  test('[BND-OUTSIDE] a route in Italy gives XX with the nearest zone; the screen still shows 112 and the fallback line', () => {
    const route = routeThrough(line([45.4642, 9.19], [45.0703, 7.6869], 100)); // Milan to Turin
    const spans = routeZones(route, file);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ country: 'XX', holidayZone: null });
    expect(spans[0]!.timeZone).toMatch(/^Europe\//);
    expect(usableZones(spans)).toEqual(spans);

    const trip = testTrip({ route: { ...route, stages: [{ day: 1, startKm: 0, endKm: route.lengthKm, ridingHours: 6, ascentM: null }] } });
    const s = screen({
      trip, matches: [], places: [], roofs: [], hours: [], rescuePoints: [], savedKm: [], forecast: null, baseline: null,
      positions: [pos({ km: 40, at: '2026-10-17 14:00' })], dayStarts: [], routeEndDate: null, planTomorrow: null,
      profile: { weightKg: null, thirst: 'average', ebike: false, capacityL: null, k: 1, sumW: 0, kDrink: 0, weighedRides: 0 },
      loadSummary: null, waterLeft: null, settings: { campWaterL: 2, keepFresh: false }, now: new Date('2026-10-17T12:00:00Z'), sun: sun(),
      routeZones: spans, holidays: {}, demo: null,
    });
    expect(s.chips.emergency.numbers).toContain('112');
    expect(s.chips.emergency.detail).toBe(W.emergencyFallback);
  });

  test('[BND-OUTSIDE] a point in no area joins the nearest span within 5 km of route; further in it is XX', () => {
    // From Lörrach over the Swiss border, on to Italy far beyond: Switzerland, then a short way into Italy, then XX.
    const route = routeThrough(line([46.45, 8.75], [45.60, 8.95], 200)); // from Ticino south past the Italian border
    const spans: ZoneSpan[] = routeZones(route, file);
    expect(spans[0]!.country).toBe('CH');
    const out = spans.find((s) => s.country === 'XX');
    expect(out).toBeDefined();
    // The last Swiss point lies inside; the span runs on for at most 5 km beyond it.
    const lastInside = route.points.filter((p) => zoneAt(p.lat, p.lon, file) !== null).at(-1)!;
    expect(out!.fromKm).toBeGreaterThan(lastInside.km);
    expect(out!.fromKm).toBeLessThanOrEqual(lastInside.km + 5.5);
  });

  test('[BND-OUTSIDE] a crossing over water between two zoned shores joins its shores', () => {
    // A ferry over the Fehmarn Belt is further than 5 km from land in the middle: XX there, then Denmark, with both shores right.
    const route = routeThrough(line([54.5023, 11.2276], [54.6566, 11.3519], 100)); // Puttgarden to Rødby
    const spans = routeZones(route, file);
    expect(spans[0]!.country).toBe('DE');
    expect(spans.at(-1)!.country).toBe('DK');
  });
});
