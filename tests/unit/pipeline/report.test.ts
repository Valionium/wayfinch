import { expect, test } from 'vitest';
import { problemsOfRun, ISSUE_TITLE } from '../../../pipeline/report.ts';
import type { PackManifest } from '../../../src/core/places/types.ts';

const manifest = (countries: PackManifest['countries']): PackManifest => ({
  v: 1, buildId: '20261103-1', builtAt: '2026-11-03T03:30:00Z',
  licence: { name: 'ODbL-1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors', buildCode: 'x' },
  countries, kinds: [], tiles: [],
});
const fresh = { status: 'fresh', builtOn: '2026-11-03', sourceDate: '2026-11-02', places: 10 } as const;
const allFresh = { manifest: manifest({ DE: fresh, FR: fresh }), problems: [], publishFailed: false };

test('no problem, no issue', () => { expect(problemsOfRun(allFresh)).toBeNull(); });

test('a last-good country is named with its date and reason', () => {
  const m = manifest({ DE: fresh, FR: { status: 'last-good', builtOn: '2026-10-27', sourceDate: '2026-10-26', places: 9 } });
  const r = problemsOfRun({ manifest: m, problems: ['FR: places fell by 40%, over the 20% limit'], publishFailed: false });
  expect(r?.title).toBe(ISSUE_TITLE);
  expect(r?.body).toContain('FR');
  expect(r?.body).toContain('2026-10-27');
  expect(r?.body).toContain('over the 20% limit');
  expect(r?.body).not.toContain('DE');
});

test('a missing country is named', () => {
  const m = manifest({ BE: { status: 'missing', builtOn: null, sourceDate: null, places: 0 } });
  expect(problemsOfRun({ manifest: m, problems: [], publishFailed: false })?.body).toContain('BE');
});

test('the body says what it means in plain words, and that nothing is broken for riders', () => {
  const m = manifest({ FR: { status: 'last-good', builtOn: '2026-10-27', sourceDate: null, places: 9 } });
  const body = problemsOfRun({ manifest: m, problems: [], publishFailed: false })!.body;
  expect(body).toContain('keeps the last good data');
  expect(body).toContain('pipeline/README.md');
});

test('a failed publish, or no manifest at all, opens an issue', () => {
  expect(problemsOfRun({ manifest: allFresh.manifest, problems: [], publishFailed: true })?.body).toContain('publish');
  expect(problemsOfRun({ manifest: null, problems: ['merge problems: tile too big'], publishFailed: false })?.body).toContain('tile too big');
});
