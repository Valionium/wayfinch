// Every tag set of section 6.0, and the objects that only support others (stops, shelters, platforms, bike parking, cemeteries,
// rescue points). The pipeline's osmium filter and Refresh this stretch's query are both made from this one list.
export const PLACE_FILTERS: readonly { key: string; values: readonly string[] }[] = [
  { key: 'amenity', values: ['drinking_water', 'water_point', 'fountain', 'toilets', 'hospital', 'pharmacy', 'shelter', 'fuel', 'bicycle_repair_station',
    'compressed_air', 'cafe', 'fast_food', 'restaurant', 'pub', 'biergarten', 'ice_cream', 'bicycle_parking', 'grave_yard'] },
  { key: 'man_made', values: ['water_tap', 'water_well'] },
  { key: 'natural', values: ['spring'] },
  { key: 'drinking_water:refill', values: ['yes'] },
  { key: 'shop', values: ['supermarket', 'convenience', 'bakery', 'kiosk', 'bicycle'] },
  { key: 'tourism', values: ['camp_site', 'wilderness_hut', 'alpine_hut', 'hostel', 'guest_house', 'hotel', 'motel'] },
  { key: 'railway', values: ['station', 'halt', 'platform'] },
  { key: 'highway', values: ['bus_stop', 'emergency_access_point'] },
  { key: 'public_transport', values: ['platform'] },
  { key: 'emergency', values: ['access_point'] },
  { key: 'place', values: ['city', 'town', 'village'] },
  { key: 'landuse', values: ['cemetery'] },
];
