// On a stub fetch; the answer's shape was checked against a real Overpass answer, kept in tests/fixtures/overpass/.
import { createReadStream, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';
import { BoundaryIndex } from '../../../pipeline/boundaries.ts';
import type { BoundaryFeature, Ring } from '../../../pipeline/boundaries.ts';
import { classifyCountry } from '../../../pipeline/classify-country.ts';
import { COUNTRY_JOBS } from '../../../pipeline/config.ts';
import { placeFilterArgs } from '../../../pipeline/filters.ts';
import { readObjects } from '../../../pipeline/read-geojson.ts';
import { makeZoneOf } from '../../../pipeline/zones.ts';
import { kindOf } from '../../../src/core/places/classify.ts';
import { PLACE_FILTERS } from '../../../src/core/places/filters.ts';
import type { OsmObject, Place } from '../../../src/core/places/types.ts';
import { radiusKmFor } from '../../../src/core/route/matches.ts';
import { screen } from '../../../src/core/screen/screen.ts';
import type { Route } from '../../../src/core/types.ts';
import { W } from '../../../src/core/wording/en.ts';
import { classifyElements, MAX_STRETCH_KM, objectFromElement, OVERPASS_URL, radiusFor, refreshStretch, simplifyLine, stretchLine, stretchQuery, zoneFromBoundary } from '../../../src/data/overpass.ts';
import type { OverpassElement, StretchDeps } from '../../../src/data/overpass.ts';
import { openDb } from '../../../src/store/db.ts';
import { readInputs, SAVED_KM_META, ZONES_META } from '../../../src/store/inputs.ts';
import { mergeRanges, STRETCHES_META, stretchStore } from '../../../src/store/stretch.ts';
import { replaceRoute, saveTrip } from '../../../src/store/trip.ts';
import { at, flatRoute, pointAtKm, testTrip, zonesOf } from '../../fixtures/build.ts';
import { json, stubFetch } from '../../fixtures/openmeteo.ts';
import type { Stub } from '../../fixtures/openmeteo.ts';
import { freshStore } from '../store/helpers.ts';

const NOW = at('2026-10-16 18:00');
const IN_DE = (): { country: string; holidayZone: string; timeZone: string } => ({ country: 'DE', holidayZone: 'DE-BW', timeZone: 'Europe/Berlin' });
const trip = () => testTrip();
const queryOf = (body: unknown): string => decodeURIComponent(String(body).replace(/^data=/, ''));
const coordsOf = (query: string): string[] => [...query.matchAll(/around:\d+,([^)]+)\)/g)].map((m) => m[1]!);

const shopAt = (id: number, km: number, tags: Record<string, string> = { shop: 'bakery', name: 'Backstube', opening_hours: 'Mo-Sa 07:00-18:00' }): OverpassElement => ({ type: 'node', id, ...pointAtKm(km), tags });
const answer = (elements: OverpassElement[] = [shopAt(1, 60)]): Response => json({ version: 0.6, generator: 'Overpass API', osm3s: { timestamp_osm_base: '2026-11-03T00:00:00Z', copyright: 'x' }, elements });

const deps = (f: Stub, over: Partial<StretchDeps> = {}): StretchDeps & { sleeps: number[]; notices: string[] } => {
  const sleeps: number[] = [];
  const notices: string[] = [];
  return {
    askNotice: async (n: string) => { notices.push(n); return true; }, fetch: f, now: () => NOW,
    sleep: async (ms: number) => { sleeps.push(ms); }, store: stretchStore, zoneAt: IN_DE, drinkPlaces: true, sleeps, notices, ...over,
  };
};

const prepared = async (): Promise<void> => {
  await saveTrip(trip());
  await (await openDb()).put('meta', zonesOf(300), ZONES_META);
};

beforeEach(freshStore);

