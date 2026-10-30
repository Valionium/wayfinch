// Boundaries as polygons, and a grid index that answers "which boundaries hold this point" in constant time.
export type Ring = [number, number][];                       // [lon, lat], closed or not
export type BoundaryFeature = { id: string; tags: Record<string, string>; rings: Ring[] };   // even-odd over all rings: holes and exclaves

// Even-odd ray casting over all rings of one feature.
export function pointInRings(rings: Ring[], lon: number, lat: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i]!;
      const [bx, by] = ring[j]!;
      if ((ay > lat) !== (by > lat) && lon < ax + ((lat - ay) * (bx - ax)) / (by - ay)) inside = !inside;
    }
  }
  return inside;
}

type Edges = { ax: Float64Array; ay: Float64Array; bx: Float64Array; by: Float64Array };
// A cell is fully inside, fully outside, or holds the edges that may cross it, with the parity at the middle of its left side.
type Cell = { state: 0 | 1 } | { state: 2; edges: Uint32Array; baseInside: boolean; x0: number; yMid: number };
type FeatureCells = { feature: BoundaryFeature; edges: Edges; cells: Map<number, Cell> };

const KEY = 2 ** 21;

export class BoundaryIndex {
  private readonly cellDeg: number;
  private readonly byCell = new Map<number, FeatureCells[]>();

  constructor(features: BoundaryFeature[], cellDeg: number) {
    this.cellDeg = cellDeg;
    for (const f of features) this.add(f);
  }

  private cx(lon: number): number { return Math.floor((lon + 180) / this.cellDeg); }
  private cy(lat: number): number { return Math.floor((lat + 90) / this.cellDeg); }

  private add(feature: BoundaryFeature): void {
    const ax: number[] = []; const ay: number[] = []; const bx: number[] = []; const by: number[] = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const ring of feature.rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!; const b = ring[(i + 1) % ring.length]!;
        minX = Math.min(minX, a[0]); maxX = Math.max(maxX, a[0]); minY = Math.min(minY, a[1]); maxY = Math.max(maxY, a[1]);
        if (a[0] === b[0] && a[1] === b[1]) continue;
        ax.push(a[0]); ay.push(a[1]); bx.push(b[0]); by.push(b[1]);
      }
    }
    if (ax.length === 0) return;
    const edges: Edges = { ax: Float64Array.from(ax), ay: Float64Array.from(ay), bx: Float64Array.from(bx), by: Float64Array.from(by) };
    const gx0 = this.cx(minX), gx1 = this.cx(maxX), gy0 = this.cy(minY), gy1 = this.cy(maxY);
    const rows = gy1 - gy0 + 1;
    const cols = gx1 - gx0 + 1;

    // Edges per cell (a superset: every cell of the edge's box), and edges per row for the row sweep.
    const cellEdges = new Map<number, number[]>();
    const rowEdges: number[][] = Array.from({ length: rows }, () => []);
    for (let e = 0; e < ax.length; e++) {
      const x0 = this.cx(Math.min(ax[e]!, bx[e]!)), x1 = this.cx(Math.max(ax[e]!, bx[e]!));
      const y0 = this.cy(Math.min(ay[e]!, by[e]!)), y1 = this.cy(Math.max(ay[e]!, by[e]!));
      for (let y = y0; y <= y1; y++) {
        rowEdges[y - gy0]!.push(e);
        for (let x = x0; x <= x1; x++) {
          const k = (x - gx0) * rows + (y - gy0);
          const list = cellEdges.get(k);
          if (list) list.push(e); else cellEdges.set(k, [e]);
        }
      }
    }

    const cells = new Map<number, Cell>();
    for (let r = 0; r < rows; r++) {
      const yMid = (gy0 + r + 0.5) * this.cellDeg - 90;
      const crossings: number[] = [];
      for (const e of rowEdges[r]!) {
        const ya = ay[e]!, yb = by[e]!;
        if ((ya > yMid) !== (yb > yMid)) crossings.push(ax[e]! + ((yMid - ya) * (bx[e]! - ax[e]!)) / (yb - ya));
      }
      crossings.sort((p, q) => p - q);
      let seen = 0;
      for (let c = 0; c < cols; c++) {
        const x0 = (gx0 + c) * this.cellDeg - 180;
        while (seen < crossings.length && crossings[seen]! < x0) seen++;
        const baseInside = seen % 2 === 1;
        const list = cellEdges.get(c * rows + r);
        const key = (gx0 + c) * KEY + (gy0 + r);
        if (list) cells.set(key, { state: 2, edges: Uint32Array.from(list), baseInside, x0, yMid });
        else if (baseInside) cells.set(key, { state: 1 });
      }
    }
    for (const key of cells.keys()) {
      const list = this.byCell.get(key);
      const entry: FeatureCells = { feature, edges, cells };
      if (list) list.push(entry); else this.byCell.set(key, [entry]);
    }
  }

  lookup(lat: number, lon: number): BoundaryFeature[] {
    const key = this.cx(lon) * KEY + this.cy(lat);
    const here = this.byCell.get(key);
    if (!here) return [];
    const out: BoundaryFeature[] = [];
    for (const { feature, edges, cells } of here) {
      const cell = cells.get(key)!;
      if (cell.state === 1 || (cell.state === 2 && insideCell(cell, edges, lon, lat))) out.push(feature);
    }
    return out;
  }
}

// Parity at the middle of the cell's left side, flipped by every edge between there and the point:
// first up or down that side, then across to the point.
function insideCell(cell: Extract<Cell, { state: 2 }>, g: Edges, lon: number, lat: number): boolean {
  let inside = cell.baseInside;
  const { x0, yMid } = cell;
  const lo = Math.min(yMid, lat), hi = Math.max(yMid, lat);
  for (const e of cell.edges) {
    const ax = g.ax[e]!, ay = g.ay[e]!, bx = g.bx[e]!, by = g.by[e]!;
    if ((ax > x0) !== (bx > x0)) {
      const y = ay + ((x0 - ax) * (by - ay)) / (bx - ax);
      if (y > lo && y <= hi) inside = !inside;
    }
    if ((ay > lat) !== (by > lat)) {
      const x = ax + ((lat - ay) * (bx - ax)) / (by - ay);
      if (x >= x0 && x < lon) inside = !inside;
    }
  }
  return inside;
}
