// The adaptive quadtree of section 5a: a tile splits into four until it holds at most the limit,
// down to level 14, where it keeps what it has (and the merge reports it).
import { tileOf } from '../src/core/places/tiles.ts';
import type { Place, TileId } from '../src/core/places/types.ts';

export const DEEPEST_LEVEL = 14;

type At = { lat: number; lon: number };
const keyOf = (t: TileId): string => `${t.z}/${t.x}/${t.y}`;

export function splitTree(places: Place[], maxPerTile: number): { id: TileId; places: Place[] }[] {
  if (places.length === 0) return [];
  const deep = places.map((p) => ({ p, t: tileOf(p.lat, p.lon, DEEPEST_LEVEL) }));
  const leaves: { id: TileId; places: Place[] }[] = [];
  const visit = (items: typeof deep, z: number, x: number, y: number): void => {
    if (items.length <= maxPerTile || z === DEEPEST_LEVEL) { leaves.push({ id: { z, x, y }, places: items.map((i) => i.p) }); return; }
    const shift = DEEPEST_LEVEL - (z + 1);
    const quadrants = new Map<number, typeof deep>();
    for (const item of items) {
      const q = (((item.t.x >> shift) & 1) << 1) | ((item.t.y >> shift) & 1);
      const list = quadrants.get(q);
      if (list) list.push(item); else quadrants.set(q, [item]);
    }
    for (const q of [...quadrants.keys()].sort((a, b) => a - b)) visit(quadrants.get(q)!, z + 1, x * 2 + (q >> 1), y * 2 + (q & 1));
  };
  visit(deep, 0, 0, 0);
  return leaves;
}

/**
 * Roofs and rescue points go to the leaf that holds them. A point whose quadrant has no leaf (no place
 * lies near) gets a leaf of its own at the shallowest empty quadrant on its way down from the root.
 */
export function assignToTiles<T extends At>(leafIds: TileId[], items: T[]): { id: TileId; items: T[] }[] {
  const leaves = new Set(leafIds.map(keyOf));
  const inner = new Set<string>();                                  // ancestors of leaves
  for (const l of leafIds) {
    for (let z = 0; z < l.z; z++) inner.add(keyOf({ z, x: l.x >> (l.z - z), y: l.y >> (l.z - z) }));
  }
  const out = new Map<string, { id: TileId; items: T[] }>();
  for (const item of items) {
    let id: TileId = { z: 0, x: 0, y: 0 };
    for (let z = 0; z <= DEEPEST_LEVEL; z++) {
      id = tileOf(item.lat, item.lon, z);
      if (leaves.has(keyOf(id)) || !inner.has(keyOf(id))) break;
    }
    const k = keyOf(id);
    const slot = out.get(k);
    if (slot) slot.items.push(item); else out.set(k, { id, items: [item] });
  }
  return [...out.values()];
}
