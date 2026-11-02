import OpeningHours from 'opening_hours';
import { describe, expect, test } from 'vitest';
import { addDaysIso, instantAt } from '../../../../src/core/answers/time';
import { stateAt } from '../../../../src/core/hours/check';
import { DEVICE_ZONES, withDeviceZone } from '../../../fixtures/zones';
import { BERLIN, brief, hoursOf, other, placeIn, shop } from './helpers';

const portugal = { timeZone: 'Europe/Lisbon', hoursRegionKey: null, holidayZone: 'PT', country: 'PT' };
const STEP = 15 * 60_000;
const newYork = 'America/New_York';

test('[H-DEVICE-ZONE] the zone switch really happens', () => {
  const offsets = DEVICE_ZONES.map(({ zone }) => withDeviceZone(zone, () => new Date(2026, 0, 1).getTimezoneOffset()));
  expect(offsets).toEqual([-60, 0, -120, 0, 300, -330, -840]);
  expect(new Set(offsets).size).toBe(6);
  // Lisbon and UTC share January, so July tells them apart.
  expect(withDeviceZone('Europe/Lisbon', () => new Date(2026, 6, 1).getTimezoneOffset())).toBe(-60);
  expect(withDeviceZone('UTC', () => new Date(2026, 6, 1).getTimezoneOffset())).toBe(0);
});

describe.each(DEVICE_ZONES.map((z) => z.zone))('on a phone set to %s', (zone) => {
  test('[H-DEVICE-ZONE] a Portuguese shop Mo-Fr 09:00-13:00 gives the same instants, summer time and winter time', () => {
    const summer = withDeviceZone(zone, () => hoursOf('Mo-Fr 09:00-13:00', portugal, shop, '2026-10-19'));
    expect(brief(summer)).toEqual(['open 2026-10-19T08:00:00.000Z 2026-10-19T12:00:00.000Z']);
    const winter = withDeviceZone(zone, () => hoursOf('Mo-Fr 09:00-13:00', portugal, shop, '2026-11-02'));
    expect(brief(winter)).toEqual(['open 2026-11-02T09:00:00.000Z 2026-11-02T13:00:00.000Z']);
  });

  test('[H-DEVICE-ZONE] the Portuguese shop is closed on its own weekend, whichever day the phone has reached', () => {
    const h = withDeviceZone(zone, () => hoursOf('Mo-Fr 09:00-13:00', portugal, shop, '2026-10-17', '2026-10-18'));
    expect(h.spans.length).toBeGreaterThan(0);
    expect(brief(h)).toEqual([]);
  });

  test('[H-CHANGE-DAYS] the Berlin place on the autumn change day: 01:00-05:00 by its wall clock, 5 h', () => {
    const h = withDeviceZone(zone, () => hoursOf('Mo-Su 01:00-05:00', placeIn('DE-BW'), other, '2026-10-25'));
    expect(brief(h)).toEqual([`open ${instantAt('2026-10-25', '01:00', BERLIN).toISOString()} ${instantAt('2026-10-25', '05:00', BERLIN).toISOString()}`]);
    expect(instantAt('2026-10-25', '05:00', BERLIN).getTime() - instantAt('2026-10-25', '01:00', BERLIN).getTime()).toBe(5 * 3_600_000);
  });

  // European clocks all change at 01:00 UTC, so phones in Lisbon and Helsinki skip another wall-clock hour than Berlin
  // does that night. That hour reads unknown (Decision 8), and everything else stays by the Berlin wall clock.
  test('[H-CHANGE-DAYS] the Berlin place on the spring change day: 01:00-05:00 by its wall clock, 3 h', () => {
    const skipped = { 'Europe/Lisbon': ['01:00', '02:00'], 'Europe/Helsinki': ['03:00', '04:00'] }[zone];
    const h = withDeviceZone(zone, () => hoursOf('Mo-Su 01:00-05:00', placeIn('DE-BW'), other, '2026-03-29'));
    const iso = (hm: string) => instantAt('2026-03-29', hm, BERLIN).toISOString();
    const expected = skipped
      ? [['01:00', skipped[0]!, 'open'], [skipped[0]!, skipped[1]!, 'unknown'], [skipped[1]!, '05:00', 'open']].filter(([a, b]) => a !== b)
      : [['01:00', '05:00', 'open']];
    expect(brief(h)).toEqual(expected.map(([a, b, state]) => `${state} ${iso(a!)} ${iso(b!)}`));
    expect(new Date(iso('05:00')).getTime() - new Date(iso('01:00')).getTime()).toBe(3 * 3_600_000);
  });
});

