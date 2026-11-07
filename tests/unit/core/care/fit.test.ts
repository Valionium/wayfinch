// Bike care's fitting (sub-project 12, Tasks 1 and 2): which details of a bike a task depends on, and which tasks show for a bike.
import { expect, test } from 'vitest';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import type { BikeRecord } from '../../../../src/core/bike/normalise.ts';
import { careDetails } from '../../../../src/core/care/fit.ts';

const bike = (extra: Record<string, unknown>): BikeRecord => normaliseBike({ id: 'bike_1', name: 'Test', ...extra })!;

test('[BC-DETAILS] each stored value maps as sub-project 11 decision 1\'s table', () => {
  const brakes = { rim: 'rim', 'cable-disc': 'cable-disc', 'hydraulic-disc': 'hydraulic-disc', other: 'other', unknown: null };
  for (const [stored, want] of Object.entries(brakes)) expect(careDetails(bike({ brakes: stored })).brakes, stored).toBe(want);
  const tyres = { tubes: 'tubes', tubeless: 'tubeless', other: 'other', unknown: null };
  for (const [stored, want] of Object.entries(tyres)) expect(careDetails(bike({ tyres: stored })).tyres, stored).toBe(want);
  const drive = { derailleur: ['chain', 'derailleur'], 'chain-hub': ['chain', 'hub'], belt: ['belt', 'hub'], unknown: [null, null] };
  for (const [stored, [d, g]] of Object.entries(drive)) {
    const details = careDetails(bike({ drive: stored }));
    expect(details.drive, stored).toBe(d);
    expect(details.gears, stored).toBe(g);
  }
  const shifting = { cable: 'cable', electronic: 'electronic', none: 'other', unknown: null };
  for (const [stored, want] of Object.entries(shifting)) expect(careDetails(bike({ shifting: stored })).shifting, stored).toBe(want);
  for (const s of ['none', 'front', 'full'] as const) expect(careDetails(bike({ suspension: s })).suspension).toBe(s);
  // Not stored: a full-suspension frame says it; any other frame, or none, is Not sure.
  expect(careDetails(bike({ fit: { style: 'full-suspension' } })).suspension).toBe('full');
  expect(careDetails(bike({ fit: { style: 'diamond-level' } })).suspension).toBe(null);
  expect(careDetails(bike({})).suspension).toBe(null);
  // A stored answer stands over the frame's shape.
  expect(careDetails(bike({ suspension: 'front', fit: { style: 'full-suspension' } })).suspension).toBe('front');
  const ebike = (v: boolean | null) => careDetails(bike({ look: { colour: '#ff0000', bars: null, ebike: v } })).ebike;
  expect(ebike(true)).toBe('yes');
  expect(ebike(false)).toBe('no');
  expect(ebike(null)).toBe(null);
  expect(careDetails(bike({})).ebike).toBe(null);
});

test('[BC-DETAILS] no bike: every detail is Not sure', () => {
  expect(careDetails(null)).toEqual({ brakes: null, tyres: null, drive: null, gears: null, shifting: null, suspension: null, ebike: null });
});
