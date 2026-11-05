// One theme for both apps (owner's try-out, 5 November 2026: "I changed to light mode [in the bag planner] ... went back to Wayfinch ...
// it was still the dark mode"). Each app writes only its own storage (spec section 7.1, ownership rule 1): Wayfinch copilot:theme:v1,
// the bag planner loadcheck:theme:v1, each {app, kind: 'theme', v: 1, theme, at}. Both read both and show the same one: the most
// recent change. The page is never printed: only what its functions return is compared.
import { createRequire } from 'node:module';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { themeFrom } from '../../../src/ui/theme-apply.ts';

const require = createRequire(import.meta.url);
const { appVM, sharedStore } = require('../../../qa/app-vm.cjs') as {
  appVM: (o?: object) => { run: (code: string) => unknown; localStorage: Storage; values: Map<string, string> };
  sharedStore: () => object;
};

type Key = 'copilot:settings' | 'copilot:theme:v1' | 'loadcheck:theme:v1' | 'loadcheck:theme';
const mine = (theme: unknown, at: unknown) => JSON.stringify({ app: 'copilot', kind: 'theme', v: 1, theme, at });
const theirs = (theme: unknown, at: unknown) => JSON.stringify({ app: 'load-check', kind: 'theme', v: 1, theme, at });
const from = (stored: Partial<Record<Key, string>>) => themeFrom((k) => stored[k as Key] ?? null);
/** What the bag planner's own page decides from the same storage. */
function pageDecides(stored: Partial<Record<string, string>>): unknown {
  const page = appVM({ storage: sharedStore() });
  for (const [k, v] of Object.entries(stored)) if (v !== undefined) page.localStorage.setItem(k, v);
  return page.run('themeChoiceNow()');
}

describe('the one theme, decided the same way by both apps', () => {
  test('[THEME-ONE] the most recent choice of either app wins; at the same moment, Wayfinch\'s; one choice alone stands', () => {
    const early = '2026-11-05T10:00:00.000Z';
    const late = '2026-11-05T11:00:00.000Z';
    expect(from({ 'copilot:theme:v1': mine('dark', early), 'loadcheck:theme:v1': theirs('light', late) })).toBe('light');
    expect(from({ 'copilot:theme:v1': mine('auto', late), 'loadcheck:theme:v1': theirs('light', early) })).toBe('auto');
    expect(from({ 'copilot:theme:v1': mine('dark', late), 'loadcheck:theme:v1': theirs('light', late) })).toBe('dark');
    expect(from({ 'loadcheck:theme:v1': theirs('light', early), 'copilot:settings': JSON.stringify({ theme: 'dark' }) })).toBe('light');
    expect(from({ 'copilot:theme:v1': mine('light', early), 'loadcheck:theme': '"dark"' })).toBe('light');
  });

  test('[THEME-ONE] a rider with two older choices and no new one: Wayfinch\'s own light or dark, else the bag planner\'s, else automatic', () => {
    expect(from({ 'copilot:settings': JSON.stringify({ theme: 'light' }), 'loadcheck:theme': '"dark"' })).toBe('light');
    expect(from({ 'copilot:settings': JSON.stringify({ theme: 'auto' }), 'loadcheck:theme': '"dark"' })).toBe('dark');
    expect(from({ 'loadcheck:theme': '"light"' })).toBe('light');
    expect(from({})).toBe('auto');
    // anything unreadable counts as not there
    expect(from({ 'copilot:theme:v1': mine('purple', early()), 'loadcheck:theme:v1': theirs('light', 'yesterday'), 'loadcheck:theme': '{' })).toBe('auto');
    expect(from({ 'copilot:theme:v1': JSON.stringify({ app: 'load-check', kind: 'theme', v: 1, theme: 'dark', at: early() }) })).toBe('auto');
    expect(from({ 'copilot:theme:v1': JSON.stringify({ app: 'copilot', kind: 'theme', v: 2, theme: 'dark', at: early() }) })).toBe('auto');
  });

  test('[THEME-ONE] the bag planner\'s page and Wayfinch decide alike, on every mix of the four records', () => {
    const at = fc.constantFrom('2026-11-05T10:00:00.000Z', '2026-11-05T11:00:00.000Z', 'never', 7);
    const theme = fc.constantFrom('auto', 'light', 'dark', 'blue', null);
    const record = fc.record({
      'copilot:settings': fc.option(theme.map((t) => JSON.stringify({ updatedAt: '2026-11-05T09:00:00.000Z', theme: t, units: 'metric' })), { nil: undefined }),
      'copilot:theme:v1': fc.option(fc.tuple(theme, at).map(([t, a]) => mine(t, a)), { nil: undefined }),
      'loadcheck:theme:v1': fc.option(fc.tuple(theme, at).map(([t, a]) => theirs(t, a)), { nil: undefined }),
      'loadcheck:theme': fc.option(theme.map((t) => JSON.stringify(t)), { nil: undefined }),
    });
    fc.assert(fc.property(record, (stored) => {
      const clean = Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== undefined)) as Record<string, string>;
      expect(pageDecides(clean)).toBe(from(clean));
    }), { numRuns: 120, seed: 5112026 });
  }, 60_000);
});

function early(): string { return '2026-11-05T10:00:00.000Z'; }
