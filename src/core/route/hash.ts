// The canonical encoding of a route and its hash (spec section 4.3 and Contract 5).
//
// `line` is Google's encoded-polyline algorithm applied to integers: latitude and longitude in millionths of a degree
// and height in centimetres, three values per point (two when the route has no heights at all). Every column is coded
// as the difference from the point before. `missingEle` lists the points without a height as inclusive index ranges
// [from, to]; such a point is encoded with the previous point's height (0 at the start). The hash is the lower-case
// SHA-256 of `line` followed by `JSON.stringify(missingEle)`, in UTF-8.
import type { RoutePoint } from '../types.ts';

/** One signed integer in the polyline code: zigzag, then 5-bit chunks, low chunks first, offset by 63. */
function encodeValue(value: number): string {
  let v = value < 0 ? -2 * value - 1 : 2 * value;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode(((v % 0x20) | 0x20) + 63);
    v = Math.floor(v / 0x20);
  }
  return out + String.fromCharCode(v + 63);
}

/** Google's polyline algorithm on whole numbers, one delta per column. Each row has the same number of columns. */
export function encodeRows(rows: number[][]): string {
  const last: number[] = [];
  let out = '';
  for (const row of rows) {
    row.forEach((value, column) => {
      out += encodeValue(value - (last[column] ?? 0));
      last[column] = value;
    });
  }
  return out;
}

export type CanonicalRoute = { line: string; missingEle: [number, number][]; values: 2 | 3 };

/** The `line` and `missingEle` of Contract 5 for these (already rounded) points. */
export function canonicalRoute(points: RoutePoint[]): CanonicalRoute {
  const hasHeights = points.some((p) => p.ele !== null);
  const rows: number[][] = [];
  const missingEle: [number, number][] = [];
  let previousCm = 0;
  points.forEach((p, i) => {
    const row = [Math.round(p.lat * 1e6), Math.round(p.lon * 1e6)];
    if (hasHeights) {
      if (p.ele === null) {
        const open = missingEle.at(-1);
        if (open && open[1] === i - 1) open[1] = i;
        else missingEle.push([i, i]);
      } else previousCm = Math.round(p.ele * 100);
      row.push(previousCm);
    }
    rows.push(row);
  });
  return { line: encodeRows(rows), missingEle, values: hasHeights ? 3 : 2 };
}

/** The route hash: lower-case hex SHA-256, fixed once the heights are final. */
export async function routeHash(points: RoutePoint[]): Promise<string> {
  const { line, missingEle } = canonicalRoute(points);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(line + JSON.stringify(missingEle)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
