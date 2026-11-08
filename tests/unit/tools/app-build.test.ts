import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Plugin } from 'vite';
import { buildDist, runVite } from '../../../tools/build.mjs';
import { measure } from '../../../tools/size-budget.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const tmpRoot = mkdtempSync(join(tmpdir(), 'wf-app-build-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
    .sort();
const text = (dir: string, f: string) => readFileSync(join(dir, f), 'utf8');
const buildJson = (dir: string) => JSON.parse(text(dir, 'build.json')) as { files: Record<string, string> };

// What the headers file said before the app existed (sub-project 4, group 2). The off build must keep saying exactly this.
const OFF_HEADERS = [
  '/offline-worker.js\n  Cache-Control: no-cache\n',
  '/\n  Cache-Control: no-cache\n',
  '/build.json\n  Cache-Control: no-cache\n',
  '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n',
  '/vendor/leaflet-1.9.4/*\n  Cache-Control: public, max-age=31536000, immutable\n',
  '/*\n  Referrer-Policy: strict-origin-when-cross-origin\n',
].join('');

test('[APP-SWITCH-OFF] with the switch off no Vite step runs, and the build is what it was before the app: the page, the worker, the headers, build.json', async () => {
  const vite = vi.fn(() => Promise.resolve());
  const out = join(tmpRoot, 'off');
  await buildDist({ out, launch: false, vite });
  expect(vite).not.toHaveBeenCalled();
  expect(files(out)).toEqual(['_headers', 'build.json', 'index.html', 'offline-worker.js']);
  // nothing of public/ beyond the page itself: no manifest, no icons, no fonts
  expect(existsSync(join(out, 'manifest.webmanifest'))).toBe(false);
  expect(existsSync(join(out, 'icons'))).toBe(false);
  const page = readFileSync(join(REPO, 'releases', 'load-check-root.html')); // the frozen copy at / (sub-project 6, Task 1)
  expect(sha256(readFileSync(join(out, 'index.html')))).toBe(sha256(page));
  expect(text(out, '_headers')).toBe(OFF_HEADERS);
  // the precache list holds the page alone, so the build id depends on the page and nothing the app adds
  const list = buildJson(out).files;
  expect(Object.keys(list).sort()).toEqual(['/', '/offline-worker.js']);
  expect(list['/']).toBe(sha256(page));
  const buildId = sha256(JSON.stringify({ '/': sha256(page) })).slice(0, 12);
  expect(text(out, 'offline-worker.js')).toContain(buildId);
}, 60_000);

