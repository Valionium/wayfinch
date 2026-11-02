import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { afterAll, describe, expect, test } from 'vitest';
import { buildDist, canonicalPath, MAX_PRECACHED_BYTES } from '../../../tools/build.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PAGE = `${REPO}public/tools/bags/index.html`;
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const tmpRoot = mkdtempSync(join(tmpdir(), 'wf-build-'));
let n = 0;
const outDir = () => join(tmpRoot, `out-${++n}`);
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) out.push(relative(dir, join(e.parentPath, e.name)).split(sep).join('/'));
  }
  return out.sort();
}
const read = (dir: string, f: string) => readFileSync(join(dir, f));
const text = (dir: string, f: string) => read(dir, f).toString('utf8');
const buildJson = (dir: string) => JSON.parse(text(dir, 'build.json')) as { v: number; configHash: string; files: Record<string, string> };

/** Splits a _headers file into { path: { header: value } }. */
function parseHeaders(src: string): Record<string, Record<string, string>> {
  const rules: Record<string, Record<string, string>> = {};
  let current: Record<string, string> = {};
  for (const line of src.split('\n')) {
    if (!line.trim()) continue;
    if (/^\s/.test(line)) {
      const at = line.indexOf(':');
      current[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    } else {
      current = {};
      rules[line.trim()] = current;
    }
  }
  return rules;
}

describe('canonicalPath', () => {
  test('files map to the addresses the host serves', () => {
    expect(canonicalPath('index.html')).toBe('/');
    expect(canonicalPath('tools/bags/index.html')).toBe('/tools/bags/');
    expect(canonicalPath('offline-worker.js')).toBe('/offline-worker.js');
    expect(canonicalPath('assets/a.js')).toBe('/assets/a.js');
  });
});

test('[SW-BUILD-FILES] with the switch off dist holds only the page, the worker, the headers and build.json', async () => {
  const out = outDir();
  await buildDist({ out, launch: false });
  expect(listFiles(out)).toEqual(['_headers', 'build.json', 'index.html', 'offline-worker.js']);
  expect(sha256(read(out, 'index.html'))).toBe(sha256(readFileSync(PAGE)));
  const b = buildJson(out);
  expect(b.v).toBe(1);
  expect(b.configHash).toBe(sha256(readFileSync(`${REPO}wrangler.jsonc`)));
  expect(Object.keys(b.files).sort()).toEqual(['/', '/offline-worker.js']);
  expect(b.files['/']).toBe(sha256(read(out, 'index.html')));
  expect(b.files['/offline-worker.js']).toBe(sha256(read(out, 'offline-worker.js')));
}, 60_000);

test('[SW-BUILD-SAME] two builds from one commit are byte for byte the same, with no date, commit id or absolute path', async () => {
  const a = outDir();
  const b = outDir();
  await buildDist({ out: a, launch: false });
  await buildDist({ out: b, launch: false });
  expect(listFiles(a)).toEqual(listFiles(b));
  for (const f of listFiles(a)) expect(sha256(read(a, f)), f).toBe(sha256(read(b, f)));

  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
  expect(commit.length).toBe(40);
  const today = new Date().toISOString().slice(0, 10);
  const roots = [REPO, REPO.replaceAll('\\', '/'), REPO.replaceAll('\\', '\\\\'), tmpRoot];
  for (const f of listFiles(a)) {
    const body = text(a, f);
    expect(body.includes(commit), `${f} holds the commit id`).toBe(false);
    expect(roots.some((r) => body.includes(r)), `${f} holds an absolute path`).toBe(false);
    // The page is the rider's own content and may mention dates; nothing the build writes may.
    if (f !== 'index.html') {
      expect(body.includes(today), `${f} holds the date`).toBe(false);
      expect(/\b20\d\d-\d\d-\d\d\b/.test(body), `${f} holds a date`).toBe(false);
    }
  }
}, 60_000);

test('[SW-BUILD-WORKER] the built worker is a classic script that declares its build and its precache list', async () => {
  const out = outDir();
  await buildDist({ out, launch: false });
  const src = text(out, 'offline-worker.js');
  expect(() => new vm.Script(src)).not.toThrow();
  expect(/^\s*(import|export)\b/m.test(src)).toBe(false);

  const { '/offline-worker.js': workerHash, ...listed } = buildJson(out).files;
  expect(workerHash).toBeTruthy();
  // The worker's own hash cannot be part of a value written inside the worker.
  const expected = sha256(JSON.stringify(listed)).slice(0, 12);
  expect(src.includes(`BUILD = "${expected}"`)).toBe(true);
  const list = /PRECACHE\w* = (\{[^}]*\})/.exec(src);
  expect(list).not.toBeNull();
  const parsed = new vm.Script(`(${list?.[1] ?? ''})`).runInNewContext() as Record<string, string>;
  expect(JSON.parse(JSON.stringify(parsed))).toEqual(listed);
  expect(Object.keys(parsed)).not.toContain('/offline-worker.js');
}, 60_000);

test('[SW-BUILD-SIZE] a precached file over 2 MiB fails the build; exactly 2 MiB passes', async () => {
  expect(MAX_PRECACHED_BYTES).toBe(2_097_152);
  const big = 'assets/generated.bin';
  const ok = outDir();
  await buildDist({ out: ok, launch: false, extraFiles: { [big]: Buffer.alloc(2_097_152, 97) } });
  expect(statSync(join(ok, big)).size).toBe(2_097_152);
  expect(Object.keys(buildJson(ok).files)).toContain(`/${big}`);
  await expect(buildDist({ out: outDir(), launch: false, extraFiles: { [big]: Buffer.alloc(2_097_153, 97) } })).rejects.toThrow(/assets\/generated\.bin.*2097153/);
}, 60_000);

test('[SW-HEADERS] the headers file sets caching and the referrer policy as decided', async () => {
  const off = outDir();
  const on = outDir();
  await buildDist({ out: off, launch: false });
  await buildDist({ out: on, launch: true });
  const immutable = 'public, max-age=31536000, immutable';
  for (const out of [off, on]) {
    const h = parseHeaders(text(out, '_headers'));
    for (const p of ['/offline-worker.js', '/', '/build.json']) expect(h[p]?.['Cache-Control'], p).toBe('no-cache');
    for (const p of ['/assets/*', '/vendor/leaflet-1.9.4/*']) expect(h[p]?.['Cache-Control'], p).toBe(immutable);
    expect(h['/*']?.['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  }
  const launchOnly = ['/tools/bags/', '/manifest.webmanifest', '/tools/bags/bike.js', '/tools/bags/bike-photo.js'];
  const hOff = parseHeaders(text(off, '_headers'));
  const hOn = parseHeaders(text(on, '_headers'));
  for (const p of launchOnly) {
    expect(hOff[p], p).toBeUndefined();
    expect(hOn[p]?.['Cache-Control'], p).toBe('no-cache');
  }
}, 60_000);

test('the command line takes --out and --launch', () => {
  const out = outDir();
  const r = spawnSync(process.execPath, [`${REPO}tools/build.mjs`, '--launch=off', `--out=${out}`], { cwd: REPO, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  expect(existsSync(join(out, 'offline-worker.js'))).toBe(true);
  expect(r.stdout.length).toBeLessThan(2000);
}, 60_000);
