// GPX text for the tests, made from a fixture route's points, as a bike computer or a planner would export it.
import { loadFixtureRoute } from './packs/index.ts';
import type { FixtureRouteId } from './packs/index.ts';

export type GpxPoint = { lat: number; lon: number; ele?: number | null };

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** One track in one segment. A point without `ele` has no height element. */
export function gpxText(points: GpxPoint[], name = 'Test route'): string {
  const body = points.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele === undefined || p.ele === null ? '' : `<ele>${p.ele}</ele>`}</trkpt>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(name)}</name><trkseg>${body}</trkseg></trk></gpx>`;
}

/** A fixture route as a GPX file; `heights: false` leaves the heights out. */
export async function fixtureGpx(id: FixtureRouteId, o: { heights?: boolean } = {}): Promise<string> {
  const route = await loadFixtureRoute(id);
  return gpxText(route.points.map((p) => (o.heights === false ? { lat: p.lat, lon: p.lon } : p)), route.name);
}
