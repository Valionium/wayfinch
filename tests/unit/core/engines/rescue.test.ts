import { describe, expect, test } from 'vitest';
import { distanceText, nearestRescue } from '../../../../src/core/engines/rescue.ts';
import { destination } from '../../../fixtures/geo.ts';
import { matchRescuePoints } from '../../../../src/core/route/matches.ts';
import type { Km, RescuePoint } from '../../../../src/core/types.ts';
import { routeOf } from '../../../fixtures/route.ts';

const FROM = { lat: 49, lon: 8.4 };
const DATE = '2026-10-28';
const point = (ref: string, m: number, bearing: number, kms: Km[] = []): RescuePoint => ({ ...destination(FROM, m, bearing), ref, kms });
const line = (points: RescuePoint[], fromKm: Km | null = 78, country = 'DE', off = 0) => nearestRescue(points, FROM, fromKm, country, DATE, off);

describe('which one', () => {
  test('[EM-RESCUE-CHOICE] the nearest: 600 m at 45 degrees beats 1.4 km at 180', () => {
    const l = line([point('FAR-1', 1400, 180), point('KA-145', 600, 45)])!;
    expect(l.short).toBe('KA-145 · 600 m north-east');
    expect(l.ref).toBe('KA-145');
  });
  test('[EM-RESCUE-CHOICE] nearest at 2.1 km: no line', () => {
    expect(line([point('A', 2100, 0)])).toBeNull();
  });
  test('[EM-RESCUE-CHOICE] at 2.0 km: a line', () => {
    expect(line([point('A', 2000, 90)])!.short).toBe('A · 2.0 km east');
    expect(line([point('A', 2000, 0)])!.short).toBe('A · 2.0 km north');
  });
  test('[EM-RESCUE-CHOICE] just past 2 km is out, though it would read 2.0 km', () => {
    expect(line([point('A', 2010, 0)])).toBeNull();
  });
  test('[EM-RESCUE-CHOICE] off the route by over 1 km adds the note; 1 km exactly does not', () => {
    const note = 'Signs more than 3 km from your route are not stored; a nearer one may exist.';
    expect(line([point('A', 600, 45)], 78, 'DE', 1001)!.lines).toContain(note);
    expect(line([point('A', 600, 45)], 78, 'DE', 1000)!.lines).not.toContain(note);
  });
  test('[EM-RESCUE-CHOICE] an unknown distance off the route counts as off it: the careful note', () => {
    expect(line([point('A', 600, 45)], 78, 'DE', NaN)!.lines).toContain('Signs more than 3 km from your route are not stored; a nearer one may exist.');
  });
  test('[EM-COMPASS] the words at the rescue line: 22.4 degrees north, 22.6 north-east', () => {
    expect(line([point('A', 600, 22.4)])!.short).toBe('A · 600 m north');
    expect(line([point('A', 600, 22.6)])!.short).toBe('A · 600 m north-east');
  });
  test('[EM-TIEBREAK] equally near: lower latitude first', () => {
    const p = (lat: number, ref: string): RescuePoint => ({ lat, lon: 8.4, ref, kms: [] });
    const from = { lat: 49, lon: 8.4 };
    const a = nearestRescue([p(49.001, 'NORTH'), p(48.999, 'SOUTH')], from, 78, 'DE', DATE, 0)!;
    expect(a.ref).toBe('SOUTH');
    expect(nearestRescue([p(48.999, 'SOUTH'), p(49.001, 'NORTH')], from, 78, 'DE', DATE, 0)!.ref).toBe('SOUTH');
  });
  test('[EM-TIEBREAK] equally near at one latitude: lower longitude first', () => {
    const p = (lon: number, ref: string): RescuePoint => ({ lat: 0, lon, ref, kms: [] });
    const from = { lat: 0, lon: 10 };
    expect(nearestRescue([p(10.01, 'EAST'), p(9.99, 'WEST')], from, null, 'DE', DATE, 0)!.ref).toBe('WEST');
  });
});

