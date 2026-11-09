// Trip's place search by address and named place: every answer is recorded (the shapes are Photon's own field names); no live call.
import { describe, expect, test, vi } from 'vitest';
import { searchPlace } from '../../../src/data/routing.ts';

type Recorded = { url: string; init?: RequestInit };
function fakeFetch(answers: Record<string, unknown>): { fetch: typeof fetch; seen: Recorded[] } {
  const seen: Recorded[] = [];
  const fetchStub = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init });
    const key = Object.keys(answers).find((k) => url.startsWith(k));
    if (key === undefined) return Promise.resolve(new Response('no', { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify(answers[key]), { status: 200, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;
  return { fetch: fetchStub, seen };
}

const METEO = 'https://geocoding-api.open-meteo.com/v1/search';
const PHOTON = 'https://photon.komoot.io/api/';
const feature = (properties: Record<string, unknown>, coordinates: [number, number] = [8.69, 49.4]) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
const address = { features: [
  feature({ housenumber: '12', street: 'Hauptstraße', postcode: '69117', city: 'Heidelberg', state: 'Baden-Württemberg', country: 'Germany', osm_key: 'building', osm_value: 'yes' }),
  feature({ housenumber: '12', street: 'Hauptstraße', postcode: '69168', city: 'Wiesloch', state: 'Baden-Württemberg', country: 'Germany', osm_key: 'building', osm_value: 'yes' }, [8.69, 49.29]),
] };
const street = { features: [feature({ name: 'Hauptstraße', postcode: '69117', city: 'Heidelberg', state: 'Baden-Württemberg', country: 'Germany', osm_key: 'highway', osm_value: 'residential' })] };
const station = { features: [feature({ name: 'Heidelberg Hauptbahnhof', street: 'Willy-Brandt-Platz', housenumber: '5', postcode: '69115', city: 'Heidelberg', state: 'Baden-Württemberg', country: 'Germany', osm_key: 'railway', osm_value: 'station' })] };
const campsite = { features: [feature({ name: 'Camping Haide', street: 'Schlierbacher Landstraße', postcode: '69118', city: 'Heidelberg', country: 'Germany', osm_key: 'tourism', osm_value: 'camp_site' })] };
const town = { results: [{ id: 1, name: 'Heidelberg', admin1: 'Baden-Württemberg', country: 'Germany', latitude: 49.4, longitude: 8.69 }] };
const paramsOf = (u: string) => new URL(u).searchParams;
const hostsOf = (seen: Recorded[]) => seen.map((s) => new URL(s.url).host);

describe('Place search by address and named place', () => {
  test('an address with a house number goes to Photon once, without the place filters, and keeps house, street, postcode and town', async () => {
    const { fetch: f, seen } = fakeFetch({ [PHOTON]: address });
    const hits = await searchPlace('Hauptstraße 12 Heidelberg', f);
    expect(hostsOf(seen)).toEqual(['photon.komoot.io']);
    expect(paramsOf(seen[0]!.url).getAll('osm_tag')).toEqual([]);
    expect(paramsOf(seen[0]!.url).get('q')).toBe('Hauptstraße 12 Heidelberg');
    expect(seen[0]!.init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ name: 'Hauptstraße 12', source: 'osm', lat: 49.4, lon: 8.69 });
    expect(hits[0]!.where).toBe('69117 Heidelberg, Baden-Württemberg, Germany');
    expect(hits[1]!.where).toContain('69168 Wiesloch');
  });

  test('a street word is an address search; the street hit shows postcode and town', async () => {
    const { fetch: f, seen } = fakeFetch({ [PHOTON]: street });
    const hits = await searchPlace('Hauptstraße Heidelberg', f);
    expect(hostsOf(seen)).toEqual(['photon.komoot.io']);
    expect(hits).toMatchObject([{ name: 'Hauptstraße', where: '69117 Heidelberg, Baden-Württemberg, Germany', kind: 'residential' }]);
  });

  test('a station is found by its name, with its street and number apart from its name', async () => {
    const { fetch: f, seen } = fakeFetch({ [PHOTON]: station });
    const hits = await searchPlace('Heidelberg Hauptbahnhof', f);
    expect(hostsOf(seen)).toEqual(['photon.komoot.io']);
    expect(paramsOf(seen[0]!.url).getAll('osm_tag')).toEqual([]);
    expect(hits).toMatchObject([{ name: 'Heidelberg Hauptbahnhof', street: 'Willy-Brandt-Platz 5', kind: 'station', source: 'osm' }]);
    expect(hits[0]!.where).toBe('69115 Heidelberg, Baden-Württemberg, Germany');
  });

  test('a campsite and a hotel are named places: Photon first, tourism kept', async () => {
    const { fetch: f, seen } = fakeFetch({ [PHOTON]: campsite });
    const hits = await searchPlace('Camping Haide Heidelberg', f);
    expect(hostsOf(seen)).toEqual(['photon.komoot.io']);
    expect(hits).toMatchObject([{ name: 'Camping Haide', street: 'Schlierbacher Landstraße', kind: 'camp site' }]);
    const hotel = fakeFetch({ [PHOTON]: { features: [] }, [METEO]: { results: [] } });
    await searchPlace('Hotel Adler', hotel.fetch);
    expect(hostsOf(hotel.seen)[0]).toBe('photon.komoot.io');
    expect(paramsOf(hotel.seen[0]!.url).getAll('osm_tag')).toEqual([]);
  });

  test('a postcode with a town is an address search', async () => {
    const { fetch: f, seen } = fakeFetch({ [PHOTON]: street });
    await searchPlace('69117 Heidelberg', f);
    expect(hostsOf(seen)).toEqual(['photon.komoot.io']);
  });

  test('a plain town still goes to Open-Meteo first, one request, and the hit is unchanged', async () => {
    const { fetch: f, seen } = fakeFetch({ [METEO]: town });
    const hits = await searchPlace('Heidelberg', f);
    expect(hostsOf(seen)).toEqual(['geocoding-api.open-meteo.com']);
    expect(hits).toEqual([{ name: 'Heidelberg', where: 'Baden-Württemberg, Germany', lat: 49.4, lon: 8.69, source: 'geonames' }]);
  });

  test('a town search that falls to Photon still drops shops of a similar name', async () => {
    const shop = { features: [feature({ name: 'Heidelberg Bäckerei', osm_key: 'shop', osm_value: 'bakery', city: 'X' })] };
    const { fetch: f } = fakeFetch({ [METEO]: { results: [] }, [PHOTON]: shop });
    expect(await searchPlace('Heidelberg', f)).toEqual([]);
  });

  test('an address search that finds nothing asks Open-Meteo once more, then returns an empty list', async () => {
    const { fetch: f, seen } = fakeFetch({ [PHOTON]: { features: [] }, [METEO]: { results: [] } });
    expect(await searchPlace('Nirgendwostraße 99', f)).toEqual([]);
    expect(hostsOf(seen)).toEqual(['photon.komoot.io', 'geocoding-api.open-meteo.com']);
  });

  test('services that never answer time out and the search throws (shown as needing signal)', async () => {
    vi.useFakeTimers();
    try {
      const hang = ((_url: string, init?: RequestInit) => new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
      const outcome = searchPlace('Hauptstraße 12', hang).then(() => 'answered', () => 'failed');
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await outcome).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });
});
