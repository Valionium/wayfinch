import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { holidaysFor } from '../../../src/core/hours/holidays.ts';
import type { BoundaryFile } from '../../../src/core/route/zones.ts';
import { loadBoundaries, loadZoneAt } from '../../../src/data/boundaries.ts';
import { buildDist } from '../../../tools/build.mjs';
import { boundaryGzip, BOUNDARY_BUDGET } from '../../../tools/size-budget.mjs';
import { COUNTRY_JOBS } from '../../../pipeline/config.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const text = readFileSync(here('../../../public/data/boundaries.v1.json'), 'utf8');
const file = JSON.parse(text) as BoundaryFile;

describe('the file', () => {
  test('[BND-LICENCE] the file names Natural Earth (public domain) and © OpenStreetMap contributors for the local zones', () => {
    expect(file.source).toContain('Natural Earth');
    expect(file.source).toContain('public domain');
    expect(file.source).toContain('© OpenStreetMap contributors');
  });

  test('[BND-LICENCE] THIRD_PARTY says the same; the licences page does once it exists (Task 20)', () => {
    const third = readFileSync(here('../../../THIRD_PARTY'), 'utf8');
    expect(third).toContain('Natural Earth');
    expect(third).toContain('public domain');
    expect(third).toContain('© OpenStreetMap contributors');
    expect(third).toContain('boundaries.v1.json');
    const page = here('../../../public/legal/licences.html');
    if (existsSync(page)) {
      const html = readFileSync(page, 'utf8');
      expect(html).toContain('Natural Earth');
      expect(html).toContain('OpenStreetMap');
    }
  });

  test('[BND-LOCAL] every key in the file is one the pipeline writes, and every key the pipeline writes is in the file', () => {
    const fromFile = new Set(file.areas.filter((a) => a.country !== 'XX').map((a) => a.holidayZone));
    // The local zones and every sentinel's zone are the pipeline's stated values.
    const stated = new Set<string>();
    for (const [cc, job] of Object.entries(COUNTRY_JOBS)) {
      for (const z of job.localZones) stated.add(z.zone);
      for (const s of job.sentinels.inside) if (s[3] !== null) stated.add(s[3]);
      if (!job.regionalHolidays) stated.add(cc);
      if (job.subdivision?.iso2In) for (const k of job.subdivision.iso2In) stated.add(k);
    }
    for (const key of stated) expect(fromFile, key).toContain(key);
    for (const key of fromFile) {
      const cc = key.slice(0, 2);
      const job = COUNTRY_JOBS[cc as keyof typeof COUNTRY_JOBS];
      expect(job, key).toBeDefined();
      if (!job.regionalHolidays) expect(key).toBe(cc);
      else if (job.subdivision?.iso2In) expect([cc, ...job.subdivision.iso2In]).toContain(key);
      else expect(key === cc ? 'country alone is not a zone here' : key).toMatch(new RegExp(`^${cc}-[0-9A-Z]+(-[A-Za-z]+)?$`));
    }
    // Germany's 16 states with Augsburg, Austria's 9, Switzerland's 26, France with its 3.
    const count = (cc: string): number => [...fromFile].filter((k) => k.startsWith(cc)).length;
    expect([count('DE'), count('AT'), count('CH'), count('FR')]).toEqual([17, 9, 26, 4]);
  });

  test('[BND-LOCAL] holidaysFor gives dates for each key', () => {
    for (const key of new Set(file.areas.filter((a) => a.country !== 'XX').map((a) => a.holidayZone))) {
      const dates = holidaysFor([key], '2026-01-01', '2026-12-31')[key]!;
      expect(dates.length, key).toBeGreaterThan(5);
      expect(dates, key).toContain('2026-12-25');
    }
    // The zones that differ really do: Augsburg's own day, and Good Friday in Alsace-Moselle only.
    expect(holidaysFor(['DE-BY-Augsburg'], '2026-08-01', '2026-08-31')['DE-BY-Augsburg']).toContain('2026-08-08');
    expect(holidaysFor(['DE-BY'], '2026-08-01', '2026-08-31')['DE-BY']).not.toContain('2026-08-08');
    expect(holidaysFor(['FR-67'], '2026-04-01', '2026-04-30')['FR-67']).toContain('2026-04-03');
    expect(holidaysFor(['FR'], '2026-04-01', '2026-04-30')['FR']).not.toContain('2026-04-03');
  });

  test('[BND-LOCAL] coordinates have at most 3 decimals', () => {
    for (const a of file.areas) for (const r of a.rings) {
      expect(r.length).toBeGreaterThanOrEqual(3);
      for (const [lon, lat] of r) {
        expect(Math.round(lon! * 1000) / 1000).toBe(lon);
        expect(Math.round(lat! * 1000) / 1000).toBe(lat);
      }
    }
  });

  test('[PERF-BOUNDARY] gzipped ≤ 150 KB, through tools/size-budget.mjs', () => {
    expect(BOUNDARY_BUDGET).toBe(150_000);
    const size = boundaryGzip(here('../../../public/data/boundaries.v1.json'));
    expect(size).toBeGreaterThan(10_000);
    expect(size).toBeLessThanOrEqual(BOUNDARY_BUDGET);
  });

  test('[PERF-BOUNDARY] the measure is of the file it is given: over the budget reads as over', () => {
    const big = join(mkdtempSync(join(tmpdir(), 'wf-bnd-')), 'x.json');
    const noise = Array.from({ length: 200_000 }, (_, i) => (i * 2_654_435_761) % 1_000_003).join(',');
    try {
      expect(boundaryGzip(here('../../../public/data/boundaries.v1.json'))).toBeLessThan(boundaryGzip(writeTo(big, noise)));
    } finally {
      rmSync(big, { force: true });
    }
  });

  test('[BND-AGREE] the proof on a live pack is on record, is of this very file, and passed', () => {
    // The proof itself needs live data, so it's run once by tools/prove-boundaries.mjs; a changed file makes the record stale.
    const proof = JSON.parse(readFileSync(here('../../../tools/boundaries-proof.json'), 'utf8')) as {
      fileSha256: string; sampled: number; agree: number; farDisagreements: unknown[]; buildId: string;
    };
    expect(proof.fileSha256).toBe(createHash('sha256').update(text).digest('hex'));
    expect(proof.sampled).toBeGreaterThanOrEqual(5000);
    expect(proof.agree / proof.sampled).toBeGreaterThanOrEqual(0.99);
    expect(proof.farDisagreements).toEqual([]);
    expect(proof.buildId).toMatch(/^\d{8}-\d+$/);
  });
});

