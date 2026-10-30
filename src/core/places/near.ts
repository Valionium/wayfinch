import { haversineKm } from '../geo/haversine.ts';

const M_PER_DEG = 111195;

/**
 * A plain grid for "what lies within m metres of here", fed with millions of objects by the pipeline.
 * An item may have several points (an outline's vertices); it is found once if any of them is near.
 */
export class NearIndex<T> {
  private readonly cells = new Map<string, { index: number; lat: number; lon: number }[]>();
  private readonly items: T[];
  private readonly dLat: number;

  constructor(items: T[], at: (t: T) => [number, number], cellM: number, allPoints?: (t: T) => [number, number][]) {
    this.items = items;
    this.dLat = cellM / M_PER_DEG;
    this.cellM = cellM;
    items.forEach((item, index) => {
      for (const [lat, lon] of allPoints ? allPoints(item) : [at(item)]) {
        const key = this.key(lat, lon);
        const list = this.cells.get(key);
        const entry = { index, lat, lon };
        if (list) list.push(entry); else this.cells.set(key, [entry]);
      }
    });
  }

  private readonly cellM: number;

  // Cells are one step high everywhere and one `cellM` wide at the latitude of their row.
  private dLon(row: number): number {
    const lat = (row + 0.5) * this.dLat;
    return this.cellM / (M_PER_DEG * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  }

  private key(lat: number, lon: number): string {
    const row = Math.floor(lat / this.dLat);
    return `${row}:${Math.floor(lon / this.dLon(row))}`;
  }

  within(lat: number, lon: number, m: number): T[] {
    const rowFrom = Math.floor((lat - m / M_PER_DEG) / this.dLat);
    const rowTo = Math.floor((lat + m / M_PER_DEG) / this.dLat);
    const found = new Set<number>();
    for (let row = rowFrom; row <= rowTo; row++) {
      // The widest reach in longitude is on the row nearest the pole.
      const edgeLat = Math.min(89.9, Math.max(Math.abs(row * this.dLat), Math.abs((row + 1) * this.dLat), Math.abs(lat)));
      const reach = m / (M_PER_DEG * Math.cos((edgeLat * Math.PI) / 180));
      const width = this.dLon(row);
      for (let col = Math.floor((lon - reach) / width); col <= Math.floor((lon + reach) / width); col++) {
        for (const e of this.cells.get(`${row}:${col}`) ?? []) {
          if (haversineKm({ lat, lon }, { lat: e.lat, lon: e.lon }) * 1000 <= m) found.add(e.index);
        }
      }
    }
    return [...found].sort((a, b) => a - b).map((i) => this.items[i]!);
  }
}
