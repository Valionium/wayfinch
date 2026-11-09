// @vitest-environment jsdom
// Tools' Gear advisor card (sub-project 13, group 3, Task 9): a way into the advisor, which runs inside the bag planner page. The card is
// in Tools' own lazy chunk (tools.tsx), and its words are in en-advisor.ts, so the first screen carries neither. Files are read from the
// repository root, where Vitest runs.
import { readFileSync } from 'node:fs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { GA } from '../../../src/core/wording/en-advisor.ts';
import { W } from '../../../src/core/wording/en.ts';
import { readHost } from '../../../src/tools/tyre/host.ts';
import type { KeyValueStore } from '../../../src/tools/tyre/storage.ts';
import type { TyreServices } from '../../../src/tools/tyre/ui.tsx';
import { go } from '../../../src/ui/nav.ts';
import { ToolsFirst } from '../../../src/ui/tools/bag-card.tsx';
import { ToolsScreen } from '../../../src/ui/tools/tools.tsx';

const host = document.createElement('div');
document.body.append(host);
afterEach(() => { render(null, host); });
beforeEach(() => { go('tools'); });
const kv: KeyValueStore = { getItem: () => null, setItem: () => {} };
const services: TyreServices = { host: () => readHost(kv, () => null), storage: kv, now: () => new Date('2026-11-07T10:00:00Z') };
const card = () => [...host.querySelectorAll('section, article, div')].find((el) => el.querySelector('h2, h3')?.textContent === GA.advisorCardTitle);

test('[GA-TOOLS-CARD] Tools shows a Gear advisor card linking /tools/bags/#gear-advisor&back=tools, with a line on what it does', async () => {
  await act(() => { render(<ToolsScreen services={services} />, host); });
  const c = card();
  expect(c, 'a card headed Gear advisor').toBeTruthy();
  expect(GA.advisorCardTitle).toBe('Gear advisor');
  expect(c!.textContent).toContain(GA.advisorCardLine);
  const link = c!.querySelector('a') as HTMLAnchorElement;
  expect(link.getAttribute('href')).toBe('/tools/bags/#gear-advisor&back=tools');
  expect(link.textContent).toBe(`${W.tyreCardOpen} ${GA.advisorCardTitle}`);
});

test('[GA-TOOLS-CARD] the card is in Tools\' lazy chunk only: the first screen\'s part of Tools shows no such card, and en.ts holds none of its words', async () => {
  await act(() => { render(<ToolsFirst services={services} />, host); });
  expect(card()).toBeUndefined();
  const en = readFileSync('src/core/wording/en.ts', 'utf8');
  for (const w of [GA.advisorCardTitle, GA.advisorCardLine]) expect(en.includes(w), w).toBe(false);
  const first = readFileSync('src/ui/tools/bag-card.tsx', 'utf8');
  expect(first.includes('en-advisor')).toBe(false);
});
