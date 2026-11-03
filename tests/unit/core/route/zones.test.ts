import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { haversineKm } from '../../../../src/core/geo/haversine.ts';
import { pointAtRouteKm } from '../../../../src/core/geo/project.ts';
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
    expect(file.areas.at(-1)!.country).toBe('XX'); // the outside comes last
    for (const a of file.areas.slice(0, -1)) {
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
    spans.forEach((s, i) => { if (i > 0) expect(`${s.country}|${s.holidayZone}`).not.toBe(`${spans[i - 1]!.country}|${spans[i - 1]!.holidayZone}`); });
  });

  // What lies under the line, looked at every 20 m, in order.
  function underLine(a: [number, number], b: [number, number]): { country: string; fromKm: number; toKm: number }[] {
    const route = routeThrough([a, b]);
    const steps = Math.ceil(route.lengthKm / 0.02);
    const runs: { country: string; fromKm: number; toKm: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const country = zoneAt(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, file)?.country ?? 'XX';
      const km = route.lengthKm * f;
      const last = runs.at(-1);
      if (last?.country === country) last.toKm = km;
      else runs.push({ country, fromKm: km, toKm: km });
    }
    return runs;
  }
  const legs: [string, [number, number], [number, number]][] = [
    ['Weil am Rhein to Konstanz, over the Swiss bends of the Rhine', [47.5947, 7.6208], [47.6633, 9.1753]],
    ['Frankfurt (Oder) over the Oder to Słubice and on', [52.34, 14.5], [52.36, 14.65]],
    ['Aachen to Maastricht', [50.7753, 6.0839], [50.8514, 5.691]],
    ['Saarbrücken to Luxembourg', [49.2402, 6.9969], [49.6116, 6.1319]],
  ];
  test.each(legs)('[BND-BORDER] one long leg, %s: the spans follow what lies under it, cut within 60 m', (_name, a, b) => {
    const truth = underLine(a, b);
    const spans = routeZones(routeThrough([a, b]), file);
    const at = (km: number): string => spans.find((s) => km >= s.fromKm && km <= s.toKm)!.country;
    let looked = 0;
    // Every stretch of 250 m or more is there, all but its last 60 m at each end; shorter ones may go to a neighbour.
    for (const run of truth.filter((r) => r.toKm - r.fromKm >= 0.25)) {
      for (let km = run.fromKm + 0.06; km <= run.toKm - 0.06; km += 0.05) {
        expect(at(km), `km ${km.toFixed(2)}`).toBe(run.country);
        looked++;
      }
    }
    expect(looked).toBeGreaterThan(100);
    expect(new Set(truth.map((r) => r.country)).size).toBeGreaterThan(1);
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

  /** The km along a route where the country under it changes, looked at every 10 m. */
  function crossings(route: Route): { km: number; country: string }[] {
    const out: { km: number; country: string }[] = [];
    route.points.forEach((p, i) => {
      const next = route.points[i + 1];
      if (!next) return;
      const steps = Math.max(1, Math.ceil((next.km - p.km) / 0.01));
      for (let s = 0; s < steps; s++) {
        const f = s / steps;
        const country = zoneAt(p.lat + (next.lat - p.lat) * f, p.lon + (next.lon - p.lon) * f, file)?.country ?? 'XX';
        if (out.at(-1)?.country !== country) out.push({ km: p.km + (next.km - p.km) * f, country });
      }
    });
    return out;
  }
  const emergencyAt = (route: Route, spans: ZoneSpan[], km: number) => {
    const trip = testTrip({ route: { ...route, stages: [{ day: 1, startKm: 0, endKm: route.lengthKm, ridingHours: 6, ascentM: null }] } });
    const p = pointAtRouteKm(route, km);
    const position = { lat: p.lat, lon: p.lon, accuracyM: 10, at: new Date('2026-10-17T12:00:00Z'), km, offRouteM: 0, source: 'gps' as const, approximate: false };
    return screen({
      trip, matches: [], places: [], roofs: [], hours: [], rescuePoints: [], savedKm: [], forecast: null, baseline: null,
      positions: [position], dayStarts: [], routeEndDate: null, planTomorrow: null,
      profile: { weightKg: null, thirst: 'average', ebike: false, capacityL: null, k: 1, sumW: 0, kDrink: 0, weighedRides: 0 },
      loadSummary: null, waterLeft: null, settings: { campWaterL: 2, keepFresh: false }, now: new Date('2026-10-17T12:00:00Z'), sun: sun(),
      routeZones: spans, holidays: {}, demo: null,
    }).chips.emergency;
  };

  test('[BND-OUTSIDE] over the Brenner: Italy begins where the border lies, never joined to Austria; 3 km in, 112 and the fallback line only', () => {
    const route = routeThrough([[47.2692, 11.4041], [47.10, 11.46], [47.002, 11.507], [46.95, 11.47], [46.893, 11.43]]);
    const spans = routeZones(route, file);
    expect(spans.map((s) => s.country)).toEqual(['AT', 'XX']);
    const border = crossings(route).find((c) => c.country === 'XX')!.km;
    expect(Math.abs(spans[1]!.fromKm - border)).toBeLessThan(0.06);
    const e = emergencyAt(route, spans, border + 3);
    expect(e.numbers).toEqual(['112']);
    expect(e.detail).toBe(W.emergencyFallback);
    const before = emergencyAt(route, spans, border - 3);
    expect(before.numbers).toContain('140');
  });

  test('[BND-OUTSIDE] through Liechtenstein: Feldkirch, Vaduz, Sargans: Liechtenstein reads XX, each stretch cut where its border lies', () => {
    expect(zoneAt(47.141, 9.521, file)).toBeNull(); // Vaduz
    const route = routeThrough([[47.237, 9.598], [47.20, 9.53], [47.141, 9.521], [47.08, 9.50], [47.04, 9.44]]);
    const spans = routeZones(route, file);
    // The line clips Liechtenstein's southern tip again by Balzers: the spans follow what lies under it.
    const truth = crossings(route);
    expect(spans.map((s) => s.country)).toEqual(truth.map((c) => c.country));
    expect(truth.map((c) => c.country).slice(0, 3)).toEqual(['AT', 'XX', 'CH']);
    spans.forEach((s, i) => { if (i > 0) expect(Math.abs(s.fromKm - truth[i]!.km)).toBeLessThan(0.06); });
    expect(emergencyAt(route, spans, (spans[1]!.fromKm + spans[1]!.toKm) / 2).numbers).toEqual(['112']);
  });

  test('[BND-OUTSIDE] from Ticino into Italy: XX from the border on, not 5 km later', () => {
    const route = routeThrough(line([46.45, 8.75], [45.60, 8.95], 200));
    const spans = routeZones(route, file);
    expect(spans[0]!.country).toBe('CH');
    const border = crossings(route).find((c) => c.country === 'XX')!.km;
    expect(Math.abs(spans.find((s) => s.country === 'XX')!.fromKm - border)).toBeLessThan(0.06);
  });

  test('[BND-OUTSIDE] a gap in the shapes still joins the nearest zone within 5 km; the outside area never does', () => {
    // A small file of its own: Germany in two pieces with a 3 km gap, the outside after a 3 km gap on the far side.
    const sq = (w: number, e: number): number[][] => [[w, 48], [e, 48], [e, 48.1], [w, 48.1]];
    const de = { country: 'DE', holidayZone: 'DE-BW', timeZone: 'Europe/Berlin' };
    const own: BoundaryFile = { v: 1, source: 'test', areas: [
      { ...de, rings: [sq(8, 8.2)] }, { ...de, rings: [sq(8.24, 8.4)] },
      { country: 'XX', holidayZone: 'XX', timeZone: 'UTC', rings: [sq(8.44, 9)] },
    ] };
    const across = routeZones(routeThrough(line([48.05, 8.1], [48.05, 8.35], 100)), own);
    expect(across.map((s) => s.country)).toEqual(['DE']);
    const out = routeThrough(line([48.05, 8.3], [48.05, 8.6], 120));
    const spans = routeZones(out, own);
    expect(spans.map((s) => s.country)).toEqual(['DE', 'XX']);
    // The gap before the outside goes to the outside, the careful side, from the middle of the gap or nearer.
    const gapStart = out.points.find((p) => p.lon > 8.4)!.km;
    expect(spans[1]!.fromKm).toBeLessThanOrEqual(gapStart + 1.6);
    expect(zoneAt(48.05, 8.5, own)).toBeNull();
    expect(spans[1]!.timeZone).toBe('Europe/Berlin');
  });

  test('[BND-OUTSIDE] a crossing over water between two zoned shores joins its shores', () => {
    // A ferry over the Fehmarn Belt is further than 5 km from land in the middle: XX there, then Denmark, with both shores right.
    const route = routeThrough(line([54.5023, 11.2276], [54.6566, 11.3519], 100)); // Puttgarden to Rødby
    const spans = routeZones(route, file);
    expect(spans[0]!.country).toBe('DE');
    expect(spans.at(-1)!.country).toBe('DK');
  });
});
