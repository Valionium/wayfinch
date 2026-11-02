import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

const TOOL = fileURLToPath(new URL('../../../tools/rules.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const made: string[] = [];

afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Files = Record<string, string>;

/** Builds a throwaway repository folder and returns its path. */
function folder(files: Files): string {
  const root = mkdtempSync(join(tmpdir(), 'rules-'));
  made.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

function run(root: string | null, ...args: string[]) {
  const env = { ...process.env };
  if (root) env.RULES_ROOT = root; else delete env.RULES_ROOT;
  const r = spawnSync(process.execPath, [TOOL, ...args], { env, encoding: 'utf8', cwd: root ?? REPO });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const REGISTER = '# Rules\n- one rule (§1) [A-ONE]\n- another rule (§2) [B-TWO]\n';
/** A test file whose title names an ID. Built here so that this file never has a quote right before an ID. */
const titled = (id: string, quote = "'"): string => `test(${quote}[${id}] it holds${quote}, () => {});\n`;
const TEST_A = titled('A-ONE');

test('passes when every ID in force has a test', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n',
    'tests/rules-in-force.txt': 'A-ONE\n',
    'tests/unit/a.test.ts': TEST_A,
  });
  const r = run(root);
  expect(r.code).toBe(0);
  expect(r.out).toContain('in force 1, later 0');
});

test('fails for an ID in force with no test', () => {
  const root = folder({
    'docs/rules.md': REGISTER,
    'tests/rules-in-force.txt': 'A-ONE\nB-TWO\n',
    'tests/unit/a.test.ts': TEST_A,
  });
  const r = run(root);
  expect(r.code).toBe(1);
  expect(r.out).toContain('B-TWO');
  expect(r.out).not.toMatch(/no test.*A-ONE/);
});

test('fails for a test naming an undefined ID', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n',
    'tests/rules-in-force.txt': 'A-ONE\n',
    'tests/unit/a.test.ts': `${TEST_A}${titled('Z-GHOST', '"')}`,
  });
  const r = run(root);
  expect(r.code).toBe(1);
  expect(r.out).toContain('Z-GHOST');
});

test('fails for an ID defined twice', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n- the same again (§1) [A-ONE]\n',
    'tests/rules-in-force.txt': 'A-ONE\n',
    'tests/unit/a.test.ts': TEST_A,
  });
  const r = run(root);
  expect(r.code).toBe(1);
  expect(r.out).toContain('A-ONE');
});

test('fails for an in-force ID that is not defined', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n',
    'tests/rules-in-force.txt': 'A-ONE\nQ-UNDEFINED\n',
    'tests/unit/a.test.ts': `${TEST_A}`,
  });
  const r = run(root);
  expect(r.code).toBe(1);
  expect(r.out).toContain('Q-UNDEFINED');
});

test('later: counts as listed, not in force', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n',
    'tests/rules-in-force.txt': 'later: A-ONE\n',
  });
  const r = run(root);
  expect(r.code).toBe(0);
  expect(r.out).toContain('in force 0, later 1');
});

test('--final fails while later: lines remain', () => {
  const root = folder({
    'docs/rules.md': REGISTER,
    'tests/rules-in-force.txt': 'A-ONE\nlater: B-TWO\n',
    'tests/unit/a.test.ts': TEST_A,
  });
  expect(run(root).code).toBe(0);
  const r = run(root, '--final');
  expect(r.code).toBe(1);
  expect(r.out).toContain('B-TWO');
});

test('--final passes when nothing is later', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n',
    'tests/rules-in-force.txt': 'A-ONE\n',
    'tests/unit/a.test.ts': TEST_A,
  });
  const r = run(root, '--final');
  expect(r.code).toBe(0);
  expect(r.out).toContain('in force 1, later 0');
});

test('fails when no rules are defined at all', () => {
  const root = folder({
    'docs/rules.md': '# Rules\nNothing here yet.\n',
    'tests/rules-in-force.txt': '',
  });
  const r = run(root);
  expect(r.code).toBe(1);
  expect(r.out).toMatch(/no rules/i);
});

