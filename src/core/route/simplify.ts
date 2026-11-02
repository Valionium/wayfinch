// The height profile that Load Check plans its stages on: a route of more than 2,000 points is thinned to 2,000 that
// keep the section ends, the lowest and highest point, and the points whose removal would change the shape most.
// Ported from Load Check's simplifyGPX in its 'profile' mode, so both apps compute the same days (spec section 7.1).
// Only this profile is thinned; the route itself, its distance and its hash always use every point.

export type ProfilePoint = { lat: number; lon: number; ele: number | null; km: number };

type Part = { first: number; last: number; at: number; score: number };

const heapPush = (heap: Part[], value: Part): void => {
  heap.push(value);
  let i = heap.length - 1;
  while (i) {
    const parent = (i - 1) >> 1;
    if (heap[parent]!.score >= value.score) break;
    heap[i] = heap[parent]!;
    i = parent;
  }
  heap[i] = value;
};

const heapPop = (heap: Part[]): Part | undefined => {
  const first = heap[0];
  const last = heap.pop();
  if (!heap.length || !last) return first;
  let i = 0;
  while (i * 2 + 1 < heap.length) {
    let child = i * 2 + 1;
    if (child + 1 < heap.length && heap[child + 1]!.score > heap[child]!.score) child++;
    if (last.score >= heap[child]!.score) break;
    heap[i] = heap[child]!;
    i = child;
  }
  heap[i] = last;
  return first;
};

const PROFILE_TOLERANCE_M = 1;

export function simplifyProfile<T extends ProfilePoint>(raw: T[], limit = 2000): T[] {
  if (raw.length <= limit) return raw;
  const selected = new Set<number>([0, raw.length - 1]);
  let low = 0;
  let high = 0;
  raw.forEach((p, i) => {
    if (p.ele === null) return;
    if (raw[low]!.ele === null || p.ele < raw[low]!.ele!) low = i;
    if (raw[high]!.ele === null || p.ele > raw[high]!.ele!) high = i;
  });
  selected.add(low);
  selected.add(high);

  const heap: Part[] = [];
  const wrap = (lon: number): number => ((lon + 540) % 360) - 180;
  const interval = (first: number, last: number): void => {
    if (last - first < 2) return;
    const a = raw[first]!;
    const b = raw[last]!;
    let score = -1;
    let at = first + 1;
    const cos = Math.cos(((a.lat + b.lat) * Math.PI) / 360);
    const bx = wrap(b.lon - a.lon) * cos;
    const by = b.lat - a.lat;
    const chord = bx * bx + by * by;
    for (let i = first + 1; i < last; i++) {
      const p = raw[i]!;
      let error: number;
      if (a.ele !== null && b.ele !== null && p.ele !== null) {
        const fraction = b.km > a.km ? (p.km - a.km) / (b.km - a.km) : (i - first) / (last - first);
        error = Math.abs(p.ele - (a.ele + (b.ele - a.ele) * fraction));
      } else {
        const x = wrap(p.lon - a.lon) * cos;
        const y = p.lat - a.lat;
        const t = chord ? Math.max(0, Math.min(1, (x * bx + y * by) / chord)) : 0;
        error = Math.hypot(x - t * bx, y - t * by) * 111320;
      }
      if (error > score + 1e-9 || (Math.abs(error - score) <= 1e-9 && Math.abs(i - (first + last) / 2) < Math.abs(at - (first + last) / 2))) {
        score = error;
        at = i;
      }
    }
    heapPush(heap, { first, last, at, score });
  };

  const anchors = [...selected].sort((x, y) => x - y);
  for (let i = 1; i < anchors.length; i++) interval(anchors[i - 1]!, anchors[i]!);
  while (selected.size < limit && heap.length) {
    const part = heapPop(heap)!;
    if (part.score <= PROFILE_TOLERANCE_M) break;
    selected.add(part.at);
    interval(part.first, part.at);
    interval(part.at, part.last);
  }
  return [...selected].sort((x, y) => x - y).map((i) => raw[i]!);
}
