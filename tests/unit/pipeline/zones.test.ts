import { expect, test } from 'vitest';
import { BoundaryIndex } from '../../../pipeline/boundaries.ts';
import type { BoundaryFeature, Ring } from '../../../pipeline/boundaries.ts';
import { COUNTRY_JOBS, SETTINGS } from '../../../pipeline/config.ts';
import { checkSentinels, makeZoneOf } from '../../../pipeline/zones.ts';
import { COUNTRY_CODES } from '../../../src/core/places/countries.ts';

const square = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const feature = (id: string, rings: Ring[], tags: Record<string, string>): BoundaryFeature => ({ id, tags, rings });

// A tiny "Germany" (lon 8..12, lat 47..50) with Bavaria in the east and Augsburg inside Bavaria.
const de = [
  feature('de', [square(8, 47, 12, 50)], { admin_level: '2', 'ISO3166-1': 'DE', name: 'Deutschland' }),
  feature('by', [square(10, 47, 12, 50)], { admin_level: '4', 'ISO3166-2': 'DE-BY', name: 'Bayern' }),
  feature('bw', [square(8, 47, 10, 50)], { admin_level: '4', 'ISO3166-2': 'DE-BW', name: 'Baden-Württemberg' }),
  feature('aug', [square(10.5, 48, 11, 48.5)], { admin_level: '6', name: 'Augsburg' }),
  feature('lk-aug', [square(11, 48, 11.5, 48.5)], { admin_level: '6', name: 'Landkreis Augsburg' }),
];

test('[PIPE-ZONE-01] null outside the national boundary', () => {
  const zoneOf = makeZoneOf(COUNTRY_JOBS.DE, 'DE', new BoundaryIndex(de, 0.5));
  expect(zoneOf(55, 9)).toBeNull();
});

test('[PIPE-ZONE-02] a German place has subdivision and key DE-BY, zone DE-BY', () => {
  const zoneOf = makeZoneOf(COUNTRY_JOBS.DE, 'DE', new BoundaryIndex(de, 0.5));
  expect(zoneOf(49, 11.5)).toEqual({ country: 'DE', subdivision: 'DE-BY', hoursRegionKey: 'DE-BY', holidayZone: 'DE-BY', timeZone: 'Europe/Berlin' });
});

test('[PIPE-ZONE-02] a Danish place: key null, zone DK; time zone Europe/Copenhagen', () => {
  const dk = [
    feature('dk', [square(8, 54, 13, 57)], { admin_level: '2', 'ISO3166-1': 'DK', name: 'Danmark' }),
    feature('hov', [square(12, 55, 13, 56)], { admin_level: '4', 'ISO3166-2': 'DK-84' }),
  ];
  const zoneOf = makeZoneOf(COUNTRY_JOBS.DK, 'DK', new BoundaryIndex(dk, 0.5));
  expect(zoneOf(55.5, 12.5)).toEqual({ country: 'DK', subdivision: 'DK-84', hoursRegionKey: null, holidayZone: 'DK', timeZone: 'Europe/Copenhagen' });
});

test('[PIPE-ZONE-02] no subdivision found: null, zone the country code', () => {
  const dk = [feature('dk', [square(8, 54, 13, 57)], { admin_level: '2', 'ISO3166-1': 'DK', name: 'Danmark' })];
  const zoneOf = makeZoneOf(COUNTRY_JOBS.DK, 'DK', new BoundaryIndex(dk, 0.5));
  expect(zoneOf(55.5, 9)).toMatchObject({ subdivision: null, hoursRegionKey: null, holidayZone: 'DK' });
  const deNoSub = [feature('de', [square(8, 47, 12, 50)], { admin_level: '2', 'ISO3166-1': 'DE' })];
  expect(makeZoneOf(COUNTRY_JOBS.DE, 'DE', new BoundaryIndex(deNoSub, 0.5))(49, 9)).toMatchObject({ subdivision: null, hoursRegionKey: null, holidayZone: 'DE' });
});

test('[PIPE-ZONE-03] inside Augsburg gives DE-BY-Augsburg with key DE-BY', () => {
  const zoneOf = makeZoneOf(COUNTRY_JOBS.DE, 'DE', new BoundaryIndex(de, 0.25));
  expect(zoneOf(48.2, 10.7)).toMatchObject({ subdivision: 'DE-BY', hoursRegionKey: 'DE-BY', holidayZone: 'DE-BY-Augsburg' });
  expect(zoneOf(48.2, 11.2)).toMatchObject({ holidayZone: 'DE-BY' });     // Landkreis Augsburg is not the city
});

test('[PIPE-ZONE-03] Bas-Rhin gives key and zone FR-67, Paris key null and zone FR', () => {
  const fr = [
    feature('fr', [square(-2, 42, 8, 51)], { admin_level: '3', name: 'France métropolitaine' }),
    feature('67', [square(7, 48, 8, 49)], { admin_level: '6', 'ISO3166-2': 'FR-67' }),
    feature('75', [square(2, 48.5, 2.5, 49)], { admin_level: '6', 'ISO3166-2': 'FR-75' }),
  ];
  const zoneOf = makeZoneOf(COUNTRY_JOBS.FR, 'FR', new BoundaryIndex(fr, 0.25));
  expect(zoneOf(48.5, 7.5)).toMatchObject({ subdivision: 'FR-67', hoursRegionKey: 'FR-67', holidayZone: 'FR-67' });
  expect(zoneOf(48.8, 2.3)).toMatchObject({ subdivision: null, hoursRegionKey: null, holidayZone: 'FR' });
});

test('[PIPE-ZONE-04] checkSentinels names a wrong and a missing sentinel', () => {
  const job = {
    ...COUNTRY_JOBS.DE,
    sentinels: {
      inside: [['Nürnberg', 49.1, 11.5, 'DE-BY'], ['Stuttgart', 48.5, 9, 'DE-BY'], ['Mars', 10, 10, null]] as [string, number, number, string | null][],
      outside: [['Strasbourg', 48.5, 7.7], ['Passau', 49.1, 11.9]] as [string, number, number][],
    },
  };
  const zoneOf = makeZoneOf(job, 'DE', new BoundaryIndex(de, 0.5));
  const problems = checkSentinels(job, zoneOf);
  expect(problems).toHaveLength(3);
  expect(problems.join('\n')).toMatch(/Stuttgart.*DE-BY.*DE-BW/);
  expect(problems.join('\n')).toMatch(/Mars.*outside/);
  expect(problems.join('\n')).toMatch(/Passau.*inside/);
});

test('the country table is complete and the settings are the plan values', () => {
  expect(Object.keys(COUNTRY_JOBS).sort()).toEqual([...COUNTRY_CODES].sort());
  expect(SETTINGS).toEqual({ drinkPlaces: true, settlementAltNames: false, maxPlacesPerTile: 5000, maxFiles: 20000, maxFileBytes: 26214400, countDropLimit: 0.2 });
  expect(COUNTRY_JOBS.FR.geofabrik).toBe('europe/france');
  expect(COUNTRY_JOBS.CZ.geofabrik).toBe('europe/czech-republic');
  for (const cc of COUNTRY_CODES) expect(COUNTRY_JOBS[cc].sentinels.inside.length).toBeGreaterThan(0);
});
