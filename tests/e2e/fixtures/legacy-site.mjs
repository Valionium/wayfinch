// The site as it was live before the handover: the tagged page and today's worker, nothing else.
// CI fetches the tag explicitly, because a shallow checkout doesn't have it.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TAG = 'load-check-zip-2026-10-30';
const LIVE_PAGE_SHA256 = 'aa086001e8d18633b75385c1ec441776a9e6f3ff270e1f3a20b6f38a92ce1f3e';

let page;
function taggedPage() {
  if (page) return page;
  let bytes;
  try {
    // A raw blob, captured and never printed.
    bytes = execFileSync('git', ['cat-file', 'blob', `${TAG}:public/tools/bags/index.html`], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    throw new Error(`The tag ${TAG} is missing. Run: git fetch --depth=1 origin +refs/tags/${TAG}:refs/tags/${TAG}`);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== LIVE_PAGE_SHA256) throw new Error(`The page at ${TAG} isn't the live page.`);
  page = bytes;
  return page;
}

/** Writes the old site into `dir`, and returns `dir`. */
export function legacySite(dir) {
  const site = join(dir, 'legacy');
  mkdirSync(site, { recursive: true });
  writeFileSync(join(site, 'index.html'), taggedPage());
  copyFileSync(join(ROOT, 'qa', 'fixtures', 'legacy-offline-worker.js'), join(site, 'offline-worker.js'));
  return site;
}
