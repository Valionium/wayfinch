import { expect } from 'vitest';
import { test } from '@fast-check/vitest';
import { decodeTile, encodeTile } from '../../../../src/core/places/pack-format.ts';
import { tileOf } from '../../../../src/core/places/tiles.ts';
import type { TileContent } from '../../../../src/core/places/types.ts';
import { metaManifest, tileContent } from '../../../gen';

const meta = { manifest: metaManifest() };
const normalised = (c: TileContent): TileContent => ({
  places: [...c.places].sort((a, b) => (a.id < b.id ? -1 : 1)),
  roofs: [...c.roofs].sort((a, b) => a.lat - b.lat || a.lon - b.lon || Number(a.kind === 'bike_parking') - Number(b.kind === 'bike_parking') || Number(a.bench) - Number(b.bench)),
  rescuePoints: [...c.rescuePoints].sort((a, b) => a.lat - b.lat || a.lon - b.lon || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0)),
});

test.prop([tileContent()])('[PIPE-FMT-01] encode and decode give the same content', (c) => {
  const id = tileOf(c.places[0]?.lat ?? 0, c.places[0]?.lon ?? 0, 8);
  expect(normalised(decodeTile(encodeTile(c, id), meta))).toEqual(normalised(c));
});

test.prop([tileContent()])('[PIPE-FMT-02] the order of input never changes the bytes', (c) => {
  const id = { z: 8, x: 1, y: 1 };
  expect(encodeTile({ places: [...c.places].reverse(), roofs: [...c.roofs].reverse(), rescuePoints: [...c.rescuePoints].reverse() }, id)).toBe(encodeTile(c, id));
});

test('a tile has no whitespace between its parts', () => {
  expect(encodeTile({ places: [], roofs: [], rescuePoints: [] }, { z: 8, x: 1, y: 1 }))
    .toBe('{"v":1,"z":8,"x":1,"y":1,"zones":[],"p":[],"roofs":{"a":[],"o":[],"f":[]},"rescue":{"a":[],"o":[],"ref":[]}}');
});
