// Merges the ten country outputs into one build: the tiles, the manifest, and the choice of which input each country uses.
// CLI: node pipeline/merge.ts --build-id 20261103-1 --built-at 2026-11-03T03:17:00Z [--in dir] [--out dir] [--no-state]
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { CountryOutput } from './classify-country.ts';
import { SETTINGS } from './config.ts';
import { readCountryOutput } from './country-output.ts';
import { assignToTiles, DEEPEST_LEVEL, splitTree } from './quadtree.ts';
import { formatSizeReport, sizeReport } from './size-report.ts';
import { downloadLastGood, replaceLastGood } from './state.ts';
import { COUNTRY_CODES } from '../src/core/places/countries.ts';
import type { CountryCode } from '../src/core/places/countries.ts';
import { encodeTile } from '../src/core/places/pack-format.ts';
import { ALL_KINDS } from '../src/core/places/types.ts';
import type { ManifestTile, PackManifest, PackRescuePoint, Place, Roof, TileId } from '../src/core/places/types.ts';

export type CountryInput = { output: CountryOutput | null; status: 'fresh' | 'last-good' | 'missing'; reason: string | null };
export type MergeOptions = { buildId: string; builtAt: string; maxPerTile: number; drinkPlaces: boolean; outDir?: string; write?: boolean };

