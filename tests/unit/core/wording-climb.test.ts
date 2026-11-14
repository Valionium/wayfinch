import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { CC } from '../../../src/core/wording/en-climb.ts';
import { TR } from '../../../src/core/wording/en-trip.ts';
import { TF } from '../../../src/core/wording/en-trip-fields.ts';
import { bannedHits } from '../../fixtures/banned.ts';

const texts = (): [string, string][] =>
  Object.entries(CC).map(([k, v]) => [k, typeof v === 'function' ? (v as (...a: unknown[]) => string)(2, '54.3', '61', '9.8') : v]);

test('[HON-BANNED] no Climb check line uses a banned word; every key is its own, in neither en.ts, en-trip.ts nor en-trip-fields.ts', () => {
  expect(texts().length).toBe(16); // 15, and the day end on a climb over a night (review of PR 150, I1)
  for (const [key, text] of texts()) {
    expect(key).toMatch(/^appClimb/);
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text), `${key}: ${text}`).toEqual([]);
    expect(key in W, key).toBe(false);
    expect(key in TR, key).toBe(false);
    expect(key in TF, key).toBe(false);
  }
});

test('[CC-HONEST] times and figures say they are estimates; no gear and no health advice; the walk line says likely, never certain', () => {
  expect(CC.appClimbTime(65)).toBe('About 1 h 5 min of riding (estimate)');
  expect(CC.appClimbTime(120)).toBe('About 2 h of riding (estimate)');
  expect(CC.appClimbTime(45)).toBe('About 45 min of riding (estimate)');
  expect(CC.appClimbLead('20')).toMatch(/^Estimates from the route's heights and your flat speed of 20 km\/h/);
  expect(CC.appClimbLead('20')).toMatch(/Short ramps can be steeper/);
  // Review of PR 150, I2: steep figures can also read high.
  expect(CC.appClimbLead('20').endsWith('heights from a phone recording or a map can make a stretch look steeper than it is (bridges, tunnels).')).toBe(true);
  expect(CC.appClimbWalk).toMatch(/^Likely a walk/);
  expect(CC.appClimbNoHeights).toMatch(/Prepare this route/);
  for (const [key, text] of texts()) {
    expect(/\b(cassette|chainring|teeth|cog|heart|doctor|medical|pulse)\b/i.test(text), `${key}: ${text}`).toBe(false);
    expect(/\b(will|always|never|must)\b/i.test(text), `${key}: ${text}`).toBe(false);
  }
});

test('[CC-LIST] where, figures and the count of the rest read plainly', () => {
  expect(CC.appClimbWhere(2, 2, '54.3', '61')).toBe('Day 2 · km 54.3 to 61');
  expect(CC.appClimbWhere(null, null, '54.3', '61')).toBe('km 54.3 to 61');
  expect(CC.appClimbFigures('6.7', 418, '6.3', '9.8')).toBe('6.7 km · 420 m up · average 6.3% · steepest 500 m 9.8%');
  expect(CC.appClimbFigures('36.2', 1626, '4.5', '8.7')).toBe('36.2 km · 1,630 m up · average 4.5% · steepest 500 m 8.7%');
  expect(CC.appClimbMore(1)).toBe('1 smaller climb is not listed.');
  expect(CC.appClimbMore(3)).toBe('3 smaller climbs are not listed.');
});

test('[CC-DAYS] a climb over a night names its days and where each day ends on it', () => {
  expect(CC.appClimbWhere(1, 2, '0', '36.2')).toBe('Days 1 to 2 · km 0 to 36.2');
  expect(CC.appClimbDayEnd(1, '22')).toBe('Day 1 ends at km 22, partway up this climb.');
});
