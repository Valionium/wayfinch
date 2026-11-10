// Writes every kit drawing to its file (node tools/care-art/build.ts). With --check it writes nothing and exits 1 when a file differs
// from its drawing or a drawing's fact fails, naming each.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DRAWINGS } from './drawings.ts';

const CARE = fileURLToPath(new URL('../../src/tools/care/', import.meta.url));
const check = process.argv.includes('--check');
let bad = 0;
for (const d of DRAWINGS) {
  const pic = d.make();
  for (const f of pic.facts) if (!f.ok) { bad++; console.log(`${d.id}: fact fails: ${f.what} (${f.detail ?? ''})`); }
  const file = `${CARE}${d.dir}/${d.id}.svg`, svg = pic.svg();
  if (check) {
    let now = '';
    try { now = readFileSync(file, 'utf8'); } catch { /* missing */ }
    if (now !== svg) { bad++; console.log(`${d.id}: file differs from its drawing`); }
  } else {
    mkdirSync(`${CARE}${d.dir}`, { recursive: true });
    writeFileSync(file, svg);
  }
}
if (bad) process.exit(1);
console.log(check ? `${DRAWINGS.length} drawings match their files` : `${DRAWINGS.length} drawings written`);
