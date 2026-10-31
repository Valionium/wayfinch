// The folder that is deployed to the data host: the kept builds, the entry point, headers, a real 404 page and a licence page.
import { execFile } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { readEntry, readManifest } from '../src/data/packs/reader.ts';
import { SETTINGS } from './config.ts';
import { listAssets, realGh, RELEASE, repo } from './state.ts';

export type BuildRecord = { buildId: string; builtAt: string; replacedAt: string | null };
export type Limits = { maxFiles: number; maxFileBytes: number };

const KEEP_MS = 14 * 24 * 60 * 60 * 1000;

/** The current build, the newest build, and every build replaced less than two weeks ago (section 5a). */
export function buildsToKeep(history: BuildRecord[], now: string): BuildRecord[] {
  const latest = history.reduce((m, r) => (r.builtAt > m ? r.builtAt : m), '');
  return history.filter((r) =>
    r.replacedAt === null || r.builtAt === latest || Date.parse(now) - Date.parse(r.replacedAt) < KEEP_MS);
}

export function headersFile(buildIds: string[]): string {
  const blocks = [
    ['/packs/current.json', 'Access-Control-Allow-Origin: *', 'Cache-Control: no-cache'],
    ...buildIds.map((id) => [`/packs/${id}/*`, 'Access-Control-Allow-Origin: *', 'Cache-Control: public, max-age=31536000, immutable']),
  ];
  return blocks.map(([path, ...lines]) => [path, ...lines.map((l) => `  ${l}`)].join('\n')).join('\n\n') + '\n';
}

function walk(dir: string): { file: string; bytes: number }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [{ file: p, bytes: statSync(p).size }];
  });
}

/** Problems against the host's limits, counting every build in the folder. */
export function fileCountProblems(dir: string, limits: Limits): string[] {
  const files = walk(dir);
  const problems: string[] = [];
  if (files.length > limits.maxFiles) problems.push(`${files.length} files, over the host limit of ${limits.maxFiles}`);
  for (const f of files) if (f.bytes > limits.maxFileBytes) problems.push(`${path.relative(dir, f.file)} is ${f.bytes} bytes, over the host limit of ${limits.maxFileBytes}`);
  return problems;
}

