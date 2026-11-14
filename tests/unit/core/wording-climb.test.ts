import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { CC } from '../../../src/core/wording/en-climb.ts';
import { TR } from '../../../src/core/wording/en-trip.ts';
import { TF } from '../../../src/core/wording/en-trip-fields.ts';
import { bannedHits } from '../../fixtures/banned.ts';

const texts = (): [string, string][] =>
  Object.entries(CC).map(([k, v]) => [k, typeof v === 'function' ? (v as (...a: unknown[]) => string)(2, '54.3', '61', '9.8') : v]);

test('[HON-BANNED] no Climb check line uses a banned word; every key is its own, in neither en.ts, en-trip.ts nor en-trip-fields.ts', () => {
  expect(texts().length).toBe(15);
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
  expect(CC.appClimbWalk).toMatch(/^Likely a walk/);
  expect(CC.appClimbNoHeights).toMatch(/Prepare this route/);
  for (const [key, text] of texts()) {
    expect(/\b(cassette|chainring|teeth|cog|heart|doctor|medical|pulse)\b/i.test(text), `${key}: ${text}`).toBe(false);
    expect(/\b(will|always|never|must)\b/i.test(text), `${key}: ${text}`).toBe(false);
  }
});

test('[CC-LIST] where, figures and the count of the rest read plainly', () => {
  expect(CC.appClimbWhere(2, '54.3', '61')).toBe('Day 2 · km 54.3 to 61');
  expect(CC.appClimbWhere(null, '54.3', '61')).toBe('km 54.3 to 61');
  expect(CC.appClimbFigures('6.7', '420', '6.3', '9.8')).toBe('6.7 km · 420 m up · average 6.3% · steepest 500 m 9.8%');
  expect(CC.appClimbMore(1)).toBe('1 smaller climb is not listed.');
  expect(CC.appClimbMore(3)).toBe('3 smaller climbs are not listed.');
});
