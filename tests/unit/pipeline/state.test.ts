import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { downloadLastGood, replaceLastGood } from '../../../pipeline/state.ts';
import type { GhRunner } from '../../../pipeline/state.ts';

const source = (): string => { const d = mkdtempSync(path.join(tmpdir(), 'wf-state-')); const p = path.join(d, 'country-FR.json.gz'); writeFileSync(p, 'x'); return p; };

// A pretend gh: records every call and answers the asset list from a table that upload, delete and rename change.
function fakeGh(start: { id: number; name: string }[], failOn?: (args: string[]) => boolean): { gh: GhRunner; calls: string[][]; assets: { id: number; name: string }[] } {
  const calls: string[][] = [];
  const assets = [...start];
  const gh: GhRunner = async (args) => {
    calls.push(args);
    if (failOn?.(args)) throw new Error('boom');
    if (args[0] === 'api' && args.includes('--jq')) return assets.map((a) => `${a.id} ${a.name}`).join('\n');
    if (args[0] === 'release' && args[1] === 'upload') assets.push({ id: 100 + assets.length, name: path.basename(args[3]!) });
    if (args[0] === 'release' && args[1] === 'delete-asset') assets.splice(assets.findIndex((a) => a.name === args[3]), 1);
    if (args[0] === 'api' && args.includes('PATCH')) {
      const id = Number(args[3]!.split('/').pop());
      assets.find((a) => a.id === id)!.name = args.find((a) => a.startsWith('name='))!.slice(5);
    }
    return '';
  };
  return { gh, calls, assets };
}

test('[PIPE-MERGE-02] replacing uploads under a fresh name first, then deletes the old one, then renames', async () => {
  const f = fakeGh([{ id: 7, name: 'country-FR-last-good' }]);
  await replaceLastGood('FR', source(), f.gh);
  const verbs = f.calls.map((c) => c.slice(0, 2).join(' '));
  const up = verbs.indexOf('release upload');
  const del = verbs.indexOf('release delete-asset');
  const rename = f.calls.findIndex((c) => c[0] === 'api' && c.includes('PATCH'));
  expect(up).toBeGreaterThanOrEqual(0);
  expect(del).toBeGreaterThan(up);
  expect(rename).toBeGreaterThan(del);
  expect(f.assets.map((a) => a.name)).toEqual(['country-FR-last-good']);
});

test('[PIPE-MERGE-02] a failed upload leaves the old copy alone', async () => {
  const f = fakeGh([{ id: 7, name: 'country-FR-last-good' }], (a) => a[1] === 'upload');
  await expect(replaceLastGood('FR', source(), f.gh)).rejects.toThrow();
  expect(f.calls.some((c) => c[1] === 'delete-asset')).toBe(false);
  expect(f.assets.map((a) => a.name)).toEqual(['country-FR-last-good']);
});

test('[PIPE-MERGE-02] a leftover copy from a crash is renamed back before anything is uploaded', async () => {
  // The earlier run died after deleting the plain copy: only the leftover is the last good output.
  const f = fakeGh([{ id: 8, name: 'country-FR-last-good.new-111' }], (a) => a[1] === 'upload');
  await expect(replaceLastGood('FR', source(), f.gh)).rejects.toThrow();
  expect(f.assets.map((a) => a.name)).toEqual(['country-FR-last-good']);
});

test('only assets that finished uploading are listed', async () => {
  const f = fakeGh([]);
  await downloadLastGood('FR', '/tmp/dl', f.gh);
  expect(f.calls.find((c) => c[0] === 'api')!.join(' ')).toContain('uploaded');
});

test('downloadLastGood returns null when there is no copy, and accepts a leftover copy', async () => {
  expect(await downloadLastGood('FR', '/tmp/dl', fakeGh([]).gh)).toBeNull();
  const only = fakeGh([{ id: 8, name: 'country-FR-last-good.new-111' }]);
  expect(await downloadLastGood('FR', '/tmp/dl', only.gh)).toMatch(/country-FR-last-good\.new-111$/);
});

test('downloadLastGood prefers the plain copy', async () => {
  const both = fakeGh([{ id: 7, name: 'country-FR-last-good' }, { id: 8, name: 'country-FR-last-good.new-111' }]);
  expect(await downloadLastGood('FR', '/tmp/dl', both.gh)).toMatch(/country-FR-last-good$/);
});
