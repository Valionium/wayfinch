import { beforeEach, expect, test, vi } from 'vitest';
import { instantAt } from '../../../../src/core/answers/time';
import { instantToWall, placeSpans, wallToInstant } from '../../../../src/core/hours/spans';
import { stateAt } from '../../../../src/core/hours/check';
import type { HoursSpan } from '../../../../src/core/types';
import { BERLIN, hoursOf, other, placeIn, shop } from './helpers';

const made = vi.hoisted(() => [] as string[]);
vi.mock('opening_hours', async (importOriginal) => {
  const real = (await importOriginal<{ default: new (...a: unknown[]) => object }>()).default;
  return { default: function counted(...a: unknown[]) { made.push(String(a[0])); return new real(...a); } };
});
beforeEach(() => { made.length = 0; });

const bw = placeIn('DE-BW');
const at = (date: string, hm: string, tz = BERLIN) => instantAt(date, hm, tz);

test('[H-UNKNOWN-TAG] a missing tag is unknown over the whole window, never open', () => {
  const h = hoursOf(null, bw, other, '2026-10-19', '2026-10-20');
  expect(h.spans).toHaveLength(1);
  expect(h.spans[0]).toMatchObject({ state: 'unknown', from: h.windowStart, to: h.windowEnd, reason: 'hours unknown' });
});

test.each(['', 'Mo-Fr 25:00-26:00', 'Mo 9-', 'not hours at all'])('[H-UNKNOWN-TAG] the library rejects %j: unknown', (tag) => {
  const h = hoursOf(tag, bw, other, '2026-10-19');
  expect(h.spans.map((s) => s.state)).toEqual(['unknown']);
});

test.each(['sunrise-sunset', 'Mo-Fr sunrise-sunset', 'Mo-Su 08:00-sunset', 'open'])(
  '[H-UNKNOWN-TAG] %j gives no clock time this wrapper can honour: unknown, not the hours the library guesses', (tag) => {
    const h = hoursOf(tag, bw, other, '2026-10-19');
    expect(h.spans.map((s) => s.state)).toEqual(['unknown']);
  });

test('[H-SPAN-BASIC] Mo-Sa 08:00-20:00 on Saturday 17 October 2026 in Berlin is open 06:00-18:00 UTC', () => {
  const h = hoursOf('Mo-Sa 08:00-20:00', bw, shop, '2026-10-17');
  const open = h.spans.filter((s) => s.state === 'open');
  expect(open.map((s) => [s.from.toISOString(), s.to.toISOString()])).toEqual([['2026-10-17T06:00:00.000Z', '2026-10-17T18:00:00.000Z']]);
  expect(stateAt(h, at('2026-10-17', '07:59'))).toMatchObject({ state: 'closed', until: at('2026-10-17', '08:00') });
  expect(stateAt(h, at('2026-10-17', '08:00'))).toMatchObject({ state: 'open', until: at('2026-10-17', '20:00') });
  expect(stateAt(h, at('2026-10-17', '20:00')).state).toBe('closed');
});

test('[H-SPAN-BASIC] the spans cover the window in order, with no hole and no overlap', () => {
  const h = hoursOf('Mo-Fr 09:00-12:00,14:00-18:00; Sa 09:00-12:00', bw, shop, '2026-10-16', '2026-10-19');
  expect(h.spans.length).toBeGreaterThan(1);
  expect(h.spans[0]!.from).toEqual(h.windowStart);
  expect(h.spans.at(-1)!.to).toEqual(h.windowEnd);
  for (let i = 1; i < h.spans.length; i++) expect(h.spans[i]!.from).toEqual(h.spans[i - 1]!.to);
  for (const s of h.spans) expect(s.to.getTime()).toBeGreaterThan(s.from.getTime());
});

test('[H-SPAN-BASIC] a span over midnight keeps its wall-clock ends on both days', () => {
  const h = hoursOf('Mo-Su 22:00-02:00', bw, other, '2026-10-19', '2026-10-20');
  expect(stateAt(h, at('2026-10-20', '01:30')).state).toBe('open');
  expect(stateAt(h, at('2026-10-20', '02:00')).state).toBe('closed');
  expect(stateAt(h, at('2026-10-20', '22:00')).state).toBe('open');
});

