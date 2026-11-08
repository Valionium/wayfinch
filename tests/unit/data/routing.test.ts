// Plan from A to B (spec section 7.1): bike routers only, the full geometry, and place search that sends only its text.
// No test here calls a live router or geocoder: every answer is recorded.
import { describe, expect, test } from 'vitest';
import { buildRoute } from '../../../src/core/route/profile.ts';
import { ROUTERS, planRoute, searchPlace } from '../../../src/data/routing.ts';
import type { Router } from '../../../src/data/routing.ts';
import { routeFromPoints } from '../../../src/ui/trip/read-gpx.ts';

const A = { lat: 49.4, lon: 8.69 };
const B = { lat: 48.58, lon: 7.75 };

/** A bike line from A to B with `n` points (every one different, none on the straight line between the ends). */
const line = (n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return [A.lon + (B.lon - A.lon) * t + Math.sin(i / 7) * 0.01, A.lat + (B.lat - A.lat) * t + Math.cos(i / 9) * 0.01] as [number, number];
  });
const exact = (n: number): [number, number][] => {
  const pts = line(n);
  pts[0] = [A.lon, A.lat];
  pts[n - 1] = [B.lon, B.lat];
  return pts;
};

/** Valhalla's encoded line (precision 6), made here so the recorded answer needs no outside tool. */
function encode(points: [number, number][], precision: number): string {
  const f = 10 ** precision;
  let lat = 0;
  let lon = 0;
  let out = '';
  const put = (v: number): void => {
    let x = v < 0 ? ~(v << 1) : v << 1;
    while (x >= 0x20) { out += String.fromCharCode((0x20 | (x & 0x1f)) + 63); x >>= 5; }
    out += String.fromCharCode(x + 63);
  };
  for (const [lo, la] of points) {
    const nl = Math.round(la * f);
    const no = Math.round(lo * f);
    put(nl - lat);
    put(no - lon);
    lat = nl;
    lon = no;
  }
  return out;
}

const osrmAnswer = (pts: [number, number][]) => ({ code: 'Ok', routes: [{ distance: 160_000, geometry: { type: 'LineString', coordinates: pts } }] });
const valhallaAnswer = (pts: [number, number][]) => ({ trip: { status: 0, summary: { length: 160 }, legs: [{ shape: encode(pts, 6) }] } });
const brouterAnswer = (pts: [number, number][]) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { 'track-length': '160000' }, geometry: { type: 'LineString', coordinates: pts.map(([lo, la], i) => [lo, la, 100 + (i % 50)]) } }] });

type Recorded = { url: string; init?: RequestInit };
function fakeFetch(answers: Record<string, unknown | Error | number>): { fetch: typeof fetch; seen: Recorded[] } {
  const seen: Recorded[] = [];
  const fetchStub = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init });
    const key = Object.keys(answers).find((k) => url.startsWith(k));
    const answer = key === undefined ? 404 : answers[key];
    if (answer instanceof Error) return Promise.reject(answer);
    if (typeof answer === 'number') return Promise.resolve(new Response('no', { status: answer }));
    return Promise.resolve(new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;
  return { fetch: fetchStub, seen };
}

const OSRM = 'https://routing.openstreetmap.de/routed-bike/route/v1/';
const VALHALLA = 'https://valhalla1.openstreetmap.de/route';
const BROUTER = 'https://brouter.de/brouter';

