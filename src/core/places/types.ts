// Place types of spec section 4.3 and the pack formats of section 5a. Pure types: nothing runs here.

export type PlaceKind =
  | 'water' | 'shop' | 'cafe' | 'restaurant' | 'fuel_shop' | 'campsite' | 'shelter' | 'hut'
  | 'lodging' | 'bike_shop' | 'repair_station' | 'air' | 'pharmacy' | 'hospital'
  | 'station' | 'toilets' | 'settlement' | 'drink' | 'ice_cream';

export const ALL_KINDS: readonly PlaceKind[] = [
  'water', 'shop', 'cafe', 'restaurant', 'fuel_shop', 'campsite', 'shelter', 'hut',
  'lodging', 'bike_shop', 'repair_station', 'air', 'pharmacy', 'hospital',
  'station', 'toilets', 'settlement', 'drink', 'ice_cream',
];

export type StopFlags = {
  indoorSeating: boolean | null;
  outdoorSeating: boolean | null;
  toilets: boolean | null;
  takeaway: boolean | null;
  kitchenHours: string | null;
  bikeParking50m: boolean;
};

/** At most two phone numbers, as mapped (section 6.13), and an http(s) website. */
export type Contact = { phones: string[]; website: string | null };

export type Place = {
  id: string; // 'n123', 'w123' or 'r123'
  kind: PlaceKind;
  name: string | null;
  lat: number;
  lon: number;
  waterClass: 'A' | 'B' | 'C' | 'D' | null;
  indoorOrLimited: boolean;
  openingHours: string | null;
  seasonal: string | null;
  checkDate: string | null;
  country: string;
  subdivision: string | null;
  hoursRegionKey: string | null;
  holidayZone: string | null;
  timeZone: string;
  tags: Record<string, string>;
  source: 'pack' | 'overpass';
  dataDate: string;
  stop: StopFlags | null;
  platformRoof: boolean | null;
  contact: Contact | null;
};

export type Roof = { kind: 'bus_stop' | 'bike_parking'; lat: number; lon: number; bench: boolean };

/** A rescue point as a pack holds it. Section 4.3's RescuePoint is this plus `kms`. */
export type PackRescuePoint = { lat: number; lon: number; ref: string };

export type TileContent = { places: Place[]; roofs: Roof[]; rescuePoints: PackRescuePoint[] };

export type TileId = { z: number; x: number; y: number };

/** Used by the shared classification (Group B). `points` are the vertices; `lat` and `lon` the centre. */
export type OsmObject = {
  id: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  points: [number, number][];
  polygon: [number, number][][] | null;
};

export type PackEntry = { v: 1; buildId: string; builtAt: string; manifest: string };

export type ManifestTile = {
  z: number; x: number; y: number;
  sha256: string; bytes: number; gzipBytes: number;
  places: number; roofs: number; rescuePoints: number;
};

export type CountryStatus = { status: 'fresh' | 'last-good' | 'missing'; builtOn: string | null; sourceDate: string | null; places: number };

export type PackManifest = {
  v: 1;
  buildId: string;
  builtAt: string;
  licence: { name: 'ODbL-1.0'; url: string; attribution: '© OpenStreetMap contributors'; buildCode: string };
  countries: Record<string, CountryStatus>;
  kinds: PlaceKind[];
  tiles: ManifestTile[];
};
