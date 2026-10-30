// The ten countries: where to download, which boundaries mean "the country" and its regions, and the places that must land right.
import type { CountryCode } from '../src/core/places/countries.ts';

// Which OpenStreetMap boundary relation to use: its admin_level, and optionally more tags to match.
export type BoundaryPick = {
  level: number;
  iso1?: string;                 // ISO3166-1 must equal this
  name?: string;                 // name must equal this exactly
  iso2In?: string[];             // ISO3166-2 must be one of these
  needsIso2?: boolean;           // an ISO3166-2 tag must be there
};

// A city that holds its own holidays: the boundary at this level with exactly this name, inside the subdivision.
export type LocalZone = { level: number; name: string; inSubdivision: string; zone: string };

export type Sentinels = {
  inside: [name: string, lat: number, lon: number, holidayZone: string | null][];   // null: only "inside the country"
  outside: [name: string, lat: number, lon: number][];
};

export type CountryJob = {
  geofabrik: string;
  national: BoundaryPick;
  subdivision: BoundaryPick | null;
  regionalHolidays: boolean;      // the subdivision is also the hours region key
  localZones: LocalZone[];
  sentinels: Sentinels;
};

export const SETTINGS = {
  drinkPlaces: true,
  settlementAltNames: false,
  maxPlacesPerTile: 5000,
  maxFiles: 20000,
  maxFileBytes: 26214400,
  countDropLimit: 0.2,
};

const level2 = (iso1: string): BoundaryPick => ({ level: 2, iso1 });

export const COUNTRY_JOBS: Record<CountryCode, CountryJob> = {
  DE: {
    geofabrik: 'europe/germany',
    national: level2('DE'),
    subdivision: { level: 4, needsIso2: true },
    regionalHolidays: true,
    localZones: [{ level: 6, name: 'Augsburg', inSubdivision: 'DE-BY', zone: 'DE-BY-Augsburg' }],
    sentinels: {
      inside: [['Berlin', 52.52, 13.405, 'DE-BE'], ['München', 48.137, 11.575, 'DE-BY'], ['Augsburg Rathaus', 48.369, 10.898, 'DE-BY-Augsburg'],
        ['Nürnberg', 49.4521, 11.0767, 'DE-BY'], ['Kehl', 48.5726, 7.8156, 'DE-BW'], ['Büsingen', 47.697, 8.69, null]],
      outside: [['Strasbourg', 48.5734, 7.7521], ['Zürich', 47.3769, 8.5417]],
    },
  },
  AT: {
    geofabrik: 'europe/austria', national: level2('AT'), subdivision: { level: 4, needsIso2: true }, regionalHolidays: true, localZones: [],
    sentinels: { inside: [['Wien', 48.2082, 16.3738, 'AT-9'], ['Salzburg', 47.8095, 13.055, 'AT-5']], outside: [['München', 48.137, 11.575]] },
  },
  CH: {
    geofabrik: 'europe/switzerland', national: level2('CH'), subdivision: { level: 4, needsIso2: true }, regionalHolidays: true, localZones: [],
    sentinels: { inside: [['Zürich', 47.3769, 8.5417, 'CH-ZH'], ['Bern', 46.948, 7.4474, 'CH-BE']], outside: [['Büsingen', 47.697, 8.69], ['Konstanz', 47.6633, 9.1753]] },
  },
  FR: {
    // "France métropolitaine" (level 3), because level 2 holds the overseas parts, which an extract of metropolitan France does not have whole.
    geofabrik: 'europe/france', national: { level: 3, name: 'France métropolitaine' },
    subdivision: { level: 6, iso2In: ['FR-57', 'FR-67', 'FR-68'] }, regionalHolidays: true, localZones: [],
    sentinels: { inside: [['Strasbourg', 48.5734, 7.7521, 'FR-67'], ['Metz', 49.1193, 6.1757, 'FR-57'], ['Paris', 48.8566, 2.3522, 'FR']], outside: [['Kehl', 48.5726, 7.8156], ['Genève Suisse', 46.2044, 6.1432]] },
  },
  NL: {
    // Level 2 is the whole Kingdom, so the country is level 3 "Nederland".
    geofabrik: 'europe/netherlands', national: { level: 3, name: 'Nederland' }, subdivision: { level: 4, needsIso2: true }, regionalHolidays: false, localZones: [],
    sentinels: { inside: [['Amsterdam', 52.3676, 4.9041, 'NL'], ['Maastricht', 50.8514, 5.691, 'NL']], outside: [['Aachen', 50.7753, 6.0839]] },
  },
  DK: {
    geofabrik: 'europe/denmark', national: level2('DK'), subdivision: { level: 4, needsIso2: true }, regionalHolidays: false, localZones: [],
    sentinels: { inside: [['København', 55.6761, 12.5683, 'DK']], outside: [['Hamburg', 53.5511, 9.9937]] },
  },
  PL: {
    geofabrik: 'europe/poland', national: level2('PL'), subdivision: { level: 4, needsIso2: true }, regionalHolidays: false, localZones: [],
    sentinels: { inside: [['Warszawa', 52.2297, 21.0122, 'PL']], outside: [['Berlin', 52.52, 13.405]] },
  },
  CZ: {
    geofabrik: 'europe/czech-republic', national: level2('CZ'), subdivision: { level: 6, needsIso2: true }, regionalHolidays: false, localZones: [],
    sentinels: { inside: [['Praha', 50.0755, 14.4378, 'CZ']], outside: [['Dresden', 51.0504, 13.7373]] },
  },
  BE: {
    geofabrik: 'europe/belgium', national: level2('BE'), subdivision: { level: 4, needsIso2: true }, regionalHolidays: false, localZones: [],
    sentinels: { inside: [['Bruxelles', 50.8503, 4.3517, 'BE']], outside: [['Lille', 50.6292, 3.0573]] },
  },
  LU: {
    geofabrik: 'europe/luxembourg', national: level2('LU'), subdivision: null, regionalHolidays: false, localZones: [],
    sentinels: { inside: [['Luxembourg', 49.6116, 6.1319, 'LU']], outside: [['Trier', 49.7596, 6.6439]] },
  },
};