test('[H-SU-UNKNOWN] Mo-Sa 08:00-18:00; Su unknown on a Sunday reads unknown, and on Saturday as stated', () => {
  const h = hoursOf('Mo-Sa 08:00-18:00; Su unknown', bw, shop, '2026-10-17', '2026-10-18');
  expect(stateAt(h, at('2026-10-18', '10:00')).state).toBe('unknown');
  expect(stateAt(h, at('2026-10-17', '10:00')).state).toBe('open');
});

test('[H-WINDOW-END] an arrival after the window end, or before its start, reads "hours unknown — update"', () => {
  const h = hoursOf('24/7', bw, other, '2026-10-17');
  expect(stateAt(h, at('2026-10-17', '23:59')).state).toBe('open');
  for (const t of [h.windowEnd, at('2026-10-18', '12:00'), at('2026-10-16', '12:00')]) {
    expect(stateAt(h, t)).toEqual({ state: 'unknown', reason: 'hours unknown — update', until: null });
  }
});

test('[H-CHANGE-DAYS] 01:00-05:00 in Berlin on the spring change day: open by the wall clock, lasting 3 h', () => {
  const h = hoursOf('Mo-Su 01:00-05:00', bw, other, '2026-03-29');
  const open = h.spans.filter((s) => s.state === 'open');
  expect(open).toHaveLength(1);
  expect(instantToWall(open[0]!.from, BERLIN)).toMatchObject({ day: 29, hour: 1, minute: 0 });
  expect(instantToWall(open[0]!.to, BERLIN)).toMatchObject({ day: 29, hour: 5, minute: 0 });
  expect(open[0]!.to.getTime() - open[0]!.from.getTime()).toBe(3 * 3_600_000);
});

test('[H-CHANGE-DAYS] 01:00-05:00 in Berlin on the autumn change day: open by the wall clock, lasting 5 h', () => {
  const h = hoursOf('Mo-Su 01:00-05:00', bw, other, '2026-10-25');
  const open = h.spans.filter((s) => s.state === 'open');
  expect(open).toHaveLength(1);
  expect(instantToWall(open[0]!.from, BERLIN)).toMatchObject({ day: 25, hour: 1, minute: 0 });
  expect(instantToWall(open[0]!.to, BERLIN)).toMatchObject({ day: 25, hour: 5, minute: 0 });
  expect(open[0]!.to.getTime() - open[0]!.from.getTime()).toBe(5 * 3_600_000);
});

test('[H-CHANGE-DAYS] a span inside the hour the place itself skips does not exist, and an end inside it stops at the change', () => {
  const inside = hoursOf('Mo-Su 02:15-02:45', bw, other, '2026-03-29');
  expect(inside.spans.filter((s) => s.state === 'open')).toEqual([]);
  const across = hoursOf('Mo-Su 01:30-02:30', bw, other, '2026-03-29');
  const open = across.spans.filter((s) => s.state === 'open');
  expect(open.map((s) => [s.from.toISOString(), s.to.toISOString()])).toEqual([['2026-03-29T00:30:00.000Z', '2026-03-29T01:00:00.000Z']]);
});

test('[H-CHANGE-DAYS] a span inside the hour the place repeats is open in both passes, as the wall clock reads', () => {
  const h = hoursOf('Mo-Su 02:15-02:45', bw, other, '2026-10-25');
  const open = h.spans.filter((s) => s.state === 'open');
  expect(open.map((s) => s.from.toISOString())).toEqual(['2026-10-25T00:15:00.000Z', '2026-10-25T01:15:00.000Z']);
  expect(stateAt(h, new Date('2026-10-25T00:50:00Z')).state).toBe('closed');
});

