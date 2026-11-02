// Routes (spec section 12.2): lines, loops, out-and-backs, crossings, repeated points and missing heights. They go through
// the real route building, so kilometres are real haversine totals and never line up with round numbers.
import fc from 'fast-check';
import { assembleRoute } from '../../src/core/route/profile.ts';
import type { RawPoint } from '../../src/core/route/gpx.ts';
import type { Route } from '../../src/core/types.ts';

export type RouteShape = 'line' | 'loop' | 'out-and-back' | 'crossing';
export type Heights = 'flat' | 'rolling' | 'alpine' | 'none' | 'gaps';

const EARTH_KM = 6371;
const RAD = Math.PI / 180;

type Plan = { shape: RouteShape; lengthKm: number; stepKm: number; lat: number; lon: number; bearing: number; heights: Heights; repeats: number };

/** A point `km` along a bearing from the start. */
function offsetKm(lat: number, lon: number, northKm: number, eastKm: number): { lat: number; lon: number } {
  return { lat: lat + (northKm / EARTH_KM) / RAD, lon: lon + (eastKm / (EARTH_KM * Math.cos(lat * RAD))) / RAD };
}

function outline(p: Plan): { north: number; east: number }[] {
  const n = Math.max(2, Math.round(p.lengthKm / p.stepKm));
  const out: { north: number; east: number }[] = [];
  const s = Math.sin(p.bearing * RAD);
  const c = Math.cos(p.bearing * RAD);
  const along = (d: number, side = 0): { north: number; east: number } => ({ north: d * c - side * s, east: d * s + side * c });
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    switch (p.shape) {
      case 'line': out.push(along(f * p.lengthKm, Math.sin(f * 20) * Math.min(1, p.lengthKm / 200))); break;
      case 'out-and-back': out.push(along((f <= 0.5 ? f : 1 - f) * p.lengthKm)); break;
      case 'loop': {
        const r = p.lengthKm / (2 * Math.PI);
        out.push(along(r * Math.sin(2 * Math.PI * f), r * (1 - Math.cos(2 * Math.PI * f))));
        break;
      }
      case 'crossing': {
        // A figure of eight: it passes its own middle once, on the way out and on the way back.
        const a = p.lengthKm / 6.1;
        const t = 2 * Math.PI * f;
        out.push(along(a * Math.sin(t), a * Math.sin(t) * Math.cos(t)));
        break;
      }
    }
  }
  return out;
}

function heightAt(h: Heights, km: number, i: number, n: number): number | null {
  switch (h) {
    case 'flat': return 120;
    case 'rolling': return 200 + 60 * Math.sin(km / 3) + 25 * Math.sin(km / 0.7);
    case 'alpine': return 500 + 900 * Math.abs(Math.sin(km / 25)) + 10 * Math.sin(km / 0.5);
    case 'none': return null;
    case 'gaps': return i > n / 3 && i < n / 2 ? null : 300 + 40 * Math.sin(km / 4);
  }
}

function raw(p: Plan): RawPoint[] {
  const shape = outline(p);
  const out: RawPoint[] = [];
  shape.forEach((q, i) => {
    const point = { ...offsetKm(p.lat, p.lon, q.north, q.east), ele: heightAt(p.heights, (i / shape.length) * p.lengthKm, i, shape.length) };
    out.push(point);
    // Repeated GPX points: zero-length segments (the plan's review focus 5).
    if (p.repeats > 0 && i % p.repeats === 1) out.push({ ...point });
  });
  return out;
}

/** The route's length: mostly a day or two, sometimes very short or very long. */
const lengthKm = (): fc.Arbitrary<number> => fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom(0.4, 1, 2.4, 2.5, 2.6) },
  { weight: 2, arbitrary: fc.integer({ min: 5, max: 60 }) },
  { weight: 12, arbitrary: fc.integer({ min: 100, max: 450 }) },
  { weight: 2, arbitrary: fc.integer({ min: 450, max: 800 }) },
);

export const route = (): fc.Arbitrary<Route> =>
  fc.record({
    shape: fc.constantFrom<RouteShape>('line', 'line', 'line', 'out-and-back', 'loop', 'crossing'),
    lengthKm: lengthKm(),
    stepKm: fc.constantFrom(0.2, 0.37, 0.5, 1.13),
    lat: fc.integer({ min: 4_750_000, max: 5_400_000 }).map((n) => n / 1e5),
    lon: fc.integer({ min: 600_000, max: 1_500_000 }).map((n) => n / 1e5),
    bearing: fc.integer({ min: 0, max: 359 }),
    heights: fc.constantFrom<Heights>('flat', 'rolling', 'rolling', 'alpine', 'alpine', 'none', 'gaps'),
    repeats: fc.constantFrom(0, 0, 0, 7),
  }).map((p) => {
    // Short routes need short steps, or there are no points to speak of; long ones need no more than a point a kilometre.
    const step = p.lengthKm < 5 ? 0.05 : p.lengthKm > 300 ? 1.13 : p.stepKm;
    const built = assembleRoute(raw({ ...p, stepKm: step }), `gen ${p.shape}`, 'gpx');
    return { ...built, id: `gen-${p.shape}-${p.heights}`, hash: `gen-${p.shape}-${p.lengthKm}` };
  });