describe('distance', () => {
  test.each<[number, string]>([
    [600, '600 m'], [612, '600 m'], [625, '650 m'], [974, '950 m'], [975, '1.0 km'], [999, '1.0 km'], [1000, '1.0 km'],
    [1040, '1.0 km'], [1050, '1.1 km'], [1400, '1.4 km'], [2000, '2.0 km'], [25, '50 m'], [24, 'under 50 m'], [0, 'under 50 m'],
  ])('[EM-RESCUE-DIST] %d m reads %s', (m, text) => {
    expect(distanceText(m)).toBe(text);
  });
  test('[EM-RESCUE-DIST] a point on the position has no direction to give', () => {
    const l = line([{ ...FROM, ref: 'A', kms: [] }])!;
    expect(l.short).toBe('A · under 50 m');
    expect(l.shareLine).toBe('Nearest rescue point: A, under 50 m from that position');
  });
});

describe('the line', () => {
  test('[EM-RESCUE-LINE] every part, in Germany', () => {
    const l = line([point('KA-145', 600, 45, [78.6])])!;
    expect(l.lines).toEqual([
      'Rescue point KA-145',
      '600 m north-east',
      'on your route at km 78.6, 600 m ahead',
      'In German: Rettungspunkt.',
      'Give this number and your coordinates when you call.',
      'As mapped in OpenStreetMap (28 Oct), not checked.',
    ]);
    expect(l.shareLine).toBe('Nearest rescue point: KA-145, 600 m north-east of that position');
  });
  test('[EM-RESCUE-LINE] the German word only in Germany', () => {
    expect(line([point('A', 600, 45)], 78, 'AT')!.lines).not.toContain('In German: Rettungspunkt.');
    expect(line([point('A', 600, 45)], 78, 'constructor')!.lines).not.toContain('In German: Rettungspunkt.');
    expect(line([point('A', 600, 45)], 78, '')!.lines).not.toContain('In German: Rettungspunkt.');
  });
  test('[EM-RESCUE-LINE] no usable map date: still "not checked", with no invented date', () => {
    for (const d of ['', 'soon', '2026-13-40']) {
      const l = nearestRescue([point('A', 600, 45)], FROM, 78, 'DE', d, 0)!;
      expect(l.lines).toContain('As mapped in OpenStreetMap, not checked.');
    }
  });
  test('[EM-NO-SIGN-PHONE] the sign\'s own number never appears', () => {
    const signed = { ...point('KA-145', 600, 45), emergency_telephone_code: '+49 800 999' } as RescuePoint;
    const l = line([signed])!;
    expect(JSON.stringify(l)).not.toContain('999');
    expect(JSON.stringify(l)).not.toContain('emergency_telephone_code');
  });
});

