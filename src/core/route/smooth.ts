// Height smoothing and distance samples, ported from Load Check's stageSmoothedHeights and stageDistanceSamples
// (spec section 7.1): heights are averaged over a 200 m window of travelled distance, where points lie closer than
// 100 m to a neighbour; sparse measurements are kept as they are.

export type HeightSample = { kmExact: number; elev: number };

const HALF_WINDOW_KM = 0.1;

/** The smoothed height of every sample. Samples must be in order of `kmExact`. */
export function smoothedHeights(points: HeightSample[]): number[] {
  const out = points.map((p) => p.elev);
  const last = points.length - 1;
  if (last < 1) return out;
  const km = (i: number): number => points[i]!.kmExact;
  const elev = (i: number): number => points[i]!.elev;
  const area = [0];
  for (let i = 1; i <= last; i++) area.push(area[area.length - 1]! + ((elev(i - 1) + elev(i)) / 2) * (km(i) - km(i - 1)));
  // The integral of the height profile from the start to x.
  const integral = (x: number): number => {
    if (x <= km(0)) return 0;
    if (x >= km(last)) return area[area.length - 1]!;
    let lo = 0;
    let hi = last;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (km(mid) <= x) lo = mid; else hi = mid;
    }
    const dx = x - km(lo);
    const width = km(hi) - km(lo);
    const height = width > 0 ? elev(lo) + ((elev(hi) - elev(lo)) * dx) / width : elev(lo);
    return area[lo]! + ((elev(lo) + height) / 2) * dx;
  };
  for (let i = 1; i < last; i++) {
    // Preserve sparse measurements: averaging a two-point climb or a widely sampled pass would erase real differences.
    if (km(i) - km(i - 1) >= 0.1 && km(i + 1) - km(i) >= 0.1) continue;
    const half = Math.min(HALF_WINDOW_KM, km(i) - km(0), km(last) - km(i));
    const left = km(i) - half;
    const right = km(i) + half;
    if (right > left) out[i] = (integral(right) - integral(left)) / (right - left);
  }
  return out;
}

/**
 * The points with `kmExact` scaled so that the last one lies at `distance`: the average over travelled distance, so
 * dense recordings and sparse profiles share the same span. Points that all share one kilometre are spread evenly.
 */
export function distanceSamples<T extends { km: number }>(points: T[], distance: number): (T & { kmExact: number })[] {
  if (points.length === 0) return [];
  const first = points[0]!.km;
  const range = points[points.length - 1]!.km - first;
  return points.map((p, i) => ({
    ...p,
    kmExact: range > 0 ? ((p.km - first) / range) * distance : points.length > 1 ? (i / (points.length - 1)) * distance : 0,
  }));
}
