// Clocks and sun times (spec section 12.2): from the day before departure to after the route end, a quarter of them on a
// threshold: 04:00, midnight, the daily start, sunset, civil dusk, a stage's halfway point.
import fc from 'fast-check';
import { addDaysIso, instantAt } from '../../src/core/answers/time.ts';
import { sunFromSuncalc } from '../../src/core/engines/daylight.ts';
import type { SunSource, SunTimes } from '../../src/core/types.ts';

/** A sun source says what it is, so a saved case can be read back. */
export type SunSpec = { kind: 'real' } | { kind: 'stub'; sunset: string; dusk: string; tz: string } | { kind: 'light-all-night' } | { kind: 'no-sun' } | { kind: 'broken' };
export type TaggedSun = SunSource & { spec: SunSpec };

const NOT_A_TIME = new Date(Number.NaN);

export function sunOf(spec: SunSpec): TaggedSun {
  const read = (lat: number, lon: number, date: string): SunTimes => {
    switch (spec.kind) {
      case 'real': return sunFromSuncalc(lat, lon, date);
      case 'stub': {
        const when = (hm: string): Date => instantAt(date, hm, spec.tz);
        return { dawn: when('07:20'), sunrise: when('07:55'), sunset: when(spec.sunset), dusk: when(spec.dusk), lightAllNight: false };
      }
      case 'light-all-night': return { dawn: null, sunrise: null, sunset: null, dusk: null, lightAllNight: true };
      case 'no-sun': return { dawn: null, sunrise: null, sunset: null, dusk: null, lightAllNight: false };
      case 'broken': return { dawn: NOT_A_TIME, sunrise: NOT_A_TIME, sunset: NOT_A_TIME, dusk: NOT_A_TIME, lightAllNight: false };
    }
  };
  return Object.assign(read, { spec });
}

export const sunSpec = (tz: string): fc.Arbitrary<SunSpec> => fc.oneof(
  { weight: 12, arbitrary: fc.constant<SunSpec>({ kind: 'real' }) },
  { weight: 6, arbitrary: fc.record({ sunset: fc.constantFrom('17:00', '18:00', '18:42', '20:30', '21:45'), dusk: fc.constantFrom('17:35', '18:35', '19:17', '21:05', '22:30') }).map((s): SunSpec => ({ kind: 'stub', tz, ...s })) },
  { weight: 1, arbitrary: fc.constantFrom<SunSpec>({ kind: 'light-all-night' }, { kind: 'no-sun' }, { kind: 'broken' }) },
);

/** Departure dates with a story: a Saturday, the clock changes, a day before a holiday, the turn of the year. */
export const departureDate = (): fc.Arbitrary<string | null> => fc.oneof(
  { weight: 12, arbitrary: fc.constantFrom('2026-10-17', '2026-10-24', '2026-03-28', '2026-06-03', '2026-07-11', '2026-08-14', '2026-12-24', '2026-12-31', '2027-01-02', '2026-05-30') },
  { weight: 1, arbitrary: fc.constant<string | null>(null) },
);

/** Section 3's range of daily start times, with both ends. */
export const startTime = (): fc.Arbitrary<string> => fc.constantFrom('08:30', '08:30', '08:30', '04:00', '06:15', '07:00', '10:00', '14:00');

export type Moment = { now: Date; onThreshold: boolean };
export type ClockFacts = { departureDate: string | null; startTime: string; days: number; tz: string; sun: SunSource; lat: number; lon: number; halfwayMin: number };

const hm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const minutesOf = (text: string): number => Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));
const ANY_DATE = '2026-07-11';

type Edge = 'midnight' | 'before-midnight' | 'four' | 'before-four' | 'after-four' | 'start' | 'before-start' | 'after-start' | 'sunset' | 'before-sunset' | 'dusk' | 'after-dusk' | 'halfway';
const EDGES: Edge[] = ['midnight', 'before-midnight', 'four', 'before-four', 'after-four', 'start', 'before-start', 'after-start', 'sunset', 'before-sunset', 'dusk', 'after-dusk', 'halfway'];

function edgeInstant(edge: Edge, date: string, c: ClockFacts): Date | null {
  const wall = (min: number): Date => instantAt(date, hm(min), c.tz);
  const start = minutesOf(c.startTime);
  const sun = (): SunTimes | null => {
    try {
      return c.sun(c.lat, c.lon, date);
    } catch {
      return null;
    }
  };
  switch (edge) {
    case 'midnight': return wall(0);
    case 'before-midnight': return wall(23 * 60 + 59);
    case 'four': return wall(240);
    case 'before-four': return wall(239);
    case 'after-four': return wall(241);
    case 'start': return wall(start);
    case 'before-start': return wall(Math.max(0, start - 1));
    case 'after-start': return wall(start + 1);
    case 'sunset': return sun()?.sunset ?? null;
    case 'before-sunset': { const s = sun()?.sunset; return s ? new Date(s.getTime() - 60_000) : null; }
    case 'dusk': return sun()?.dusk ?? null;
    case 'after-dusk': { const s = sun()?.dusk; return s ? new Date(s.getTime() + 60_000) : null; }
    case 'halfway': return wall(Math.min(23 * 60, start + Math.max(0, Math.round(c.halfwayMin))));
  }
}

/** The moment of a scenario. Most fall on the trip's own days; some on the day before and after its end. */
export function clock(c: ClockFacts): fc.Arbitrary<Moment> {
  const dayRange = fc.oneof(
    { weight: 1, arbitrary: fc.constantFrom(-1, -1, -3) },
    { weight: 6, arbitrary: fc.integer({ min: 0, max: Math.max(0, c.days - 1) }) },
    { weight: 1, arbitrary: fc.constantFrom(c.days, c.days + 1) },
  );
  const base = c.departureDate ?? ANY_DATE;
  return fc.tuple(dayRange, fc.oneof({ weight: 3, arbitrary: fc.oneof({ weight: 4, arbitrary: fc.integer({ min: 7 * 60, max: 20 * 60 }) }, { weight: 1, arbitrary: fc.integer({ min: 0, max: 1439 }) }).map((n): number | Edge => n) }, { weight: 1, arbitrary: fc.constantFrom<number | Edge>(...EDGES) })).map(([day, when]): Moment => {
    const date = addDaysIso(base, day);
    if (typeof when === 'number') return { now: instantAt(date, hm(when), c.tz), onThreshold: false };
    const edge = edgeInstant(when, date, c);
    return edge && Number.isFinite(edge.getTime()) ? { now: edge, onThreshold: true } : { now: instantAt(date, '12:00', c.tz), onThreshold: false };
  });
}