describe('on the route', () => {
  test('[EM-RESCUE-ROUTE] 80 m off at km 77.4, seen from km 78.0', () => {
    const l = line([point('A', 600, 45, [77.4])], 78)!;
    expect(l.lines).toContain('on your route at km 77.4, 600 m back');
  });
  test('[EM-RESCUE-ROUTE] the nearest pass, whichever comes first in the list', () => {
    expect(line([point('A', 600, 45, [77.4, 200])], 78)!.lines).toContain('on your route at km 77.4, 600 m back');
    expect(line([point('A', 600, 45, [200, 77.4])], 78)!.lines).toContain('on your route at km 77.4, 600 m back');
    expect(line([point('A', 600, 45, [77.4, 200])], 199.5)!.lines).toContain('on your route at km 200, 500 m ahead');
  });
  test('[EM-RESCUE-ROUTE] at the sign itself: no distance along the route', () => {
    expect(line([point('A', 20, 45, [78])], 78)!.lines).toContain('on your route at km 78');
  });
  test('[EM-RESCUE-ROUTE] not within 300 m of the route: no route line', () => {
    expect(line([point('A', 600, 45, [])], 78)!.lines.some((t) => t.startsWith('on your route'))).toBe(false);
  });
  test('[EM-RESCUE-ROUTE] a broken first pass does not decide', () => {
    expect(line([point('A', 600, 45, [NaN, 77.4])], 78)!.lines).toContain('on your route at km 77.4, 600 m back');
  });
  test('[EM-RESCUE-ROUTE] no kilometre for the position, one pass: its kilometre without a distance', () => {
    expect(line([point('A', 600, 45, [77.4])], null)!.lines).toContain('on your route at km 77.4');
    expect(line([point('A', 600, 45, [77.4])], NaN)!.lines).toContain('on your route at km 77.4');
  });
  test('[EM-RESCUE-ROUTE] no kilometre for the position, two passes: no guess at which', () => {
    expect(line([point('A', 600, 45, [77.4, 200])], null)!.lines.some((t) => t.startsWith('on your route'))).toBe(false);
  });

  // Real geometry, not stated kilometres: built with buildRoute and matched as the app will.
  test('[EM-RESCUE-ROUTE] on an out-and-back, one kilometre per pass, and the way out reads the same line', async () => {
    const out: [Km, number | null][] = Array.from({ length: 101 }, (_, i) => [i, 100]);
    const back: [Km, number | null][] = Array.from({ length: 100 }, (_, i) => [99 - i, 100]);
    const route = await routeOf([...out, ...back]);
    const on = route.points.find((p) => p.km >= 77)!;
    const next = route.points.find((p) => p.km >= 78)!;
    const at774 = { lat: on.lat + (next.lat - on.lat) * 0.4, lon: on.lon + (next.lon - on.lon) * 0.4 };
    const sign = destination(at774, 80, 90);
    const [matched] = matchRescuePoints([{ ...sign, ref: 'KA-145' }], route);
    expect(matched!.kms).toHaveLength(2);
    expect(matched!.kms[0]).toBeCloseTo(77.4, 1);
    expect(matched!.kms[1]).toBeCloseTo(route.lengthKm - 77.4, 1);
    const from = { lat: on.lat + (next.lat - on.lat), lon: on.lon + (next.lon - on.lon) };
    const l = nearestRescue([matched!], from, 78, 'DE', DATE, 0)!;
    expect(l.lines).toContain('on your route at km 77.4, 600 m back');
    const later = nearestRescue([matched!], from, route.lengthKm - 78, 'DE', DATE, 0)!;
    expect(later.lines).toContain(`on your route at km ${Math.round((route.lengthKm - 77.4) * 10) / 10}, 600 m ahead`);
  });
  test('[EM-RESCUE-ROUTE] matching: over 300 m off has no kilometre but stays a point; broken coordinates do not throw', async () => {
    const route = await routeOf(Array.from({ length: 21 }, (_, i): [Km, number | null] => [i, 100]));
    const mid = route.points[10]!;
    const list = matchRescuePoints([
      { lat: NaN, lon: 8, ref: 'BROKEN' },
      { lat: 49, lon: Infinity, ref: 'BROKEN-2' },
      { ...destination(mid, 400, 90), ref: 'FAR' },
      { ...destination(mid, 250, 90), ref: 'NEAR' },
    ], route);
    expect(list.find((p) => p.ref === 'FAR')!.kms).toEqual([]);
    expect(list.find((p) => p.ref === 'NEAR')!.kms).toHaveLength(1);
    expect(list.find((p) => p.ref === 'BROKEN')!.kms).toEqual([]);
  });
});

describe('bad data', () => {
  test('[EM-RESCUE-CHOICE] broken points never win, also when first; an empty ref is no sign', () => {
    const list: RescuePoint[] = [
      { lat: NaN, lon: 8.4, ref: 'NAN', kms: [] },
      { lat: 49, lon: Infinity, ref: 'INF', kms: [] },
      { lat: 95, lon: 8.4, ref: 'WIDE', kms: [] },
      { ...FROM, ref: '', kms: [] },
      { ...FROM, ref: '   ', kms: [] },
      null as unknown as RescuePoint,
      point('GOOD', 600, 45),
    ];
    expect(line(list)!.ref).toBe('GOOD');
  });
  test('[EM-RESCUE-CHOICE] a point with no kms list is still a point', () => {
    const bare: Partial<RescuePoint> = point('A', 600, 45);
    delete bare.kms;
    expect(line([bare as RescuePoint])!.ref).toBe('A');
  });
  test('[EM-RESCUE-CHOICE] a bad position gives no line', () => {
    expect(nearestRescue([point('A', 600, 45)], { lat: NaN, lon: 8.4 }, 78, 'DE', DATE, 0)).toBeNull();
  });
  test('[EM-RESCUE-CHOICE] does not change the list it is given', () => {
    const list = [point('B', 800, 0), point('A', 600, 45)];
    line(list);
    expect(list.map((p) => p.ref)).toEqual(['B', 'A']);
  });
});
