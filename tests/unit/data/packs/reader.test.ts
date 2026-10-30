import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import fc from 'fast-check';
import { expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { PackError, readEntry, readManifest, readTile } from '../../../../src/data/packs/reader.ts';
import { metaManifest, packEntry, packManifest, sha256Hex, tileBytes, tileContent, tileFileFor } from '../../../gen';

const schema = (name: string) => JSON.parse(readFileSync(new URL(`../../../../contracts/schemas/${name}.schema.json`, import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: true, allErrors: false });
const validEntry = ajv.compile(schema('pack-entry'));
const validManifest = ajv.compile(schema('pack-manifest'));

test.prop([tileBytes(), fc.nat()])('[FZ-06] a truncated tile is rejected', async (t, n) => {
  const cut = t.bytes.slice(0, n % t.bytes.length);
  await expect(readTile(cut, t.expected, t.manifest)).rejects.toMatchObject({ code: 'bad-hash' });
});

test.prop([tileBytes(), fc.nat(), fc.integer({ min: 1, max: 255 })])('[FZ-06] an altered tile is rejected', async (t, n, x) => {
  const b = t.bytes.slice();
  b[n % b.length]! ^= x;
  await expect(readTile(b, t.expected, t.manifest)).rejects.toBeInstanceOf(PackError);
});

test.prop([fc.string()])('[FZ-06] junk is rejected with a clear error, never a value', (s) => {
  expect(() => readEntry(s)).toThrow(PackError);
  expect(() => readManifest(s, '20261103-1')).toThrow(PackError);
});

plain('[FZ-06] an entry may only point at its own build', () => {
  expect(() => readEntry(JSON.stringify({ v: 1, buildId: '20261103-1', builtAt: '2026-11-03T03:17:00Z', manifest: 'https://evil.example/m.json' }))).toThrow(PackError);
  expect(readEntry(JSON.stringify({ v: 1, buildId: '20261103-1', builtAt: '2026-11-03T03:17:00Z', manifest: '/packs/20261103-1/manifest.json' })).buildId).toBe('20261103-1');
});

plain('[FZ-06] a manifest of another build is refused', () => {
  const m = metaManifest();
  expect(() => readManifest(JSON.stringify(m), '20261110-2')).toThrow(expect.objectContaining({ code: 'wrong-build' }));
  expect(readManifest(JSON.stringify(m), m.buildId).buildId).toBe(m.buildId);
});

plain('[FZ-06] an entry or manifest of a newer version is refused', () => {
  expect(() => readEntry(JSON.stringify({ ...JSON.parse(JSON.stringify(metaManifest())), v: 2 }))).toThrow(expect.objectContaining({ code: 'bad-version' }));
  expect(() => readManifest(JSON.stringify({ ...metaManifest(), v: 2 }), '20261103-1')).toThrow(expect.objectContaining({ code: 'bad-version' }));
});

plain('[FZ-06] a tile with a good hash but a wrong version or shape is refused', async () => {
  const c = { places: [], roofs: [], rescuePoints: [] };
  const base = JSON.parse(tileFileFor(c).text) as Record<string, unknown>;
  const expectFor = async (obj: unknown, code: string) => {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    const expected = { ...tileFileFor(c).expected, sha256: sha256Hex(bytes) };
    await expect(readTile(bytes, expected, { ...metaManifest(), tiles: [expected] })).rejects.toMatchObject({ code });
  };
  await expectFor({ ...base, v: 2 }, 'bad-version');
  await expectFor({ ...base, p: 'not an array' }, 'bad-shape');
  await expectFor({ ...base, x: base.x as number + 1 }, 'bad-shape');
  await expectFor({ ...base, roofs: { a: [1], o: [], f: [] } }, 'bad-shape');
});

test.prop([tileContent()])('a good tile reads back through readTile', async (c) => {
  const f = tileFileFor(c);
  const out = await readTile(f.bytes, f.expected, { ...metaManifest(), tiles: [f.expected] });
  expect(out.places.map((p) => p.id)).toEqual(c.places.map((p) => p.id).sort());
});

plain('writer output passes the committed schemas', () => {
  fc.assert(fc.property(packEntry(), (e) => validEntry(e) === true));
  fc.assert(fc.property(packManifest(), (m) => validManifest(m) === true));
});

plain('anything readManifest accepts passes the schema', () => {
  const fields = ['v', 'buildId', 'builtAt', 'licence', 'countries', 'kinds', 'tiles', 'extra'];
  fc.assert(fc.property(packManifest(), fc.constantFrom(...fields), fc.jsonValue(), fc.boolean(), (m, field, value, deep) => {
    const o: Record<string, unknown> = { ...m };
    if (deep && field === 'tiles' && m.tiles.length > 0) o.tiles = [{ ...m.tiles[0], z: value }, ...m.tiles.slice(1)];
    else if (deep && field === 'licence') o.licence = { ...m.licence, url: value };
    else if (deep && field === 'countries') o.countries = { DE: value };
    else o[field] = value;
    let accepted = true;
    try { readManifest(JSON.stringify(o), m.buildId); } catch (e) { if (!(e instanceof PackError)) throw e; accepted = false; }
    if (accepted) expect(validManifest(JSON.parse(JSON.stringify(o)))).toBe(true);
  }));
});

plain('anything readEntry accepts passes the schema', () => {
  fc.assert(fc.property(packEntry(), fc.constantFrom('v', 'buildId', 'builtAt', 'manifest', 'extra'), fc.jsonValue(), (e, field, value) => {
    const o: Record<string, unknown> = { ...e, [field]: value };
    let accepted = true;
    try { readEntry(JSON.stringify(o)); } catch (err) { if (!(err instanceof PackError)) throw err; accepted = false; }
    if (accepted) expect(validEntry(JSON.parse(JSON.stringify(o)))).toBe(true);
  }));
});
