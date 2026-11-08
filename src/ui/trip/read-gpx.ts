// A GPX file or a router's line as a route (spec section 3.3): only Add a route and Plan from A to B need it, so it is not in the
// first screen (TRIP-GUIDED-FIRST).
import { parseGpx } from '../../core/route/gpx.ts';
import type { RawPoint, XmlDocLike } from '../../core/route/gpx.ts';
import { buildRoute } from '../../core/route/profile.ts';
import type { Route } from '../../core/types.ts';
import { W } from '../../core/wording/en.ts';

const stem = (fileName: string): string => fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '').trim().slice(0, 60);

/**
 * A GPX file as a route with no days yet. Throws GpxError with the reason's own plain message for a file that can't be used.
 * `hadHeights` is whether every point came with a height; if not, Get ready offline looks them up.
 */
export async function routeFromGpx(text: string, fileName: string, parseXml: (s: string) => XmlDocLike): Promise<{ route: Route; hadHeights: boolean }> {
  const parsed = parseGpx(text, parseXml);
  const raw: RawPoint[] = parsed.points;
  const route = await buildRoute(raw, parsed.name || stem(fileName) || W.appTripUnnamed, 'gpx');
  return { route, hadHeights: route.points.every((p) => p.ele !== null) };
}

/** A router's line as a route: the very building a GPX file goes through, with all its points. */
export const routeFromPoints = (raw: RawPoint[], name: string): Promise<Route> => buildRoute(raw, name, 'planned');
