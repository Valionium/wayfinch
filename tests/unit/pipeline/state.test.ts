import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { downloadLastGood, replaceLastGood } from '../../../pipeline/state.ts';
import type { GhRunner } from '../../../pipeline/state.ts';

const source = (): string => { const d = mkdtempSync(path.join(tmpdir(), 'wf-state-')); const p = path.join(d, 'country-FR.json.gz'); writeFileSync(p, 'x'); return p; };

// A pretend gh: records every call and answers from a small table of assets.
function fakeGh(assets: { id: number; name: string }[], failOn?: (args: string[]) => boolean): { gh: GhRunner; calls: string[][] } {
  const calls: string[][] = [];
  const gh: GhRunner = async (args) => {
    calls.push(args);
    if (failOn?.(args)) throw new Error('boom');
    if (args[0] === 'api' && args.includes('--jq')) return assets.map((a) => `${a.id} ${a.name}`).join('\n');
    return '';
  };
  return { gh, calls };
}

test('[PIPE-MERGE-02] replacing uploads as .new first, then deletes the old one, then renames', async () => {
  const { gh, calls } = fakeGh([{ id: 7, name: 'country-FR-last-good' }, { id: 8, name: 'country-FR-last-good.new' }]);
  await replaceLastGood('FR', source(), gh);
  const verbs = calls.map((c) => c.slice(0, 2).join(' '));
  const up = verbs.findIndex((v) => v === 'release upload');
  const del = verbs.findIndex((v) => v === 'release delete-asset');
  const rename = calls.findIndex((c) => c[0] === 'api' && c.includes('PATCH'));
  expect(up).toBeGreaterThanOrEqual(0);
  expect(del).toBeGreaterThan(up);
  expect(rename).toBeGreaterThan(del);
  expect(calls[rename]!.join(' ')).toContain('name=country-FR-last-good');
});

test('[PIPE-MERGE-02] a failed upload leaves the old copy alone', async () => {
  const { gh, calls } = fakeGh([{ id: 7, name: 'country-FR-last-good' }], (a) => a[1] === 'upload');
  await expect(replaceLastGood('FR', source(), gh)).rejects.toThrow();
  expect(calls.some((c) => c[1] === 'delete-asset')).toBe(false);
});

test('downloadLastGood returns null when there is no copy, and accepts a .new copy', async () => {
  expect(await downloadLastGood('FR', '/tmp/dl', fakeGh([]).gh)).toBeNull();
  const only = fakeGh([{ id: 8, name: 'country-FR-last-good.new' }]);
  expect(await downloadLastGood('FR', '/tmp/dl', only.gh)).toMatch(/country-FR-last-good\.new$/);
});

test('downloadLastGood prefers the plain copy', async () => {
  const both = fakeGh([{ id: 7, name: 'country-FR-last-good' }, { id: 8, name: 'country-FR-last-good.new' }]);
  expect(await downloadLastGood('FR', '/tmp/dl', both.gh)).toMatch(/country-FR-last-good$/);
});
