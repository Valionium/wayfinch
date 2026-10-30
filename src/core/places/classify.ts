// Kinds of spec section 6.0: one kind per object, first match wins.
import { readPhones, readWebsite } from './contact.ts';
import type { CountryCode } from './countries.ts';
import { isNeverCover } from './shelter.ts';
import type { OsmObject, Place, PlaceKind } from './types.ts';
import { keepTags, limitedText, MAX_HOURS, MAX_NAME } from './whitelist.ts';
import { waterClass } from './water.ts';

export type Zone = { country: CountryCode; subdivision: string | null; hoursRegionKey: string | null; holidayZone: string; timeZone: string };
export type PlaceContext = { zone: Zone; inCemetery: boolean; onCampsite: boolean; sourceDate: string };
export type ClassifyOptions = { drinkPlaces: boolean; settlementAltNames: boolean };

const v = (tags: Record<string, string>, key: string): string | undefined => tags[key]?.trim().toLowerCase();
const isOneOf = (value: string | undefined, list: string[]): boolean => value !== undefined && list.includes(value);

export function kindOf(tags: Record<string, string>, opts: ClassifyOptions): PlaceKind | null {
  const amenity = v(tags, 'amenity');
  const tourism = v(tags, 'tourism');
  const shop = v(tags, 'shop');
  const railway = v(tags, 'railway');

  if (amenity === 'hospital') return 'hospital';
  if (amenity === 'pharmacy') return 'pharmacy';
  if (railway === 'station' || railway === 'halt') {
    const excluded = v(tags, 'station') === 'subway' || v(tags, 'usage') === 'tourism' || v(tags, 'railway:preserved') === 'yes';
    return excluded ? null : 'station';
  }
  if (tourism === 'camp_site') return v(tags, 'tents') === 'no' ? null : 'campsite';
  if (tourism === 'wilderness_hut' || tourism === 'alpine_hut') return 'hut';
  if (isOneOf(tourism, ['hostel', 'guest_house', 'hotel', 'motel'])) return 'lodging';
  if (amenity === 'shelter') return isNeverCover(tags) ? null : 'shelter';
  if (amenity === 'fuel' && shop !== undefined && shop !== 'no' && v(tags, 'automated') !== 'yes') return 'fuel_shop';
  if (shop === 'bicycle') return 'bike_shop';
  if (amenity === 'bicycle_repair_station') return 'repair_station';
  if (amenity === 'compressed_air') return 'air';
  if (isOneOf(shop, ['supermarket', 'convenience', 'bakery', 'kiosk'])) return 'shop';
  if (amenity === 'cafe' || amenity === 'fast_food') return 'cafe';
  if (amenity === 'restaurant') return 'restaurant';
  if (amenity === 'pub' || amenity === 'biergarten') return opts.drinkPlaces ? 'drink' : null;
  if (amenity === 'ice_cream') return opts.drinkPlaces ? 'ice_cream' : null;
  if (amenity === 'toilets') return 'toilets';
  const water = waterClass(tags, { inCemetery: false });
  if (water !== null) return 'water';
  if (isOneOf(v(tags, 'place'), ['city', 'town', 'village'])) return 'settlement';
  return null;
}

const CONTACT_KINDS: PlaceKind[] = ['campsite', 'lodging', 'bike_shop'];
const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;

/** A place for the pack, or null when the object is none (section 6.0, 5a steps 5-7 and 12). */
export function classifyObject(o: OsmObject, ctx: PlaceContext, opts: ClassifyOptions): Place | null {
  const tags = o.tags;
  if (v(tags, 'disused') === 'yes' || v(tags, 'abandoned') === 'yes') return null;
  const kind = kindOf(tags, opts);
  if (kind === null) return null;

  const water = waterClass(tags, { inCemetery: ctx.inCemetery });
  if (kind === 'water' && (water === null || water === 'D')) return null;
  const waterOut = water === 'D' ? null : water;

  const name = limitedText(tags['name'], MAX_NAME);
  if (kind === 'settlement' && name === null) return null;

  const hasContact = CONTACT_KINDS.includes(kind) || (kind === 'hut' && v(tags, 'tourism') === 'alpine_hut');
  let contact: Place['contact'] = null;
  if (hasContact) {
    const phones = readPhones(tags, ctx.zone.country);
    const website = readWebsite(tags);
    if (phones.length > 0 || website !== null) contact = { phones, website };
  }

  const openingHours = limitedText(tags['opening_hours'], MAX_HOURS);
  const limited = waterOut !== null && (kind !== 'water' || ctx.onCampsite || v(tags, 'access') === 'customers');
  return {
    id: o.id, kind, name, lat: round5(o.lat), lon: round5(o.lon),
    waterClass: waterOut, indoorOrLimited: limited,
    openingHours,
    seasonal: limitedText(tags['seasonal'], MAX_HOURS),
    checkDate: limitedText(openingHours !== null ? tags['check_date:opening_hours'] : tags['check_date'], 32),
    country: ctx.zone.country, subdivision: ctx.zone.subdivision, hoursRegionKey: ctx.zone.hoursRegionKey,
    holidayZone: ctx.zone.holidayZone, timeZone: ctx.zone.timeZone,
    tags: keepTags(kind, tags, { settlementAltNames: opts.settlementAltNames, inCemetery: ctx.inCemetery }),
    source: 'pack', dataDate: ctx.sourceDate,
    stop: null, platformRoof: null, contact,
  };
}