const INDEX = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Wayfinch map data</title></head>
<body><p>Wayfinch's map data. © OpenStreetMap contributors, <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a>.
<a href="/packs/current.json">Current build</a>. <a href="https://github.com/Valionium/wayfinch">How it is made</a>.</p></body></html>
`;
const NOT_FOUND = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not found</title></head><body><p>Not found.</p></body></html>\n';

// The newest build must read as a whole: its manifest, and every tile the manifest lists.
function newestProblems(dir: string, buildId: string): string[] {
  const manifestFile = path.join(dir, 'manifest.json');
  if (!existsSync(manifestFile)) return [`the manifest of build ${buildId} is missing`];
  let manifest;
  try { manifest = readManifest(readFileSync(manifestFile, 'utf8'), JSON.parse(readFileSync(manifestFile, 'utf8')).buildId); }
  catch (e) { return [`the manifest of build ${buildId} does not read: ${e instanceof Error ? e.message : String(e)}`]; }
  return manifest.tiles.filter((t) => !existsSync(path.join(dir, 't', String(t.z), String(t.x), `${t.y}.json`))).map((t) => `tile ${t.z}/${t.x}/${t.y} of build ${buildId} is missing`);
}

export type DeploymentOptions = {
  builds: { buildId: string; builtAt: string; dir: string }[];
  newest: string;
  outDir: string;
  limits: Limits;
};

/** Writes the folder to deploy. With a problem, no folder is offered (dir is null). */
export async function prepareDeployment(opts: DeploymentOptions): Promise<{ dir: string | null; problems: string[] }> {
  const newest = opts.builds.find((b) => b.buildId === opts.newest);
  if (!newest) throw new Error(`the newest build ${opts.newest} is not among the builds`);
  const intact = newestProblems(newest.dir, newest.buildId);
  if (intact.length > 0) return { dir: null, problems: intact };
  rmSync(opts.outDir, { recursive: true, force: true });
  mkdirSync(path.join(opts.outDir, 'packs'), { recursive: true });
  for (const b of opts.builds) cpSync(b.dir, path.join(opts.outDir, 'packs', b.buildId), { recursive: true });
  const entry = { v: 1, buildId: newest.buildId, builtAt: newest.builtAt, manifest: `/packs/${newest.buildId}/manifest.json` };
  writeFileSync(path.join(opts.outDir, 'packs', 'current.json'), JSON.stringify(entry));
  readEntry(JSON.stringify(entry));
  writeFileSync(path.join(opts.outDir, '_headers'), headersFile(opts.builds.map((b) => b.buildId)));
  writeFileSync(path.join(opts.outDir, '404.html'), NOT_FOUND);
  writeFileSync(path.join(opts.outDir, 'index.html'), INDEX);
  const problems = fileCountProblems(opts.outDir, opts.limits);
  return { dir: problems.length === 0 ? opts.outDir : null, problems };
}

/** The history with the new build as the current one. Running it again for the same build changes nothing. */
export function nextHistory(history: BuildRecord[], build: { buildId: string; builtAt: string }, now: string): BuildRecord[] {
  if (history.some((r) => r.buildId === build.buildId)) return history;
  return [...history.map((r) => (r.replacedAt === null ? { ...r, replacedAt: now } : r)), { ...build, replacedAt: null }];
}

/** Only build archives, never the last good files or the history on the same release. */
export function archivesToDelete(assetNames: string[], keptIds: string[]): string[] {
  return assetNames.filter((n) => /^build-.+\.tar\.gz$/.test(n) && !keptIds.some((id) => n === `build-${id}.tar.gz`));
}

const HISTORY = 'builds.json';
const tar = promisify(execFile);

async function main(): Promise<number> {
  const root = path.resolve('pipeline/build');
  const [buildId, ...others] = readdirSync(root);
  if (!buildId || others.length > 0) { console.error(`expected one build in ${root}, found ${readdirSync(root).length}`); return 1; }
  const buildDir = path.join(root, buildId);
  const { builtAt } = readManifest(readFileSync(path.join(buildDir, 'manifest.json'), 'utf8'), buildId);
  const now = new Date().toISOString();
  const work = mkdtempSync(path.join(tmpdir(), 'pack-publish-'));
  const assets = (await listAssets(realGh)).map((a) => a.name);
  const fetchAsset = (name: string): Promise<string> => realGh(['release', 'download', RELEASE, '-R', repo(), '-p', name, '-D', work, '--clobber']);

  let history: BuildRecord[] = [];
  if (assets.includes(HISTORY)) {
    await fetchAsset(HISTORY);
    history = JSON.parse(readFileSync(path.join(work, HISTORY), 'utf8')) as BuildRecord[];
  }
  const keep = buildsToKeep(nextHistory(history, { buildId, builtAt }, now), now);

  const builds = [{ buildId, builtAt, dir: buildDir }];
  for (const r of keep.filter((k) => k.buildId !== buildId)) {
    const name = `build-${r.buildId}.tar.gz`;
    if (!assets.includes(name)) { console.error(`the archive of kept build ${r.buildId} is missing; nothing was published`); return 1; }
    await fetchAsset(name);
    const dir = path.join(work, r.buildId);
    mkdirSync(dir);
    await tar('tar', ['-xzf', path.join(work, name), '-C', dir]);
    builds.push({ buildId: r.buildId, builtAt: r.builtAt, dir });
  }

  const { dir, problems } = await prepareDeployment({ builds, newest: buildId, outDir: path.resolve('pipeline/out/deploy'), limits: { maxFiles: SETTINGS.maxFiles, maxFileBytes: SETTINGS.maxFileBytes } });
  if (!dir) { console.error(`nothing was published:\n  ${problems.join('\n  ')}`); return 1; }

  // Stored before the deploy: an archive stored too early does no harm, a deployment with no archive could not be rebuilt.
  const archive = path.join(work, `build-${buildId}.tar.gz`);
  await tar('tar', ['-czf', archive, '-C', buildDir, '.']);
  await realGh(['release', 'upload', RELEASE, archive, '-R', repo(), '--clobber']);
  const historyFile = path.join(work, HISTORY);
  writeFileSync(historyFile, JSON.stringify(keep, null, 1));
  await realGh(['release', 'upload', RELEASE, historyFile, '-R', repo(), '--clobber']);
  for (const name of archivesToDelete(assets, keep.map((k) => k.buildId))) await realGh(['release', 'delete-asset', RELEASE, name, '-R', repo(), '--yes']);

  if (process.env['GITHUB_OUTPUT']) appendFileSync(process.env['GITHUB_OUTPUT'], `build_id=${buildId}\n`);
  console.log(`build ${buildId} is ready to deploy, with ${builds.length - 1} earlier build(s) kept`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = await main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); return 1; });
}
