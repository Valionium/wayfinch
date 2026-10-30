import fc from 'fast-check';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { buildsToKeep, fileCountProblems, headersFile, prepareDeployment } from '../../../pipeline/publish-prepare.ts';
import type { BuildRecord } from '../../../pipeline/publish-prepare.ts';
import { readEntry } from '../../../src/data/packs/reader.ts';

const dirs: string[] = [];
const tmp = (): string => { const d = mkdtempSync(path.join(tmpdir(), 'wf-pub-')); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const rec = (buildId: string, builtAt: string, replacedAt: string | null): BuildRecord => ({ buildId, builtAt, replacedAt });
const ids = (rs: BuildRecord[]): string[] => rs.map((r) => r.buildId);
const FIXTURE_BUILD = path.resolve(import.meta.dirname, '../../fixtures/packs/heidelberg-strasbourg');

plain('[PIPE-PUB-01] builds replaced under two weeks ago stay; at two weeks they go', () => {
  const h = [rec('A', '2026-11-03', '2026-11-10'), rec('B', '2026-11-10', '2026-11-17'), rec('C', '2026-11-17', null)];
  expect(ids(buildsToKeep(h, '2026-11-24T04:00:00Z'))).toEqual(['B', 'C']);      // A was replaced 14 days and 4 hours before
  expect(ids(buildsToKeep(h, '2026-11-23T04:00:00Z'))).toEqual(['A', 'B', 'C']);
  expect(ids(buildsToKeep(h, '2026-11-24T00:00:00Z'))).toEqual(['B', 'C']);      // exactly 14 days: gone
});

const history = fc.array(fc.tuple(fc.integer({ min: 0, max: 400 }), fc.option(fc.integer({ min: 1, max: 40 }), { nil: null })), { minLength: 1, maxLength: 8 })
  .map((rows) => rows.map(([day, replacedAfter], i) => {
    const built = new Date(Date.UTC(2026, 0, 1) + day * 864e5);
    const replaced = replacedAfter === null ? null : new Date(built.getTime() + replacedAfter * 864e5).toISOString();
    return rec(`B${i}`, built.toISOString(), replaced);
  }));

test.prop([history, fc.integer({ min: 0, max: 500 })])('[PIPE-PUB-01] the newest build always stays, and any replaced under 14 days ago', (h, nowDay) => {
  const now = new Date(Date.UTC(2026, 0, 1) + nowDay * 864e5).toISOString();
  const kept = ids(buildsToKeep(h, now));
  const latest = h.reduce((m, r) => (r.builtAt > m ? r.builtAt : m), '');
  expect(h.filter((r) => r.builtAt === latest).some((r) => kept.includes(r.buildId))).toBe(true);
  for (const r of h) {
    if (r.replacedAt === null) expect(kept).toContain(r.buildId);
    else if (Date.parse(now) - Date.parse(r.replacedAt) < 14 * 864e5) expect(kept).toContain(r.buildId);
    else if (r.builtAt !== latest) expect(kept).not.toContain(r.buildId);
  }
});

plain('[PIPE-PUB-02] over 20,000 files or a file over 25 MiB is a problem, counting all builds', () => {
  const dir = tmp();
  for (let i = 0; i < 5; i++) writeFileSync(path.join(dir, `f${i}.json`), 'x');
  mkdirSync(path.join(dir, 'sub'));
  writeFileSync(path.join(dir, 'sub', 'big.json'), 'x'.repeat(100));
  expect(fileCountProblems(dir, { maxFiles: 10, maxFileBytes: 1000 })).toEqual([]);
  expect(fileCountProblems(dir, { maxFiles: 5, maxFileBytes: 1000 }).join()).toMatch(/6 files/);
  expect(fileCountProblems(dir, { maxFiles: 10, maxFileBytes: 50 }).join()).toMatch(/big\.json/);
});

plain('[PIPE-PUB-03] headers', () => {
  const h = headersFile(['20261103-1', '20261110-2']);
  expect(h).toMatch(/\/packs\/current\.json\n\s+Access-Control-Allow-Origin: \*\n\s+Cache-Control: no-cache/);
  expect(h).toMatch(/\/packs\/20261103-1\/\*\n\s+Access-Control-Allow-Origin: \*\n\s+Cache-Control: public, max-age=31536000, immutable/);
  expect(h).toMatch(/\/packs\/20261110-2\/\*/);
  expect(h).not.toMatch(/\/packs\/\*/);             // Pages would combine that with current.json's no-cache
});

const limits = { maxFiles: 20000, maxFileBytes: 26214400 };

plain('[PIPE-PUB-04] the deployment holds a 404.html, so a missing tile is a real 404', async () => {
  const r = await prepareDeployment({ builds: [{ buildId: '20261028-1', builtAt: '2026-10-28T00:00:00Z', dir: FIXTURE_BUILD }], newest: '20261028-1', outDir: tmp(), limits });
  expect(r.problems).toEqual([]);
  const dir = r.dir!;
  expect(existsSync(path.join(dir, '404.html'))).toBe(true);
  expect(readFileSync(path.join(dir, '404.html'), 'utf8')).not.toMatch(/<script/i);
  expect(readFileSync(path.join(dir, 'index.html'), 'utf8')).toMatch(/© OpenStreetMap contributors/);
  expect(readFileSync(path.join(dir, 'index.html'), 'utf8')).not.toMatch(/<script/i);
  expect(existsSync(path.join(dir, '_headers'))).toBe(true);
});

plain('current.json passes readEntry and points at the newest build; every kept build is copied', async () => {
  const r = await prepareDeployment({
    builds: [{ buildId: '20261021-1', builtAt: '2026-10-21T00:00:00Z', dir: FIXTURE_BUILD }, { buildId: '20261028-1', builtAt: '2026-10-28T00:00:00Z', dir: FIXTURE_BUILD }],
    newest: '20261028-1', outDir: tmp(), limits,
  });
  const entry = readEntry(readFileSync(path.join(r.dir!, 'packs', 'current.json'), 'utf8'));
  expect(entry).toEqual({ v: 1, buildId: '20261028-1', builtAt: '2026-10-28T00:00:00Z', manifest: '/packs/20261028-1/manifest.json' });
  expect(existsSync(path.join(r.dir!, 'packs', '20261021-1', 'manifest.json'))).toBe(true);
  expect(existsSync(path.join(r.dir!, 'packs', '20261028-1', 'manifest.json'))).toBe(true);
  expect(readFileSync(path.join(r.dir!, '_headers'), 'utf8')).toMatch(/20261021-1/);
});

plain('a problem means no deployment folder is offered', async () => {
  const r = await prepareDeployment({ builds: [{ buildId: '20261028-1', builtAt: '2026-10-28T00:00:00Z', dir: FIXTURE_BUILD }], newest: '20261028-1', outDir: tmp(), limits: { maxFiles: 3, maxFileBytes: 26214400 } });
  expect(r.dir).toBeNull();
  expect(r.problems.join()).toMatch(/files/);
});

plain('a build folder without a readable manifest is refused before any entry point is written', async () => {
  const r = await prepareDeployment({ builds: [{ buildId: '20261028-1', builtAt: '2026-10-28T00:00:00Z', dir: tmp() }], newest: '20261028-1', outDir: tmp(), limits });
  expect(r.dir).toBeNull();
  expect(r.problems.join()).toMatch(/manifest/);
});

plain('a manifest that lists a tile the folder lacks is refused', async () => {
  const copy = tmp();
  cpSync(FIXTURE_BUILD, copy, { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(copy, 'manifest.json'), 'utf8')) as { tiles: { z: number; x: number; y: number }[] };
  const t = manifest.tiles[0]!;
  rmSync(path.join(copy, 't', String(t.z), String(t.x), `${t.y}.json`));
  const r = await prepareDeployment({ builds: [{ buildId: '20261028-1', builtAt: '2026-10-28T00:00:00Z', dir: copy }], newest: '20261028-1', outDir: tmp(), limits });
  expect(r.dir).toBeNull();
  expect(r.problems.join()).toMatch(/tile/);
});

plain('the newest build must be among the builds', async () => {
  await expect(prepareDeployment({ builds: [], newest: '20261028-1', outDir: tmp(), limits })).rejects.toThrow(/newest/);
});