describe('[H-DEVICE-GAP] the hour a phone in New York skips on Sunday 8 March 2026', () => {
  const berlin = placeIn('DE-BW');
  const gapDay = (tag: string) => withDeviceZone(newYork, () => hoursOf(tag, berlin, other, '2026-03-08'));
  const at = (hm: string) => instantAt('2026-03-08', hm, BERLIN);

  test('a span inside it reads unknown, never open, and the rest of the day is right', () => {
    const h = gapDay('Mo-Su 02:15-02:45');
    expect(h.spans.some((s) => s.state === 'open')).toBe(false);
    for (const hm of ['02:00', '02:30', '02:59']) expect(stateAt(h, at(hm)).state, hm).toBe('unknown');
    for (const hm of ['00:00', '01:59', '03:00', '03:15', '03:45', '12:00', '23:59']) expect(stateAt(h, at(hm)).state, hm).toBe('closed');
  });

  test('the same place on a phone with no skipped hour reads the plain span', () => {
    const h = withDeviceZone('UTC', () => hoursOf('Mo-Su 02:15-02:45', berlin, other, '2026-03-08'));
    expect(brief(h)).toEqual([`open ${at('02:15').toISOString()} ${at('02:45').toISOString()}`]);
  });

  test('a closing time inside it does not leak an hour later', () => {
    const h = gapDay('Mo-Su 01:30-02:30');
    expect(stateAt(h, at('01:45')).state).toBe('open');
    expect(stateAt(h, at('02:45')).state).toBe('unknown');
    for (const hm of ['03:00', '03:15', '03:29', '03:30', '04:00']) expect(stateAt(h, at(hm)).state, hm).toBe('closed');
  });

  test('an opening time inside it does not arrive an hour late', () => {
    const h = gapDay('Mo-Su 02:30-03:30');
    expect(stateAt(h, at('02:45')).state).toBe('unknown');
    expect(stateAt(h, at('03:00')).state).toBe('open');
    expect(stateAt(h, at('03:29')).state).toBe('open');
    expect(stateAt(h, at('03:30')).state).toBe('closed');
  });

  test('a span around it stays open on both sides, and the next day is untouched', () => {
    const h = withDeviceZone(newYork, () => hoursOf('Mo-Su 01:00-05:00', berlin, other, '2026-03-08', '2026-03-09'));
    expect(stateAt(h, at('01:30')).state).toBe('open');
    expect(stateAt(h, at('02:30')).state).toBe('unknown');
    expect(stateAt(h, at('03:30')).state).toBe('open');
    expect(stateAt(h, instantAt('2026-03-09', '02:30', BERLIN)).state).toBe('open');
  });

  test('hours far from it are untouched', () => {
    const h = gapDay('Mo-Su 08:00-20:00');
    expect(stateAt(h, at('02:30')).state).toBe('unknown');
    expect(stateAt(h, at('03:30')).state).toBe('closed');
    expect(stateAt(h, at('08:00')).state).toBe('open');
    expect(stateAt(h, at('20:00')).state).toBe('closed');
  });
});

