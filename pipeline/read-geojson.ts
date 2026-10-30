// Reads osmium's GeoJSON sequence (one feature per line) into the objects of src/core/places and into boundaries.
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import type { BoundaryFeature, Ring } from './boundaries.ts';
import type { OsmObject } from '../src/core/places/types.ts';

const MAX_POINTS = 300;
const ID = /^[nwr]\d+$/;

type Json = Record<string, unknown>;
const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const isCoord = (c: unknown): c is [number, number] =>
  Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number' && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
const isRing = (r: unknown): r is [number, number][] => Array.isArray(r) && r.length > 0 && r.every(isCoord);

function parseFeature(line: string): { id: string; tags: Record<string, string>; geometry: Json } | null {
  let f: unknown;
  try { f = JSON.parse(line.replace(/^\u001e/, '')); } catch { return null; }
  if (!isObject(f) || typeof f['id'] !== 'string' || !ID.test(f['id']) || !isObject(f['properties']) || !isObject(f['geometry'])) return null;
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(f['properties'])) if (typeof v === 'string') tags[k] = v;
  return { id: f['id'], tags, geometry: f['geometry'] };
}

// Rings of a Polygon or MultiPolygon, as [lon, lat]; null when the geometry is none of these or is broken.
function polygonRings(g: Json): Ring[] | null {
  const polys = g['type'] === 'Polygon' ? [g['coordinates']] : g['type'] === 'MultiPolygon' && Array.isArray(g['coordinates']) ? g['coordinates'] : null;
  if (!polys) return null;
  const rings: Ring[] = [];
  for (const poly of polys) {
    if (!Array.isArray(poly)) return null;
    for (const ring of poly) { if (!isRing(ring)) return null; rings.push(ring.map((c) => [c[0], c[1]])); }
  }
  return rings.length > 0 ? rings : null;
}

export function parseGeoJsonLine(line: string): OsmObject | null {
  const f = parseFeature(line);
  if (!f) return null;
  const g = f.geometry;
  let vertices: [number, number][];                  // lat, lon
  let polygon: [number, number][][] | null = null;
  if (g['type'] === 'Point') {
    if (!isCoord(g['coordinates'])) return null;
    vertices = [[g['coordinates'][1], g['coordinates'][0]]];
  } else if (g['type'] === 'LineString') {
    if (!isRing(g['coordinates'])) return null;
    vertices = g['coordinates'].map((c) => [c[1], c[0]]);
  } else {
    const rings = polygonRings(g);
    if (!rings) return null;
    polygon = rings.map((r) => r.map((c): [number, number] => [c[1], c[0]]));
    vertices = polygon.flat();
  }
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const [lat, lon] of vertices) { south = Math.min(south, lat); north = Math.max(north, lat); west = Math.min(west, lon); east = Math.max(east, lon); }
  const step = Math.ceil(vertices.length / MAX_POINTS);
  const points = step > 1 ? vertices.filter((_, i) => i % step === 0) : vertices;
  return { id: f.id, lat: (south + north) / 2, lon: (west + east) / 2, tags: f.tags, points, polygon };
}

export function parseBoundaryLine(line: string): BoundaryFeature | null {
  const f = parseFeature(line);
  if (!f) return null;
  const rings = polygonRings(f.geometry);
  return rings ? { id: f.id, tags: f.tags, rings } : null;
}

async function* lines(stream: Readable): AsyncGenerator<string> {
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) yield line;
}

export async function* readObjects(stream: Readable): AsyncGenerator<OsmObject> {
  for await (const line of lines(stream)) { const o = parseGeoJsonLine(line); if (o) yield o; }
}

export async function readBoundaries(stream: Readable): Promise<BoundaryFeature[]> {
  const out: BoundaryFeature[] = [];
  for await (const line of lines(stream)) { const b = parseBoundaryLine(line); if (b) out.push(b); }
  return out;
}
