import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

const eslint = new ESLint();

async function ruleIds(code: string, filePath: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages.map((message) => message.ruleId);
}

const CORE = 'src/core/engines/x.ts';
const AHEAD = 'src/ui/cards/x.tsx';
const SHELL = 'src/ui/shell/x.tsx';

test('core may not import ui, data or store', async () => {
  for (const from of ['../../ui/a', '../../data/a', '../../store/a']) {
    const code = `import x from '${from}'; export default x;`;
    expect(await ruleIds(code, CORE)).toContain('no-restricted-imports');
  }
});

test('core has no clock or randomness', async () => {
  expect(await ruleIds('export const a = Date.now();', CORE)).toContain('no-restricted-properties');
  expect(await ruleIds('export const a = Math.random();', CORE)).toContain('no-restricted-properties');
  expect(await ruleIds('export const a = new Date();', CORE)).toContain('no-restricted-syntax');
  expect(await ruleIds('export const a = Date();', CORE)).toContain('no-restricted-syntax');
});

test('core may build a date from an argument', async () => {
  expect(await ruleIds('export const a = (t: number) => new Date(t);', CORE)).toEqual([]);
});

test('core does not read the device zone', async () => {
  const code = 'export const a = new Intl.DateTimeFormat().resolvedOptions();';
  expect(await ruleIds(code, CORE)).toContain('no-restricted-syntax');
});

test("Ahead's components import neither store nor data", async () => {
  for (const from of ['../../store/a', '../../data/a']) {
    const code = `import x from '${from}'; export default x;`;
    expect(await ruleIds(code, AHEAD)).toContain('no-restricted-imports');
  }
});

test("Ahead's components use no browser services", async () => {
  for (const code of ['fetch("/a");', 'localStorage.getItem("a");', 'indexedDB.open("a");']) {
    expect(await ruleIds(code, AHEAD)).toContain('no-restricted-globals');
  }
  for (const code of ['navigator.geolocation.getCurrentPosition();', 'navigator.share({});', 'navigator.clipboard.writeText("a");']) {
    expect(await ruleIds(code, AHEAD)).toContain('no-restricted-properties');
  }
});

test('the shell may use the browser', async () => {
  expect(await ruleIds('fetch("/a");', SHELL)).toEqual([]);
});

// Decision 6: only the hours wrapper (src/core/hours/spans.ts) imports the lazy opening_hours library.
test('engines, the screen and the one hours check may not import opening_hours', async () => {
  for (const file of ['src/core/engines/x.ts', 'src/core/screen/x.ts', 'src/core/hours/check.ts', 'src/core/hours/rules.ts']) {
    for (const from of ['opening_hours', 'opening_hours/build/opening_hours.js']) {
      const code = `import x from '${from}'; export default x;`;
      expect(await ruleIds(code, file), `${from} in ${file}`).toContain('no-restricted-imports');
    }
  }
});

test('engines and the screen still may not import ui, data or store', async () => {
  for (const file of ['src/core/engines/x.ts', 'src/core/screen/x.ts']) {
    const code = "import x from '../../ui/a'; export default x;";
    expect(await ruleIds(code, file), file).toContain('no-restricted-imports');
  }
});

test('the hours wrapper may import opening_hours', async () => {
  const code = "import x from 'opening_hours'; export default x;";
  expect(await ruleIds(code, 'src/core/hours/spans.ts')).toEqual([]);
});
