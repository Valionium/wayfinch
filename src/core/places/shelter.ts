import type { OsmObject } from './types.ts';
// Rain shelters of spec section 6.0 and section 5a step 7.

const SPELLINGS: Record<string, string> = {
  weathershelter: 'weather_shelter', leanto: 'lean_to', picnicshelter: 'picnic_shelter', basichut: 'basic_hut',
  weather: 'weather_shelter', publictransport: 'public_transport',
};

/** Lower case, spaces and hyphens become `_`, and known spellings are mapped (so `Wetterpilz` equals `wetterpilz`). */
export function normaliseShelterType(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (s === '') return null;
  return SPELLINGS[s.replace(/_/g, '')] ?? s;
}

/** Shelter types that count as cover or as a place to sleep. */
export const COVER_TYPES: readonly string[] = ['lean_to', 'basic_hut', 'weather_shelter', 'wetterpilz', 'picnic_shelter'];

const v = (tags: Record<string, string>, key: string): string | undefined => tags[key]?.trim().toLowerCase();

/** True for objects that must never be suggested or counted as shelter (section 6.0, "Never cover"). */
export function isNeverCover(tags: Record<string, string>): boolean {
  if (v(tags, 'amenity') === 'hunting_stand') return true;
  if (v(tags, 'amenity') !== 'shelter') return false;
  const type = normaliseShelterType(tags['shelter_type']);
  if (type === null || !COVER_TYPES.includes(type)) return true;
  const access = v(tags, 'access');
  return access === 'private' || access === 'no' || v(tags, 'disused') === 'yes' || v(tags, 'abandoned') === 'yes';
}

const byId = (a: OsmObject, b: OsmObject): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Even-odd test over every ring, so holes count as outside. Points are [lat, lon].
function inside(ring: [number, number][][], lat: number, lon: number): boolean {
  let odd = false;
  for (const r of ring) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [yi, xi] = r[i]!;
      const [yj, xj] = r[j]!;
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) odd = !odd;
    }
  }
  return odd;
}

/**
 * A shelter drawn both as an outline and as a node is kept once, as the outline, with the node's
 * tags added where the outline has none (section 5a step 7). The result is sorted by id.
 */
export function mergeOutlinesAndNodes(shelters: OsmObject[]): OsmObject[] {
  const outlines = shelters.filter((o) => o.polygon !== null).sort(byId);
  const nodes = shelters.filter((o) => o.polygon === null).sort(byId);
  const merged = new Map(outlines.map((o) => [o.id, { ...o, tags: { ...o.tags } }]));
  const kept: OsmObject[] = [];
  for (const n of nodes) {
    const home = outlines.find((o) => inside(o.polygon!, n.lat, n.lon));
    if (!home) { kept.push(n); continue; }
    const target = merged.get(home.id)!;
    for (const [k, value] of Object.entries(n.tags)) if (!(k in target.tags)) target.tags[k] = value;
  }
  return [...merged.values(), ...kept].sort(byId);
}
