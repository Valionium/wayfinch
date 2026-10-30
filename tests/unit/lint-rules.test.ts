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