test('[APP-SWITCH-ON] the default build (no switch given) reads build.config.json, which says on since the launch (owner, 7 Nov 2026)', async () => {
  const config = JSON.parse(readFileSync(join(REPO, 'build.config.json'), 'utf8')) as { launch: boolean };
  expect(config.launch).toBe(true);
  const vite = vi.fn(async (dir: string) => { writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="app"></div>'); });
  const out = join(tmpRoot, 'default');
  await buildDist({ out, vite });
  expect(vite).toHaveBeenCalledTimes(1);
  expect(files(out)).toContain('manifest.webmanifest');
}, 60_000);

let on = '';
beforeAll(async () => {
  on = join(tmpRoot, 'on');
  await buildDist({ out: on, launch: true });
}, 120_000);

test('[APP-SWITCH-ON] with the switch on, / is the app shell, the bag planner stays at /tools/bags/, and the manifest and icons ship', () => {
  const html = text(on, 'index.html');
  expect(html).toContain('<div id="app">');
  expect(html).toMatch(/<script type="module"[^>]*src="\/assets\/[^"]+\.js"/);
  expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
  expect(html).not.toContain('loadcheck-offline-shell'); // not Load Check's page
  expect(existsSync(join(on, 'tools', 'bags', 'index.html'))).toBe(true);
  expect(existsSync(join(on, 'manifest.webmanifest'))).toBe(true);
  for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) expect(existsSync(join(on, 'icons', icon))).toBe(true);
  // fonts are files the site serves itself, never from outside
  expect(files(on).filter((f) => f.endsWith('.woff2')).length).toBeGreaterThanOrEqual(4);
  expect(files(on).some((f) => f.endsWith('.woff'))).toBe(false);
  expect(html + readdirSync(join(on, 'assets')).filter((f) => f.endsWith('.css')).map((f) => text(on, `assets/${f}`)).join('')).not.toMatch(/https?:\/\//);
});

test('[APP-SWITCH-ON] /offline-worker.js precaches every emitted file, under the address the host serves', () => {
  const list = buildJson(on).files;
  const worker = text(on, 'offline-worker.js');
  const emitted = files(on).filter((f) => !['offline-worker.js', '_headers', 'build.json'].includes(f));
  expect(emitted.length).toBeGreaterThan(8);
  for (const file of emitted) {
    const address = `/${file}`.replace(/\/index\.html$/, '/');
    expect(list[address], address).toBe(sha256(readFileSync(join(on, file))));
    expect(worker, address).toContain(`"${address}"`);
  }
  expect(list['/']).toBeDefined();
  expect(list['/tools/bags/']).toBeDefined();
  expect(list['/manifest.webmanifest']).toBeDefined();
});

test('[APP-NO-HOOK] a production build\'s JavaScript contains no __wf', () => {
  const scripts = files(on).filter((f) => f.endsWith('.js') && !f.startsWith('tools/'));
  expect(scripts.length).toBeGreaterThan(0);
  for (const file of scripts) expect(text(on, file).includes('__wf'), file).toBe(false);
});

test('[APP-NO-HOOK] only a --test-hooks build has window.__wf, and only with the launch switch on', async () => {
  const hooked = join(tmpRoot, 'hooks');
  await buildDist({ out: hooked, launch: true, testHooks: true });
  const scripts = files(hooked).filter((f) => f.endsWith('.js') && !f.startsWith('tools/'));
  expect(scripts.some((f) => text(hooked, f).includes('__wf'))).toBe(true);
  // The production build has none of the hook's code, not even as a chunk nobody loads.
  expect(scripts.some((f) => text(hooked, f).includes('loadCase'))).toBe(true);
  for (const f of files(on).filter((x) => x.endsWith('.js'))) {
    expect(f).not.toMatch(/test-hooks/);
    expect(text(on, f).includes('loadCase'), f).toBe(false);
  }
  await expect(buildDist({ out: join(tmpRoot, 'hooks-off'), launch: false, testHooks: true })).rejects.toThrow(/--launch=on/);
}, 120_000);

// 150 KB read as 150,000 bytes: the coordinator's ruling of 3 November 2026. It tightens the test (it was 150 x 1024) and
// loosens nothing; the owner may reverse it.
test("[PERF-JS-FIRST] the first screen's JavaScript, bike drawing included, sits under the 150 KB budget (150,000 bytes)", () => {
  const figures = measure(on);
  expect(figures.firstFiles.length).toBeGreaterThan(0);
  expect(figures.firstJsGzip).toBeGreaterThan(1000);
  // The bike module is in it: the drawing is on the first screen.
  expect(figures.firstFiles.some((f) => text(on, f).includes('bk-casing'))).toBe(true);
  console.log(`PERF-JS-FIRST: ${figures.firstJsGzip} bytes gzipped`);
  expect(figures.firstJsGzip).toBeLessThanOrEqual(150_000);
});

// 200 KB read as 200,000 bytes, as the first-screen budget is (the same ruling).
test('[PERF-JS-LAZY] all lazy chunks together sit under 200 KB gzipped (200,000 bytes); the bag planner is not counted', () => {
  const figures = measure(on);
  const lazy = files(on).filter((f) => f.endsWith('.js') && f.startsWith('assets/') && !figures.firstFiles.includes(f));
  expect(lazy.length).toBeGreaterThan(2); // the tyre tool, You, A to B and the opening-hours library at least
  expect(figures.lazyJsGzip).toBeGreaterThan(10_000);
  console.log(`PERF-JS-LAZY: ${figures.lazyJsGzip} bytes gzipped in ${lazy.length} chunks`);
  expect(figures.lazyJsGzip).toBeLessThanOrEqual(200_000);
});

// The glide back (the owner's device check of 5 November): Wayfinch's entry script holds the first frame until it has run, so the bike is
// drawn, and named, when the page is revealed. The hold can keep back nothing a rider could see: before the script runs the page is
// empty. It is the only thing that holds a frame, and the worker keeps it, so offline it comes from the phone itself.
test('[LC-GLIDE-OFF] the one render-blocking element of the shell is its entry script, precached; before it runs the page shows nothing', () => {
  const html = text(on, 'index.html');
  const blocking = [...html.matchAll(/<[^>]*\bblocking="([^"]*)"[^>]*>/g)];
  expect(blocking.map((m) => m[1])).toEqual(['render']);
  const entry = /^<script type="module"[^>]*\ssrc="\/(assets\/[^"]+\.js)"/.exec(blocking[0]![0]);
  expect(entry, 'the entry module script').not.toBeNull();
  expect(Object.keys(buildJson(on).files)).toContain(`/${entry![1]}`);
  // Nothing else may hold a frame: no other script in the body, no render-blocking stylesheet from outside.
  const body = /<body>([\s\S]*)<\/body>/.exec(html)![1]!;
  expect(body.replace(/<!--[\s\S]*?-->/g, '').trim()).toBe('<div id="app"></div>');
});

