// The rule check (spec section 12.1). Every rule has an ID in docs/rules.md; every ID in force has a test
// whose title starts with [ID]. Usage: node tools/rules.mjs | show <PREFIX> | --final
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.RULES_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const ID = '[A-Z]{1,5}(?:-[A-Z0-9]+)+';

function files(dir, keep) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p, keep));
    else if (keep(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p).split(sep).join('/');

// Defined IDs: lines ending in [ID], in the register and in any split spec.
const defined = new Map(); // id -> { line, file }
const problems = [];
const registers = [join(ROOT, 'docs', 'rules.md'), ...files(join(ROOT, 'docs', 'spec'), (n) => n.endsWith('.md'))];
for (const file of registers.filter(existsSync)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = new RegExp(`\\[(${ID})\\]\\s*$`).exec(line);
    if (!m) continue;
    const id = m[1];
    if (defined.has(id)) problems.push(`${id} is defined twice (${defined.get(id).file} and ${rel(file)})`);
    else defined.set(id, { line: line.replace(/^[-*\s]+/, '').replace(/\s*\[[^\]]*\]\s*$/, ''), file: rel(file) });
  }
}
if (defined.size === 0) problems.push('no rules are defined: docs/rules.md has no line ending in [ID]');

// Named IDs: a string literal in a test file that starts with [ID].
const named = new Map(); // id -> Set of files
const titleRe = new RegExp(`['"\`]\\[(${ID})\\]`, 'g');
for (const file of files(join(ROOT, 'tests'), (n) => /\.(ts|tsx|mjs|cjs)$/.test(n))) {
  for (const m of readFileSync(file, 'utf8').matchAll(titleRe)) {
    if (!named.has(m[1])) named.set(m[1], new Set());
    named.get(m[1]).add(rel(file));
  }
}

// In-force file.
const force = new Map(); // id -> 'now' | 'later' | 'manual'
const forceFile = join(ROOT, 'tests', 'rules-in-force.txt');
if (existsSync(forceFile)) {
  for (const raw of readFileSync(forceFile, 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    let m;
    let state = 'now';
    let id = line;
    if ((m = /^later:\s*(\S+)$/.exec(line))) { state = 'later'; id = m[1]; }
    else if ((m = /^(\S+)\s*\(manual\)$/.exec(line))) { state = 'manual'; id = m[1]; }
    if (!new RegExp(`^${ID}$`).test(id)) { problems.push(`rules-in-force.txt: cannot read the line "${line}"`); continue; }
    if (force.has(id)) problems.push(`${id} is listed twice in rules-in-force.txt`);
    force.set(id, state);
  }
}

const args = process.argv.slice(2);

if (args[0] === 'show') {
  const prefix = args[1] ?? '';
  const ids = [...defined.keys()].filter((id) => id === prefix || id.startsWith(`${prefix}-`)).sort();
  if (!prefix || ids.length === 0) {
    console.error(`No rules with the prefix "${prefix}".`);
    process.exit(1);
  }
  for (const id of ids) {
    const state = force.get(id) === 'later' ? 'later' : force.has(id) ? 'in force' : 'not listed';
    console.log(`${id} [${state}] ${defined.get(id).line}`);
    for (const f of [...(named.get(id) ?? [])].sort()) console.log(`    test: ${f}`);
  }
  process.exit(0);
}

const inForce = [...force].filter(([, s]) => s === 'now').map(([id]) => id);
const later = [...force].filter(([, s]) => s === 'later').map(([id]) => id);
const manual = [...force].filter(([, s]) => s === 'manual').map(([id]) => id);

for (const id of force.keys()) if (!defined.has(id)) problems.push(`${id} is listed in rules-in-force.txt but defined nowhere`);
for (const id of inForce) if (defined.has(id) && !named.has(id)) problems.push(`${id} is in force but no test title starts with [${id}]`);
for (const id of named.keys()) if (!defined.has(id)) problems.push(`a test names ${id}, which is defined nowhere (${[...named.get(id)].join(', ')})`);
if (args.includes('--final')) for (const id of later) problems.push(`${id} is still "later:" at the final check`);

console.log(`in force ${inForce.length}, later ${later.length}`);
if (manual.length > 0) {
  console.log('release checklist (checked by hand, no test):');
  for (const id of manual) console.log(`  ${id}  ${defined.get(id)?.line ?? ''}`);
}
for (const id of later) if (named.has(id)) console.log(`note: ${id} has a test but is still "later:"; remove the mark`);
if (problems.length > 0) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
