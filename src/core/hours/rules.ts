// Holiday overrides and the labelled assumptions of spec section 6.4. Pure: it works on naive wall-clock numbers
// (see spans.ts) and imports no library.
import type { HoursSpan } from '../types';
import { W } from '../wording/en';

export type RuleClass = { kind: 'food-shop' | 'kiosk' | 'bakery' | 'fuel-shop' | 'other-shop' | 'other'; nearStation: boolean };
export type Seg = { from: number; to: number; state: HoursSpan['state']; reason?: string };

const DAY = 86_400_000;
const isoOf = (n: number): string => new Date(n).toISOString().slice(0, 10);

/** Easter Sunday as an ISO date (the anonymous Gregorian computus). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoOf(Date.UTC(year, month - 1, day));
}

const corpusChristi = (year: number): string => {
  const easter = easterSunday(year);
  return isoOf(Date.parse(`${easter}T00:00:00Z`) + 60 * DAY);
};

/** A holiday zone's country and library region: 'DE-BY-Augsburg' is DE and DE-BY; 'FR' is FR alone. */
export function zoneParts(zone: string): { country: string; key: string | null } {
  const parts = zone.split('-');
  return { country: parts[0]!, key: parts.length > 1 ? `${parts[0]!}-${parts[1]!}` : null };
}

/**
 * Where a zone differs from the library's data for a year. Corpus Christi counts in Saxony and Thuringia, which the
 * library does not have. 8 August counts inside Augsburg only, while the library has it for all of Bavaria.
 */
export function holidayEdits(zone: string, year: number): { added: string[]; removed: string[] } {
  const { key } = zoneParts(zone);
  return {
    added: key === 'DE-SN' || key === 'DE-TH' ? [corpusChristi(year)] : [],
    removed: key === 'DE-BY' && zone !== 'DE-BY-Augsburg' ? [`${year}-08-08`] : [],
  };
}

function isLocalHoliday(zone: string, date: string): boolean {
  const { key } = zoneParts(zone);
  if (key === 'DE-BY') return date.endsWith('-08-15');
  return (key === 'DE-SN' || key === 'DE-TH') && date === corpusChristi(Number(date.slice(0, 4)));
}

/** An explicit PH rule, not the letters inside a quoted comment. */
export const hasPhRule = (tag: string): boolean => /\bPH\b/.test(tag.replace(/"[^"]*"/g, ''));

export type RuleFacts = {
  country: string;
  zone: string;
  rule: RuleClass;
  /** The tag was read, so `segs` are its hours. Otherwise the place counts as having no hours. */
  tagged: boolean;
  phRule: boolean;
  holidays: Set<string>;
  /** Holidays the library can't see, so a PH rule says nothing on them. */
  unseenHolidays: Set<string>;
};

const FRENCH_REST_FROM = 13 * 60;

function mayOrClosed(mayBeOpen: boolean, reason: string): Pick<Seg, 'state' | 'reason'> {
  return mayBeOpen ? { state: 'unknown', reason: W.foodMayBeOpen } : { state: 'possibly-closed', reason };
}

/** The state a piece of one local day reads as, or null where no rule applies. */
function ruleFor(f: RuleFacts, s: Seg, date: string, weekday: number, minute: number): Pick<Seg, 'state' | 'reason'> | null {
  const { kind, nearStation } = f.rule;
  if (kind === 'other') return null;
  const sunday = weekday === 0;
  const holiday = f.holidays.has(date);
  const bakeryOrFuel = kind === 'bakery' || kind === 'fuel-shop';
  const germanRules = f.country === 'DE' || f.country === 'AT';

  if (f.tagged) {
    if (!germanRules || !holiday || s.state !== 'open') return null;
    if (f.phRule && !f.unseenHolidays.has(date)) return null;
    return mayOrClosed(bakeryOrFuel, isLocalHoliday(f.zone, date) ? W.foodLocalHoliday : W.foodHolidayRules);
  }
  if (germanRules && (sunday || holiday)) {
    return mayOrClosed(bakeryOrFuel, isLocalHoliday(f.zone, date) ? W.foodUnknownLocalHoliday : W.foodUnknownSundayRules);
  }
  if (f.country === 'CH' && sunday) return mayOrClosed(bakeryOrFuel || kind === 'kiosk' || nearStation, W.foodUnknownSundayRules);
  if (f.country === 'FR' && sunday && minute >= FRENCH_REST_FROM && (kind === 'food-shop' || kind === 'bakery')) {
    return { state: 'possibly-closed', reason: W.foodUnknownSundayRules };
  }
  return null;
}

/** Applies the rules of section 6.4 to ordered segments, cut at each midnight and at France's Sunday 13:00. */
export function applyRules(segs: Seg[], f: RuleFacts): Seg[] {
  if (f.rule.kind === 'other') return segs;
  const out: Seg[] = [];
  for (const s of segs) {
    let from = s.from;
    while (from < s.to) {
      const dayStart = Math.floor(from / DAY) * DAY;
      const weekday = new Date(dayStart).getUTCDay();
      const minute = Math.floor((from - dayStart) / 60_000);
      const cut = f.country === 'FR' && weekday === 0 && minute < FRENCH_REST_FROM ? dayStart + FRENCH_REST_FROM * 60_000 : dayStart + DAY;
      const to = Math.min(cut, s.to);
      const ruled = ruleFor(f, s, isoOf(dayStart), weekday, minute);
      out.push(ruled ? { from, to, ...ruled } : { ...s, from, to });
      from = to;
    }
  }
  return out;
}
