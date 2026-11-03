// osmium tags-filter expressions: every tag set of section 6.0, and the objects that only support others
// (stops, shelters, platforms, bike parking, cemeteries, rescue points).
import { PLACE_FILTERS } from '../src/core/places/filters.ts';

export const placeFilterArgs = (): string[] => PLACE_FILTERS.map(({ key, values }) => `nwr/${key}=${values.join(',')}`);

// Boundaries in two steps: all administrative relations, then only the levels the country table uses.
export const boundaryFilterArgs = (): string[] => ['r/boundary=administrative'];
export const boundaryLevelArgs = (): string[] => ['r/admin_level=2,3,4,6'];
