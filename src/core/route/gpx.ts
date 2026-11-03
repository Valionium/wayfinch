// GPX reading, ported from Load Check's parseGPX (spec section 7.1): tracks first, routes as a fallback, heights only
// when they are plausible, a new section at every segment, and Load Check's limits of 20 MB, 200,000 points and 500
// sections. The XML parser is injected, so this file needs no DOM: the app passes DOMParser, the tests jsdom.
import { W } from '../wording/en.ts';

/** One point as the file gives it. `break` marks the first point of a new section: no distance is counted into it. */
export type RawPoint = { lat: number; lon: number; ele: number | null; break?: true };

/** The little of the DOM that parseGpx reads. A browser Document or a jsdom Document satisfies it. */
export type XmlElementLike = {
  localName: string;
  parentNode: XmlElementLike | null;
  textContent: string | null;
  children: ArrayLike<XmlElementLike>;
  getAttribute(name: string): string | null;
  getElementsByTagNameNS(ns: string, name: string): ArrayLike<XmlElementLike>;
};
export type XmlDocLike = XmlElementLike & { querySelector(selector: string): unknown };

export type GpxErrorReason = 'too-large' | 'too-many-points' | 'too-many-sections' | 'unreadable' | 'too-long';
/** A file refused with the reason, in words the rider can act on. */
export class GpxError extends Error {
  reason: GpxErrorReason;
  constructor(reason: GpxErrorReason, message: string) {
    super(message);
    this.reason = reason;
    this.name = 'GpxError';
  }
}

export const GPX_MAX_BYTES = 20 * 1024 * 1024;
export const GPX_MAX_POINTS = 200_000;
export const GPX_MAX_SECTIONS = 500;

const MIN_ELE = -500;
const MAX_ELE = 10_000;
const SECTION_TAGS = ['trkseg', 'trk', 'rte'];

const tags = (root: XmlElementLike, name: string): XmlElementLike[] => Array.from(root.getElementsByTagNameNS('*', name));

function byteLength(text: string): number {
  // UTF-8 takes at least one byte per character and at most three per UTF-16 unit.
  if (text.length > GPX_MAX_BYTES) return text.length;
  if (text.length * 3 <= GPX_MAX_BYTES) return text.length * 3;
  return new TextEncoder().encode(text).length;
}

function nameFrom(doc: XmlDocLike): string {
  const own = (el: XmlElementLike | undefined): XmlElementLike | undefined =>
    el ? Array.from(el.children).find((c) => c.localName === 'name') : undefined;
  const hit = own(tags(doc, 'trk')[0]) ?? own(tags(doc, 'rte')[0]) ?? own(tags(doc, 'metadata')[0]);
  return hit ? (hit.textContent ?? '').trim().slice(0, 60) : '';
}

/** How many `<trkpt` (or `<rtept`) start tags the text holds, with or without a namespace prefix. */
function pointTags(text: string, tag: 'trkpt' | 'rtept'): number {
  let n = 0;
  const re = tag === 'trkpt' ? /<(?:[A-Za-z_][\w.-]*:)?trkpt[\s/>]/g : /<(?:[A-Za-z_][\w.-]*:)?rtept[\s/>]/g;
  while (re.exec(text) !== null) if ((n += 1) > GPX_MAX_POINTS) break;
  return n;
}

/**
 * Reads GPX text into points. Throws a GpxError for a file that is too big, has too many points or sections, or is no
 * GPX track or route with valid coordinates. A point with bad coordinates is skipped and starts a new section.
 */
export function parseGpx(
  text: string,
  parseXml: (s: string) => XmlDocLike,
): { points: RawPoint[]; segments: number; name: string; hasElev: boolean } {
  if (typeof text !== 'string' || byteLength(text) > GPX_MAX_BYTES) throw new GpxError('too-large', W.routeGpxTooLarge);
  // Counted in the text first, so a file far over the limit is refused before a document of it is built (a phone's memory).
  if (pointTags(text, 'trkpt') > GPX_MAX_POINTS || pointTags(text, 'rtept') > GPX_MAX_POINTS) throw new GpxError('too-many-points', W.routeGpxTooManyPoints);
  let doc: XmlDocLike;
  try {
    doc = parseXml(text);
  } catch {
    throw new GpxError('unreadable', W.routeGpxUnreadable);
  }
  if (!doc || doc.querySelector('parsererror')) throw new GpxError('unreadable', W.routeGpxUnreadable);

  // Tracks first, routes as a fallback: some planners export one, some the other.
  let nodes = tags(doc, 'trkpt');
  if (nodes.length === 0) nodes = tags(doc, 'rtept');
  if (nodes.length < 2) throw new GpxError('unreadable', W.routeGpxUnreadable);
  if (nodes.length > GPX_MAX_POINTS) throw new GpxError('too-many-points', W.routeGpxTooManyPoints);

  const points: RawPoint[] = [];
  let previousGroup: XmlElementLike | null = null;
  let gap = false;
  let segments = 0;
  for (const n of nodes) {
    let group: XmlElementLike | null = n.parentNode;
    while (group && !SECTION_TAGS.includes(group.localName)) group = group.parentNode;
    const latText = n.getAttribute('lat');
    const lonText = n.getAttribute('lon');
    const lat = latText && latText.trim() ? Number(latText) : NaN;
    const lon = lonText && lonText.trim() ? Number(lonText) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      gap = true;
      continue;
    }
    const el = tags(n, 'ele')[0];
    const value = el ? (el.textContent ?? '').trim() : '';
    const ele = value ? Number(value) : NaN;
    const boundary = points.length === 0 || group !== previousGroup || gap;
    if (boundary) segments++;
    points.push({
      lat, lon, ele: Number.isFinite(ele) && ele >= MIN_ELE && ele <= MAX_ELE ? ele : null,
      ...(points.length > 0 && boundary ? { break: true as const } : {}),
    });
    previousGroup = group;
    gap = false;
  }
  if (points.length < 2) throw new GpxError('unreadable', W.routeGpxUnreadable);
  if (segments > GPX_MAX_SECTIONS) throw new GpxError('too-many-sections', W.routeGpxTooManySections);
  return { points, segments, name: nameFrom(doc), hasElev: points.some((p) => p.ele !== null) };
}
