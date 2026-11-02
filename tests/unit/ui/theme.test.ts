import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const css = readFileSync(new URL('../../../src/ui/theme.css', import.meta.url), 'utf8');

// Spec section 3.6, the only colours the app may use.
const TOKENS = {
  dark: { ground: '#1B2018', panel: '#242B20', ink: '#EFEDE0', muted: '#A8B198', blaze: '#FF7950', sage: '#A8C07A', amber: '#E5B145', red: '#F08067', ice: '#8CC9D4', line: '#3E4A36' },
  light: { ground: '#F4F2E8', panel: '#FBFAF3', ink: '#22271D', muted: '#57604A', blaze: '#B43A08', sage: '#4C6828', amber: '#84590A', red: '#BC311A', ice: '#156E84', line: '#C7C4B1' },
} as const;
type Theme = keyof typeof TOKENS;

/** The custom properties declared by the rule whose selector contains `selector`, within `source`. */
function declared(source: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const at = source.indexOf(selector);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  const open = source.indexOf('{', at);
  const close = source.indexOf('}', open);
  for (const m of source.slice(open + 1, close).matchAll(/--([a-z]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) out[m[1]!] = m[2]!.toUpperCase();
  return out;
}

const luminance = (hex: string): number => {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test('[APP-TOKENS] every colour in theme.css is one of the section 3.6 tokens, in both themes', () => {
  const allowed = new Set([...Object.values(TOKENS.dark), ...Object.values(TOKENS.light)].map((c) => c.toUpperCase()));
  const used = [...css.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase());
  expect(used.length).toBeGreaterThan(0);
  for (const colour of used) expect(allowed.has(colour), colour).toBe(true);
  // no other colour syntax is in use outside var(--token)
  expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\(/);
  // the page itself says which token a colour is, never a literal
  const outsideTokens = css.replace(/--[a-z]+:\s*#[0-9A-Fa-f]{6};/g, '');
  expect(outsideTokens).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
});

test('[APP-TOKENS] :root and [data-theme] give both themes, the phone setting picks light, and each token has its value', () => {
  expect(declared(css, ':root {')).toEqual(TOKENS.dark);
  expect(declared(css, ":root[data-theme='dark']")).toEqual(TOKENS.dark);
  expect(declared(css, ":root[data-theme='light']")).toEqual(TOKENS.light);
  const media = css.slice(css.indexOf('@media (prefers-color-scheme: light)'));
  expect(declared(media, ":root:not([data-theme='dark'])")).toEqual(TOKENS.light);
});

test('[APP-TOKENS] contrast is at least 4.5:1 for every text token on every ground, in both themes, and for the primary button', () => {
  for (const theme of Object.keys(TOKENS) as Theme[]) {
    const t = TOKENS[theme];
    for (const text of ['ink', 'muted', 'blaze', 'sage', 'amber', 'red', 'ice'] as const) {
      for (const ground of ['ground', 'panel'] as const) {
        expect(contrast(t[text], t[ground]), `${theme}: ${text} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(t.ground, t.blaze), `${theme}: button text on blaze`).toBeGreaterThanOrEqual(4.5);
  }
});