describe('the notice', () => {
  test('[RFS-NOTICE] nothing is sent before the rider says yes; a no sends nothing at all', async () => {
    await prepared();
    const f = stubFetch(() => answer());
    let sentBeforeAnswer = -1;
    const yes = deps(f, { askNotice: async () => { sentBeforeAnswer = f.urls.length; return true; } });
    await refreshStretch(50, 70, yes);
    expect(sentBeforeAnswer).toBe(0);
    expect(f.urls).toHaveLength(1);

    const g = stubFetch(() => answer());
    expect((await refreshStretch(50, 70, deps(g, { askNotice: async () => false }))).status).toBe('declined');
    expect((await refreshStretch(50, 70, deps(g, { askNotice: async () => { throw new Error('closed'); } }))).status).toBe('declined');
    expect(g.urls).toEqual([]);
  });

  test('[RFS-NOTICE] the notice says the outline goes to the Overpass service', async () => {
    await prepared();
    const d = deps(stubFetch(() => answer()));
    await refreshStretch(50, 70, d);
    expect(d.notices).toEqual([W.appStretchNotice]);
    expect(W.appStretchNotice).toContain('Overpass');
    expect(W.appStretchNotice).toContain('outline');
  });

  test('[RFS-NOTICE] with no route no notice is shown and nothing is sent', async () => {
    const f = stubFetch(() => answer());
    const d = deps(f);
    expect((await refreshStretch(0, 10, d)).status).toBe('nothing');
    expect(d.notices).toEqual([]);
    expect(f.urls).toEqual([]);
  });
});