test('the launch-on build is the same twice', async () => {
  const again = join(tmpRoot, 'on-again');
  await buildDist({ out: again, launch: true });
  expect(files(again)).toEqual(files(on));
  expect(text(again, 'build.json')).toBe(text(on, 'build.json'));
}, 120_000);

// Review of PR 63, C1: the whole of build.config.json once reached the entry chunk, so flipping the launch switch renamed every
// chunk, and the bytes that deployed were not the bytes the owner had tested. Only the fields the app reads may reach its files.
describe("the launch switch and the deploy settings never reach the app's files (review of PR 63, C1)", () => {
  const real = JSON.parse(readFileSync(join(REPO, 'build.config.json'), 'utf8')) as Record<string, unknown>;
  /** vite.config.ts as it is, with build.config.json read as `config` instead of the file on disk. */
  const withConfig = (config: Record<string, unknown>): Plugin => ({
    name: 'wf-test-config', enforce: 'pre',
    load(id) { return /[\\/]build\.config\.json$/.test(id.split('?')[0]!) ? JSON.stringify(config, null, 2) : null; },
  });
  const built = async (name: string, config: Record<string, unknown>): Promise<Map<string, string>> => {
    const dir = join(tmpRoot, name);
    await runVite(dir, { plugins: [withConfig(config)] });
    return new Map(files(dir).map((f) => [f, sha256(readFileSync(join(dir, f)))]));
  };
  let base = new Map<string, string>();
  beforeAll(async () => { base = await built('config-real', real); }, 120_000);

  test.each([
    ['launch', { launch: !real['launch'] }],
    ['deployEnabled and deployWithoutReviewer', { deployEnabled: !real['deployEnabled'], deployWithoutReviewer: !real['deployWithoutReviewer'] }],
  ])('[APP-LAUNCH-BYTES] with only %s changed, every file Vite writes is byte-identical, under the same name', async (what, change) => {
    const other = await built(`config-${what.replace(/\W+/g, '-')}`, { ...real, ...change });
    expect([...other.keys()]).toEqual([...base.keys()]);
    for (const [f, hash] of base) expect(other.get(f), f).toBe(hash);
  }, 120_000);

  test('[APP-LAUNCH-BYTES] the stand-in config does reach the build: a field the app reads (weatherMode) changes its files', async () => {
    const other = await built('config-weather', { ...real, weatherMode: real['weatherMode'] === 'auto' ? 'tap' : 'auto' });
    expect([...other.entries()].some(([f, hash]) => base.get(f) !== hash)).toBe(true);
  }, 120_000);
});

// Leaflet 1.9.4 from this site (spec 7.1 item 7): the npm registry's published package, checked against its integrity
// (sha512-nxS1ynzJOmOlHp+iL3FyWqK89GtNL8U8rvlMOsQdTTssxZwCXh8N2NB3GDQOL+YR3XnWyZAxwQixURb+FA74PA==) and copied unchanged.
const LEAFLET: Record<string, string> = {
  'leaflet.js': 'db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a',
  'leaflet.css': 'a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6',
  LICENSE: '53e8dc25862014e4324741ca18fbe3611e11d42ef69f59f86ea8c5389647d4cb',
  'images/layers-2x.png': '066daca850d8ffbef007af00b06eac0015728dee279c51f3cb6c716df7c42edf',
  'images/layers.png': '1dbbe9d028e292f36fcba8f8b3a28d5e8932754fc2215b9ac69e4cdecf5107c6',
  'images/marker-icon-2x.png': '00179c4c1ee830d3a108412ae0d294f55776cfeb085c60129a39aa6fc4ae2528',
  'images/marker-icon.png': '574c3a5cca85f4114085b6841596d62f00d7c892c7b03f28cbfa301deb1dc437',
  'images/marker-shadow.png': '264f5c640339f042dd729062cfc04c17f8ea0f29882b538e3848ed8f10edb4da',
};

