// Reads the published data the way the app will, from outside, and lists whatever is wrong. Takes no secret: the data is public.
import path from 'node:path';
import { readEntry, readManifest, readTile } from '../src/data/packs/reader.ts';
import type { ManifestTile, PackManifest } from '../src/core/places/types.ts';

export type LiveWait = { timeoutMs: number; pauseMs: number };

const FIVE_MINUTES: LiveWait = { timeoutMs: 5 * 60 * 1000, pauseMs: 15 * 1000 };
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const hasCors = (r: Response): boolean => r.headers.get('access-control-allow-origin') === '*';

async function liveEntry(base: string, fetcher: typeof fetch): Promise<{ buildId: string | null; response: Response | null; problem: string | null }> {
  try {
    const response = await fetcher(`${base}/packs/current.json`, { cache: 'no-store' });
    if (response.status !== 200) return { buildId: null, response, problem: `current.json answered ${response.status}` };
    return { buildId: readEntry(await response.text()).buildId, response, problem: null };
  } catch (e) {
    return { buildId: null, response: null, problem: `current.json does not read: ${message(e)}` };
  }
}

async function tileProblems(base: string, fetcher: typeof fetch, id: string, tile: ManifestTile, manifest: PackManifest): Promise<string[]> {
  const name = `${tile.z}/${tile.x}/${tile.y}`;
  const r = await fetcher(`${base}/packs/${id}/t/${name}.json`, { headers: { 'Accept-Encoding': 'gzip, br' } });
  if (r.status !== 200) return [`tile ${name} answered ${r.status}`];
  const problems: string[] = [];
  if (!hasCors(r)) problems.push(`tile ${name} has no CORS header`);
  if (!/^(gzip|br)$/.test(r.headers.get('content-encoding') ?? '')) problems.push(`tile ${name} is not compressed`);
  try { await readTile(new Uint8Array(await r.arrayBuffer()), tile, manifest); }
  catch (e) { problems.push(`tile ${name} does not read: ${message(e)}`); }
  return problems;
}

/** The problems with the live data; empty means good. Waits while the expected build is not live yet. */
export async function checkLive(base: string, fetcher: typeof fetch, expectedBuildId: string, wait: LiveWait = FIVE_MINUTES): Promise<string[]> {
  const until = Date.now() + wait.timeoutMs;
  let live = await liveEntry(base, fetcher);
  while (live.buildId !== expectedBuildId && Date.now() < until) {
    await sleep(wait.pauseMs);
    live = await liveEntry(base, fetcher);
  }
  if (live.problem) return [live.problem];
  if (live.buildId !== expectedBuildId) return [`the live build is ${live.buildId}, expected ${expectedBuildId}`];

  const problems: string[] = [];
  if (!/no-cache/.test(live.response?.headers.get('cache-control') ?? '')) problems.push('current.json has no no-cache');
  if (live.response && !hasCors(live.response)) problems.push('current.json has no CORS header');

  const m = await fetcher(`${base}/packs/${expectedBuildId}/manifest.json`);
  if (m.status !== 200) return [...problems, `the manifest answered ${m.status}`];
  if (!hasCors(m)) problems.push('the manifest has no CORS header');
  let manifest: PackManifest;
  try { manifest = readManifest(await m.text(), expectedBuildId); }
  catch (e) { return [...problems, `the manifest does not read: ${message(e)}`]; }

  const { tiles } = manifest;
  const samples = [...new Set([tiles[0], tiles[Math.floor(tiles.length / 2)], tiles[tiles.length - 1]])].filter((t) => t !== undefined);
  if (samples.length === 0) problems.push('the manifest lists no tiles');
  for (const t of samples) problems.push(...await tileProblems(base, fetcher, expectedBuildId, t, manifest));

  const missing = await fetcher(`${base}/packs/${expectedBuildId}/t/99/0/0.json`);
  if (missing.status !== 404) problems.push(`a missing tile answered ${missing.status}, not 404`);
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [base, buildId] = process.argv.slice(2);
  if (!base || !buildId) { console.error('usage: node pipeline/check-live.ts <address> <build id>'); process.exit(1); }
  const problems = await checkLive(base.replace(/\/$/, ''), fetch, buildId);
  for (const p of problems) console.error(p);
  console.log(problems.length === 0 ? `${base} serves build ${buildId}: all good` : `${problems.length} problem(s) at ${base}`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}
