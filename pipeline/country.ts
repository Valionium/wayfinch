// node pipeline/country.ts <cc> --built-on YYYY-MM-DD [--work-dir dir] [--out-dir dir]
// Runs on Linux with osmium-tool. Every command goes through execFile, never through a shell string.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { BoundaryIndex } from './boundaries.ts';
import { classifyCountry } from './classify-country.ts';
import { COUNTRY_JOBS, SETTINGS } from './config.ts';
import { writeCountryOutput } from './country-output.ts';
import { boundaryFilterArgs, boundaryLevelArgs, placeFilterArgs } from './filters.ts';
import { readBoundaries, readObjects } from './read-geojson.ts';
import { checkSentinels, describeBoundaries, makeZoneOf } from './zones.ts';
import { COUNTRY_CODES } from '../src/core/places/countries.ts';
import type { CountryCode } from '../src/core/places/countries.ts';

const run = promisify(execFile);
const USER_AGENT = 'wayfinch-place-packs (github.com/Valionium/wayfinch)';
const BOUNDARY_CELL_DEG = 0.1;

async function sh(command: string, args: string[]): Promise<string> {
  const { stdout } = await run(command, args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim();
}

async function md5(file: string): Promise<string> {
  const hash = createHash('md5');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const cc = process.argv[2] as CountryCode;
  const builtOn = arg('--built-on');
  if (!COUNTRY_CODES.includes(cc) || !builtOn || !/^\d{4}-\d{2}-\d{2}$/.test(builtOn)) {
    console.error('usage: node pipeline/country.ts <country code> --built-on YYYY-MM-DD');
    return 1;
  }
  const job = COUNTRY_JOBS[cc];
  const work = path.resolve(arg('--work-dir') ?? `pipeline/work/${cc}`);
  const outDir = path.resolve(arg('--out-dir') ?? 'pipeline/out');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const f = (name: string): string => path.join(work, name);
  const stamp = (label: string, since: number): void => console.log(`${cc} ${label}: ${Math.round((Date.now() - since) / 1000)} s`);

  const url = `https://download.geofabrik.de/${job.geofabrik}-latest.osm.pbf`;
  const curl = ['--fail', '--location', '--retry', '3', '--user-agent', USER_AGENT, '--silent', '--show-error'];
  let t = Date.now();
  await sh('curl', [...curl, '-o', f('in.pbf'), url]);
  await sh('curl', [...curl, '-o', f('in.pbf.md5'), `${url}.md5`]);
  const expected = readFileSync(f('in.pbf.md5'), 'utf8').trim().split(/\s+/)[0];
  const actual = await md5(f('in.pbf'));
  if (expected !== actual) { console.error(`${cc}: the download is damaged (checksum ${actual}, expected ${expected})`); return 1; }
  stamp('download', t);

  const sourceDate = (await sh('osmium', ['fileinfo', '-g', 'header.option.osmosis_replication_timestamp', f('in.pbf')])).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) { console.error(`${cc}: the file has no source date`); return 1; }

  t = Date.now();
  await sh('osmium', ['tags-filter', f('in.pbf'), ...placeFilterArgs(), '-o', f('places.pbf'), '--overwrite']);
  await sh('osmium', ['tags-filter', f('in.pbf'), ...boundaryFilterArgs(), '-o', f('admin.pbf'), '--overwrite']);
  await sh('osmium', ['tags-filter', f('admin.pbf'), ...boundaryLevelArgs(), '-o', f('bounds.pbf'), '--overwrite']);
  rmSync(f('in.pbf'));                                   // the disk is tight for France
  rmSync(f('admin.pbf'));
  for (const name of ['places', 'bounds']) {
    await sh('osmium', ['export', '-f', 'geojsonseq', '-x', 'print_record_separator=false', '--add-unique-id=type_id', '--overwrite', '-o', f(`${name}.geojsonseq`), f(`${name}.pbf`)]);
  }
  stamp('filter and export', t);

  t = Date.now();
  const features = await readBoundaries(createReadStream(f('bounds.geojsonseq')));
  const index = new BoundaryIndex(features, BOUNDARY_CELL_DEG);
  const zoneOf = makeZoneOf(job, cc, index);
  const problems = checkSentinels(job, zoneOf);
  if (problems.length > 0) {
    for (const name of ['bounds', 'places']) console.error(`first lines of ${name}.geojsonseq:
${await sh('head', ['-c', '500', f(`${name}.geojsonseq`)])}`);
    console.error(`${cc}: boundary check failed:\n  ${problems.join('\n  ')}\nboundaries in the extract:\n  ${describeBoundaries(features).join('\n  ')}`);
    return 2;
  }
  const out = await classifyCountry(readObjects(createReadStream(f('places.geojsonseq'))), zoneOf, cc, sourceDate, { builtOn, drinkPlaces: SETTINGS.drinkPlaces, settlementAltNames: SETTINGS.settlementAltNames });
  await writeCountryOutput(path.join(outDir, `country-${cc}.json.gz`), out);
  stamp('classify', t);
  console.log(`${cc} done: source ${sourceDate}, ${out.places.length} places, ${out.roofs.length} roofs, ${out.rescuePoints.length} rescue points`);
  return 0;
}

process.exitCode = await main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); return 1; });