function writeTo(path: string, content: string): string {
  writeFileSync(path, content);
  return path;
}

describe('in the build', () => {
  test('[BND-LICENCE] with the switch on it is served and precached; with the switch off it is not in the build', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wf-bnd-'));
    try {
      const off = await buildDist({ out: join(root, 'off'), launch: false });
      expect(Object.keys(off.precache)).not.toContain('/data/boundaries.v1.json');
      expect(existsSync(join(root, 'off', 'data', 'boundaries.v1.json'))).toBe(false);
      const on = await buildDist({ out: join(root, 'on'), launch: true, vite: async (dir: string) => { writeFileSync(join(dir, 'index.html'), '<!doctype html>'); } });
      expect(Object.keys(on.precache)).toContain('/data/boundaries.v1.json');
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    }
  }, 60_000);
});

describe('reading it', () => {
  const answer = (body: string, status = 200): typeof fetch => async () => new Response(body, { status });
  test('[BND-LOCAL] the app reads the file from its own address, and nothing about the rider goes with it', async () => {
    const asked: string[] = [];
    const got = await loadBoundaries(async (u) => { asked.push(String(u)); return new Response(text); });
    expect(asked).toEqual(['/data/boundaries.v1.json']);
    expect(got.areas.length).toBe(file.areas.length);
  });
  test('[BND-LOCAL] Refresh this stretch gets its zoneAt from the same file', async () => {
    const zoneOf = await loadZoneAt(async () => new Response(text));
    expect(zoneOf(48.5734, 7.7521)).toEqual({ country: 'FR', holidayZone: 'FR-67', timeZone: 'Europe/Paris' });
    expect(zoneOf(45.4642, 9.19)).toBeNull();
  });
  test('[BND-LOCAL] a damaged file or a failed answer is no file', async () => {
    await expect(loadBoundaries(answer('nonsense'))).rejects.toThrow();
    await expect(loadBoundaries(answer('{"v":2,"areas":[]}'))).rejects.toThrow();
    await expect(loadBoundaries(answer(text, 500))).rejects.toThrow();
    await expect(loadBoundaries(answer('{"v":1,"source":"x","areas":[{"country":"DE","holidayZone":"DE-BW","timeZone":"Not/AZone","rings":[[[1,2],[2,3],[3,4]]]}]}'))).rejects.toThrow();
  });
});