test('[LC-LEAFLET] Leaflet from /vendor/leaflet-1.9.4/ with subresource integrity, precached, long-lived; no unpkg in the page or its privacy text', () => {
  const page = text(on, 'tools/bags/index.html');
  const list = buildJson(on).files;
  for (const [file, hash] of Object.entries(LEAFLET)) {
    expect(sha256(readFileSync(join(on, 'vendor/leaflet-1.9.4', file))), file).toBe(hash);
    expect(list[`/vendor/leaflet-1.9.4/${file}`], `${file} precached`).toBe(hash);
  }
  // the page asks for the same bytes, by the hash it always had
  const sri = (file: string) => `sha256-${createHash('sha256').update(readFileSync(join(on, 'vendor/leaflet-1.9.4', file))).digest('base64')}`;
  expect(page.includes(`'/vendor/leaflet-1.9.4/leaflet.js','${sri('leaflet.js')}'`)).toBe(true);
  expect(page.includes(`'/vendor/leaflet-1.9.4/leaflet.css','${sri('leaflet.css')}'`)).toBe(true);
  expect(page.includes('unpkg')).toBe(false); // the privacy text is part of the page
  expect(text(on, '_headers')).toContain('/vendor/leaflet-1.9.4/*\n  Cache-Control: public, max-age=31536000, immutable\n');
});

test("[BK-PAINT-LAZY] the look extras are their own chunk: no pattern, texture or its words in the first screen's JavaScript", () => {
  const figures = measure(on);
  const first = figures.firstFiles.map((f) => text(on, f)).join('\n');
  for (const mark of ['feTurbulence', 'bk-rimband', 'Water-dyed', 'Liquid metal', 'patternTransform']) expect(first.includes(mark), mark).toBe(false);
  const lazy = files(on).filter((f) => f.startsWith('assets/') && f.endsWith('.js') && !figures.firstFiles.includes(f));
  const chunk = lazy.filter((f) => text(on, f).includes('feTurbulence'));
  expect(chunk.length).toBe(1);
  expect(text(on, chunk[0]!)).toContain('Water-dyed');
  // loaded by a dynamic import from the first screen, never a static one or a preload
  expect(first).toContain(`/${chunk[0]!.replace(/^assets\//, '')}`.slice(1));
  expect(text(on, 'index.html')).not.toContain(chunk[0]!);
});

test("[AH-ASK-NOTE] Ahead's which-pass words are their own chunk, loaded with the tap: not in the first screen's JavaScript", () => {
  const figures = measure(on);
  const first = figures.firstFiles.map((f) => text(on, f)).join('\n');
  for (const mark of ['(way back)', 'Choose which pass']) expect(first.includes(mark), mark).toBe(false);
  const lazy = files(on).filter((f) => f.startsWith('assets/') && f.endsWith('.js') && !figures.firstFiles.includes(f));
  expect(lazy.filter((f) => text(on, f).includes('Choose which pass')).length).toBe(1);
});

test("[YOU-INSTALL-ANDROID] the Android install line is You's, never in the first screen's JavaScript", () => {
  const figures = measure(on);
  const first = figures.firstFiles.map((f) => text(on, f)).join('\n');
  expect(first.includes('Play Protect')).toBe(false);
  const lazy = files(on).filter((f) => f.startsWith('assets/') && f.endsWith('.js') && !figures.firstFiles.includes(f));
  expect(lazy.some((f) => text(on, f).includes('Play Protect'))).toBe(true);
});

test("[TY-UI-BIKEBOX] the tyre tool's bike-choice logic is in the tool's own chunk, not in the first screen's JavaScript", () => {
  const figures = measure(on);
  const first = figures.firstFiles.map((f) => text(on, f)).join('\n');
  expect(first.includes('loadcheck:saved-at:v1')).toBe(false);
  const lazy = files(on).filter((f) => f.startsWith('assets/') && f.endsWith('.js') && !figures.firstFiles.includes(f));
  expect(lazy.some((f) => text(on, f).includes('loadcheck:saved-at:v1'))).toBe(true);
});