describe('the limits', () => {
  test('[RFS-LIMITS] at most 50 km go, also when more is asked for, and only the stretch: nothing beyond it', async () => {
    await prepared();
    const f = stubFetch(() => answer());
    const out = await refreshStretch(60, 300, deps(f));
    expect(MAX_STRETCH_KM).toBe(50);
    expect(out.saved).toEqual([{ fromKm: 60, toKm: 110 }]);
    const stops = coordsOf(queryOf(f.inits[0]!.body))[0]!.split(',').map(Number);
    const lats = stops.filter((_, i) => i % 2 === 0);
    expect(Math.min(...lats)).toBeCloseTo(pointAtKm(60).lat, 3);
    expect(Math.max(...lats)).toBeCloseTo(pointAtKm(110).lat, 3);
  });

  test('[RFS-LIMITS] 100 m tolerance: a straight line is two points, a wiggle of 150 m stays and one of 50 m goes', () => {
    const north = (km: number, offM = 0): { lat: number; lon: number } => pointAtKm(km, offM);
    expect(simplifyLine([north(0), north(1), north(2), north(3)], 100)).toHaveLength(2);
    expect(simplifyLine([north(0), north(1, 150), north(2)], 100)).toHaveLength(3);
    expect(simplifyLine([north(0), north(1, 50), north(2)], 100)).toHaveLength(2);
  });

  test('[RFS-LIMITS] the outline has 4 decimals, and is simplified', () => {
    const route = flatRoute(50);
    const line = stretchLine(route, 10, 40);
    expect(line).toHaveLength(2); // the built route runs straight north
    for (const stop of line) for (const n of stop.split(',')) expect(n).toMatch(/^-?\d+\.\d{4}$/);
    expect(stretchQuery(line)).toContain(`,${line.join(',')})`);
  });

  test('[RFS-LIMITS] the outline that leaves the phone is the line simplified at 100 m', () => {
    const route = flatRoute(50);
    const bent = (offM: number): Route => ({ ...route, points: route.points.map((p) => (p.km === 25 ? { ...p, ...pointAtKm(25, offM) } : p)) });
    expect(stretchLine(bent(50), 10, 40)).toHaveLength(2);
    expect(stretchLine(bent(150), 10, 40).length).toBeGreaterThan(2);
  });

  test('[RFS-LIMITS] every tag set of the pipeline is asked for, each at least as far as its kind counts', () => {
    const query = stretchQuery(['49.0000,8.4000', '49.1000,8.4000']);
    expect(placeFilterArgs().length).toBe(PLACE_FILTERS.length);
    for (const { key, values } of PLACE_FILTERS) {
      for (const value of values) {
        const km = radiusFor(key, value);
        const statement = [...query.matchAll(new RegExp(`nwr\\["${key}"~"\\^\\(([^)]*)\\)\\$"\\]\\(around:(\\d+),`, 'g'))].find((m) => m[1]!.split('|').includes(value));
        expect(statement, `${key}=${value}`).toBeDefined();
        expect(Number(statement![2])).toBe(km * 1000);
        const kind = kindOf({ [key]: value }, { drinkPlaces: true, settlementAltNames: false });
        if (kind) expect(km).toBeGreaterThanOrEqual(radiusKmFor({ kind } as Place));
      }
    }
    expect(query).toContain('out geom');
    expect(query.startsWith('[out:json]')).toBe(true);
  });

  test('[RFS-LIMITS] one request at a time: a second call while one runs sends nothing, and the first finishes', async () => {
    await prepared();
    let inFlight = 0;
    let most = 0;
    const f = stubFetch(async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((r) => { setTimeout(r, 5); });
      inFlight--;
      return answer();
    });
    const [a, b] = await Promise.all([refreshStretch(50, 70, deps(f)), refreshStretch(70, 90, deps(f))]);
    expect(most).toBe(1);
    expect(a.status).toBe('saved');
    expect(b.status).toBe('busy');
    expect(f.urls).toHaveLength(1);
    expect((await refreshStretch(70, 90, deps(f))).status).toBe('saved'); // and it's free again after
  });

  test('[RFS-LIMITS] a 429 waits at least 30 s, or as long as the service says, and tries again', async () => {
    await prepared();
    let n = 0;
    const f = stubFetch(() => {
      n++;
      if (n === 1) return json({}, 429);
      if (n === 2) return new Response('{}', { status: 429, headers: { 'retry-after': '60' } });
      return answer();
    });
    const d = deps(f);
    expect((await refreshStretch(50, 70, d)).status).toBe('saved');
    expect(d.sleeps).toEqual([30_000, 60_000]);
    expect(f.urls).toHaveLength(3);
  });

  test('[RFS-LIMITS] a service that keeps saying 429 is left alone after a few tries; the stretch is reported as failed', async () => {
    await prepared();
    const f = stubFetch(() => json({}, 429));
    const out = await refreshStretch(50, 70, deps(f));
    expect(out.status).toBe('failed');
    expect(f.urls.length).toBeLessThanOrEqual(3);
    expect(out.say).toContain('km 50');
  });

  test('[RFS-LIMITS] a server error backs off and halves the stretch', async () => {
    await prepared();
    let n = 0;
    const f = stubFetch(() => (++n === 1 ? json({}, 504) : answer()));
    const d = deps(f);
    const out = await refreshStretch(50, 90, d);
    expect(d.sleeps[0]).toBeGreaterThanOrEqual(1000);
    expect(out.saved).toEqual([{ fromKm: 50, toKm: 70 }, { fromKm: 70, toKm: 90 }]);
    expect(out.status).toBe('saved');
    expect(f.urls).toHaveLength(3);
  });

  test('[RFS-LIMITS] a service that keeps failing is asked a bounded number of times, with longer waits', async () => {
    await prepared();
    const f = stubFetch(() => json({}, 500));
    const d = deps(f);
    const out = await refreshStretch(50, 100, d);
    expect(out.status).toBe('failed');
    expect(f.urls.length).toBeLessThanOrEqual(10);
    expect(d.sleeps[1]).toBeGreaterThan(d.sleeps[0]!);
    expect((await readInputs(NOW))!.savedKm).toEqual([]);
  });

  test('[RFS-LIMITS] a "runtime error" inside a 200 answer is a failure: its partial elements are not stored', async () => {
    await prepared();
    let n = 0;
    const f = stubFetch(() => (++n === 1 ? json({ elements: [shopAt(9, 60)], remark: 'runtime error: Query timed out in "query" at line 1 after 91 seconds.' }) : answer([shopAt(1, 65)])));
    const out = await refreshStretch(50, 70, deps(f));
    expect(out.saved).toEqual([{ fromKm: 50, toKm: 60 }, { fromKm: 60, toKm: 70 }]); // halved, and the halves answered
    expect((await readInputs(NOW))!.places.map((p) => p.id)).toEqual(['n1']);
  });

  test('[RFS-LIMITS] an answer with nothing in it is not believed: asked once more, then the stretch is not recorded as having place data', async () => {
    await prepared();
    const f = stubFetch(() => answer([]));
    const d = deps(f);
    const out = await refreshStretch(50, 70, d);
    expect(out.status).toBe('failed');
    expect(f.urls).toHaveLength(2);
    expect(d.sleeps).toHaveLength(1);
    expect((await readInputs(NOW))!.savedKm).toEqual([]);
    const answers = [answer([]), answer()];
    const g = stubFetch(() => answers.shift()!);
    expect((await refreshStretch(50, 70, deps(g))).status).toBe('saved');
  });

  test('[RFS-LIMITS] a busy page in HTML is a failure too; a 400 is not tried again', async () => {
    await prepared();
    const html = stubFetch(() => new Response('<html>busy</html>', { status: 200 }));
    expect((await refreshStretch(50, 60, deps(html))).status).toBe('failed');
    const bad = stubFetch(() => json({}, 400));
    expect((await refreshStretch(50, 90, deps(bad))).status).toBe('failed');
    expect(bad.urls).toHaveLength(1);
  });

  test('[RFS-LIMITS] one half failing keeps the other: partial, saying which kilometres', async () => {
    await prepared();
    const answers = [json({}, 500), json({}, 400), answer()];
    const f = stubFetch(() => answers.shift()!);
    const out = await refreshStretch(50, 90, deps(f));
    expect(out.status).toBe('partial');
    expect(out.saved).toEqual([{ fromKm: 70, toKm: 90 }]);
    expect(out.failed[0]).toMatchObject({ fromKm: 50, toKm: 70 });
    expect((await readInputs(NOW))!.savedKm).toEqual([{ fromKm: 70, toKm: 90 }]);
    expect(out.say).toContain('70');
  });

  test('[RFS-LIMITS] the request goes by POST to the one service, with no credentials and no cached copy', async () => {
    await prepared();
    const f = stubFetch(() => answer());
    await refreshStretch(50, 70, deps(f));
    expect(f.urls[0]).toBe(OVERPASS_URL);
    expect(f.inits[0]).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store' });
  });
});

