// The folder that is deployed to the data host: the kept builds, the entry point, headers, a real 404 page and a licence page.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readEntry } from '../src/data/packs/reader.ts';

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
