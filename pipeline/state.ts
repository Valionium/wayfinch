// The last good output of each country lives as a file on the GitHub release `pack-state`.
// Replacing it never leaves a gap: upload as <name>.new, delete the old, rename the new.
import { execFile } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export type GhRunner = (args: string[]) => Promise<string>;
const run = promisify(execFile);
const RELEASE = 'pack-state';
const repo = (): string => process.env['GITHUB_REPOSITORY'] ?? 'Valionium/wayfinch';

export const realGh: GhRunner = async (args) => (await run('gh', args, { maxBuffer: 16 * 1024 * 1024 })).stdout;

const nameOf = (cc: string): string => `country-${cc}-last-good`;

async function listAssets(gh: GhRunner): Promise<{ id: number; name: string }[]> {
  let text: string;
  try {
    text = await gh(['api', `repos/${repo()}/releases/tags/${RELEASE}`, '--jq', '.assets[] | "\\(.id) \\(.name)"']);
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

/** The local path of the country's last good file, or null when there is none. A `.new` copy counts. */
export async function downloadLastGood(cc: string, dir: string, gh: GhRunner = realGh): Promise<string | null> {
  const assets = await listAssets(gh);
  const name = [nameOf(cc), `${nameOf(cc)}.new`].find((n) => assets.some((a) => a.name === n));
  if (!name) return null;
  mkdirSync(dir, { recursive: true });
  await gh(['release', 'download', RELEASE, '-R', repo(), '-p', name, '-D', dir, '--clobber']);
  return path.join(dir, name);
}

export async function replaceLastGood(cc: string, file: string, gh: GhRunner = realGh): Promise<void> {
  await ensureRelease(gh);
  const name = nameOf(cc);
  const staging = mkdtempSync(path.join(tmpdir(), 'pack-state-'));
  const staged = path.join(staging, `${name}.new`);
  copyFileSync(file, staged);
  await gh(['release', 'upload', RELEASE, staged, '-R', repo(), '--clobber']);
  const before = await listAssets(gh);
  if (before.some((a) => a.name === name)) await gh(['release', 'delete-asset', RELEASE, name, '-R', repo(), '--yes']);
  const fresh = (await listAssets(gh)).find((a) => a.name === `${name}.new`);
  if (!fresh) throw new Error(`the uploaded copy of ${cc} is not on the release`);
  await gh(['api', '-X', 'PATCH', `repos/${repo()}/releases/assets/${fresh.id}`, '-f', `name=${name}`]);
}