// The library run directly with TZ set to the place's own zone is the oracle (spec 11.4): its local time is the
// place's time. Every device zone must agree at every 15-minute step, except inside the phone's own skipped hour.
describe('[H-DEVICE-ZONE] against the library run in the place\'s own zone', () => {
  const tags = ['Mo-Sa 08:00-20:00', 'Mo-Fr 09:00-13:00,14:00-18:00; Sa 09:00-12:00', 'Mo-Su 22:00-02:00', 'Mo-Su 01:30-02:30', 'Mo-Su 02:30-03:30',
    'Mo-Su 00:15-00:45', '24/7', 'Mo-Sa 08:00-18:00; Su unknown', 'PH off; Mo-Su 06:00-22:00', 'Mar 29 01:00-05:00', 'Oct 25 00:30-02:30', 'Su[-1] 01:00-04:00'];
  const places = [
    { place: placeIn('DE-BW'), cc: 'de', key: 'DE-BW' as string | null },
    { place: portugal, cc: 'pt', key: null as string | null },
    { place: { timeZone: 'Europe/Helsinki', hoursRegionKey: null, holidayZone: 'FI', country: 'FI' }, cc: 'fi', key: null as string | null },
  ];
  const windows = [['2026-03-06', '2026-03-10'], ['2026-03-27', '2026-03-30'], ['2026-10-23', '2026-10-26'], ['2026-10-31', '2026-11-02'], ['2026-05-14', '2026-05-15']] as const;

  test.each(places.map((p) => [p.place.timeZone, p] as const))('a place in %s', (_name, { place, cc, key }) => {
    const nominatim = { lat: 0, lon: 0, address: { country_code: cc, state: '', ...(key ? { 'ISO3166-2-lvl4': key } : {}) } };
    let compared = 0;
    let skipped = 0;
    for (const [from, to] of windows) {
      const start = instantAt(from, '00:00', place.timeZone).getTime();
      const end = instantAt(addDaysIso(to, 1), '00:00', place.timeZone).getTime();
      for (const tag of tags) {
        const oracle = withDeviceZone(place.timeZone, () => {
          const o = new OpeningHours(tag, nominatim);
          const out: { t: number; state: string }[] = [];
          for (let t = start; t < end; t += STEP) {
            const d = new Date(t);
            out.push({ t, state: o.getUnknown(d) ? 'unknown' : o.getState(d) ? 'open' : 'closed' });
          }
          return out;
        });
        for (const { zone } of DEVICE_ZONES) {
          // The rule class 'other' has no assumptions, so the states are the library's alone.
          const h = withDeviceZone(zone, () => hoursOf(tag, place, other, from, to));
          const gaps = withDeviceZone(zone, () => skippedOnDevice(start, end));
          for (const { t, state } of oracle) {
            const wall = wallNumber(t, place.timeZone);
            const label = `${tag} on ${zone} at ${new Date(t).toISOString()}`;
            if (gaps.some(([a, b]) => wall >= a && wall < b)) {
              skipped++;
              expect(stateAt(h, new Date(t)).state, label).toBe('unknown');
            } else {
              compared++;
              expect(stateAt(h, new Date(t)).state, label).toBe(state);
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(50_000);
    expect(skipped).toBeGreaterThan(0);
  }, 120_000);
});

// Clocks that change at midnight, by half an hour, or on other days than Europe's and New York's. Not among section
// 11.6's seven, but a rider's phone can be set to anything. A phone with no clock change is the reference.
describe('[H-DEVICE-GAP] phones whose clocks change in other ways', () => {
  const tags = ['Mo-Sa 08:00-20:00', 'Mo-Su 00:15-00:45', 'Mo-Su 23:30-00:30', 'Mo-Su 01:30-02:30', 'Mo-Su 02:15-02:45', 'Sa,Su 00:00-24:00', 'Su 00:00-01:00', '24/7', 'PH off; Mo-Su 06:00-22:00'];
  const place = placeIn('DE-BW');
  const cases = [
    ['America/Havana', 300, '2026-03-07', '2026-03-09'],     // midnight, forward
    ['America/Havana', 300, '2026-10-31', '2026-11-02'],     // back
    ['Asia/Beirut', -120, '2026-03-28', '2026-03-30'],       // midnight, forward
    ['America/Santiago', 180, '2026-09-05', '2026-09-07'],   // midnight, forward
    ['America/Santiago', 180, '2026-04-04', '2026-04-06'],   // midnight, back
    ['Australia/Lord_Howe', -660, '2026-10-03', '2026-10-05'], // half an hour
    ['Australia/Lord_Howe', -660, '2026-04-04', '2026-04-06'], // half an hour, back
  ] as const;

  test.each(cases)('%s (January offset %i) from %s', (zone, janOffset, from, to) => {
    const before = process.env['TZ'];
    try {
      process.env['TZ'] = zone;
      expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(janOffset);
      const start = instantAt(from, '00:00', BERLIN).getTime();
      const end = instantAt(addDaysIso(to, 1), '00:00', BERLIN).getTime();
      const gaps = skippedOnDevice(start, end);
      for (const tag of tags) {
        process.env['TZ'] = zone;
        const h = hoursOf(tag, place, other, from, to);
        process.env['TZ'] = 'UTC';
        const reference = hoursOf(tag, place, other, from, to);
        for (let t = start; t < end; t += STEP) {
          const wall = wallNumber(t, BERLIN);
          const state = stateAt(h, new Date(t)).state;
          const label = tag + ' at ' + new Date(t).toISOString();
          if (gaps.some(([a, b]) => wall >= a && wall < b)) expect(state, label).toBe('unknown');
          else expect(state, label).toBe(stateAt(reference, new Date(t)).state);
        }
      }
    } finally {
      if (before === undefined) delete process.env['TZ']; else process.env['TZ'] = before;
    }
  });
});

const wallFormat = new Map<string, Intl.DateTimeFormat>();
/** The wall clock of `t` in `tz`, as milliseconds with no zone. */
function wallNumber(t: number, tz: string): number {
  let f = wallFormat.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    wallFormat.set(tz, f);
  }
  const w: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(t))) if (p.type !== 'literal') w[p.type] = Number(p.value);
  return Date.UTC(w['year']!, w['month']! - 1, w['day']!, w['hour']!, w['minute']!);
}

/** The wall-clock stretches the device's own clock skips around the window, worked out here apart from the wrapper. */
function skippedOnDevice(start: number, end: number): [number, number][] {
  const out: [number, number][] = [];
  const first = Math.floor(start / STEP) * STEP - 2 * 86_400_000;
  for (let n = first; n < end + 2 * 86_400_000; n += STEP) {
    const u = new Date(n);
    const d = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes());
    if (d.getHours() !== u.getUTCHours() || d.getMinutes() !== u.getUTCMinutes()) {
      const last = out.at(-1);
      if (last && last[1] === n) last[1] = n + STEP; else out.push([n, n + STEP]);
    }
  }
  return out;
}

// The library finds "yesterday" of a time over midnight as 24 hours back. The night after the phone's own spring change that
// lands two days back: found by the simulator's INV-26.
describe('[H-DEVICE-ZONE] the hour after midnight, the night after the phone skips an hour', () => {
  const wraps = 'Mo-Fr off; Mo-Sa 03:30-20:30,18:45-03:15';
  const read = (zone: string, tag: string, when: string): string => withDeviceZone(zone, () => {
    const date = when.slice(0, 10);
    return stateAt(hoursOf(tag, placeIn('DE-BW'), other, addDaysIso(date, -2), addDaysIso(date, 1)), instantAt(date, when.slice(11), BERLIN)).state;
  });

  test('a time over midnight from Saturday does not read open on Monday morning', () => {
    expect(read('UTC', wraps, '2026-03-30 00:30')).toBe('closed');
    expect(read('Europe/Berlin', wraps, '2026-03-30 00:30')).toBe('closed');
    expect(read('America/New_York', wraps, '2026-03-09 00:30')).toBe('closed');
  });
  test('a time over midnight from Sunday does not read closed', () => {
    expect(read('UTC', 'Su 20:00-02:00', '2026-03-30 00:30')).toBe('open');
    expect(read('Europe/Berlin', 'Su 20:00-02:00', '2026-03-30 00:30')).toBe('open');
  });
  test('a tag that looks at the calendar reads unknown then', () => {
    expect(read('Europe/Berlin', 'Sa,Su 10:30-04:00,16:15-18:00; Su,PH 07:45-14:30', '2026-03-30 00:30')).toBe('unknown');
    expect(read('UTC', 'Sa,Su 10:30-04:00,16:15-18:00; Su,PH 07:45-14:30', '2026-03-30 00:30')).toBe('open');
  });
  test('the hour after it and a tag with no time over midnight read as on any phone', () => {
    expect(read('Europe/Berlin', wraps, '2026-03-30 01:30')).toBe('closed');
    expect(read('Europe/Berlin', 'Mo-Su 00:00-23:00', '2026-03-30 00:30')).toBe('open');
    expect(read('Europe/Berlin', 'Mo 06:00-12:00', '2026-03-30 00:30')).toBe('closed');
  });
});
