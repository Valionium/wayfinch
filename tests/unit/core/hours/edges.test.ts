import { test as fcTest, fc } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { instantAt } from '../../../../src/core/answers/time';
import { buildSchedule } from '../../../../src/core/engines/pace';
import { openAtArrival, openOnArrival, openOver, openWaterWindow, stateAt } from '../../../../src/core/hours/check';
import { testTrip, zoneAt } from '../../../fixtures/build';
import { hoursValue } from '../../../gen';
import { BERLIN, hoursOf, other, placeIn, shop } from './helpers';

const SUNDAY = '2026-10-18';
const MONDAY = '2026-10-19';
const WHIT_MONDAY = '2026-05-25';
const bad = new Date(Number.NaN);
const bw = placeIn('DE-BW');
const read = (tag: string | null, date: string, hm: string, rule = shop, place = bw) => stateAt(hoursOf(tag, place, rule, date), instantAt(date, hm, place.timeZone));

describe('[H-NEVER-OPEN] an invalid date is never open', () => {
  const closedSunday = hoursOf('Mo-Sa 08:00-20:00', bw, shop, SUNDAY);
  const openDay = hoursOf('24/7', bw, other, MONDAY);
  const untagged = hoursOf(null, bw, other, MONDAY);
  const t = instantAt(MONDAY, '03:00', BERLIN);

  test.each([['closed on Sunday', closedSunday], ['open all day', openDay], ['untagged', untagged]] as const)('%s', (_n, h) => {
    expect(stateAt(h, bad)).toEqual({ state: 'unknown', reason: 'hours unknown — update', until: null });
    expect(openAtArrival(h, bad)).toBe(false);
    expect(openOnArrival(h, bad)).toBe(false);
    expect(openOnArrival(h, bad, true)).toBe(false);
    expect(openWaterWindow(h, bad)).toBe(false);
    expect(openOver(h, bad, bad)).toBe(false);
  });

  test('either end of a span alone', () => {
    expect(openOver(openDay, t, bad)).toBe(false);
    expect(openOver(openDay, bad, t)).toBe(false);
  });

  test.each([['0', 0], ['NaN', Number.NaN], ['negative', -25]])('a flat speed of %s, which the settings refuse, can\'t reach open through the schedule', (_n, flatKph) => {
    const trip = { ...testTrip(), flatKph };
    const departure = instantAt(MONDAY, '08:30', BERLIN);
    const schedule = buildSchedule(trip, { startKm: 0, startLegKm: 0, departure, dayStopKm: 78, date: MONDAY }, 1, zoneAt(trip.route.lengthKm));
    const arrival = schedule.atKm(30);
    const h = hoursOf('24/7', bw, other, MONDAY);
    if (Number.isNaN(arrival.getTime())) {
      expect(stateAt(h, arrival).state).toBe('unknown');
      expect(openOnArrival(h, arrival)).toBe(false);
      expect(openAtArrival(h, arrival)).toBe(false);
    } else {
      // A negative speed gives a time before the departure, which no valid ride has.
      expect(arrival.getTime()).toBeLessThan(departure.getTime());
    }
  });
});

describe('[H-UNKNOWN-TAG] a value with no clock time for its days says nothing about when', () => {
  test.each(['Mo-Fr', 'Mo-Su', 'Mo-Su open', 'Mar-Oct', 'Apr-Oct open', 'PH', 'Su,PH', 'week 10-50', 'Mo-Fr 08:00-12:00; Sa', 'Mo-Fr 08:00-12:00; Sa open', 'Mo 08:00-12:00,We,Fr', 'Mo-Fr "on request"'])(
    '%j reads unknown on Monday at 03:00, at noon, and at the weekend', (tag) => {
      for (const [date, hm] of [[MONDAY, '03:00'], [MONDAY, '12:00'], ['2026-10-17', '12:00']] as const) {
        expect(read(tag, date, hm, other).state, `${date} ${hm}`).toBe('unknown');
      }
    });

  test.each([
    ['24/7', '03:00', 'open'],
    ['Mo-Fr 24/7', '03:00', 'open'],
    ['Mo-Su 00:00-24:00', '03:00', 'open'],
    ['Mo-Fr 9-17', '12:00', 'open'],
    ['Mo-Fr 09.00-17.00', '12:00', 'open'],
    ['Mo,We 08:00-12:00,14:00-18:00', '11:00', 'open'],
    ['Mo 08:00-12:00,We,Fr 10:00-11:00', '11:00', 'open'],
    ['Mar-Oct Mo-Su 10:00-18:00; Nov-Feb off', '12:00', 'open'],
    ['Mo-Fr 08:00-18:00; Sa unknown "call first"', '12:00', 'open'],
    ['Mo-Fr 08:00-18:00; Su closed', '12:00', 'open'],
    ['off', '12:00', 'closed'],
    ['closed', '12:00', 'closed'],
    ['Mo off', '12:00', 'closed'],
  ])('%j keeps its clock times: at %s it reads %s', (tag, hm, state) => {
    expect(read(tag, MONDAY, hm, other).state).toBe(state);
  });

  const selector = fc.oneof(fc.constantFrom('Mo-Fr', 'Mo-Su', 'Sa,Su', 'Mar-Oct', 'Apr-Sep', 'PH', 'Su,PH', 'week 1-53'), fc.constantFrom('Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'));
  fcTest.prop([selector, fc.boolean(), fc.option(fc.constantFrom('Mo-Fr 08:00-12:00', 'Sa 09:00-10:00')), fc.integer({ min: 0, max: 1439 })])(
    'generated selector-only values are never open', (sel, withOpen, first, minute) => {
      const tag = [first, `${sel}${withOpen ? ' open' : ''}`].filter((x) => x !== null).join('; ');
      const h = hoursOf(tag, bw, other, MONDAY);
      expect(stateAt(h, new Date(h.windowStart.getTime() + minute * 60_000)).state).not.toBe('open');
    });

  fcTest.prop([hoursValue()])('the general generator holds this family too', (tag) => {
    if (!/^(?:Mo-Fr|Mo-Su|Mo-Su open|Mar-Oct|Apr-Oct open)$/.test(tag)) return;
    expect(hoursOf(tag, bw, other, MONDAY).spans.map((s) => s.state)).toEqual(['unknown']);
  });

  test('the general generator can produce this family', () => {
    const seen = new Set(fc.sample(hoursValue(), { numRuns: 3000, seed: 7 }));
    for (const tag of ['Mo-Fr', 'Mo-Su', 'Mo-Su open', 'Mar-Oct', 'Apr-Oct open']) expect(seen, tag).toContain(tag);
  });
});

