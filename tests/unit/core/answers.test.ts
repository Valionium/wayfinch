import { describe, expect, test } from 'vitest';
import {
  compareFinal, formatAbout, formatLeaveBy, formatRainEnd, formatRainOnset, makeAnswer,
} from '../../../src/core/answers/index.ts';
import type { Answer, Missing, Place, RescuePoint, Roof } from '../../../src/core/types.ts';
import { at, shop } from '../../fixtures/build.ts';
import { DEVICE_ZONES, withDeviceZone } from '../../fixtures/zones.ts';

const BER = 'Europe/Berlin';
const base: Omit<Answer, 'basis' | 'missing'> = {
  topic: 'water', status: 'fine', title: 't', stamp: null, detail: '', items: [], freshness: { dataDates: {}, stale: false },
};

describe('makeAnswer', () => {
  test('[HON-BASIS] an answer with an empty basis throws', () => {
    expect(() => makeAnswer({ ...base, basis: [] })).toThrow(/basis/i);
    expect(() => makeAnswer({ ...base, basis: ['map data from 28 Oct'] })).not.toThrow();
  });

  test('[HON-BASIS] a basis of blank lines counts as empty', () => {
    expect(() => makeAnswer({ ...base, basis: ['', '  '] })).toThrow(/basis/i);
  });

  test('[HON-MISSING] missing defaults to an empty list', () => {
    const a: Answer = makeAnswer({ ...base, basis: ['x'] });
    expect(a.missing).toEqual([]);
  });

  test('[HON-MISSING] missing carries each of the six codes, in the order given', () => {
    const all: Missing[] = ['date', 'places', 'hours', 'weather', 'heights', 'capacity'];
    for (const m of all) expect(makeAnswer({ ...base, basis: ['x'], missing: [m] }).missing).toEqual([m]);
    expect(makeAnswer({ ...base, basis: ['x'], missing: all }).missing).toEqual(all);
  });

  test('the answer keeps every other field', () => {
    const a = makeAnswer({ ...base, basis: ['x'], title: 'Hello', status: 'warning' });
    expect(a).toMatchObject({ topic: 'water', status: 'warning', title: 'Hello', basis: ['x'] });
  });
});

describe('[HON-TIME] one formatter', () => {
  test('about: nearest 5 minutes, half up', () => {
    expect(formatAbout(at('2026-10-17 14:37:30'), BER)).toBe('about 14:40');
    expect(formatAbout(at('2026-10-17 14:37:29'), BER)).toBe('about 14:35');
    expect(formatAbout(at('2026-10-17 14:32:29'), BER)).toBe('about 14:30');
    expect(formatAbout(at('2026-10-17 14:32:30'), BER)).toBe('about 14:35');
    expect(formatAbout(at('2026-10-17 14:35:00'), BER)).toBe('about 14:35');
    expect(formatAbout(at('2026-10-17 23:58:00'), BER)).toBe('about 00:00');
    expect(formatAbout(at('2026-10-17 09:05:00'), BER)).toBe('about 09:05');
  });

  test('leave-by: down to 5 minutes', () => {
    expect(formatLeaveBy(at('2026-10-17 11:17:34'), BER)).toBe('about 11:15');
    expect(formatLeaveBy(at('2026-10-17 11:15:00'), BER)).toBe('about 11:15');
    expect(formatLeaveBy(at('2026-10-17 11:19:59'), BER)).toBe('about 11:15');
    expect(formatLeaveBy(at('2026-10-17 11:20:00'), BER)).toBe('about 11:20');
    expect(formatLeaveBy(at('2026-10-17 11:14:59'), BER)).toBe('about 11:10');
  });

  test('rain onset: down to the hour or the half hour', () => {
    expect(formatRainOnset(at('2026-10-17 14:40:00'), BER)).toBe('about 14:30');
    expect(formatRainOnset(at('2026-10-17 14:30:00'), BER)).toBe('about 14:30');
    expect(formatRainOnset(at('2026-10-17 14:59:59'), BER)).toBe('about 14:30');
    expect(formatRainOnset(at('2026-10-17 15:00:00'), BER)).toBe('about 15:00');
    expect(formatRainOnset(at('2026-10-17 14:29:59'), BER)).toBe('about 14:00');
  });

  test('rain end: up to the hour or the half hour', () => {
    expect(formatRainEnd(at('2026-10-17 15:50:00'), BER)).toBe('about 16:00');
    expect(formatRainEnd(at('2026-10-17 15:30:00'), BER)).toBe('about 15:30');
    expect(formatRainEnd(at('2026-10-17 15:30:01'), BER)).toBe('about 16:00');
    expect(formatRainEnd(at('2026-10-17 15:00:00'), BER)).toBe('about 15:00');
    expect(formatRainEnd(at('2026-10-17 15:00:01'), BER)).toBe('about 15:30');
  });

  test('the place\'s zone decides the text, with an explicit zone', () => {
    const t = at('2026-10-17 14:37:30', BER);
    expect(formatAbout(t, 'Europe/Lisbon')).toBe('about 13:40');
    expect(formatAbout(t, 'Asia/Kolkata')).toBe('about 18:10');
    expect(formatAbout(t, 'UTC')).toBe('about 12:40');
  });

  test('rounding follows the local half hour, also in zones with a quarter-hour offset', () => {
    // Nepal is UTC+5:45: a UTC grid would turn local 14:40 into 14:15.
    const t = at('2026-10-17 14:40:00', 'Asia/Kathmandu');
    expect(formatRainOnset(t, 'Asia/Kathmandu')).toBe('about 14:30');
    expect(formatRainEnd(at('2026-10-17 14:40:00', 'Asia/Kathmandu'), 'Asia/Kathmandu')).toBe('about 15:00');
    expect(formatLeaveBy(at('2026-10-17 14:41:00', 'Asia/Kathmandu'), 'Asia/Kathmandu')).toBe('about 14:40');
  });

  test('every format gives the same text under every device zone of section 11.6', () => {
    const t = at('2026-10-17 14:37:30');
    const run = (): string[] => [
      formatAbout(t, BER), formatLeaveBy(at('2026-10-17 11:17:34'), BER),
      formatRainOnset(at('2026-10-17 14:40:00'), BER), formatRainEnd(at('2026-10-17 15:50:00'), BER),
    ];
    const expected = ['about 14:40', 'about 11:15', 'about 14:30', 'about 16:00'];
    expect(DEVICE_ZONES).toHaveLength(7);
    for (const { zone } of DEVICE_ZONES) {
      expect(withDeviceZone(zone, run), zone).toEqual(expected);
    }
  });

  test('the zone switch checks itself: a wrong zone name is refused', () => {
    expect(() => withDeviceZone('Mars/Olympus', () => 1)).toThrow();
  });
});