describe('one code path', () => {
  const square = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const boundaries: BoundaryFeature[] = [
    { id: 'r1', tags: { admin_level: '2', 'ISO3166-1': 'DE' }, rings: [square(8, 49, 9.5, 50)] },
    { id: 'r2', tags: { admin_level: '4', 'ISO3166-2': 'DE-BW' }, rings: [square(8, 49, 9.5, 50)] },
  ];
  const zoneOf = makeZoneOf(COUNTRY_JOBS.DE, 'DE', new BoundaryIndex(boundaries, 0.1));
  const options = { drinkPlaces: true, settlementAltNames: false };
  const MINI = new URL('../../fixtures/osm/mini.geojsonseq', import.meta.url);

  const asElement = (o: OsmObject): OverpassElement => {
    const n = Number(o.id.slice(1));
    const c = ([lat, lon]: [number, number]): { lat: number; lon: number } => ({ lat, lon });
    if (o.id.startsWith('n')) return { type: 'node', id: n, lat: o.points[0]![0], lon: o.points[0]![1], tags: o.tags };
    if (o.id.startsWith('w')) return { type: 'way', id: n, tags: o.tags, geometry: (o.polygon?.[0] ?? o.points).map(c) };
    return { type: 'relation', id: n, tags: o.tags, members: (o.polygon ?? []).map((ring) => ({ type: 'way', role: 'outer', geometry: ring.map(c) })) };
  };

  test('[RFS-SHARED] the same objects give what the pipeline gives: every field but the source', async () => {
    const objects: OsmObject[] = [];
    for await (const o of readObjects(createReadStream(MINI))) objects.push(o);
    expect(objects.length).toBeGreaterThan(5);
    const pipeline = await classifyCountry(readObjects(createReadStream(MINI)), zoneOf, 'DE', '2026-10-27', { builtOn: '2026-10-28', ...options });
    const phone = classifyElements(objects.map(asElement), zoneOf, '2026-10-27', options);
    expect(pipeline.places.length).toBeGreaterThan(3);
    expect(phone.places.every((p) => p.source === 'overpass')).toBe(true);
    expect(phone.places.map((p) => ({ ...p, source: 'pack' }))).toEqual(pipeline.places);
    expect(phone.roofs).toEqual(pipeline.roofs);
    expect(phone.rescuePoints).toEqual(pipeline.rescuePoints);
  });

  test('[RFS-SHARED] the source has one classifier: neither the phone nor the pipeline has its own', () => {
    const text = (rel: string): string => readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8');
    expect(text('pipeline/classify-country.ts')).toContain('classifyAll');
    expect(text('src/data/overpass.ts')).toContain('classifyAll');
    expect(text('pipeline/classify-country.ts')).not.toContain('classifyObject');
    expect(text('src/data/overpass.ts')).not.toContain('classifyObject');
  });

  test('[RFS-SHARED] a real Overpass answer reads: nodes, closed ways as polygons, open ways as lines, relations from their rings', () => {
    const real = JSON.parse(readFileSync(new URL('../../fixtures/overpass/around-short-line.json', import.meta.url), 'utf8')) as { elements: OverpassElement[] };
    expect(real.elements.length).toBeGreaterThan(0);
    const objects = real.elements.map(objectFromElement);
    expect(objects.every((o) => o !== null)).toBe(true);
    expect(real.elements.some((e) => e.type === 'node')).toBe(true);
    expect(real.elements.some((e) => e.type === 'way')).toBe(true);
    const out = classifyElements(real.elements, zoneOf, '2026-11-03', options);
    expect(out.places.length).toBeGreaterThan(0);
    for (const p of out.places) expect(p.id).toMatch(/^[nwr]\d+$/);
  });

  test('[RFS-SHARED] a relation joins its member ways end to end into a ring, and a cemetery made so holds its tap', () => {
    const cemetery: OverpassElement = {
      type: 'relation', id: 7, tags: { type: 'multipolygon', landuse: 'cemetery' },
      members: [
        { type: 'way', role: 'outer', geometry: [{ lat: 49.5, lon: 8.5 }, { lat: 49.5, lon: 8.6 }] },
        { type: 'way', role: 'outer', geometry: [{ lat: 49.6, lon: 8.6 }, { lat: 49.5, lon: 8.6 }] }, // this one runs the other way
        { type: 'way', role: 'outer', geometry: [{ lat: 49.6, lon: 8.6 }, { lat: 49.6, lon: 8.5 }, { lat: 49.5, lon: 8.5 }] },
      ],
    };
    const object = objectFromElement(cemetery)!;
    expect(object.id).toBe('r7');
    expect(object.polygon).toHaveLength(1);
    expect(object.polygon![0]).toHaveLength(5);
    const tap: OverpassElement = { type: 'node', id: 8, lat: 49.55, lon: 8.55, tags: { man_made: 'water_tap' } };
    const inside = classifyElements([cemetery, tap], zoneOf, '2026-11-03', options).places.find((p) => p.id === 'n8');
    const outside = classifyElements([tap], zoneOf, '2026-11-03', options).places.find((p) => p.id === 'n8');
    expect(inside!.waterClass).not.toBe(outside!.waterClass); // the containment rule applied
  });

  test('[RFS-SHARED] a ring that never closes is no area', () => {
    expect(objectFromElement({ type: 'relation', id: 1, tags: {}, members: [{ type: 'way', role: 'outer', geometry: [{ lat: 1, lon: 1 }, { lat: 1, lon: 2 }, { lat: 2, lon: 2 }, { lat: 3, lon: 3 }] }] })).toBeNull();
  });

  test.each([
    [{ country: 'DE', holidayZone: 'DE-BW', timeZone: 'Europe/Berlin' }, 'DE-BW', 'DE-BW', 'DE-BW'],
    [{ country: 'DE', holidayZone: 'DE-BY-Augsburg', timeZone: 'Europe/Berlin' }, 'DE-BY', 'DE-BY', 'DE-BY-Augsburg'],
    [{ country: 'FR', holidayZone: 'FR-67', timeZone: 'Europe/Paris' }, 'FR-67', 'FR-67', 'FR-67'],
    [{ country: 'PL', holidayZone: 'PL', timeZone: 'Europe/Warsaw' }, null, null, 'PL'],
    [{ country: 'XX', holidayZone: null, timeZone: 'Europe/Rome' }, null, null, 'XX'],
  ])('[RFS-SHARED] the boundary file\'s zone reads as the pipeline writes it: %j', (z, subdivision, key, holidayZone) => {
    expect(zoneFromBoundary(z)).toEqual({ country: z.country, subdivision, hoursRegionKey: key, holidayZone, timeZone: z.timeZone });
  });
});

