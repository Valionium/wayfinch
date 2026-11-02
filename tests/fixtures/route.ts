// Helpers that state a route as (kilometre, height) pairs and parse real GPX text through jsdom.
import { JSDOM } from 'jsdom';
import { realAscent } from '../../src/core/route/ascent.ts';
import { buildRoute } from '../../src/core/route/profile.ts';
import type { RawPoint, XmlDocLike } from '../../src/core/route/gpx.ts';
import type { Km, Route } from '../../src/core/types.ts';
import { pointAtKm } from './build.ts';

/** Points on the fixed northbound line at the given kilometres, with heights (null = missing). */
export const rawAt = (pairs: [Km, number | null][]): RawPoint[] =>
  pairs.map(([km, ele]) => ({ ...pointAtKm(km), ele }));

/** A built route from (km, height) pairs. Kilometres come out within a few metres of the asked ones. */
export const routeOf = (pairs: [Km, number | null][], name = 'test'): Promise<Route> => buildRoute(rawAt(pairs), name, 'planned');

/**
 * A route with exactly the given kilometres, for hand-worked numbers: kilometres are not taken from rounded coordinates,
 * so 45.0 stays 45.0. Everything else follows buildRoute's rules. The hash is a stand-in.
 */
export function exactRoute(pairs: [Km, number | null][], name = 'exact'): Route {
  const points = pairs.map(([km, ele]) => ({ ...pointAtKm(km), ele, km }));
  const complete = points.every((p) => p.ele !== null);
  return {
    id: 'exact', name, points, lengthKm: pairs.at(-1)![0], ascentM: complete ? Math.round((realAscent(points) ?? 0) / 10) * 10 : null,
    stages: [], climbs: [], source: 'planned', sampleGrid: [], hash: 'exact',
  };
}

/** Points every `stepKm` over `lengthKm`, with the height given by `ele(km)`. */
export function sampled(lengthKm: Km, stepKm: Km, ele: ((km: Km) => number) | null): [Km, number | null][] {
  const out: [Km, number | null][] = [];
  const n = Math.round(lengthKm / stepKm);
  for (let i = 0; i <= n; i++) {
    const km = Math.min(lengthKm, i * stepKm);
    out.push([km, ele ? ele(km) : null]);
  }
  return out;
}

const dom = new JSDOM('');
/** Parses XML like a browser's DOMParser, with a <parsererror> in the result when the text is broken. */
export function parseXml(text: string): XmlDocLike {
  return new dom.window.DOMParser().parseFromString(text, 'application/xml') as unknown as XmlDocLike;
}
