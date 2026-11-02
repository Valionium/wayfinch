import { describe, expect, test } from 'vitest';
import { GpxError, parseGpx } from '../../../../src/core/route/gpx.ts';
import type { XmlDocLike, XmlElementLike } from '../../../../src/core/route/gpx.ts';
import { parseXml } from '../../../fixtures/route.ts';

const MB20 = 20 * 1024 * 1024;

/** A fake document of `n` track points in `groups` track segments, for the limits (building real XML would be slow). */
function fakeDoc(n: number, groups: number): XmlDocLike {
  const segs = Array.from({ length: groups }, () => ({ localName: 'trkseg', parentNode: null, textContent: null, children: [], getAttribute: () => null, getElementsByTagNameNS: () => [] } as XmlElementLike));
  const nodes = Array.from({ length: n }, (_, i): XmlElementLike => ({
    localName: 'trkpt', parentNode: segs[Math.floor((i * groups) / n)]!, textContent: null, children: [],
    getAttribute: (name) => (name === 'lat' ? String(49 + i * 1e-6) : '8.4'),
    getElementsByTagNameNS: () => [],
  }));
  return {
    localName: '#document', parentNode: null, textContent: null, children: [], getAttribute: () => null,
    querySelector: () => null,
    getElementsByTagNameNS: (_ns, name) => (name === 'trkpt' ? nodes : []),
  };
}

const expectRefused = (fn: () => unknown, reason: string): void => {
  try { fn(); } catch (e) {
    expect(e).toBeInstanceOf(GpxError);
    expect((e as GpxError).reason).toBe(reason);
    expect((e as GpxError).message.length).toBeGreaterThan(10);
    return;
  }
  throw new Error('expected the file to be refused');
};

describe('[LC-PORT-LIMITS] limits', () => {
  test('over 200,000 points is refused with the reason, 200,000 is accepted', () => {
    expectRefused(() => parseGpx('x', () => fakeDoc(200_001, 1)), 'too-many-points');
    expect(parseGpx('x', () => fakeDoc(200_000, 1)).points).toHaveLength(200_000);
  });

  test('over 500 sections is refused with the reason, 500 is accepted', () => {
    expectRefused(() => parseGpx('x', () => fakeDoc(1000, 501)), 'too-many-sections');
    expect(parseGpx('x', () => fakeDoc(1000, 500)).segments).toBe(500);
  });

  test('over 20 MB is refused before it is parsed, 20 MB exactly is not', () => {
    let parsed = false;
    const parse = (): XmlDocLike => { parsed = true; return fakeDoc(10, 1); };
    expectRefused(() => parseGpx('x'.repeat(MB20 + 1), parse), 'too-large');
    expect(parsed).toBe(false);
    expect(parseGpx('x'.repeat(MB20), parse).points).toHaveLength(10);
  });

  test('the size is counted in bytes, not characters', () => {
    expectRefused(() => parseGpx('é'.repeat(MB20 / 2 + 1), () => fakeDoc(10, 1)), 'too-large');
  });

  test('the messages are the app\'s own words, from the wording module', () => {
    const msg = (fn: () => unknown): string => { try { fn(); } catch (e) { return (e as Error).message; } return ''; };
    expect(msg(() => parseGpx('x', () => fakeDoc(200_001, 1)))).toBe('This GPX has more than 200,000 points. Export a simplified track and try again.');
    expect(msg(() => parseGpx('x', () => fakeDoc(1000, 501)))).toBe('This GPX has more than 500 separate sections. Export fewer sections and try again.');
    expect(msg(() => parseGpx('x'.repeat(MB20 + 1), () => fakeDoc(1, 1)))).toBe('Choose a GPX file of 20 MB or less.');
  });
});

describe('reading real GPX text', () => {
  const gpx = (body: string): string => `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">${body}</gpx>`;

  test('a track with heights', () => {
    const r = parseGpx(gpx('<trk><name>Ride</name><trkseg><trkpt lat="49.0" lon="8.4"><ele>100.5</ele></trkpt><trkpt lat="49.001" lon="8.4"><ele>101</ele></trkpt></trkseg></trk>'), parseXml);
    expect(r.points).toEqual([{ lat: 49, lon: 8.4, ele: 100.5 }, { lat: 49.001, lon: 8.4, ele: 101 }]);
    expect(r.segments).toBe(1);
    expect(r.name).toBe('Ride');
    expect(r.hasElev).toBe(true);
  });

  test('tracks come first, routes are the fallback', () => {
    const both = gpx('<rte><rtept lat="1" lon="1"/><rtept lat="2" lon="2"/></rte><trk><trkseg><trkpt lat="3" lon="3"/><trkpt lat="4" lon="4"/></trkseg></trk>');
    expect(parseGpx(both, parseXml).points.map((p) => p.lat)).toEqual([3, 4]);
    expect(parseGpx(gpx('<rte><name>Planned</name><rtept lat="1" lon="1"/><rtept lat="2" lon="2"/></rte>'), parseXml).points.map((p) => p.lat)).toEqual([1, 2]);
  });

  test('heights outside -500 to 10,000 m, or unreadable, are missing', () => {
    const r = parseGpx(gpx('<trk><trkseg><trkpt lat="1" lon="1"><ele>-501</ele></trkpt><trkpt lat="2" lon="2"><ele>10001</ele></trkpt><trkpt lat="3" lon="3"><ele>abc</ele></trkpt><trkpt lat="4" lon="4"><ele>-500</ele></trkpt><trkpt lat="5" lon="5"/></trkseg></trk>'), parseXml);
    expect(r.points.map((p) => p.ele)).toEqual([null, null, null, -500, null]);
    expect(r.hasElev).toBe(true);
  });

  test('a new segment, or a point with bad coordinates, starts a new section', () => {
    const r = parseGpx(gpx('<trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/></trkseg><trkseg><trkpt lat="3" lon="3"/><trkpt lat="999" lon="3"/><trkpt lat="4" lon="4"/></trkseg></trk>'), parseXml);
    expect(r.points.map((p) => [p.lat, p.break === true])).toEqual([[1, false], [2, false], [3, true], [4, true]]);
    expect(r.segments).toBe(3);
  });

  test('a file that is not GPX, has fewer than two points, or is broken XML is unreadable', () => {
    for (const text of ['<html/>', gpx('<trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk>'), '<gpx><trk>', 'not xml at all', gpx('<trk><trkseg><trkpt lat="x" lon="1"/><trkpt lat="y" lon="1"/></trkseg></trk>')]) {
      expectRefused(() => parseGpx(text, parseXml), 'unreadable');
    }
  });

  test('a parser that throws is unreadable too', () => {
    expectRefused(() => parseGpx('x', () => { throw new Error('boom'); }), 'unreadable');
  });

  test('the name comes from the track, then the route, then the file\'s own title, and is cut at 60 characters', () => {
    const pts = '<trkseg><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/></trkseg>';
    expect(parseGpx(gpx(`<metadata><name>Title</name></metadata><trk>${pts}</trk>`), parseXml).name).toBe('Title');
    expect(parseGpx(gpx(`<metadata><name>Title</name></metadata><trk><name>${'n'.repeat(80)}</name>${pts}</trk>`), parseXml).name).toBe('n'.repeat(60));
    expect(parseGpx(gpx(`<trk>${pts}</trk>`), parseXml).name).toBe('');
  });
});
