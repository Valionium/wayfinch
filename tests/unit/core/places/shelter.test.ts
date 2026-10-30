import { expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { classifyObject } from '../../../../src/core/places/classify.ts';
import { NearIndex } from '../../../../src/core/places/near.ts';
import { isNeverCover, mergeOutlinesAndNodes, normaliseShelterType } from '../../../../src/core/places/shelter.ts';
import { shelterTags } from '../../../gen';
import { ctx, metresFrom, node, obj, opts, way } from './helpers.ts';

test.each([
  ['Wetterpilz', 'wetterpilz'], ['wetterpilz', 'wetterpilz'], ['weather shelter', 'weather_shelter'],
  ['Weather_Shelter', 'weather_shelter'], ['lean-to', 'lean_to'], ['picnic shelter', 'picnic_shelter'],
])('[PIPE-SHELTER-01] %s becomes %s', (v, out) => expect(normaliseShelterType(v)).toBe(out));

plain('[PIPE-SHELTER-01] a missing or empty type has none', () => {
  expect(normaliseShelterType(undefined)).toBeNull();
  expect(normaliseShelterType('  ')).toBeNull();
});

test.each(['field_shelter', 'sun_shelter', 'pergola', 'gazebo', 'pavilion', 'rock_shelter', 'shopping_cart', 'smoking'])(
  '[PIPE-SHELTER-02] %s is never cover',
  (v) => expect(classifyObject(obj({ amenity: 'shelter', shelter_type: v }), ctx(), opts())).toBeNull(),
);

plain('[PIPE-SHELTER-02] an untyped shelter, a private one and a hunting stand are never places', () => {
  expect(classifyObject(obj({ amenity: 'shelter' }), ctx(), opts())).toBeNull();
  expect(classifyObject(obj({ amenity: 'shelter', shelter_type: 'lean_to', access: 'private' }), ctx(), opts())).toBeNull();
  expect(classifyObject(obj({ amenity: 'shelter', shelter_type: 'lean_to', access: 'no' }), ctx(), opts())).toBeNull();
  expect(classifyObject(obj({ amenity: 'shelter', shelter_type: 'lean_to', disused: 'yes' }), ctx(), opts())).toBeNull();
  expect(classifyObject(obj({ amenity: 'shelter', shelter_type: 'lean_to', abandoned: 'yes' }), ctx(), opts())).toBeNull();
  expect(classifyObject(obj({ amenity: 'hunting_stand' }), ctx(), opts())).toBeNull();
  expect(classifyObject(obj({ amenity: 'shelter', shelter_type: 'lean_to' }), ctx(), opts())?.kind).toBe('shelter');
  expect(classifyObject(obj({ amenity: 'shelter', shelter_type: 'Weather Shelter' }), ctx(), opts())?.kind).toBe('shelter');
});

test.prop([shelterTags()])('[PIPE-SHELTER-02] whatever the tags, a never-cover object is no shelter', (t) => {
  const p = classifyObject(obj(t), ctx(), opts());
  if (isNeverCover(t)) expect(p?.kind).not.toBe('shelter');
});

const square: [number, number][] = [[49.4, 8.7], [49.4, 8.7002], [49.4002, 8.7002], [49.4002, 8.7]];
const inSquare = { lat: 49.4001, lon: 8.7001 };

plain('[PIPE-SHELTER-03] a shelter node inside its outline is kept once, as the outline, with missing tags filled', () => {
  const r = mergeOutlinesAndNodes([
    way('w1', square, { amenity: 'shelter', shelter_type: 'wetterpilz' }),
    node('n1', inSquare, { amenity: 'shelter', shelter_type: 'Wetterpilz', bench: 'yes' }),
  ]);
  expect(r.map((o) => o.id)).toEqual(['w1']);
  expect(r[0]!.tags.bench).toBe('yes');
  expect(r[0]!.tags.shelter_type).toBe('wetterpilz');
});

plain('[PIPE-SHELTER-03] a node outside the outline stays, and the order of input changes nothing', () => {
  const a = way('w1', square, { amenity: 'shelter', shelter_type: 'wetterpilz' });
  const b = node('n2', metresFrom({ lat: 49.4002, lon: 8.7002 }, 50), { amenity: 'shelter', shelter_type: 'lean_to' });
  const c = node('n1', inSquare, { amenity: 'shelter', bench: 'yes' });
  const one = mergeOutlinesAndNodes([a, b, c]);
  expect(one.map((o) => o.id)).toEqual(['n2', 'w1']);
  expect(mergeOutlinesAndNodes([c, b, a])).toEqual(one);
});

plain('NearIndex finds items within a distance, by vertices too, in a stable order', () => {
  const items = [
    { id: 'a', ...metresFrom({ lat: 49, lon: 8 }, 299) }, { id: 'b', ...metresFrom({ lat: 49, lon: 8 }, 301) },
    { id: 'c', lat: 49, lon: 8 },
  ];
  const idx = new NearIndex(items, (t) => [t.lat, t.lon], 300);
  expect(idx.within(49, 8, 300).map((t) => t.id)).toEqual(['a', 'c']);
  expect(idx.within(49, 8, 400).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  expect(idx.within(0, 0, 400)).toEqual([]);
  const lines = [{ id: 'line', pts: [[50, 9], [50.01, 9]] as [number, number][] }];
  const byVertex = new NearIndex(lines, (t) => t.pts[0]!, 300, (t) => t.pts);
  expect(byVertex.within(50.0101, 9, 200).map((t) => t.id)).toEqual(['line']);
  expect(byVertex.within(50.0101, 9, 200)).toHaveLength(1);
});
