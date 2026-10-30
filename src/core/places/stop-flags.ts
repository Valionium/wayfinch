// Stop flags on food and drink places (section 5a step 10).
import type { NearIndex } from './near.ts';
import type { OsmObject, StopFlags } from './types.ts';
import { limitedText, MAX_HOURS } from './whitelist.ts';

const v = (tags: Record<string, string>, key: string): string | undefined => tags[key]?.trim().toLowerCase();

const seating = (value: string | undefined): boolean | null => (value === 'yes' ? true : value === 'no' ? false : null);
const offered = (value: string | undefined): boolean | null =>
  value === 'yes' || value === 'only' || value === 'customers' ? true : value === 'no' ? false : null;

/** Access values that make bike parking not public. */
export const NOT_PUBLIC = ['private', 'no', 'customers', 'permit'];

export function stopFlags(tags: Record<string, string>, bikeParking: NearIndex<OsmObject>, at: [number, number]): StopFlags {
  const publicParking = bikeParking.within(at[0], at[1], 50).some((o) => !NOT_PUBLIC.includes(v(o.tags, 'access') ?? ''));
  return {
    indoorSeating: seating(v(tags, 'indoor_seating')),
    outdoorSeating: seating(v(tags, 'outdoor_seating')),
    toilets: offered(v(tags, 'toilets')),
    takeaway: offered(v(tags, 'takeaway')),
    kitchenHours: limitedText(tags['opening_hours:kitchen'], MAX_HOURS),
    bikeParking50m: publicParking,
  };
}
