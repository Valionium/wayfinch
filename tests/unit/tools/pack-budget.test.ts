// PERF-PACK on every pull request (spec section 4.5): the Heidelberg → Strasbourg fixture's places stay within 3 MB. This proves
// nothing about the live pack: its size and its 30 s on the stand-in's network are PERF-PACK-LIVE, still `later:` (no test or
// workflow step exists), because a pull request must not depend on outside data.
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { gzipBytes } from '../../../tools/size-budget.mjs';

const DIR = new URL('../../fixtures/packs/heidelberg-strasbourg/', import.meta.url);

test('[PERF-PACK] the Heidelberg → Strasbourg fixture pack, manifest and every tile, is at most 3 MB (3,000,000 bytes) as sent and unpacked', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8')) as { tiles: { z: number; x: number; y: number }[] };
  expect(manifest.tiles.length).toBeGreaterThan(3);
  let raw = statSync(fileURLToPath(new URL('manifest.json', DIR))).size;
  let sent = gzipBytes(readFileSync(new URL('manifest.json', DIR)));
  for (const t of manifest.tiles) {
    const file = new URL(`t/${t.z}/${t.x}/${t.y}.json`, DIR);
    raw += statSync(fileURLToPath(file)).size;
    sent += gzipBytes(readFileSync(file));
  }
  console.log(`PERF-PACK fixture: ${raw} bytes, ${sent} gzipped, ${manifest.tiles.length} tiles`);
  expect(sent).toBeLessThanOrEqual(3_000_000);
  expect(raw).toBeLessThanOrEqual(3_000_000);
});