describe('[HON-TIEBREAK] the final comparator', () => {
  const p = (id: string): Place => shop(null).atKm(1, { id });
  const roof = (lat: number, lon: number): Roof => ({ kind: 'bus_stop', lat, lon, bench: false });
  const rp = (lat: number, lon: number): RescuePoint => ({ lat, lon, ref: 'X', kms: [] });

  test('places order by id as text', () => {
    const ids = ['n9', 'n10', 'w2', 'n100', 'r5'];
    expect(ids.map(p).sort(compareFinal).map((x) => x.id)).toEqual(['n10', 'n100', 'n9', 'r5', 'w2']);
    expect(compareFinal(p('n10'), p('n9'))).toBeLessThan(0);
    expect(compareFinal(p('n9'), p('n10'))).toBeGreaterThan(0);
    expect(compareFinal(p('n9'), p('n9'))).toBe(0);
  });

  test('roofs and rescue points order by latitude, then longitude', () => {
    const roofs = [roof(49.1, 8.5), roof(49.0, 8.9), roof(49.1, 8.4)];
    expect(roofs.sort(compareFinal).map((r) => [r.lat, r.lon])).toEqual([[49.0, 8.9], [49.1, 8.4], [49.1, 8.5]]);
    const pts = [rp(48.2, 7.0), rp(48.1, 9.0), rp(48.2, 6.9)];
    expect(pts.sort(compareFinal).map((r) => [r.lat, r.lon])).toEqual([[48.1, 9.0], [48.2, 6.9], [48.2, 7.0]]);
  });

  test('in a list with both, places come before roofs, whatever the ids and positions', () => {
    const mixed = [roof(0, 0), p('w9'), roof(-1, -1), p('n1')];
    const sorted = mixed.sort(compareFinal);
    expect(sorted.slice(0, 2).map((x) => ('id' in x ? x.id : '?'))).toEqual(['n1', 'w9']);
    expect(sorted.slice(2).every((x) => !('id' in x))).toBe(true);
  });

  test('the order does not depend on the starting order', () => {
    const items = [p('n3'), roof(1, 1), p('n1'), roof(0, 5), p('n2')];
    const a = [...items].sort(compareFinal);
    const b = [...items].reverse().sort(compareFinal);
    expect(a).toEqual(b);
  });
});
