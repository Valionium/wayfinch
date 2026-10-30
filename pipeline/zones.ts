// The holiday zone of a point: the country boundary decides "inside", the regions and local zones decide the rest.
import { COUNTRIES } from '../src/core/places/countries.ts';
import type { CountryCode } from '../src/core/places/countries.ts';
import type { Zone } from '../src/core/places/classify.ts';
import type { BoundaryFeature, BoundaryIndex } from './boundaries.ts';
import type { BoundaryPick, CountryJob } from './config.ts';

function matches(pick: BoundaryPick, f: BoundaryFeature, cc: CountryCode): boolean {
  const t = f.tags;
  if (t['admin_level'] !== String(pick.level)) return false;
  if (pick.iso1 !== undefined && t['ISO3166-1'] !== pick.iso1) return false;
  if (pick.name !== undefined && t['name'] !== pick.name) return false;
  if (pick.needsIso2 && !t['ISO3166-2']?.startsWith(`${cc}-`)) return false;   // a neighbour's region is never ours
  if (pick.iso2In && !pick.iso2In.includes(t['ISO3166-2'] ?? '')) return false;
  return true;
}

export function makeZoneOf(job: CountryJob, cc: CountryCode, idx: BoundaryIndex): (lat: number, lon: number) => Zone | null {
  const timeZone = COUNTRIES[cc].timeZone;
  return (lat, lon) => {
    const found = idx.lookup(lat, lon);
    const sub = job.subdivision ? found.find((f) => matches(job.subdivision!, f, cc)) : undefined;
    const inside = job.nationalFromSubdivisions ? sub !== undefined : found.some((f) => matches(job.national, f, cc));
    if (!inside) return null;
    const subdivision = sub?.tags['ISO3166-2'] ?? null;
    const hoursRegionKey = job.regionalHolidays ? subdivision : null;
    let holidayZone = hoursRegionKey ?? cc;
    for (const lz of job.localZones) {
      if (subdivision === lz.inSubdivision && found.some((f) => f.tags['admin_level'] === String(lz.level) && f.tags['name'] === lz.name)) holidayZone = lz.zone;
    }
    return { country: cc, subdivision, hoursRegionKey, holidayZone, timeZone };
  };
}

// The sentinels are real places that must land where they belong. Any problem fails the country's job.
export function checkSentinels(job: CountryJob, zoneOf: (lat: number, lon: number) => Zone | null): string[] {
  const problems: string[] = [];
  for (const [name, lat, lon, expected] of job.sentinels.inside) {
    const z = zoneOf(lat, lon);
    if (!z) problems.push(`${name} should be inside the country but is outside`);
    else if (expected !== null && z.holidayZone !== expected) problems.push(`${name} should have zone ${expected} but has ${z.holidayZone}`);
  }
  for (const [name, lat, lon] of job.sentinels.outside) {
    if (zoneOf(lat, lon)) problems.push(`${name} should be outside the country but is inside`);
  }
  return problems;
}

// A short look at what the extract really holds, printed when a sentinel fails.
export function describeBoundaries(features: BoundaryFeature[]): string[] {
  // Relations first, the most important levels first: ways and small areas come last.
  const rank = (f: BoundaryFeature): number => (f.id.startsWith('r') ? 0 : 100) + Number(f.tags['admin_level'] ?? 99);
  const shown = [...features].sort((x, y) => rank(x) - rank(y)).slice(0, 40).map((f) =>
    `${f.id} level=${f.tags['admin_level'] ?? '-'} iso1=${f.tags['ISO3166-1'] ?? '-'} iso2=${f.tags['ISO3166-2'] ?? '-'} name=${f.tags['name'] ?? '-'} rings=${f.rings.length}`);
  if (features.length > 40) shown.push(`... and ${features.length - 40} more`);
  return shown;
}
