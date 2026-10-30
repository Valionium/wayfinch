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
