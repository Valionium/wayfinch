// osmium tags-filter expressions: every tag set of section 6.0, and the objects that only support others
// (stops, shelters, platforms, bike parking, cemeteries, rescue points).
const NWR = (key: string, values?: string[]): string => `nwr/${key}${values ? `=${values.join(',')}` : ''}`;

export function placeFilterArgs(): string[] {
  return [
    NWR('amenity', ['drinking_water', 'water_point', 'fountain', 'toilets', 'hospital', 'pharmacy', 'shelter', 'fuel', 'bicycle_repair_station',
      'compressed_air', 'cafe', 'fast_food', 'restaurant', 'pub', 'biergarten', 'ice_cream', 'bicycle_parking', 'grave_yard']),
    NWR('man_made', ['water_tap', 'water_well']),
    NWR('natural', ['spring']),
    NWR('drinking_water:refill', ['yes']),
    NWR('shop', ['supermarket', 'convenience', 'bakery', 'kiosk', 'bicycle']),
    NWR('tourism', ['camp_site', 'wilderness_hut', 'alpine_hut', 'hostel', 'guest_house', 'hotel', 'motel']),
    NWR('railway', ['station', 'halt', 'platform']),
    NWR('highway', ['bus_stop', 'emergency_access_point']),
    NWR('public_transport', ['platform']),
    NWR('emergency', ['access_point']),
    NWR('place', ['city', 'town', 'village']),
    NWR('landuse', ['cemetery']),
  ];
}

// Boundaries in two steps: all administrative relations, then only the levels the country table uses.
export const boundaryFilterArgs = (): string[] => ['r/boundary=administrative'];
export const boundaryLevelArgs = (): string[] => ['r/admin_level=2,3,4,6'];
