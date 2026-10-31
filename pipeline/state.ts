// The last good output of each country lives as a file on the GitHub release `pack-state`.
// Replacing it never leaves a gap: upload as <name>.new, delete the old, rename the new.
import { execFile } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export type GhRunner = (args: string[]) => Promise<string>;
const run = promisify(execFile);
export const RELEASE = 'pack-state';
export const repo = (): string => process.env['GITHUB_REPOSITORY'] ?? 'Valionium/wayfinch';

export const realGh: GhRunner = async (args) => (await run('gh', args, { maxBuffer: 16 * 1024 * 1024 })).stdout;

const nameOf = (cc: string): string => `country-${cc}-last-good`;

export async function listAssets(gh: GhRunner): Promise<{ id: number; name: string }[]> {
  let text: string;
  try {
    text = await gh(['api', `repos/${repo()}/releases/tags/${RELEASE}`, '--jq', '.assets[] | select(.state == "uploaded") | "\\(.id) \\(.name)"']);
  } catch (e) {
    if (/404|Not Found/i.test(String(e instanceof Error ? e.message : e))) return [];     // the release is not made yet
    throw e;
  }
  return text.split('\n').filter((l) => l.trim() !== '').map((l) => { const [id, ...rest] = l.trim().split(' '); return { id: Number(id), name: rest.join(' ') }; });
}

async function ensureRelease(gh: GhRunner): Promise<void> {
  try {
    await gh(['release', 'view', RELEASE, '-R', repo()]);
  } catch {
    await gh(['release', 'create', RELEASE, '-R', repo(), '--prerelease', '--latest=false', '--target', 'main', '--title', 'Pack state',
      '--notes', 'Last good output of each country, kept by the weekly place-pack build. Not a release of the app.']);
  }
}

type Asset = { id: number; name: string };
const leftovers = (assets: Asset[], cc: string): Asset[] =>
  assets.filter((a) => a.name.startsWith(`${nameOf(cc)}.new-`)).sort((a, b) => b.id - a.id);
const rename = (gh: GhRunner, a: Asset, to: string): Promise<string> =>
  gh(['api', '-X', 'PATCH', `repos/${repo()}/releases/assets/${a.id}`, '-f', `name=${to}`]);

/** The local path of the country's last good file, or null when there is none. A leftover copy from a crashed run counts. */
export async function downloadLastGood(cc: string, dir: string, gh: GhRunner = realGh): Promise<string | null> {
  const assets = await listAssets(gh);
  const name = assets.find((a) => a.name === nameOf(cc))?.name ?? leftovers(assets, cc)[0]?.name;
  if (!name) return null;
  mkdirSync(dir, { recursive: true });
  await gh(['release', 'download', RELEASE, '-R', repo(), '-p', name, '-D', dir, '--clobber']);
  return path.join(dir, name);
}

/**
 * Upload under a fresh name, delete the old copy, rename the new one. A crash in between leaves a copy under
 * one name or the other, and the next call puts a leftover back first, so the last good output is never overwritten.
 */
export async function replaceLastGood(cc: string, file: string, gh: GhRunner = realGh): Promise<void> {
  await ensureRelease(gh);
  const name = nameOf(cc);
  let assets = await listAssets(gh);
  const left = leftovers(assets, cc);
  if (!assets.some((a) => a.name === name) && left[0]) {
    await rename(gh, left[0], name);
    assets = await listAssets(gh);
  }
  const fresh = `${name}.new-${process.env['GITHUB_RUN_ID'] ?? Date.now()}`;
  const staged = path.join(mkdtempSync(path.join(tmpdir(), 'pack-state-')), fresh);
  copyFileSync(file, staged);
  await gh(['release', 'upload', RELEASE, staged, '-R', repo(), '--clobber']);
  assets = await listAssets(gh);
  const uploaded = assets.find((a) => a.name === fresh);
  if (!uploaded) throw new Error(`the uploaded copy of ${cc} is not on the release`);
  if (assets.some((a) => a.name === name)) await gh(['release', 'delete-asset', RELEASE, name, '-R', repo(), '--yes']);
  await rename(gh, uploaded, name);
  for (const old of leftovers(assets, cc)) if (old.id !== uploaded.id) await gh(['release', 'delete-asset', RELEASE, old.name, '-R', repo(), '--yes']);
}
