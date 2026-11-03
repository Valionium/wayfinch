// The trip window of spec section 6.4, one for every place: Get ready's, Refresh this stretch's and the idle catch-up's.
// From the departure day to the planned end + 3 days, whole, in each place's own zone. Pure: `today` comes in.
import { addDaysIso } from '../answers/time.ts';

/** With no departure date, how far ahead the window reaches: the trip may begin any day. */
const NO_DATE_DAYS = 14;
/** Days after the planned end the window still covers (section 6.4). */
const AFTER_END_DAYS = 3;

/**
 * `from` and `toExclusive` are calendar dates: the window runs from 00:00 of `from` to 00:00 of `toExclusive`. A trip already
 * begun starts at yesterday, not at a departure long past, and a rider behind the plan gets the riding days ahead of today.
 */
export function hoursWindowDates(o: { departureDate: string | null; ridingDays: number; today: string }): { from: string; toExclusive: string; plannedEnd: string } {
  const days = Math.max(1, o.ridingDays);
  const yesterday = addDaysIso(o.today, -1);
  const d = o.departureDate;
  const from = d === null ? o.today : d > o.today ? d : d > yesterday ? d : yesterday;
  const plannedEnd = d === null ? addDaysIso(o.today, Math.max(days, NO_DATE_DAYS) - 1) : addDaysIso(d, days - 1);
  const behind = addDaysIso(o.today, days - 1);
  const end = d !== null && behind > plannedEnd ? behind : plannedEnd;
  return { from, toExclusive: addDaysIso(end, AFTER_END_DAYS + 1), plannedEnd };
}

/** The riding days of a route's stages: the highest day number. */
export const ridingDaysOf = (stages: { day: number }[]): number => stages.reduce((most, s) => Math.max(most, s.day), 1);
