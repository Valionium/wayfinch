import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { dumpStorage, freshStore } from './helpers.ts';
import empty from '../../../contracts/load-summary/empty.json';
import full from '../../../contracts/load-summary/full.json';
import { readBike, readBikes, readLoadSummary } from '../../../src/store/loadcheck-read.ts';

beforeEach(freshStore);

const filesIn = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? filesIn(path) : [path];
});

test('[ST-NO-LOADCHECK] the store and the data layer never write a loadcheck key, and nothing clears the storage', () => {
  const files = [...filesIn('src/store'), ...filesIn('src/data')];
  expect(files.length).toBeGreaterThan(3);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    expect(source, file).not.toMatch(/setItem\(\s*[`'"]loadcheck:/);
    expect(source, file).not.toMatch(/removeItem\(\s*[`'"]loadcheck:/);
    expect(source, file).not.toMatch(/localStorage\s*\.\s*clear/);
  }
  // A key held in a constant can't dodge the check: the reader's keys are only ever read.
  const reader = readFileSync('src/store/loadcheck-read.ts', 'utf8');
  expect(reader).not.toMatch(/setItem|removeItem/);
});

test('[ST-NO-LOADCHECK] reading the load summary and the bikes changes nothing', () => {
  localStorage.setItem('loadcheck:summary:v1', JSON.stringify(full));
  localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([{ id: 'a', name: 'A' }]));
  localStorage.setItem('loadcheck:bikeProfile', JSON.stringify({ id: 'a', name: 'A' }));
  const before = dumpStorage();
  readLoadSummary(); readBikes(); readBike();
  expect(dumpStorage()).toBe(before);
});

test('[ST-NO-LOADCHECK] the load summary reads per contract; an unknown major version, another app or a damaged record reads as none', () => {
  expect(readLoadSummary()).toBeNull();
  localStorage.setItem('loadcheck:summary:v1', JSON.stringify(full));
  expect(readLoadSummary()).toEqual(full);
  localStorage.setItem('loadcheck:summary:v1', JSON.stringify({ ...full, futureField: 1 }));
  expect(readLoadSummary()).toMatchObject({ v: 1 });
  localStorage.setItem('loadcheck:summary:v1', JSON.stringify(empty));
  expect(readLoadSummary()).toEqual(empty);
  for (const bad of [{ ...full, v: 2 }, { ...full, app: 'other' }, { ...full, kind: 'other' }, { ...full, water: null }, { ...full, weight: { kitKg: 'x' } }, 'text', 7]) {
    localStorage.setItem('loadcheck:summary:v1', JSON.stringify(bad));
    expect(readLoadSummary(), JSON.stringify(bad).slice(0, 40)).toBeNull();
  }
  localStorage.setItem('loadcheck:summary:v1', '{not json');
  expect(readLoadSummary()).toBeNull();
});

test('[ST-NO-LOADCHECK] bikes read from every format; a damaged record reads as none and a damaged row drops only itself', () => {
  expect(readBike()).toBeNull();
  expect(readBikes()).toEqual([]);
  localStorage.setItem('loadcheck:bikeProfilesFormat', '99');
  localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([{ id: 'a', name: 'A', later: 1 }, { name: 'no id' }, 3, { id: 'b' }]));
  expect(readBikes().map((b) => b.id)).toEqual(['a', 'b']);
  localStorage.setItem('loadcheck:bikeProfile', JSON.stringify({ id: 'a' }));
  expect(readBike()?.id).toBe('a');
  localStorage.setItem('loadcheck:bikeProfile', '{no');
  localStorage.setItem('loadcheck:bikeProfiles', '{}');
  expect(readBike()).toBeNull();
  expect(readBikes()).toEqual([]);
});
