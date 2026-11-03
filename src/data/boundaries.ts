// The bundled boundary file: served by the site, precached with the launch, fetched at preparation only.
import { zoneAt } from '../core/route/zones.ts';
import type { BoundaryFile, Zone } from '../core/route/zones.ts';

export const BOUNDARY_PATH = '/data/boundaries.v1.json';

const isCoord = (c: unknown): boolean => Array.isArray(c) && c.length === 2 && c.every((x) => typeof x === 'number' && Number.isFinite(x));

function knownZone(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

function usableFile(raw: unknown): raw is BoundaryFile {
  const f = raw as Partial<BoundaryFile> | null;
  return typeof f === 'object' && f !== null && f.v === 1 && typeof f.source === 'string' && Array.isArray(f.areas) && f.areas.length > 0
    && f.areas.every((a) => typeof a.country === 'string' && typeof a.holidayZone === 'string' && knownZone(a.timeZone)
      && Array.isArray(a.rings) && a.rings.every((r) => Array.isArray(r) && r.every(isCoord)));
}

/** Refresh this stretch's `deps.zoneAt`: the zone of a point from the bundled file, null outside the first countries. */
export async function loadZoneAt(fetcher: typeof fetch): Promise<(lat: number, lon: number) => Zone | null> {
  const file = await loadBoundaries(fetcher);
  return (lat, lon) => zoneAt(lat, lon, file);
}

export async function loadBoundaries(fetcher: typeof fetch): Promise<BoundaryFile> {
  const answer = await fetcher(BOUNDARY_PATH);
  if (!answer.ok) throw new Error(`boundary file: http-${answer.status}`);
  const raw: unknown = await answer.json();
  if (!usableFile(raw)) throw new Error('boundary file: not readable');
  return raw;
}