test('also reads docs/spec/**/*.md when present', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n',
    'docs/spec/part/water.md': 'Some text.\n- a rule only the split spec defines (§6.3) [S-ONLY]\n',
    'tests/rules-in-force.txt': 'A-ONE\nS-ONLY\n',
    'tests/unit/a.test.ts': `${TEST_A}${titled('S-ONLY')}`,
  });
  const r = run(root);
  expect(r.code).toBe(0);
  expect(r.out).toContain('in force 2, later 0');
});

test('(manual) IDs need no test and print under "release checklist"', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n- a thing checked by hand (§9) [M-HAND]\n',
    'tests/rules-in-force.txt': 'A-ONE\nM-HAND (manual)\n',
    'tests/unit/a.test.ts': TEST_A,
  });
  const r = run(root);
  expect(r.code).toBe(0);
  expect(r.out).toMatch(/release checklist[\s\S]*M-HAND/);
  expect(r.out).toContain('in force 1, later 0');
});

test('comments and blank lines in the in-force file are ignored', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n',
    'tests/rules-in-force.txt': '# a comment\n\nA-ONE  # trailing words\n',
    'tests/unit/a.test.ts': TEST_A,
  });
  const r = run(root);
  expect(r.code).toBe(0);
  expect(r.out).toContain('in force 1, later 0');
});

test('a title in a backtick string and in .mjs files counts as a test', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n- another rule (§2) [B-TWO]\n',
    'tests/rules-in-force.txt': 'A-ONE\nB-TWO\n',
    'tests/unit/a.test.ts': titled('A-ONE', '`'),
    'tests/unit/b.test.mjs': titled('B-TWO'),
  });
  const r = run(root);
  expect(r.code).toBe(0);
  expect(r.out).toContain('in force 2, later 0');
});

test('a test file under node_modules does not count', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n',
    'tests/rules-in-force.txt': 'A-ONE\n',
    'tests/node_modules/x/a.test.ts': TEST_A,
  });
  const r = run(root);
  expect(r.code).toBe(1);
  expect(r.out).toContain('A-ONE');
});

test("show W prints that area's rules and the tests naming them", () => {
  const root = folder({
    'docs/rules.md': '- water rule one (§6.3) [W-ONE]\n- weather rule (§6.6) [WX-ONE]\n- water rule two (§6.3) [W-TWO]\n',
    'tests/rules-in-force.txt': 'W-ONE\nlater: W-TWO\nlater: WX-ONE\n',
    'tests/unit/w.test.ts': titled('W-ONE'),
  });
  const r = run(root, 'show', 'W');
  expect(r.code).toBe(0);
  expect(r.out).toContain('W-ONE');
  expect(r.out).toContain('water rule one');
  expect(r.out).toContain('tests/unit/w.test.ts');
  expect(r.out).toContain('W-TWO');
  expect(r.out).toMatch(/W-TWO[^\n]*later/);
  expect(r.out).not.toContain('WX-ONE');
});

test('show with an unknown prefix fails', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n',
    'tests/rules-in-force.txt': 'later: A-ONE\n',
  });
  const r = run(root, 'show', 'ZZ');
  expect(r.code).toBe(1);
});

test('the real repository passes', () => {
  const r = run(null);
  expect(r.out).toMatch(/in force (\d+), later (\d+)/);
  expect(r.code).toBe(0);
  const m = /in force (\d+), later (\d+)/.exec(r.out)!;
  // Sub-project 2's IDs are in force; the rest of the engines' IDs are listed.
  expect(Number(m[1])).toBeGreaterThanOrEqual(45);
});

test('counts an ID named in a Load Check QA suite (qa/*.cjs)', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n',
    'tests/rules-in-force.txt': 'A-ONE\n',
    'qa/suite.cjs': titled('A-ONE'),
  });
  const r = run(root);
  expect(r.code).toBe(0);
  expect(r.out).toContain('in force 1, later 0');
});

test('fails for a QA suite naming an undefined ID', () => {
  const root = folder({
    'docs/rules.md': '- one rule (§1) [A-ONE]\n',
    'tests/rules-in-force.txt': 'A-ONE\n',
    'tests/unit/a.test.ts': TEST_A,
    'qa/suite.cjs': titled('Z-GHOST'),
  });
  const r = run(root);
  expect(r.code).toBe(1);
  expect(r.out).toContain('Z-GHOST');
});
