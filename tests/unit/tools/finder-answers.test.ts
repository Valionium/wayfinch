// The Bike finder's answers (design of 14 November 2026): one copilot:* key, as the tyre tool keeps its answers. Nothing stored, unreadable,
// another version or a value not in its question's list reads as that question unanswered, so old data loads unchanged; nothing else is
// written; Delete co-pilot data removes it.
import { beforeEach, expect, test } from 'vitest';
import { dumpStorage, freshStore } from '../store/helpers.ts';
import { deleteCopilotData } from '../../../src/store/export.ts';
import { clearAnswers, FINDER_KEY, readAnswers, writeAnswers } from '../../../src/tools/finder/answers.ts';

beforeEach(freshStore);

test('[BF-STORE] the key is a copilot:* key; nothing stored, unreadable, another version or a value not in the list reads as unanswered', () => {
  expect(FINDER_KEY).toBe('copilot:bikeFinder:v1');
  expect(readAnswers()).toEqual({});
  for (const raw of ['{', 'null', '7', '"x"', '[]', '{}', '{"v":2,"answers":{"rides":"day"}}', '{"v":1}', '{"v":1,"answers":[]}', '{"v":1,"answers":"day"}']) {
    localStorage.setItem(FINDER_KEY, raw);
    expect(readAnswers(), raw).toEqual({});
  }
  localStorage.setItem(FINDER_KEY, JSON.stringify({ v: 1, answers: { rides: 'touring', ground: 'moon', carry: 7, pace: 'comfort', motor: null, extra: 'x' } }));
  expect(readAnswers()).toEqual({ rides: 'touring', pace: 'comfort' });
});

test('[BF-STORE] an answer is kept under its one key and nothing else is written; Start again removes it; Delete co-pilot data removes it', async () => {
  localStorage.setItem('loadcheck:bikeProfile', '{"id":"bike_1"}');
  localStorage.setItem('loadcheck:bikeProfiles', '[{"id":"bike_1"}]');
  localStorage.setItem('copilot:bikeChoice:v1', '{"app":"wayfinch"}');
  const before = JSON.parse(dumpStorage()) as [string, string][];
  expect(writeAnswers({ rides: 'day', ground: 'paved' })).toBe(true);
  expect(JSON.parse(localStorage.getItem(FINDER_KEY)!)).toEqual({ v: 1, answers: { rides: 'day', ground: 'paved' } });
  expect(readAnswers()).toEqual({ rides: 'day', ground: 'paved' });
  const after = (JSON.parse(dumpStorage()) as [string, string][]).filter(([k]) => k !== FINDER_KEY);
  expect(after).toEqual(before);
  clearAnswers();
  expect(localStorage.getItem(FINDER_KEY)).toBeNull();
  expect(JSON.parse(dumpStorage())).toEqual(before);
  writeAnswers({ rides: 'bikepacking', ground: 'gravel', carry: 'days', pace: 'balance', motor: 'no' });
  await deleteCopilotData();
  expect(localStorage.getItem(FINDER_KEY)).toBeNull();
  expect(readAnswers()).toEqual({});
});

test('[BF-STORE] a browser that refuses to keep it: the answers stay for this visit, nothing throws', () => {
  const real = localStorage.setItem.bind(localStorage);
  localStorage.setItem = () => { throw new Error('full'); };
  try {
    expect(writeAnswers({ rides: 'day' })).toBe(false);
    expect(() => clearAnswers()).not.toThrow();
  } finally {
    localStorage.setItem = real;
  }
});
