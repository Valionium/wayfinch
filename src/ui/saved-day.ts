// A date the rider saved, as the phone's own day (sweep of 14 Nov 2026, #2): the bag planner stamps its summary in UTC.
import { localIsoDate } from '../core/answers/time.ts';
import { shortMapDate } from '../core/wording/en.ts';
import { deviceZone } from '../store/rules.ts';

/** "14 Nov": the phone's date of an instant saved as an ISO string. Anything else is no date. */
export function savedDay(at: string): string | null {
  const t = new Date(at);
  return Number.isFinite(t.getTime()) ? shortMapDate(localIsoDate(t, deviceZone())) : null;
}