test('[H-CHANGE-DAYS] wallToInstant reads the zone: a skipped time moves forward to the change, a repeated one is its first pass', () => {
  expect(wallToInstant(2026, 10, 17, 8, 0, BERLIN).toISOString()).toBe('2026-10-17T06:00:00.000Z');
  expect(wallToInstant(2026, 3, 29, 2, 30, BERLIN).toISOString()).toBe('2026-03-29T01:00:00.000Z');
  expect(wallToInstant(2026, 10, 25, 2, 30, BERLIN).toISOString()).toBe('2026-10-25T00:30:00.000Z');
  expect(wallToInstant(2026, 1, 15, 12, 0, 'Asia/Kolkata').toISOString()).toBe('2026-01-15T06:30:00.000Z');
  expect(instantToWall(new Date('2026-10-17T06:00:00Z'), BERLIN)).toEqual({ year: 2026, month: 10, day: 17, hour: 8, minute: 0, second: 0 });
});

const phAt11 = (zone: string, date: string) => {
  const h = hoursOf('PH 10:00-12:00', placeIn(zone), other, date);
  return stateAt(h, instantAt(date, '11:00', BERLIN)).state;
};

test('[H-REGION] DE-BY has a holiday on 6 January 2026, DE-NW does not', () => {
  expect(phAt11('DE-BY', '2026-01-06')).toBe('open');
  expect(phAt11('DE-NW', '2026-01-06')).toBe('closed');
});

test('[H-REGION] FR-57 has a holiday on 26 December 2026, FR-75 does not', () => {
  expect(phAt11('FR-57', '2026-12-26')).toBe('open');
  expect(phAt11('FR-75', '2026-12-26')).toBe('closed');
});

test('[H-REGION] a null key uses the country alone', () => {
  // 3 October is German unity day everywhere; 6 January only in some states, so not for the country alone.
  const de = { timeZone: BERLIN, hoursRegionKey: null, holidayZone: null, country: 'DE' };
  expect(stateAt(hoursOf('PH 10:00-12:00', de, other, '2026-10-03'), at('2026-10-03', '11:00')).state).toBe('open');
  expect(stateAt(hoursOf('PH 10:00-12:00', de, other, '2026-01-06'), at('2026-01-06', '11:00')).state).toBe('closed');
});

test('[H-CACHE] one tag, holiday zone, zone and rule class is evaluated once for 50 places', () => {
  const cache = new Map<string, HoursSpan[]>();
  const from = at('2026-10-17', '00:00');
  const to = at('2026-10-20', '00:00');
  const results = Array.from({ length: 50 }, () => placeSpans('Mo-Sa 08:00-20:00', bw, shop, from, to, {}, cache));
  expect(made.filter((t) => t === 'Mo-Sa 08:00-20:00')).toHaveLength(1);
  expect(results[49]).toEqual(results[0]);
  expect(results[0]!.some((s) => s.state === 'open')).toBe(true);
});

test.each([
  ['tag', 'Mo-Su 08:00-20:00', bw, shop],
  ['holiday zone', 'Mo-Sa 08:00-20:00', placeIn('DE-BY'), shop],
  ['time zone', 'Mo-Sa 08:00-20:00', { ...bw, timeZone: 'Europe/Lisbon' }, shop],
  ['rule kind', 'Mo-Sa 08:00-20:00', bw, { kind: 'bakery', nearStation: false }],
  ['station flag', 'Mo-Sa 08:00-20:00', bw, { kind: 'food-shop', nearStation: true }],
] as const)('[H-CACHE] a different %s is evaluated apart', (_name, tag, place, rule) => {
  const cache = new Map<string, HoursSpan[]>();
  const from = at('2026-10-17', '00:00');
  const to = at('2026-10-20', '00:00');
  placeSpans('Mo-Sa 08:00-20:00', bw, shop, from, to, {}, cache);
  placeSpans(tag, place, rule, from, to, {}, cache);
  expect(cache.size).toBe(2);
});

test('[H-CACHE] the same key over another window is evaluated apart, so a recomputed window is never served stale', () => {
  const cache = new Map<string, HoursSpan[]>();
  placeSpans('24/7', bw, other, at('2026-10-17', '00:00'), at('2026-10-18', '00:00'), {}, cache);
  const later = placeSpans('24/7', bw, other, at('2026-10-17', '00:00'), at('2026-10-25', '00:00'), {}, cache);
  expect(later.at(-1)?.to).toEqual(at('2026-10-25', '00:00'));
});
