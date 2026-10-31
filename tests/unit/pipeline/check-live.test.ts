import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { checkLive } from '../../../pipeline/check-live.ts';

const DIR = path.resolve(import.meta.dirname, '../../fixtures/packs/heidelberg-strasbourg');
const manifestText = readFileSync(path.join(DIR, 'manifest.json'), 'utf8');
const manifest = JSON.parse(manifestText) as { buildId: string; builtAt: string; tiles: { z: number; x: number; y: number }[] };
const id = manifest.buildId;
const base = 'https://data.example';
const entry = (buildId = id): string => JSON.stringify({ v: 1, buildId, builtAt: manifest.builtAt, manifest: `/packs/${buildId}/manifest.json` });
const quick = { timeoutMs: 0, pauseMs: 0 };

type Answer = { status?: number; body: string | Uint8Array<ArrayBuffer>; headers?: Record<string, string> };
type Change = (p: string, a: Answer, sent: Headers) => Answer;

function site(change: Change = (_, a) => a): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const p = String(input as string).slice(base.length);
    const cors = { 'access-control-allow-origin': '*' };
    const m = /^\/packs\/[^/]+\/t\/(\d+)\/(\d+)\/(\d+)\.json$/.exec(p);
    const known = m && manifest.tiles.some((t) => String(t.z) === m[1] && String(t.x) === m[2] && String(t.y) === m[3]);
    const start: Answer = p === '/packs/current.json' ? { body: entry(), headers: { 'cache-control': 'no-cache', ...cors } }
      : p === `/packs/${id}/manifest.json` ? { body: manifestText, headers: cors }
      : known ? { body: new Uint8Array(readFileSync(path.join(DIR, 't', m[1]!, m[2]!, `${m[3]}.json`))), headers: { 'content-encoding': 'br', ...cors } }
      : { status: 404, body: 'Not found' };
    const a = change(p, start, new Headers(init?.headers));
    return new Response(a.body, { status: a.status ?? 200, headers: a.headers ?? {} });
  }) as typeof fetch;
}

const isTile = (p: string): boolean => p.includes('/t/') && !p.includes('/t/99/');
const noNoCache = site((p, a) => (p.endsWith('current.json') ? { ...a, headers: { 'access-control-allow-origin': '*' } } : a));
const noCors = site((p, a) => (p.endsWith('manifest.json') ? { ...a, headers: {} } : a));
const old = site((p, a) => (p.endsWith('current.json') ? { ...a, body: entry('20200101-1') } : a));
const badTile = site((p, a) => (isTile(p) ? { ...a, body: '{"v":1}' } : a));
const spaFallback = site((p, a) => (p.includes('/t/99/') ? { body: '<html>' } : a));
const notCompressed = site((p, a) => (isTile(p) ? { ...a, headers: { 'access-control-allow-origin': '*' } } : a));

test('[PIPE-PUB-02] passes on a good answer', async () => {
  expect(await checkLive(base, site(), id, quick)).toEqual([]);
});

test.each([
  ['current.json has no no-cache', noNoCache],
  ['no CORS header', noCors],
  ['an older build', old],
  ['a tile fails its hash', badTile],
  ['a missing tile answers 200', spaFallback],
  ['tiles are not compressed', notCompressed],
])('[PIPE-PUB-02] names the problem: %s', async (_, f) => {
  expect((await checkLive(base, f, id, quick)).length).toBeGreaterThan(0);
});

test('[PIPE-PUB-02] asks for compression when it reads a tile directly', async () => {
  const asked: string[] = [];
  await checkLive(base, site((p, a, sent) => { if (isTile(p)) asked.push(sent.get('accept-encoding') ?? ''); return a; }), id, quick);
  expect(asked).toContain('gzip, br');
});

test('[PIPE-PUB-02] waits while the new build is not live yet, then passes', async () => {
  let calls = 0;
  const late = site((p, a) => (p.endsWith('current.json') && ++calls < 3 ? { ...a, body: entry('20200101-1') } : a));
  expect(await checkLive(base, late, id, { timeoutMs: 60_000, pauseMs: 1 })).toEqual([]);
  expect(calls).toBe(3);
});
