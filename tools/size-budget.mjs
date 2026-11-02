// Size measures of a built site (spec section 4.5). The budgets themselves are tests (plan, "Budgets as tests"); this is what they measure with.
// node tools/size-budget.mjs [dist]   prints the figures. Gzip level 9, so a figure doesn't depend on a build machine.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export const gzipBytes = (bytes) => gzipSync(bytes, { level: 9 }).length;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

/** The scripts the shell's HTML loads at once: `<script src>` and `modulepreload` links, then what those import statically. */
function firstScripts(dist) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const wanted = new Set();
  for (const m of html.matchAll(/<script[^>]*\ssrc="\/([^"]+\.js)"/g)) wanted.add(m[1]);
  for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="\/([^"]+\.js)"/g)) wanted.add(m[1]);
  // static imports between chunks: `import ... from "./x.js"` (a dynamic `import("./x.js")` is lazy and not followed)
  const queue = [...wanted];
  while (queue.length > 0) {
    const file = queue.pop();
    const source = readFileSync(join(dist, file), 'utf8');
    for (const m of source.matchAll(/(?:^|[;}\s])(?:import|export)\s*(?:[^'"();]*?\sfrom\s*)?["']\.\/([^"']+\.js)["']/g)) {
      const target = join(file, '..', m[1]).split(sep).join('/');
      if (!wanted.has(target)) {
        wanted.add(target);
        queue.push(target);
      }
    }
  }
  return [...wanted];
}

/** JavaScript before the first screen, and every other script, in gzipped bytes; the service worker is neither. */
export function measure(distDir) {
  const dist = resolve(distDir);
  const first = new Set(firstScripts(dist));
  let firstBytes = 0;
  let lazyBytes = 0;
  for (const file of walk(dist)) {
    if (!file.endsWith('.js') || file === 'offline-worker.js' || file.startsWith('tools/') || file.startsWith('vendor/')) continue;
    const size = gzipBytes(readFileSync(join(dist, file)));
    if (first.has(file)) firstBytes += size;
    else lazyBytes += size;
  }
  return { firstJsGzip: firstBytes, lazyJsGzip: lazyBytes, firstFiles: [...first].sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dist = process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url));
  const figures = measure(dist);
  console.log(`First-screen JavaScript: ${figures.firstJsGzip} bytes gzipped in ${figures.firstFiles.length} file(s).`);
  console.log(`Lazy JavaScript: ${figures.lazyJsGzip} bytes gzipped.`);
}
