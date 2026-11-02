// Public holidays per holiday zone, prepared ahead of the stop (plan Decision 6). `screen()` receives this plain list,
// so the library stays out of it. This file reaches the library through spans.ts; engines must not import it.
import { zoneHolidayDates } from './spans';

/** Each zone's public holidays between two ISO dates, ends included, overrides of section 6.4 applied. */
export function holidaysFor(zones: string[], fromDate: string, toDate: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const firstYear = Number(fromDate.slice(0, 4));
  const lastYear = Number(toDate.slice(0, 4));
  for (const zone of zones) {
    const dates: string[] = [];
    for (let y = firstYear; y <= lastYear; y++) dates.push(...zoneHolidayDates(zone, y).filter((d) => d >= fromDate && d <= toDate));
    out[zone] = dates;
  }
  return out;
}
