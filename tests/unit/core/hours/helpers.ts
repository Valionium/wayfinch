import { instantAt, addDaysIso } from '../../../../src/core/answers/time';
import { placeSpans, type HolidayOverrides, type HoursPlace, type RuleClass } from '../../../../src/core/hours/spans';
import type { PlaceHours } from '../../../../src/core/types';

export const BERLIN = 'Europe/Berlin';
export const shop: RuleClass = { kind: 'food-shop', nearStation: false };
export const other: RuleClass = { kind: 'other', nearStation: false };

export const placeIn = (holidayZone: string, timeZone = BERLIN, country = holidayZone.slice(0, 2)): HoursPlace => {
  const parts = holidayZone.split('-');
  return { timeZone, country, holidayZone, hoursRegionKey: parts.length > 1 ? parts.slice(0, 2).join('-') : null };
};

/** Hours of one place over whole local days, `fromDate` to `toDate` inclusive. */
export function hoursOf(tag: string | null, place: HoursPlace, rule: RuleClass, fromDate: string, toDate = fromDate, extra: HolidayOverrides = {}): PlaceHours {
  const windowStart = instantAt(fromDate, '00:00', place.timeZone);
  const windowEnd = instantAt(addDaysIso(toDate, 1), '00:00', place.timeZone);
  return { placeId: 'n1', windowStart, windowEnd, spans: placeSpans(tag, place, rule, windowStart, windowEnd, extra) };
}

/** The non-closed spans as ISO instants, to compare between device zones. */
export const brief = (h: PlaceHours): string[] =>
  h.spans.filter((s) => s.state !== 'closed').map((s) => `${s.state} ${s.from.toISOString()} ${s.to.toISOString()}`);
