// @vitest-environment jsdom
// Wide screens (plan Task 22): what can be checked without a browser.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { installDrop, zoneInput } from '../../../src/ui/wide/drop.ts';

const css = readFileSync(resolve('src/ui/wide/wide.css'), 'utf8');

/** The text with comments and every `@media (min-width: 600px or more) { ... }` block taken out. */
function withoutWideBlocks(source: string): string {
  let rest = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (;;) {
    const m = /@media\s*\(min-width:\s*(\d+)px\)\s*\{/.exec(rest);
    if (!m) return rest;
    let depth = 1;
    let i = m.index + m[0].length;
    while (depth > 0 && i < rest.length) {
      if (rest[i] === '{') depth += 1;
      else if (rest[i] === '}') depth -= 1;
      i += 1;
    }
    expect(Number(m[1]), 'a wide block starts at 600 px or more').toBeGreaterThanOrEqual(600);
    rest = rest.slice(0, m.index) + rest.slice(i);
  }
}

test('[WIDE-UNDER-600] every rule of the wide layout sits inside a query of 600 px or more, and uses no colour but the tokens', () => {
  expect(withoutWideBlocks(css).trim()).toBe('');
  expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
});

test('[WIDE-FIREFOX] desktop Firefox is a blocking project at 1280 x 720 and the browser job installs it', () => {
  const config = readFileSync(resolve('playwright.config.ts'), 'utf8');
  expect(config).toMatch(/name: 'app-wide-firefox'[^\n]*browserName: 'firefox'[^\n]*width: 1280, height: 720/);
  const workflow = readFileSync(resolve('.github/workflows/pull-request.yml'), 'utf8');
  expect(workflow).toMatch(/playwright install[^\n]*\bfirefox\b/);
});

function dragEvent(type: string, files: File[]): DragEvent {
  const e = new Event(type, { bubbles: true, cancelable: true }) as unknown as DragEvent;
  Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: 'none' } });
  return e;
}

// Review M4 of PR 45: #/you/legal is You, so a dropped export file goes to You's import there too.
test('[WIDE-DROP] [APP-SCREENS-FULL] on #/you/legal a dropped file goes to You\'s file input, as on #/you', () => {
  document.body.innerHTML = '<main class="screen" data-screen="you/legal"><input type="file" id="you"></main>';
  expect(zoneInput(document, 'you/legal')).toBe(document.getElementById('you'));
});

test('[WIDE-DROP] a file dropped on You goes to the screen\'s file input, on Trip to Trip itself, which opens the Route step with it, and on Ahead nowhere', () => {
  document.body.innerHTML = '<main class="screen" data-screen="you"><input type="file" id="you"></main><div class="trip" id="trip" data-trip-drop></div>';
  const you = document.getElementById('you') as HTMLInputElement;
  const trip = document.getElementById('trip') as HTMLElement;
  const got: string[] = [];
  vi.stubGlobal('DataTransfer', class { items = { add: (f: File) => { got.push(f.name); } }; files = []; });
  Object.defineProperty(you, 'files', { configurable: true, set: () => undefined });
  const change = vi.fn();
  you.addEventListener('change', change);
  // Trip takes the file as a filedrop event, which opens its Route step (review of PR 73, I3).
  trip.addEventListener('filedrop', (e) => { got.push((e as CustomEvent<File>).detail.name); change(); });
  let screen: 'you' | 'trip' | 'ahead' = 'you';
  expect(zoneInput(document, 'you')).toBe(you);
  expect(zoneInput(document, 'trip')).toBe(trip);
  expect(zoneInput(document, 'ahead')).toBeNull();
  const off = installDrop(window, document, () => screen);
  const file = new File(['{}'], 'wayfinch-export.json');
  for (screen of ['you', 'trip', 'ahead'] as const) {
    const e = dragEvent('drop', [file]);
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  }
  expect(got).toEqual(['wayfinch-export.json', 'wayfinch-export.json']);
  expect(change).toHaveBeenCalledTimes(2);
  off();
  const after = dragEvent('drop', [file]);
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
  vi.unstubAllGlobals();
});
