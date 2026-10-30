import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, expect, test } from 'vitest';
import type { CountryOutput } from '../../../pipeline/classify-country.ts';
import { chooseCountryInputs, mergeBuild } from '../../../pipeline/merge.ts';
import { readManifest, readTile } from '../../../src/data/packs/reader.ts';
import { COUNTRY_CODES } from '../../../src/core/places/countries.ts';
import type { CountryCode } from '../../../src/core/places/countries.ts';
import { placeAt, rescueAt, roofAt } from '../../fixtures/places.ts';

const dirs: string[] = [];
const tmp = (): string => { const d = mkdtempSync(path.join(tmpdir(), 'wf-merge-')); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function output(cc: CountryCode, count: number, extra: Partial<CountryOutput> = {}): CountryOutput {
  const base = { DE: [49.4, 8.69], FR: [48.6, 7.75], AT: [47.8, 13.0] }[cc as 'DE' | 'FR' | 'AT'] ?? [50, 10];
  return {
    cc, sourceDate: '2026-10-27', builtOn: '2026-10-28',
    places: Array.from({ length: count }, (_, i) => placeAt('shop', base[0]! + i * 1e-3, base[1]!, { id: `${cc}${i}`.toLowerCase().replace(/^(..)/, 'n') + cc, country: cc })),
    roofs: [roofAt(base[0]!, base[1]! + 0.01)], rescuePoints: [rescueAt(base[0]!, base[1]! + 0.02, `R-${cc}`)],
    ...extra,
  };
}
const opts = (over = {}) => ({ buildId: '20261103-1', builtAt: '2026-11-03T03:17:00Z', maxPerTile: 50, drinkPlaces: true, ...over });
const fresh = (...outs: CountryOutput[]): Map<CountryCode, CountryOutput> => new Map(outs.map((o) => [o.cc, o]));

test('[PIPE-MERGE-01] the same place from two countries appears once, from the first country code', async () => {
  const de = output('DE', 2); const fr = output('FR', 2);
  fr.places[0] = { ...fr.places[0]!, id: de.places[0]!.id, country: 'FR' };
  const { manifest, dir } = await mergeBuild(chooseCountryInputs(fresh(de, fr), new Map(), 0.2), { ...opts(), outDir: tmp() });
  const all = [];
  for (const t of manifest.tiles) {
    const c = await readTile(readFileSync(path.join(dir, 't', String(t.z), String(t.x), `${t.y}.json`)), t, manifest);
    all.push(...c.places);
  }
  expect(all.filter((p) => p.id === de.places[0]!.id)).toHaveLength(1);
  expect(all.find((p) => p.id === de.places[0]!.id)!.country).toBe('DE');
  expect(all).toHaveLength(3);
});

test('[PIPE-MERGE-02] a failed country reuses its last good output and says so', () => {
  const fr = output('FR', 10);
  const r = chooseCountryInputs(new Map(), new Map([['FR', fr]]), 0.2);
  expect(r.get('FR')).toMatchObject({ status: 'last-good', output: fr });
  expect(r.get('FR')!.reason).toMatch(/failed/);
});

test('[PIPE-MERGE-03] a drop over 20% counts as failed; 20% passes', () => {
  const last = new Map([['DE' as CountryCode, output('DE', 100)]]);
  expect(chooseCountryInputs(fresh(output('DE', 80)), last, 0.2).get('DE')).toMatchObject({ status: 'fresh' });
  const r = chooseCountryInputs(fresh(output('DE', 79)), last, 0.2).get('DE')!;
  expect(r.status).toBe('last-good');
  expect(r.output!.places).toHaveLength(100);
  expect(r.reason).toMatch(/79/);
  expect(r.reason).toMatch(/100/);
});

test('[PIPE-MERGE-03] more places than last time, or no last time, is fine', () => {
  expect(chooseCountryInputs(fresh(output('DE', 120)), new Map([['DE', output('DE', 100)]]), 0.2).get('DE')!.status).toBe('fresh');
  expect(chooseCountryInputs(fresh(output('DE', 3)), new Map(), 0.2).get('DE')!.status).toBe('fresh');
});

test('[PIPE-MERGE-04] no output at all is missing, not an error, and the others still build', async () => {
  const inputs = chooseCountryInputs(fresh(output('DE', 3)), new Map(), 0.2);
  expect(inputs.get('FR')).toEqual({ output: null, status: 'missing', reason: expect.any(String) });
  expect([...inputs.keys()].sort()).toEqual([...COUNTRY_CODES].sort());
  const { manifest } = await mergeBuild(inputs, { ...opts(), outDir: tmp() });
  expect(manifest.countries['FR']).toEqual({ status: 'missing', builtOn: null, sourceDate: null, places: 0 });
  expect(manifest.countries['DE']).toEqual({ status: 'fresh', builtOn: '2026-10-28', sourceDate: '2026-10-27', places: 3 });
  expect(manifest.tiles.length).toBeGreaterThan(0);
});

test('the manifest lists kinds, licence, dates and hashes; hashes match the files', async () => {
  const { manifest, dir, problems } = await mergeBuild(chooseCountryInputs(fresh(output('DE', 120), output('AT', 5)), new Map(), 0.2), { ...opts(), outDir: tmp() });
  expect(problems).toEqual([]);
  expect(manifest.licence).toMatchObject({ name: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', buildCode: 'https://github.com/Valionium/wayfinch' });
  expect(manifest.buildId).toBe('20261103-1');
  expect(manifest.kinds).toContain('drink');
  expect(readManifest(readFileSync(path.join(dir, 'manifest.json'), 'utf8'), '20261103-1')).toEqual(manifest);
  let places = 0; let roofs = 0; let rescue = 0;
  for (const t of manifest.tiles) {
    const c = await readTile(readFileSync(path.join(dir, 't', String(t.z), String(t.x), `${t.y}.json`)), t, manifest);
    places += c.places.length; roofs += c.roofs.length; rescue += c.rescuePoints.length;
    expect(c.places.length).toBeLessThanOrEqual(50);
    expect(t.gzipBytes).toBeGreaterThan(0);
  }
  expect([places, roofs, rescue]).toEqual([125, 2, 2]);
});

test('[PIPE-KIND-05] with the setting off, kinds lacks drink and ice_cream, and no tile holds them', async () => {
  const de = output('DE', 3);
  de.places.push(placeAt('drink', 49.5, 8.7, { id: 'n900' }), placeAt('ice_cream', 49.5, 8.71, { id: 'n901' }));
  const { manifest, dir } = await mergeBuild(chooseCountryInputs(fresh(de), new Map(), 0.2), { ...opts({ drinkPlaces: false }), outDir: tmp() });
  expect(manifest.kinds).not.toContain('drink');
  expect(manifest.kinds).not.toContain('ice_cream');
  expect(manifest.countries['DE']!.places).toBe(3);
  for (const t of manifest.tiles) {
    const c = await readTile(readFileSync(path.join(dir, 't', String(t.z), String(t.x), `${t.y}.json`)), t, manifest);
    expect(c.places.some((p) => p.kind === 'drink' || p.kind === 'ice_cream')).toBe(false);
  }
});

test('a place filtered by the setting is dropped even from last good output', async () => {
  const last = output('DE', 3);
  last.places.push(placeAt('drink', 49.5, 8.7, { id: 'n900' }));
  const inputs = chooseCountryInputs(new Map(), new Map([['DE', last]]), 0.2);
  const { manifest } = await mergeBuild(inputs, { ...opts({ drinkPlaces: false }), outDir: tmp() });
  expect(manifest.countries['DE']).toMatchObject({ status: 'last-good', places: 3 });
});

test('the same inputs give the same bytes', async () => {
  const make = () => chooseCountryInputs(fresh(output('DE', 120), output('FR', 60)), new Map(), 0.2);
  const a = await mergeBuild(make(), { ...opts(), outDir: tmp() });
  const b = await mergeBuild(make(), { ...opts(), outDir: tmp() });
  expect(JSON.stringify(a.manifest)).toBe(JSON.stringify(b.manifest));
  expect(readFileSync(path.join(a.dir, 'manifest.json'), 'utf8')).toBe(readFileSync(path.join(b.dir, 'manifest.json'), 'utf8'));
});

test('places piled on one spot beyond the limit are a problem, not a crash', async () => {
  const de = output('DE', 0);
  de.places = Array.from({ length: 60 }, (_, i) => placeAt('shop', 49.4, 8.69, { id: `n${i}` }));
  const { problems } = await mergeBuild(chooseCountryInputs(fresh(de), new Map(), 0.2), { ...opts(), outDir: tmp() });
  expect(problems.join()).toMatch(/60/);
});

test('with write off nothing is written, but the manifest is the same', async () => {
  const make = () => chooseCountryInputs(fresh(output('DE', 120)), new Map(), 0.2);
  const written = await mergeBuild(make(), { ...opts(), outDir: tmp() });
  const dir = tmp();
  const dry = await mergeBuild(make(), { ...opts(), outDir: dir, write: false });
  expect(JSON.stringify(dry.manifest)).toBe(JSON.stringify(written.manifest));
  expect(readdirSync(dir)).toEqual([]);
});

test('the build reports, per tile, how many places each country holds', async () => {
  const { shares, manifest } = await mergeBuild(chooseCountryInputs(fresh(output('DE', 3), output('FR', 2)), new Map(), 0.2), { ...opts(), outDir: tmp() });
  const total: Record<string, number> = {};
  for (const s of shares.values()) for (const [cc, n] of Object.entries(s)) total[cc] = (total[cc] ?? 0) + n;
  expect(total).toEqual({ DE: 3, FR: 2 });
  expect(shares.size).toBe(manifest.tiles.length);
});
