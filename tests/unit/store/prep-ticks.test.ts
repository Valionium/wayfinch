// Trip prep's ticks (design of 15 November 2026): one copilot:* key, for one route; old or odd data reads as no ticks, and Delete co-pilot
// data removes it with the rest.
import { beforeEach, expect, test } from 'vitest';
import { dumpStorage, freshStore } from './helpers.ts';
import { deleteCopilotData } from '../../../src/store/export.ts';
import { PREP_TICKS_KEY, readTicks, setTick } from '../../../src/store/prep-ticks.ts';

beforeEach(freshStore);

test('[TRIP-PREP-TICKS] the key is a copilot:* key, and nothing stored, unreadable, the wrong shape or another route reads as no ticks', () => {
  expect(PREP_TICKS_KEY).toBe('copilot:tripPrep:v1');
  expect(readTicks('route-a')).toEqual([]);
  for (const raw of ['{', 'null', '7', '"x"', '[]', '{}', '{"route":"route-a"}', '{"route":"route-a","ticked":"kit"}', '{"route":7,"ticked":["kit"]}']) {
    localStorage.setItem(PREP_TICKS_KEY, raw);
    expect(readTicks('route-a'), raw).toEqual([]);
  }
  localStorage.setItem(PREP_TICKS_KEY, JSON.stringify({ route: 'route-b', ticked: ['kit'] }));
  expect(readTicks('route-a')).toEqual([]);
  // ids that are not item ids are left out; the rest still count
  localStorage.setItem(PREP_TICKS_KEY, JSON.stringify({ route: 'route-a', ticked: ['kit', 7, '', 'Not an id!', 'x'.repeat(200), 'charge', 'kit'] }));
  expect(readTicks('route-a')).toEqual(['kit', 'charge']);
});

test('[TRIP-PREP-TICKS] a tick is kept for this route only, under its one key, and nothing else is written', () => {
  localStorage.setItem('loadcheck:bikeProfile', '{"id":"bike_1"}');
  localStorage.setItem('copilot:settings', '{"nights":2}');
  const before = JSON.parse(dumpStorage()) as [string, string][];
  expect(setTick('route-a', 'kit', true)).toEqual(['kit']);
  expect(setTick('route-a', 'brakes-lever-test', true)).toEqual(['kit', 'brakes-lever-test']);
  expect(setTick('route-a', 'kit', true)).toEqual(['kit', 'brakes-lever-test']);
  expect(readTicks('route-a')).toEqual(['kit', 'brakes-lever-test']);
  expect(setTick('route-a', 'kit', false)).toEqual(['brakes-lever-test']);
  expect(JSON.parse(localStorage.getItem(PREP_TICKS_KEY)!)).toEqual({ route: 'route-a', ticked: ['brakes-lever-test'] });
  const after = (JSON.parse(dumpStorage()) as [string, string][]).filter(([k]) => k !== PREP_TICKS_KEY);
  expect(after).toEqual(before);
  // another route starts afresh: its first tick replaces the old route's list
  expect(readTicks('route-b')).toEqual([]);
  expect(setTick('route-b', 'charge', true)).toEqual(['charge']);
  expect(readTicks('route-a')).toEqual([]);
});

test('[TRIP-PREP-TICKS] a tick starts from what is stored, so ticks removed elsewhere (another window, Delete co-pilot data) do not come back with it', async () => {
  setTick('route-a', 'kit', true);
  setTick('route-a', 'charge', true);
  await deleteCopilotData();
  expect(localStorage.getItem(PREP_TICKS_KEY)).toBeNull();
  expect(readTicks('route-a')).toEqual([]);
  expect(setTick('route-a', 'forecast', true)).toEqual(['forecast']);
});

test('[TRIP-PREP-TICKS] a browser that refuses storage: the tick is not kept and the write says so; a refused read is no ticks', () => {
  const real = globalThis.localStorage;
  const refusing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
  globalThis.localStorage = refusing;
  try {
    expect(readTicks('route-a')).toEqual([]);
    expect(setTick('route-a', 'kit', true)).toBeNull();
  } finally {
    globalThis.localStorage = real;
  }
  const full = { getItem: () => null, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } } as unknown as Storage;
  globalThis.localStorage = full;
  try {
    expect(setTick('route-a', 'kit', true)).toBeNull();
  } finally {
    globalThis.localStorage = real;
  }
});