describe('Plan from A to B (spec section 7.1)', () => {
  test('[AB-ROUTERS] the table holds FOSSGIS OSRM bike, Valhalla bicycle and BRouter trekking, each with its terms address and a note', () => {
    expect(ROUTERS.map((r) => r.id)).toEqual(['osrm-bike', 'valhalla-bicycle', 'brouter-trekking']);
    for (const r of ROUTERS) {
      expect(r.terms, r.id).toMatch(/^https:\/\/[a-z0-9.-]+\//);
      expect(r.note.length, r.id).toBeGreaterThan(10);
      expect(r.name.length).toBeGreaterThan(3);
    }
  });

  test('[AB-ROUTERS] each terms address is the one read on 3 November 2026 (policy check): the OSRM about page, the FOSSGIS Valhalla page (the instance address answers 404) and the BRouter home page', () => {
    expect(Object.fromEntries(ROUTERS.map((r) => [r.id, r.terms]))).toEqual({
      'osrm-bike': 'https://routing.openstreetmap.de/about.html',
      'valhalla-bicycle': 'https://valhalla.openstreetmap.de/',
      'brouter-trekking': 'https://brouter.de/',
    });
  });

  test('[AB-ROUTERS] they are tried in turn: the first that answers wins and the rest are never asked', async () => {
    const first = fakeFetch({ [OSRM]: osrmAnswer(exact(40)) });
    const got = await planRoute(A, B, first.fetch);
    expect(Array.isArray(got)).toBe(true);
    expect(first.seen).toHaveLength(1);
    expect(first.seen[0]!.url.startsWith(OSRM)).toBe(true);

    const later = fakeFetch({ [OSRM]: 500, [VALHALLA]: new TypeError('Failed to fetch'), [BROUTER]: brouterAnswer(exact(40)) });
    const third = await planRoute(A, B, later.fetch);
    expect(Array.isArray(third)).toBe(true);
    expect(later.seen.map((s) => s.url.split('?')[0]!.replace(/\/[-\d.,;]+$/, ''))).toEqual([OSRM.replace(/\/$/, '') + '/driving', VALHALLA, BROUTER]);
    expect((third as { ele: number | null }[]).every((p) => p.ele !== null)).toBe(true);

    const second = fakeFetch({ [OSRM]: { code: 'NoRoute' }, [VALHALLA]: valhallaAnswer(exact(40)) });
    const viaValhalla = await planRoute(A, B, second.fetch);
    expect(Array.isArray(viaValhalla)).toBe(true);
    expect(second.seen).toHaveLength(2);
  });

  test('[AB-ROUTERS] only the routers of the table are asked: a router taken out of it (by the policy check) is never contacted', async () => {
    const { fetch: f, seen } = fakeFetch({ [OSRM]: 500, [VALHALLA]: valhallaAnswer(exact(40)), [BROUTER]: brouterAnswer(exact(40)) });
    const allowed: readonly Router[] = ROUTERS.filter((r) => r.id !== 'valhalla-bicycle');
    await planRoute(A, B, f, allowed);
    expect(seen.map((s) => new URL(s.url).host)).toEqual(['routing.openstreetmap.de', 'brouter.de']);
  });

  test('[AB-ROUTERS] only the start and end points are sent: no headers, no cookies, no referrer', async () => {
    const { fetch: f, seen } = fakeFetch({ [OSRM]: 500, [VALHALLA]: 500, [BROUTER]: 500 });
    await planRoute(A, B, f);
    expect(seen).toHaveLength(3);
    for (const s of seen) {
      expect(s.init?.credentials).toBe('omit');
      expect(s.init?.referrerPolicy).toBe('no-referrer');
      expect(s.init?.headers).toBeUndefined();
      expect(s.init?.body).toBeUndefined();
    }
    expect(seen[0]!.url).toBe(`${OSRM}driving/${A.lon},${A.lat};${B.lon},${B.lat}?overview=full&geometries=geojson`);
    expect(decodeURIComponent(seen[1]!.url)).toContain(`"locations":[{"lat":${A.lat},"lon":${A.lon}},{"lat":${B.lat},"lon":${B.lon}}]`);
    expect(seen[2]!.url).toBe(`${BROUTER}?lonlats=${A.lon},${A.lat}|${B.lon},${B.lat}&profile=trekking&alternativeidx=0&format=geojson`);
  });

  test('[AB-NO-CAR] only bike profiles are asked for, and no car, foot or demo router appears anywhere', async () => {
    const { fetch: f, seen } = fakeFetch({ [OSRM]: 500, [VALHALLA]: 500, [BROUTER]: 500 });
    await planRoute(A, B, f);
    const all = seen.map((s) => decodeURIComponent(s.url)).join('\n');
    expect(all).toContain('routed-bike');
    expect(all).toContain('"costing":"bicycle"');
    expect(all).toContain('profile=trekking');
    expect(all).not.toMatch(/routed-foot|routed-car|router\.project-osrm|costing":"(auto|pedestrian)|profile=(car|foot|shortest)/);
    for (const r of ROUTERS) expect(r.profile, r.id).toMatch(/^(routed-bike|bicycle|trekking)$/);
  });

  test('[AB-NO-CAR] an answer that is not a ride is not accepted: a straight line, bad coordinates, a line far from the ends, or too few points', async () => {
    const bad: unknown[] = [
      osrmAnswer([[A.lon, A.lat], [B.lon, B.lat]]), // a straight line between the ends: a drawn estimate, not a ride
      osrmAnswer([[A.lon, A.lat]]),
      osrmAnswer([[A.lon, A.lat], [Number.NaN, 3], [B.lon, B.lat]]),
      osrmAnswer(line(30).map(([lo, la]) => [lo + 1.5, la] as [number, number])), // starts a hundred kilometres from A
      osrmAnswer([[A.lon, 95], [B.lon, B.lat]]),
      { code: 'Ok', routes: [] },
      { code: 'Ok' },
      'text',
      null,
    ];
    for (const answer of bad) {
      const { fetch: f } = fakeFetch({ [OSRM]: answer, [VALHALLA]: 500, [BROUTER]: 500 });
      expect(await planRoute(A, B, f)).toEqual({ none: true });
    }
  });

  test('[AB-FULL-GEOMETRY] every point of the router\'s line is kept, in order, and the line goes through the same buildRoute as a GPX', async () => {
    const pts = exact(3000);
    const { fetch: f } = fakeFetch({ [OSRM]: osrmAnswer(pts) });
    const got = await planRoute(A, B, f);
    expect(Array.isArray(got)).toBe(true);
    const raw = got as { lat: number; lon: number; ele: number | null }[];
    expect(raw).toHaveLength(3000);
    expect(raw.map((p) => [p.lon, p.lat])).toEqual(pts);
    expect(raw.every((p) => p.ele === null)).toBe(true);
    const route = await routeFromPoints(raw, 'A to B');
    const direct = await buildRoute(raw, 'A to B', 'planned');
    expect(route).toEqual(direct);
    expect(route.points).toHaveLength(3000);
    expect(route.source).toBe('planned');
  });

  test('[AB-FULL-GEOMETRY] Valhalla\'s encoded line and BRouter\'s heights come through whole too', async () => {
    const pts = exact(500).map(([lo, la]) => [Math.round(lo * 1e6) / 1e6, Math.round(la * 1e6) / 1e6] as [number, number]);
    const v = await planRoute(A, B, fakeFetch({ [OSRM]: 500, [VALHALLA]: valhallaAnswer(pts) }).fetch);
    expect((v as unknown[]).length).toBe(500);
    const b = (await planRoute(A, B, fakeFetch({ [OSRM]: 500, [VALHALLA]: 500, [BROUTER]: brouterAnswer(pts) }).fetch)) as { ele: number | null }[];
    expect(b).toHaveLength(500);
    expect(b[0]!.ele).toBe(100);
  });

  test('[AB-NONE] when no bike router answers, the answer is "none", and nothing synthetic takes its place', async () => {
    const { fetch: f, seen } = fakeFetch({ [OSRM]: 500, [VALHALLA]: new Error('x'), [BROUTER]: 404 });
    expect(await planRoute(A, B, f)).toEqual({ none: true });
    expect(seen).toHaveLength(3);
    const offline = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    expect(await planRoute(A, B, offline)).toEqual({ none: true });
    expect(await planRoute(A, B, offline, [])).toEqual({ none: true });
  });
});

describe('Place search (spec section 7.1)', () => {
  const METEO = 'https://geocoding-api.open-meteo.com/v1/search';
  const PHOTON = 'https://photon.komoot.io/api/';
  const meteoHits = { results: [{ id: 1, name: 'Heidelberg', admin1: 'Baden-Württemberg', country: 'Germany', country_code: 'DE', latitude: 49.4, longitude: 8.69, feature_code: 'PPL' }] };
  const photonHits = { features: [{ type: 'Feature', properties: { name: 'Bodensee', osm_key: 'natural', osm_value: 'water', osm_type: 'R', osm_id: 5, country: 'Germany', countrycode: 'DE' }, geometry: { type: 'Point', coordinates: [9.3, 47.6] } }] };

  test('[AB-SEARCH] only the search text is sent: a town goes to Open-Meteo with fixed parameters and nothing else', async () => {
    const { fetch: f, seen } = fakeFetch({ [METEO]: meteoHits });
    const hits = await searchPlace('Heidelberg', f);
    expect(hits.map((h) => h.name)).toEqual(['Heidelberg']);
    expect(hits[0]).toMatchObject({ lat: 49.4, lon: 8.69, source: 'geonames' });
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0]!.url);
    expect(url.origin + url.pathname).toBe(METEO);
    expect([...url.searchParams.keys()].sort()).toEqual(['count', 'format', 'language', 'name']);
    expect(url.searchParams.get('name')).toBe('Heidelberg');
    expect(seen[0]!.init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(seen[0]!.init?.headers).toBeUndefined();
  });

  test('[AB-SEARCH] a natural feature asks Photon first, with its fixed filters and the text; each is the fallback of the other', async () => {
    const photonFirst = fakeFetch({ [PHOTON]: photonHits });
    expect((await searchPlace('Bodensee', photonFirst.fetch)).map((h) => [h.name, h.source])).toEqual([['Bodensee', 'osm']]);
    expect(photonFirst.seen).toHaveLength(1);
    const url = new URL(photonFirst.seen[0]!.url);
    expect(url.origin + url.pathname).toBe(PHOTON);
    expect(url.searchParams.get('q')).toBe('Bodensee');
    expect([...new Set(url.searchParams.keys())].sort()).toEqual(['lang', 'limit', 'osm_tag', 'q']);

    const meteoFails = fakeFetch({ [METEO]: 503, [PHOTON]: photonHits });
    expect((await searchPlace('Heidelberg', meteoFails.fetch)).map((h) => h.name)).toEqual(['Bodensee']);
    expect(meteoFails.seen.map((s) => new URL(s.url).host)).toEqual(['geocoding-api.open-meteo.com', 'photon.komoot.io']);

    const photonEmpty = fakeFetch({ [PHOTON]: { features: [] }, [METEO]: meteoHits });
    expect((await searchPlace('Lake Heidelberg', photonEmpty.fetch)).map((h) => h.name)).toEqual(['Heidelberg']);
    expect(photonEmpty.seen.map((s) => new URL(s.url).host)).toEqual(['photon.komoot.io', 'geocoding-api.open-meteo.com']);
  });

  test('[AB-SEARCH] nothing found is an empty list; both services failing is an error, not "nothing found"; too short or too long text sends nothing', async () => {
    expect(await searchPlace('Nowhereville', fakeFetch({ [METEO]: { results: [] }, [PHOTON]: { features: [] } }).fetch)).toEqual([]);
    await expect(searchPlace('Heidelberg', fakeFetch({ [METEO]: 500, [PHOTON]: new Error('x') }).fetch)).rejects.toThrow();
    const none = fakeFetch({});
    expect(await searchPlace('H', none.fetch)).toEqual([]);
    expect(await searchPlace('x'.repeat(201), none.fetch)).toEqual([]);
    expect(none.seen).toHaveLength(0);
  });

  test('[AB-SEARCH] answers with bad coordinates or no name are dropped, and at most eight places come back', async () => {
    const many = { results: Array.from({ length: 12 }, (_, i) => ({ id: i, name: `Town ${i}`, latitude: 40 + i * 0.01, longitude: 8, country_code: 'DE' })) };
    const withBad = { results: [{ id: 99, name: 'Bad', latitude: 91, longitude: 8 }, { id: 98, latitude: 40, longitude: 8 }, ...many.results] };
    const hits = await searchPlace('Town', fakeFetch({ [METEO]: withBad }).fetch);
    expect(hits).toHaveLength(8);
    expect(hits.every((h) => h.name.startsWith('Town'))).toBe(true);
  });
});