describe('[H-DE-HOLIDAY] a PH rule counts only where it decides that day', () => {
  test.each([
    'PH off; Mo-Sa 08:00-20:00',                    // the later rule overrides it
    'Mo-Sa 08:00-20:00; PH -1 days 08:00-12:00',    // the day before a holiday
    'Mo-Sa 08:00-20:00; PH +1 days 08:00-12:00',    // the day after
    'Mo-Sa 08:00-20:00 || PH off',                  // a fallback that the first rule never reaches
    'PH 08:00-12:00; Mo-Sa 08:00-20:00',
  ])('%j at 11:00 on Whit Monday: possibly closed, "holiday rules"', (tag) => {
    const s = read(tag, WHIT_MONDAY, '11:00');
    expect(s.state).toBe('possibly-closed');
    expect(s.reason).toContain('probably closed (holiday rules)');
  });

  test.each([
    ['Mo-Sa 08:00-20:00; PH off', '11:00', 'closed'],
    ['Mo-Sa 08:00-20:00; PH 10:00-12:00', '11:00', 'open'],
    ['Mo-Sa 08:00-20:00; PH 10:00-12:00', '14:00', 'closed'],
    ['Mo-Su,PH 08:00-20:00', '11:00', 'open'],
    ['PH 09:00-13:00', '11:00', 'open'],
    ['PH -1 days 08:00-09:00; PH 09:00-13:00', '11:00', 'open'],
  ])('%j at %s on Whit Monday follows the rule: %s', (tag, hm, state) => {
    expect(read(tag, WHIT_MONDAY, hm).state).toBe(state);
  });

  test('an added rule decides only its own hours', () => {
    const tag = 'Mo-Sa 08:00-20:00, PH 10:00-12:00';
    expect(read(tag, WHIT_MONDAY, '11:00').state).toBe('open');
    expect(read(tag, WHIT_MONDAY, '14:00').state).toBe('possibly-closed');
  });

  test('a bakery with an overridden PH rule "may be open"', () => {
    const s = read('PH off; Mo-Sa 08:00-20:00', WHIT_MONDAY, '11:00', { kind: 'bakery', nearStation: false });
    expect(s.state).toBe('unknown');
    expect(s.reason).toContain('may be open');
  });

  test('the day before a holiday, a PH -1 days rule still decides, and no holiday rule applies', () => {
    expect(read('Mo-Sa 08:00-20:00; PH -1 days 08:00-12:00', '2026-05-23', '11:00').state).toBe('open');
    expect(read('Mo-Sa 08:00-20:00; PH -1 days 08:00-12:00', '2026-05-23', '14:00').state).toBe('open');
  });
});

describe('[H-REGION] a country the library has no holidays for', () => {
  test.each([['LI', 'Europe/Vaduz'], ['GB', 'Europe/London']])('%s: a PH rule reads unknown, plain hours read as stated', (country, timeZone) => {
    const place = { timeZone, hoursRegionKey: null, holidayZone: country, country };
    expect(hoursOf('Mo-Fr 08:00-20:00; PH off', place, shop, MONDAY).spans.map((s) => s.state)).toEqual(['unknown']);
    expect(hoursOf('PH 10:00-12:00', place, shop, MONDAY).spans.map((s) => s.state)).toEqual(['unknown']);
    expect(read('Mo-Fr 08:00-20:00', MONDAY, '12:00', shop, place).state).toBe('open');
  });
});
