import fc from 'fast-check';
import { COUNTRIES, COUNTRY_CODES } from '../../src/core/places/countries.ts';
import type { CountryCode } from '../../src/core/places/countries.ts';
import { ALL_KINDS } from '../../src/core/places/types.ts';
import type { Place, PlaceKind, StopFlags } from '../../src/core/places/types.ts';
import { hoursValue } from './hours.ts';

/** The source date every generated place carries, and every generated manifest gives its countries. */
export const GEN_DATA_DATE = '2026-10-26';

const e5 = (n: number): number => n / 1e5;

// A quarter of the coordinates sit on the corners and edges of level 8 tiles (section 12.2).
export const coordinate = (): fc.Arbitrary<{ lat: number; lon: number }> =>
  fc.oneof(
    { weight: 3, arbitrary: fc.record({ lat: fc.integer({ min: 4_500_000, max: 5_500_000 }).map(e5), lon: fc.integer({ min: 500_000, max: 1_800_000 }).map(e5) }) },
    {
      weight: 1,
      arbitrary: fc.record({
        lat: fc.integer({ min: 160, max: 190 }).map((y) => Math.round(((y * 180) / 256 - 90) * 1e5) / 1e5),
        lon: fc.integer({ min: 130, max: 150 }).map((x) => Math.round(((x * 360) / 256 - 180) * 1e5) / 1e5),
      }),
    },
  );

const word = (): fc.Arbitrary<string> => fc.string({ minLength: 1, maxLength: 12 });

export function zoneOf(country: CountryCode): [string, string | null, string | null, string, string] {
  const sub: Record<string, [string | null, string | null, string]> = {
    DE: ['DE-BW', 'DE-BW', 'DE-BW'], FR: ['FR-67', 'FR-67', 'FR-67'], AT: ['AT-9', 'AT-9', 'AT-9'], CH: ['CH-ZH', 'CH-ZH', 'CH-ZH'],
  };
  const s = sub[country];
  return [country, s?.[0] ?? null, s?.[1] ?? null, s?.[2] ?? country, COUNTRIES[country].timeZone];
}

const stopFlags = (): fc.Arbitrary<StopFlags> =>
  fc.record({
    indoorSeating: fc.option(fc.boolean(), { nil: null }), outdoorSeating: fc.option(fc.boolean(), { nil: null }),
    toilets: fc.option(fc.boolean(), { nil: null }), takeaway: fc.option(fc.boolean(), { nil: null }),
    kitchenHours: fc.option(hoursValue(), { nil: null }), bikeParking50m: fc.boolean(),
  });

const FOOD: PlaceKind[] = ['shop', 'cafe', 'restaurant', 'drink', 'ice_cream', 'fuel_shop'];
const CALL: PlaceKind[] = ['campsite', 'lodging', 'hut', 'bike_shop'];

export function place(): fc.Arbitrary<Place> {
  return fc.record({
    id: fc.tuple(fc.constantFrom('n', 'w', 'r'), fc.integer({ min: 1, max: 9_999_999_999 })).map(([t, n]) => `${t}${n}`),
    kind: fc.constantFrom(...ALL_KINDS),
    name: fc.option(word(), { nil: null }),
    pos: coordinate(),
    waterClass: fc.option(fc.constantFrom('A' as const, 'B' as const, 'C' as const), { nil: null }),
    indoorOrLimited: fc.boolean(),
    openingHours: fc.option(hoursValue(), { nil: null }),
    seasonal: fc.option(fc.constantFrom('no', 'yes', 'summer', 'Apr-Oct'), { nil: null }),
    checkDate: fc.option(fc.constantFrom('2026-01-05', '2023-06-30'), { nil: null }),
    country: fc.constantFrom(...COUNTRY_CODES),
    tags: fc.dictionary(fc.constantFrom('amenity', 'shop', 'access', 'fee', 'bench', 'covered', 'shelter_type'), word()),
    stop: fc.option(stopFlags(), { nil: null }),
    platformRoof: fc.option(fc.boolean(), { nil: null }),
    contact: fc.option(fc.record({ phones: fc.array(word(), { maxLength: 2 }), website: fc.option(word(), { nil: null }) }), { nil: null }),
  }).map((r): Place => {
    const [country, subdivision, hoursRegionKey, holidayZone, timeZone] = zoneOf(r.country);
    return {
      id: r.id, kind: r.kind, name: r.name, lat: r.pos.lat, lon: r.pos.lon, waterClass: r.waterClass,
      indoorOrLimited: r.indoorOrLimited, openingHours: r.openingHours, seasonal: r.seasonal, checkDate: r.checkDate,
      country, subdivision, hoursRegionKey, holidayZone, timeZone, tags: r.tags, source: 'pack', dataDate: GEN_DATA_DATE,
      stop: FOOD.includes(r.kind) ? r.stop : null,
      platformRoof: r.kind === 'station' ? r.platformRoof : null,
      contact: CALL.includes(r.kind) ? r.contact : null,
    };
  });
}

const KEYS = ['amenity', 'shop', 'tourism', 'natural', 'man_made', 'railway', 'access', 'fee', 'drinking_water', 'shelter_type',
  'opening_hours', 'phone', 'website', 'name', 'bench', 'covered', 'disused', 'abandoned', 'ref', 'emergency'];
const VALUES = ['yes', 'no', 'drinking_water', 'water_tap', 'spring', 'fountain', 'shelter', 'Wetterpilz', 'wetterpilz', 'lean_to',
  'camp_site', 'bakery', 'supermarket', 'station', 'halt', 'private', 'customers', 'a;b', 'javascript:alert(1)', '+49 7221 123456'];

/** Tag sets drawn from real keys and values, with case variants, ';' lists and junk (section 12.2). */
export const osmTags = (): fc.Arbitrary<Record<string, string>> =>
  fc.dictionary(
    fc.oneof(fc.constantFrom(...KEYS), fc.string({ maxLength: 10 })),
    fc.oneof(
      fc.constantFrom(...VALUES),
      fc.constantFrom(...VALUES).map((v) => v.toUpperCase()),
      fc.string({ maxLength: 300 }),
      fc.string({ maxLength: 20 }).map((s) => `${s}\u0000\u0007`),
    ),
    { maxKeys: 12 },
  );