/** Fresh output when it is there and has not shrunk by more than the limit; else the last good one; else nothing. */
export function chooseCountryInputs(
  fresh: Map<CountryCode, CountryOutput>, lastGood: Map<CountryCode, CountryOutput>, limit: number,
): Map<CountryCode, CountryInput> {
  const result = new Map<CountryCode, CountryInput>();
  for (const cc of COUNTRY_CODES) {
    const now = fresh.get(cc);
    const before = lastGood.get(cc);
    if (now && before) {
      const dropped = (before.places.length - now.places.length) / before.places.length;
      if (before.places.length > 0 && dropped > limit) {
        result.set(cc, { output: before, status: 'last-good', reason: `${cc} has ${now.places.length} places now against ${before.places.length} last time, a drop of more than ${Math.round(limit * 100)}%` });
      } else {
        result.set(cc, { output: now, status: 'fresh', reason: null });
      }
    } else if (now) {
      result.set(cc, { output: now, status: 'fresh', reason: null });
    } else if (before) {
      result.set(cc, { output: before, status: 'last-good', reason: `the ${cc} job failed or gave nothing` });
    } else {
      result.set(cc, { output: null, status: 'missing', reason: `the ${cc} job gave nothing and there is no earlier output` });
    }
  }
  return result;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const tileKey = (t: TileId): string => `${t.z}/${t.x}/${t.y}`;
const DROPPED_WITHOUT_DRINKS = ['drink', 'ice_cream'];

export async function mergeBuild(inputs: Map<CountryCode, CountryInput>, opts: MergeOptions): Promise<{ dir: string; manifest: PackManifest; problems: string[]; warnings: string[]; shares: Map<string, Record<string, number>> }> {
  const write = opts.write ?? true;
  const dir = opts.outDir ?? mkdtempSync(path.join(tmpdir(), 'pack-build-'));
  const shares = new Map<string, Record<string, number>>();
  const problems: string[] = [];
  const warnings: string[] = [];
  const places: Place[] = []; const roofs: Roof[] = []; const rescuePoints: PackRescuePoint[] = [];
  const seenPlaces = new Set<string>(); const seenRoofs = new Set<string>(); const seenRescue = new Set<string>();
  const countries: PackManifest['countries'] = {};

  for (const cc of [...COUNTRY_CODES].sort()) {
    const input = inputs.get(cc);
    const out = input?.output ?? null;
    if (!input || !out) { countries[cc] = { status: 'missing', builtOn: null, sourceDate: null, places: 0 }; continue; }
    const kept = out.places.filter((p) => opts.drinkPlaces || !DROPPED_WITHOUT_DRINKS.includes(p.kind));
    countries[cc] = { status: input.status, builtOn: out.builtOn, sourceDate: out.sourceDate, places: kept.length };
    for (const p of kept) if (!seenPlaces.has(p.id)) { seenPlaces.add(p.id); places.push(p); }
    for (const r of out.roofs) { const k = `${r.kind}|${r.lat}|${r.lon}|${r.bench}`; if (!seenRoofs.has(k)) { seenRoofs.add(k); roofs.push(r); } }
    for (const r of out.rescuePoints) { const k = `${r.ref}|${r.lat}|${r.lon}`; if (!seenRescue.has(k)) { seenRescue.add(k); rescuePoints.push(r); } }
  }

  const leaves = splitTree(places, opts.maxPerTile);
  const tiles = new Map<string, { id: TileId; places: Place[]; roofs: Roof[]; rescuePoints: PackRescuePoint[] }>();
  for (const l of leaves) tiles.set(tileKey(l.id), { id: l.id, places: l.places, roofs: [], rescuePoints: [] });
  const leafIds = leaves.map((l) => l.id);
  for (const a of assignToTiles(leafIds, roofs)) {
    const t = tiles.get(tileKey(a.id)) ?? { id: a.id, places: [], roofs: [], rescuePoints: [] };
    t.roofs = a.items; tiles.set(tileKey(a.id), t);
  }
  for (const a of assignToTiles(leafIds, rescuePoints)) {
    const t = tiles.get(tileKey(a.id)) ?? { id: a.id, places: [], roofs: [], rescuePoints: [] };
    t.rescuePoints = a.items; tiles.set(tileKey(a.id), t);
  }

  const entries: ManifestTile[] = [];
  const ordered = [...tiles.values()].sort((a, b) => a.id.z - b.id.z || a.id.x - b.id.x || a.id.y - b.id.y);
  for (const t of ordered) {
    if (t.places.length > opts.maxPerTile) warnings.push(`tile ${tileKey(t.id)} holds ${t.places.length} places, over the limit of ${opts.maxPerTile}, at the deepest level ${DEEPEST_LEVEL}`);
    const text = encodeTile({ places: t.places, roofs: t.roofs, rescuePoints: t.rescuePoints }, t.id);
    const bytes = Buffer.byteLength(text);
    if (bytes > SETTINGS.maxFileBytes) problems.push(`tile ${tileKey(t.id)} is ${bytes} bytes, over the host limit of ${SETTINGS.maxFileBytes}`);
    if (write) {
      const file = path.join(dir, 't', String(t.id.z), String(t.id.x), `${t.id.y}.json`);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    const share: Record<string, number> = {};
    for (const p of t.places) share[p.country] = (share[p.country] ?? 0) + 1;
    shares.set(tileKey(t.id), share);
    entries.push({ ...t.id, sha256: sha256(text), bytes, gzipBytes: gzipSync(text, { level: 9 }).length,
      places: t.places.length, roofs: t.roofs.length, rescuePoints: t.rescuePoints.length });
  }

  const manifest: PackManifest = {
    v: 1, buildId: opts.buildId, builtAt: opts.builtAt,
    licence: { name: 'ODbL-1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors', buildCode: 'https://github.com/Valionium/wayfinch' },
    countries,
    kinds: ALL_KINDS.filter((k) => opts.drinkPlaces || !DROPPED_WITHOUT_DRINKS.includes(k)),
    tiles: entries,
  };
  if (write) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  }
  return { dir, manifest, problems, warnings, shares };
}

/** A damaged or missing country file counts as no file, with the reason, instead of stopping the whole build. */
export async function readOutputOrNull(file: string): Promise<{ output: CountryOutput | null; error: string | null }> {
  try {
    return { output: await readCountryOutput(file), error: null };
  } catch (e) {
    return { output: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- command line ----------

const ROUTES = path.join(import.meta.dirname, '..', 'tests', 'fixtures', 'routes');
const readRoute = (id: string): { lat: number; lon: number }[] =>
  (JSON.parse(readFileSync(path.join(ROUTES, `${id}.json`), 'utf8')) as { points: { lat: number; lon: number }[] }).points;

// Section 5a's size check (criterion 7): the Heidelberg to Strasbourg download and the 800 km route,
// at the settings and with the levers of Decision 19 (a smaller tile limit, no drink places).
async function sizeSection(inputs: Map<CountryCode, CountryInput>, builtAt: string): Promise<string> {
  const rows = ['| Variant | Tiles | Plain MB | Gzip MB |', '| --- | ---: | ---: | ---: |'];
  const wholePack: string[] = [];
  for (const maxPerTile of [SETTINGS.maxPlacesPerTile, 2500]) {
    for (const drinkPlaces of [true, false]) {
      const { manifest, shares } = await mergeBuild(inputs, { buildId: '20000101-0', builtAt, maxPerTile, drinkPlaces, write: false });
      const label = `${maxPerTile} per tile, drink places ${drinkPlaces ? 'on' : 'off'}`;
      rows.push(formatSizeReport(`Heidelberg to Strasbourg, 20 km, ${label}`, sizeReport(manifest, readRoute('heidelberg-strasbourg'), 20, shares)));
      rows.push(formatSizeReport(`800 km fixture, 20 km, ${label}`, sizeReport(manifest, readRoute('multi-day-800'), 20, shares)));
      const gzip: Record<string, number> = {};
      for (const t of manifest.tiles) {
        const share = shares.get(`${t.z}/${t.x}/${t.y}`) ?? {};
        const total = Object.values(share).reduce((a, n) => a + n, 0) || 1;
        for (const [cc, n] of Object.entries(share)) gzip[cc] = (gzip[cc] ?? 0) + (t.gzipBytes * n) / total;
      }
      wholePack.push(`| ${label} | ${manifest.tiles.length} | ${Object.entries(gzip).map(([cc, b]) => `${cc} ${(b / 1e6).toFixed(1)}`).join(', ')} |`);
    }
  }
  const counts = COUNTRY_CODES.map((cc) => {
    const o = inputs.get(cc)?.output;
    return `| ${cc} | ${o?.places.length ?? 0} | ${o?.roofs.length ?? 0} | ${o?.rescuePoints.length ?? 0} |`;
  });
  return ['', '## Sizes', '', ...rows, '', '## Whole pack, gzip MB by country', '', '| Variant | Tiles | Gzip MB |', '| --- | ---: | --- |', ...wholePack,
    '', '## Counts per country', '', '| Country | Places | Roofs | Rescue points |', '| --- | ---: | ---: | ---: |', ...counts, ''].join('\n');
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function summary(manifest: PackManifest, inputs: Map<CountryCode, CountryInput>): string {
  const rows = COUNTRY_CODES.map((cc) => {
    const c = manifest.countries[cc]!;
    const why = inputs.get(cc)?.reason;
    return `| ${cc} | ${c.status} | ${c.sourceDate ?? '-'} | ${c.places} |${why ? ` ${why}` : ''}`;
  });
  const total = (key: 'bytes' | 'gzipBytes'): number => manifest.tiles.reduce((s, t) => s + t[key], 0);
  return [`## Place pack ${manifest.buildId}`, '', '| Country | Input | Source date | Places | Note', '| --- | --- | --- | ---: | ---', ...rows, '',
    `Tiles: ${manifest.tiles.length}. Plain bytes: ${total('bytes')}. Gzip bytes: ${total('gzipBytes')}.`, ''].join('\n');
}

async function main(): Promise<number> {
  const buildId = arg('--build-id'); const builtAt = arg('--built-at');
  if (!buildId || !builtAt) { console.error('usage: node pipeline/merge.ts --build-id <id> --built-at <time>'); return 1; }
  const inDir = path.resolve(arg('--in') ?? 'pipeline/in');
  const outDir = path.resolve(arg('--out') ?? 'pipeline/build');
  const useState = !process.argv.includes('--no-state');

  const files = new Map<CountryCode, string>();
  const fresh = new Map<CountryCode, CountryOutput>();
  for (const cc of COUNTRY_CODES) {
    const file = [path.join(inDir, `country-${cc}`, `country-${cc}.json.gz`), path.join(inDir, `country-${cc}.json.gz`)].find((f) => existsSync(f));
    if (file) {
      const r = await readOutputOrNull(file);
      if (r.output) { files.set(cc, file); fresh.set(cc, r.output); } else console.error(`${cc}: the new output could not be read (${r.error}); the last good one is used`);
    }
  }
  const lastGood = new Map<CountryCode, CountryOutput>();
  if (useState) {
    for (const cc of COUNTRY_CODES) {
      const file = await downloadLastGood(cc, path.join(tmpdir(), 'pack-last-good'));
      if (file) {
        const r = await readOutputOrNull(file);
        if (r.output) lastGood.set(cc, r.output); else console.error(`${cc}: the last good output could not be read (${r.error}); it is treated as missing`);
      }
    }
  }
  const inputs = chooseCountryInputs(fresh, lastGood, SETTINGS.countDropLimit);
  mkdirSync(outDir, { recursive: true });
  const { manifest, problems, warnings, dir } = await mergeBuild(inputs, { buildId, builtAt, maxPerTile: SETTINGS.maxPlacesPerTile, drinkPlaces: SETTINGS.drinkPlaces, outDir: path.join(outDir, buildId) });
  const text = summary(manifest, inputs) + (process.argv.includes('--size-report') ? await sizeSection(inputs, builtAt) : '');
  console.log(text);
  if (process.env['GITHUB_STEP_SUMMARY']) appendFileSync(process.env['GITHUB_STEP_SUMMARY'], text);
  if (warnings.length > 0) console.error(`merge warnings:\n  ${warnings.join('\n  ')}`);
  if (problems.length > 0) { console.error(`merge problems:\n  ${problems.join('\n  ')}`); return 1; }
  if (useState) for (const [cc, input] of inputs) if (input.status === 'fresh') await replaceLastGood(cc, files.get(cc)!);
  console.log(`build written to ${dir}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = await main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); return 1; });
}
