import { expect, test as plain } from 'vitest';
import { buildRescuePoints } from '../../../../src/core/places/rescue.ts';
import { metresFrom, node, way } from './helpers.ts';

const a = { lat: 49.4, lon: 8.7 };

plain('[PIPE-RESCUE-01] nodes with either tag and a ref; no ref or a way is out', () => {
  expect(buildRescuePoints([node('n1', a, { highway: 'emergency_access_point', ref: 'KA-145' })])).toEqual([{ lat: 49.4, lon: 8.7, ref: 'KA-145' }]);
  expect(buildRescuePoints([node('n1', a, { emergency: 'access_point', ref: 'KA-146' })])).toHaveLength(1);
  expect(buildRescuePoints([node('n1', a, { highway: 'emergency_access_point' })])).toHaveLength(0);
  expect(buildRescuePoints([node('n1', a, { highway: 'emergency_access_point', ref: '  ' })])).toHaveLength(0);
  expect(buildRescuePoints([node('n1', a, { highway: 'bus_stop', ref: 'X' })])).toHaveLength(0);
  const ring: [number, number][] = [[49.4, 8.7], [49.4, 8.701], [49.401, 8.701]];
  expect(buildRescuePoints([way('w1', ring, { highway: 'emergency_access_point', ref: 'X' })])).toHaveLength(0);
});

plain('[PIPE-RESCUE-01] a ref over 32 characters is cut out', () => {
  expect(buildRescuePoints([node('n1', a, { highway: 'emergency_access_point', ref: 'x'.repeat(32) })])).toHaveLength(1);
  expect(buildRescuePoints([node('n1', a, { highway: 'emergency_access_point', ref: 'x'.repeat(33) })])).toHaveLength(0);
});

plain('[PIPE-RESCUE-02] the same ref within 50 m is merged; other refs and 51 m stay', () => {
  const rp = (id: string, ref: string, m: number) => node(id, metresFrom(a, m), { highway: 'emergency_access_point', ref });
  expect(buildRescuePoints([rp('n1', 'A1', 0), rp('n2', 'A1', 49)])).toHaveLength(1);
  expect(buildRescuePoints([rp('n1', 'A1', 0), rp('n2', 'A1', 51)])).toHaveLength(2);
  expect(buildRescuePoints([rp('n1', 'A1', 0), rp('n2', 'B2', 10)])).toHaveLength(2);
  expect(buildRescuePoints([rp('n2', 'A1', 49), rp('n1', 'A1', 0)])).toEqual(buildRescuePoints([rp('n1', 'A1', 0), rp('n2', 'A1', 49)]));
  expect(buildRescuePoints([rp('n1', 'A1', 0), rp('n2', 'A1', 49)])[0]!.lat).toBe(49.4);
});

plain('[PIPE-RESCUE-03] the sign\'s phone is not kept', () => {
  const out = buildRescuePoints([node('n1', a, { highway: 'emergency_access_point', ref: 'X', emergency_telephone_code: '112' })]);
  expect(JSON.stringify(out)).not.toContain('112');
  expect(Object.keys(out[0]!).sort()).toEqual(['lat', 'lon', 'ref']);
});

plain('control characters are removed from a ref', () => {
  expect(buildRescuePoints([node('n1', a, { highway: 'emergency_access_point', ref: 'K\u0000A-1' })])[0]!.ref).toBe('KA-1');
});
