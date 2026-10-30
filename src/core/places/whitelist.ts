import type { PlaceKind } from './types.ts';
import { normaliseShelterType } from './shelter.ts';

const COMMON = ['amenity', 'shop', 'tourism', 'natural', 'man_made', 'railway', 'access', 'fee'];
const STOP = ['indoor_seating', 'outdoor_seating', 'toilets', 'toilets:access', 'takeaway', 'opening_hours:kitchen'];
const EXTRA: Record<PlaceKind, string[]> = {
  water: ['drinking_water', 'drinking_water:legal', 'drinking_water:refill'],
  campsite: ['backcountry', 'reservation', 'tents', 'locked'],
  hut: ['reservation', 'locked'],
  lodging: ['reservation', 'locked'],
  shelter: ['shelter_type', 'bench', 'covered', 'locked'],
  bike_shop: ['service:bicycle:repair', 'service:bicycle:pump'],
  repair_station: ['valves', 'service:bicycle:pump', 'service:bicycle:tools'],
  air: ['valves', 'service:bicycle:pump', 'service:bicycle:tools'],
  hospital: ['emergency'],
  toilets: ['drinking_water'],
  settlement: ['place', 'population'],
  shop: STOP, cafe: STOP, restaurant: STOP, drink: STOP, ice_cream: STOP, fuel_shop: STOP,
  pharmacy: [], station: [],
};
const SETTLEMENT_NAMES = ['name:en', 'name:de', 'name:fr', 'alt_name'];

export const MAX_NAME = 120;
export const MAX_HOURS = 255;
const MAX_TAG = 255;

/** Control characters are removed from every kept text. */
const CONTROL = new RegExp('[\u0000-\u001f\u007f-\u009f\u2028\u2029]', 'g');
export const stripControl = (s: string): string => s.replace(CONTROL, '');

/** Cleans a text and returns null when it is empty or longer than `max`. */
export function limitedText(raw: string | undefined, max: number): string | null {
  if (raw === undefined) return null;
  const s = stripControl(raw).trim();
  return s === '' || s.length > max ? null : s;
}

export function keepTags(kind: PlaceKind, tags: Record<string, string>, opts: { settlementAltNames: boolean; inCemetery?: boolean }): Record<string, string> {
  const keys = [...COMMON, ...EXTRA[kind], ...(kind === 'settlement' && opts.settlementAltNames ? SETTLEMENT_NAMES : [])];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const raw = tags[key];
    if (raw === undefined) continue;
    const value = key === 'shelter_type' ? normaliseShelterType(stripControl(raw)) : limitedText(raw, MAX_TAG);
    if (value !== null && value !== '' && value.length <= MAX_TAG) out[key] = value;
  }
  if (kind === 'water' && opts.inCemetery) out['in_cemetery'] = 'yes';
  return out;
}