// Sub-project 11, group 2: the Tools screen (with its bike line and tyre card) is a chunk of its own, loaded by a dynamic import like the tyre
// tool; only its bag card, with the bike drawing, is in the first screen (the bike glides back from the bag planner, LC-GLIDE).
// 149,774 bytes is the first screen's figure on main (538e69e) at the branch point; the rule is that it may not rise above it.
test("[TB-TOOLS-LAZY] the Tools screen (bike line, tyre card) is not among the first screen's files, and the first screen is at or below main's figure", () => {
  const figures = measure(on);
  const first = figures.firstFiles.map((f) => text(on, f)).join('\n');
  expect(first.includes('tools-bike')).toBe(false);
  expect(first.includes('copilot:bikeChoice:v1')).toBe(false);
  const lazy = files(on).filter((f) => f.startsWith('assets/') && f.endsWith('.js') && !figures.firstFiles.includes(f));
  const chunk = lazy.filter((f) => text(on, f).includes('tools-bike'));
  expect(chunk.length).toBe(1);
  // loaded by a dynamic import from the first screen, never a static one or a preload
  expect(first).toContain(`/${chunk[0]!.replace(/^assets\//, '')}`.slice(1));
  expect(text(on, 'index.html')).not.toContain(chunk[0]!);
  console.log(`TB-TOOLS-LAZY: first screen ${figures.firstJsGzip} bytes gzipped`);
  expect(figures.firstJsGzip).toBeLessThanOrEqual(149_774);
});

// Sub-project 12, group 1: Bike care is a chunk of its own, loaded by a dynamic import like the tyre tool; its words (en-care.ts, with the
// content) are not in the first screen. 145,711 bytes is main's first screen (235535e, after PRs 64 and 65, which grew it from the 145,569 of the old branch point 42551e2); Bike care adds nothing to it; the
// rule is that it may never rise above main's figure.
test("[BC-CHUNK] Bike care is a lazy chunk; en-care is not in the first screen's files, and the first screen is at or below main's figure", () => {
  const figures = measure(on);
  const first = figures.firstFiles.map((f) => text(on, f)).join('\n');
  for (const mark of ['care-filters', 'Roadside repairs come in the next version', 'Lube the chain, after every wash']) expect(first.includes(mark), mark).toBe(false);
  const lazy = files(on).filter((f) => f.startsWith('assets/') && f.endsWith('.js') && !figures.firstFiles.includes(f));
  const chunk = lazy.filter((f) => text(on, f).includes('care-filters'));
  expect(chunk.length).toBe(1);
  expect(text(on, chunk[0]!)).toContain('Lube the chain, after every wash');
  // loaded by a dynamic import from the first screen, never a static one or a preload
  expect(first).toContain(`/${chunk[0]!.replace(/^assets\//, '')}`.slice(1));
  expect(text(on, 'index.html')).not.toContain(chunk[0]!);
  console.log(`BC-CHUNK: first screen ${figures.firstJsGzip} bytes gzipped, lazy ${figures.lazyJsGzip}`);
  expect(figures.firstJsGzip).toBeLessThanOrEqual(145_711);
});

// Care pictures, part 1 (design of 7 November 2026, section 5): each drawing is a file of its own, fetched when its step view opens; none is
// in the first screen's files, in Bike care's chunk or in any JavaScript, and each is precached for offline use.
test("[BC-PIC-LAZY] no picture is in the first screen's files, Bike care's chunk or any script; each is a precached file of its own, and the first screen stays at its figure", () => {
  const figures = measure(on);
  const dir = join(REPO, 'src', 'tools', 'care', 'pictures');
  const pictures = readdirSync(dir).filter((f) => f.endsWith('.svg'));
  expect(pictures.length).toBeGreaterThan(0);
  const all = files(on);
  const listed = Object.keys(buildJson(on).files);
  for (const p of pictures) {
    const bytes = readFileSync(join(dir, p));
    const where = all.filter((f) => readFileSync(join(on, f)).includes(bytes.subarray(40, 120)));
    expect(where.length, p).toBe(1);
    expect(where[0], p).toMatch(/^assets\/.+\.svg$/);
    expect(listed, p).toContain(`/${where[0]}`);
    expect(figures.firstFiles, p).not.toContain(where[0]);
  }
  expect(all.filter((f) => f.endsWith('.js') && text(on, f).includes('class="cp-')), 'a drawing in a script').toEqual([]);
  expect(figures.firstJsGzip).toBeLessThanOrEqual(145_700);
});

test('[BC-SOURCES-PRIVATE] the built Bike care chunk holds no "http": where each fact came from never ships', () => {
  const figures = measure(on);
  const lazy = files(on).filter((f) => f.startsWith('assets/') && f.endsWith('.js') && !figures.firstFiles.includes(f));
  const care = lazy.filter((f) => text(on, f).includes('care-filters') || text(on, f).includes('Lube the chain, after every wash'));
  expect(care.length).toBeGreaterThan(0);
  for (const f of care) expect(text(on, f).includes('http'), f).toBe(false);
  for (const f of files(on).filter((x) => x.endsWith('.js'))) expect(text(on, f).includes('parktool.com'), f).toBe(false);
});
