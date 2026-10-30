import { createReadStream, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { BoundaryIndex } from '../../../pipeline/boundaries.ts';
import type { BoundaryFeature, Ring } from '../../../pipeline/boundaries.ts';
import { classifyCountry } from '../../../pipeline/classify-country.ts';
import type { CountryOutput } from '../../../pipeline/classify-country.ts';
import { COUNTRY_JOBS } from '../../../pipeline/config.ts';
import { readCountryOutput, writeCountryOutput } from '../../../pipeline/country-output.ts';
import { readObjects } from '../../../pipeline/read-geojson.ts';
import { makeZoneOf } from '../../../pipeline/zones.ts';
import { ALL_KINDS } from '../../../src/core/places/types.ts';
import type { OsmObject, Place } from '../../../src/core/places/types.ts';

const MINI = path.resolve(import.meta.dirname, '../../fixtures/osm/mini.geojsonseq');
const square = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const boundaries: BoundaryFeature[] = [
  { id: 'r1', tags: { admin_level: '2', 'ISO3166-1': 'DE' }, rings: [square(8, 49, 9.5, 50)] },
  { id: 'r2', tags: { admin_level: '4', 'ISO3166-2': 'DE-BW' }, rings: [square(8, 49, 9.5, 50)] },
];
const zoneOf = makeZoneOf(COUNTRY_JOBS.DE, 'DE', new BoundaryIndex(boundaries, 0.1));
const options = { drinkPlaces: true, settlementAltNames: false };

const run = (stream: AsyncIterable<OsmObject> = readObjects(createReadStream(MINI))): Promise<CountryOutput> =>
  classifyCountry(stream, zoneOf, 'DE', '2026-10-27', { builtOn: '2026-10-28', ...options });
const find = (out: CountryOutput, id: string): Place => {
  const p = out.places.find((x) => x.id === id);
  if (!p) throw new Error(`no place ${id}; have ${out.places.map((x) => x.id).join(' ')}`);
  return p;
};

test('classifyCountry end to end on the mini file', async () => {
  const out = await run();
  expect([...new Set(out.places.map((p) => p.kind))].sort()).toEqual([...ALL_KINDS].sort());
  expect(out.places.filter((p) => p.id === 'n17')).toHaveLength(0);              // the shelter node, merged into its outline
  expect(find(out, 'w16')).toMatchObject({ kind: 'shelter', tags: { shelter_type: 'lean_to' } });
  expect(find(out, 'n15')).toMatchObject({ waterClass: 'C', tags: { in_cemetery: 'yes' } });
  expect(find(out, 'n13')).toMatchObject({ waterClass: 'A', indoorOrLimited: true });   // a water point on a campsite
  expect(find(out, 'n1')).toMatchObject({ waterClass: 'A', indoorOrLimited: false });
  expect(find(out, 'n18').platformRoof).toBe(true);
  expect(find(out, 'n20').platformRoof).toBe(false);
  expect(find(out, 'n3').stop!.bikeParking50m).toBe(true);
  expect(find(out, 'n2').stop!.bikeParking50m).toBe(false);
  expect(find(out, 'n21')).toMatchObject({ kind: 'fuel_shop', openingHours: '24/7' });   // the linked shop node
  expect(out.places.some((p) => p.id === 'n22')).toBe(false);                     // and it is not kept twice
  expect(find(out, 'n2')).toMatchObject({ country: 'DE', subdivision: 'DE-BW', holidayZone: 'DE-BW', timeZone: 'Europe/Berlin', dataDate: '2026-10-27' });
  expect(out.roofs).toHaveLength(4);                                              // two bus stops, the sheltered platform and one covered bike parking
  expect(out.roofs.find((r) => r.kind === 'bus_stop' && r.bench)).toBeDefined();
  expect(out.rescuePoints.map((r) => r.ref)).toEqual(['KA-145']);
  expect(out).toMatchObject({ cc: 'DE', sourceDate: '2026-10-27', builtOn: '2026-10-28' });
});

test('[PIPE-ZONE-01] a place outside the country is dropped', async () => {
  const out = await run();
  expect(out.places.some((p) => p.id === 'n32')).toBe(false);
});

test('the output is sorted by id and the same input gives the same output', async () => {
  const a = await run();
  const b = await run();
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  const ids = a.places.map((p) => p.id);
  expect(ids).toEqual([...ids].sort());
});

test('one bad line never fails the country', async () => {
  // The mini file has a broken line and a line without geometry among the good ones.
  const out = await run();
  expect(out.places.length).toBeGreaterThan(20);
});

test('setting drinkPlaces off drops pubs and ice cream', async () => {
  const out = await classifyCountry(readObjects(createReadStream(MINI)), zoneOf, 'DE', '2026-10-27', { builtOn: '2026-10-28', drinkPlaces: false, settlementAltNames: false });
  expect(out.places.some((p) => p.kind === 'drink' || p.kind === 'ice_cream')).toBe(false);
});

test('country output files round-trip, sorted, one record per line', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wf-out-'));
  try {
    const out = await run();
    const file = path.join(dir, 'country-DE.json.gz');
    await writeCountryOutput(file, out);
    expect(await readCountryOutput(file)).toEqual(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
