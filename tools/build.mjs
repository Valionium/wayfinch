// Writes dist/: what the site serves. Spec sections 9.1, 9.5 and 9.7, Decisions 4 and 5 of sub-project 4's plan.
// node tools/build.mjs [--launch=on|off] [--out=dist] [--emergency]
// Deterministic: no dates, commit ids or absolute paths, so a merge that changes no served file changes nothing here.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE = join(ROOT, 'public', 'tools', 'bags', 'index.html');
const WORKER_SOURCE = join(ROOT, 'src', 'offline-worker.ts');
const PUBLIC = join(ROOT, 'public');
const EMERGENCY_WORKER = join(ROOT, 'tools', 'emergency-worker.js');

export const MAX_PRECACHED_BYTES = 2_097_152; // 2 MiB, §9.1

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** The address the host serves a file at: `index.html` → `/`, `tools/bags/index.html` → `/tools/bags/`. */
export function canonicalPath(distPath) {
  const path = `/${distPath.split(sep).join('/').replace(/^\/+/, '')}`;
  return path.endsWith('/index.html') ? path.slice(0, -'index.html'.length) : path;
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

function headersFile(launch) {
  const noCache = ['/offline-worker.js', '/', '/build.json'];
  if (launch) noCache.push('/tools/bags/', '/manifest.webmanifest', '/tools/bags/bike.js', '/tools/bags/bike-photo.js');
  const immutable = ['/assets/*', '/vendor/leaflet-1.9.4/*'];
  return [
    ...noCache.map((path) => `${path}\n  Cache-Control: no-cache\n`),
    ...immutable.map((path) => `${path}\n  Cache-Control: public, max-age=31536000, immutable\n`),
    '/*\n  Referrer-Policy: strict-origin-when-cross-origin\n',
  ].join('');
}

/** Vite builds the app's shell into `outDir`. Only a build with the launch switch on ever gets here (Task 1, APP-SWITCH-OFF). */
async function runVite(outDir) {
  const { build } = await import('vite');
  await build({
    root: ROOT,
    configFile: join(ROOT, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true },
  });
}

/**
 * The bike module for the bag planner (spec section 7.4): a classic script, `window.WayfinchBike`, so the page draws the same bike as
 * the app. Only a build with the launch switch on writes it.
 */
async function compileBikeScript() {
  const result = await esbuild({
    stdin: {
      contents: "import { bikeArt, nearestSwatchName, normaliseBike, oklabMedian, resolveBikeSpec, SWATCHES } from './src/core/bike/index.ts';\n"
        + 'window.WayfinchBike = Object.freeze({ bikeArt, resolveBikeSpec, SWATCHES, nearestSwatchName, normaliseBike, oklabMedian });\n',
      resolveDir: ROOT,
      sourcefile: 'bike-entry.ts',
      loader: 'ts',
    },
    absWorkingDir: ROOT,
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    charset: 'utf8',
    legalComments: 'none',
    minify: true,
    logLevel: 'silent',
  });
  return Buffer.from(result.outputFiles[0].contents);
}

async function compileWorker(buildId, precache) {
  const result = await esbuild({
    entryPoints: [WORKER_SOURCE],
    absWorkingDir: ROOT,
    bundle: true,
    write: false,
    format: 'iife', // a classic script: old pages register it with no module type (§9.5)
    target: 'es2020',
    platform: 'browser',
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'silent',
    define: { __BUILD__: JSON.stringify(buildId), __PRECACHE__: JSON.stringify(precache) },
  });
  return Buffer.from(result.outputFiles[0].contents);
}

/**
 * Builds the site into `out`.
 * `extraFiles` ({ 'assets/x.js': bytes }) are written and precached like any other file; only tests use it so far.
 * `pagePath` lets a test build a site around another page; `vite` lets a test watch for the one step only the launch runs.
 */
export async function buildDist({ out = join(ROOT, 'dist'), launch, emergency = false, extraFiles = {}, pagePath = PAGE, vite = runVite } = {}) {
  const config = JSON.parse(readFileSync(join(ROOT, 'build.config.json'), 'utf8'));
  const launchOn = launch ?? config.launch === true;
  const target = resolve(out);
  if (ROOT.startsWith(`${target}${sep}`) || `${target}${sep}` === ROOT) throw new Error('The build would delete the repository: choose another --out.');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });

  // With the switch off the page riders see stays Load Check, at /.
  if (launchOn) {
    // The co-pilot goes to /, built by Vite; public/ (the manifest, the icons, the bag planner at /tools/bags/) is copied as it is.
    // Neither happens with the switch off, so that build stays byte for byte what it was.
    if (existsSync(PUBLIC)) cpSync(PUBLIC, target, { recursive: true });
    const shell = mkdtempSync(join(tmpdir(), 'wf-vite-'));
    try {
      await vite(shell);
      cpSync(shell, target, { recursive: true });
    } finally {
      rmSync(shell, { recursive: true, force: true });
    }
    mkdirSync(join(target, 'tools', 'bags'), { recursive: true });
    writeFileSync(join(target, 'tools', 'bags', 'bike.js'), await compileBikeScript());
  } else {
    // With the switch off the page riders see stays Load Check, at /.
    writeFileSync(join(target, 'index.html'), readFileSync(pagePath));
  }
  for (const [path, bytes] of Object.entries(extraFiles)) {
    mkdirSync(dirname(join(target, path)), { recursive: true });
    writeFileSync(join(target, path), bytes);
  }

  // The precache list comes first: the worker's own hash isn't in its own list.
  const precache = {};
  for (const file of listFiles(target)) {
    const size = statSync(join(target, file)).size;
    if (size > MAX_PRECACHED_BYTES) throw new Error(`${file} is ${size} bytes, over the 2 MiB precache limit (${MAX_PRECACHED_BYTES}).`);
    precache[canonicalPath(file)] = sha256(readFileSync(join(target, file)));
  }
  const list = sorted(precache);
  const buildId = sha256(JSON.stringify(list)).slice(0, 12);

  const worker = emergency ? readFileSync(EMERGENCY_WORKER) : await compileWorker(buildId, list);
  writeFileSync(join(target, 'offline-worker.js'), worker);
  writeFileSync(join(target, '_headers'), headersFile(launchOn));
  writeFileSync(join(target, 'build.json'), `${JSON.stringify({
    v: 1,
    configHash: sha256(readFileSync(join(ROOT, 'wrangler.jsonc'))),
    files: sorted({ ...list, '/offline-worker.js': sha256(worker) }),
  }, null, 2)}\n`);
  return { out: target, build: buildId, precache: list };
}

async function main(args) {
  const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const launch = value('launch');
  if (launch !== undefined && launch !== 'on' && launch !== 'off') throw new Error('--launch takes on or off.');
  const result = await buildDist({
    out: value('out') ?? join(ROOT, 'dist'),
    launch: launch === undefined ? undefined : launch === 'on',
    emergency: args.includes('--emergency'),
  });
  console.log(`Built ${Object.keys(result.precache).length} precached file(s), build ${result.build}${args.includes('--emergency') ? ', emergency worker' : ''}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