describe('the record', () => {
  test('[RFS-RECORD] the stretch and its date are stored, savedKm grows, and a route replace takes them away', async () => {
    await prepared();
    await (await openDb()).put('meta', [{ fromKm: 0, toKm: 50 }, { fromKm: 200, toKm: 300 }], SAVED_KM_META);
    const out = await refreshStretch(50, 70, deps(stubFetch(() => answer())));
    expect(out.status).toBe('saved');
    expect(out.say).toBe(W.appStretchSaved('50', '70', 1));
    const db = await openDb();
    expect(await db.get('meta', STRETCHES_META)).toEqual([{ fromKm: 50, toKm: 70, date: '2026-10-16' }]);
    expect((await readInputs(NOW))!.savedKm).toEqual([{ fromKm: 0, toKm: 70 }, { fromKm: 200, toKm: 300 }]);
    await replaceRoute({ ...flatRoute(50), id: 'second' });
    expect(await db.get('meta', STRETCHES_META)).toBeUndefined();
    expect(await db.get('meta', SAVED_KM_META)).toBeUndefined();
  });

  test('[RFS-RECORD] hours are worked out on the phone, across the trip window, for the place and its kitchen', async () => {
    await prepared();
    const elements = [shopAt(1, 60), shopAt(2, 62, { amenity: 'restaurant', name: 'Linde', opening_hours: 'Mo-Su 10:00-22:00', 'opening_hours:kitchen': 'Mo-Su 12:00-14:00' })];
    await refreshStretch(50, 70, deps(stubFetch(() => answer(elements))));
    const inputs = (await readInputs(NOW))!;
    const shop = inputs.hours.find((h) => h.placeId === 'n1')!;
    expect(shop.windowStart).toEqual(at('2026-10-17 00:00')); // the departure, as the trip has not begun
    expect(shop.windowEnd).toEqual(at('2026-10-21 00:00')); // the day after the plan's last, Tue 20 Oct
    expect(shop.spans[0]!.from).toEqual(shop.windowStart);
    expect(shop.spans[shop.spans.length - 1]!.to).toEqual(shop.windowEnd);
    expect(shop.spans.some((s) => s.state === 'open' && s.from.getTime() === at('2026-10-17 07:00').getTime())).toBe(true);
    expect(inputs.hours.some((h) => h.placeId === 'n2:kitchen')).toBe(true);
    expect(inputs.places.find((p) => p.id === 'n1')).toMatchObject({ source: 'overpass', dataDate: '2026-10-16', country: 'DE', holidayZone: 'DE-BW' });
    expect(inputs.matches.find((m) => m.placeId === 'n1')!.km).toBeCloseTo(60, 3);
    expect(inputs.holidays['DE-BW']).toBeDefined();
  });

  test('[RFS-RECORD] a place also in the pack keeps the pack\'s zones, and takes the new tags', async () => {
    await prepared();
    const pack = { id: 'n1', kind: 'shop', name: 'Old', lat: pointAtKm(60).lat, lon: pointAtKm(60).lon, waterClass: null, indoorOrLimited: false, openingHours: null, seasonal: null, checkDate: null,
      country: 'DE', subdivision: 'DE-BY', hoursRegionKey: 'DE-BY', holidayZone: 'DE-BY-Augsburg', timeZone: 'Europe/Berlin', tags: {}, source: 'pack', dataDate: '2026-10-01', stop: null, platformRoof: null, contact: null };
    await (await openDb()).put('places', pack);
    await (await openDb()).add('matches', { placeId: 'n1', km: 60, offRouteM: 0 });
    await refreshStretch(50, 70, deps(stubFetch(() => answer())));
    const inputs = (await readInputs(NOW))!;
    expect(inputs.places.find((p) => p.id === 'n1')).toMatchObject({ name: 'Backstube', source: 'overpass', subdivision: 'DE-BY', hoursRegionKey: 'DE-BY', holidayZone: 'DE-BY-Augsburg' });
    expect(inputs.matches.filter((m) => m.placeId === 'n1')).toHaveLength(1); // not doubled
  });

  test('[RFS-RECORD] outside the first countries a place is kept, with the route\'s zone and no country, and a local number cannot break it', async () => {
    await prepared();
    const f = stubFetch(() => answer([shopAt(1, 60, { tourism: 'hotel', name: 'Alba', phone: '0123 456' })]));
    const out = await refreshStretch(50, 70, deps(f, { zoneAt: () => null }));
    expect(out.status).toBe('saved');
    const inputs = (await readInputs(NOW))!;
    expect(inputs.places[0]).toMatchObject({ country: 'XX', timeZone: 'Europe/Berlin', subdivision: null });
    expect(screen(inputs)).toBeDefined();
  });

  test('[RFS-RECORD] a place out of its radius is not kept; roofs and rescue points are, once, however often the stretch is refreshed', async () => {
    await prepared();
    const far: OverpassElement = { type: 'node', id: 5, ...pointAtKm(60, 2000), tags: { shop: 'bakery', name: 'Far' } }; // 2 km off; shops count to 1 km
    const stop: OverpassElement = { type: 'node', id: 6, ...pointAtKm(61, 20), tags: { highway: 'bus_stop', shelter: 'yes', bench: 'yes' } };
    const rescue: OverpassElement = { type: 'node', id: 7, ...pointAtKm(62, 20), tags: { highway: 'emergency_access_point', ref: 'BW-1' } };
    const list = [far, stop, rescue];
    await refreshStretch(50, 70, deps(stubFetch(() => answer(list))));
    await refreshStretch(50, 70, deps(stubFetch(() => answer(list))));
    const inputs = (await readInputs(NOW))!;
    expect(inputs.places.map((p) => p.id)).not.toContain('n5');
    expect(inputs.roofs).toHaveLength(1);
    expect(inputs.rescuePoints).toHaveLength(1);
    expect(inputs.rescuePoints[0]!.kms.length).toBe(1);
  });

  test('[RFS-RECORD] storage refusing a stretch leaves nothing of it, and says so; the saved stretch before it stays', async () => {
    await prepared();
    await refreshStretch(50, 60, deps(stubFetch(() => answer())));
    const store = { ...stretchStore, save: () => Promise.reject(new DOMException('full', 'QuotaExceededError')) };
    const out = await refreshStretch(60, 70, deps(stubFetch(() => answer([shopAt(2, 65)])), { store }));
    expect(out.status).toBe('storage');
    expect(out.say).toBe(W.appStretchNotKept);
    const inputs = (await readInputs(NOW))!;
    expect(inputs.savedKm).toEqual([{ fromKm: 50, toKm: 60 }]);
    expect(inputs.places.map((p) => p.id)).toEqual(['n1']);
  });

  test('[RFS-RECORD] an answer the phone cannot work through is a failed stretch, never reported as full storage', async () => {
    await prepared();
    const store = { ...stretchStore, known: () => Promise.reject(new Error('broken')) };
    const out = await refreshStretch(50, 70, deps(stubFetch(() => answer()), { store }));
    expect(out.status).toBe('failed');
    expect(out.say).not.toBe(W.appStretchNotKept);
    expect((await readInputs(NOW))!.savedKm).toEqual([]);
  });

  test('[RFS-RECORD] a value the browser cannot store aborts the whole save: no place, match or kilometre of it', async () => {
    await prepared();
    const bad = { ...(await import('../../../src/store/stretch.ts')) };
    const out = await bad.saveStretch(trip().route.id, {
      fromKm: 1, toKm: 2, date: '2026-10-16', places: [{ id: 'n1' } as Place], matches: [{ placeId: 'n1', km: 1, offRouteM: 0 }], roofs: [], rescuePoints: [],
      hours: [{ placeId: 'n1', windowStart: () => 1 } as never], holidays: {},
    }).then(() => 'saved', () => 'refused');
    expect(out).toBe('refused');
    const inputs = (await readInputs(NOW))!;
    expect(inputs.places).toEqual([]);
    expect(inputs.matches).toEqual([]);
    expect(inputs.savedKm).toEqual([]);
  });

  test('[RFS-RECORD] a route replaced while the request is under way: nothing of the old stretch mixes in', async () => {
    await prepared();
    const f = stubFetch(async () => {
      await replaceRoute({ ...flatRoute(100), id: 'second' } as Route);
      return answer();
    });
    const out = await refreshStretch(50, 70, deps(f));
    expect(out.saved).toEqual([]);
    const db = await openDb();
    expect(await db.count('places')).toBe(0);
    expect(await db.get('meta', SAVED_KM_META)).toBeUndefined();
  });

  test('[RFS-RECORD] ranges that touch become one, the rest stay apart, in order', () => {
    expect(mergeRanges([{ fromKm: 60, toKm: 70 }, { fromKm: 0, toKm: 10 }, { fromKm: 10, toKm: 20 }, { fromKm: 15, toKm: 18 }])).toEqual([{ fromKm: 0, toKm: 20 }, { fromKm: 60, toKm: 70 }]);
  });
});
