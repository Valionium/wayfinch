// @vitest-environment jsdom
// The one top bar "← Back to Wayfinch" (owner's list of 7 Nov 2026, items 8 and 9): away while the page scrolls down, back on any scroll up,
// at the top, at the end of the page and while it holds the focus; the tyre tool has it in place of its "Tools" box.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, test } from 'vitest';
import { TL } from '../../../src/core/wording/en-tools.ts';
import { readHost } from '../../../src/tools/tyre/host.ts';
import type { KeyValueStore } from '../../../src/tools/tyre/storage.ts';
import { TyreScreen } from '../../../src/tools/tyre/ui.tsx';
import { BAR_AWAY, watchBar } from '../../../src/ui/back-bar/back-bar.ts';
import type { BarWindow } from '../../../src/ui/back-bar/back-bar.ts';

const host = document.createElement('div');
document.body.append(host);
afterEach(() => { render(null, host); });

/** A page 3000 px tall in a 640 px window, scrolled by hand; the bar 48 px tall. */
function world() {
  const listeners: (() => void)[] = [];
  const root = document.createElement('html');
  Object.defineProperty(root, 'scrollHeight', { value: 3000 });
  const doc = { documentElement: root, activeElement: null as Element | null };
  const win = {
    scrollY: 0, innerHeight: 640, document: doc,
    addEventListener: (type: string, fn: () => void) => { if (type === 'scroll') listeners.push(fn); },
    removeEventListener: (type: string, fn: () => void) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
  };
  const bar = document.createElement('div');
  const link = document.createElement('a');
  link.href = '#/tools';
  bar.append(link);
  document.body.append(bar);
  Object.defineProperty(bar, 'offsetHeight', { value: 48 });
  const scroll = (y: number): void => { win.scrollY = y; for (const fn of [...listeners]) fn(); };
  const away = (): boolean => bar.classList.contains(BAR_AWAY);
  return { win: win as unknown as BarWindow, doc, root, bar, link, scroll, away, listeners };
}

test('[WF-BAR] away while the page scrolls down, back at once on any scroll up; never away near the top or at the end of the page', () => {
  const w = world();
  const stop = watchBar(w.bar, w.win);
  expect(w.root.style.getPropertyValue('--wf-bar-h')).toBe('48px');
  w.scroll(30);
  expect(w.away(), 'near the top, the bar is at its own place').toBe(false);
  w.scroll(400);
  expect(w.away(), 'scrolling down').toBe(true);
  w.scroll(900);
  expect(w.away()).toBe(true);
  w.scroll(890);
  expect(w.away(), 'any scroll up brings it back').toBe(false);
  w.scroll(1500);
  expect(w.away()).toBe(true);
  w.scroll(3000 - 640);
  expect(w.away(), 'at the end of the page, back: nothing more to read').toBe(false);
  w.scroll(20);
  expect(w.away()).toBe(false);
  stop();
  expect(w.listeners.length).toBe(0);
});

test('[WF-BAR] keyboard and screen readers: the bar is never taken out of the page, and it comes back while it holds the focus', () => {
  const w = world();
  watchBar(w.bar, w.win);
  w.scroll(400);
  w.scroll(800);
  expect(w.away()).toBe(true);
  // still there for assistive technology: not hidden, not inert, the link still focusable
  expect(w.bar.hidden || w.bar.getAttribute('aria-hidden') === 'true' || w.bar.hasAttribute('inert')).toBe(false);
  w.link.focus();
  w.bar.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  expect(w.away()).toBe(false);
  // scrolling down while it holds the focus keeps it there
  w.doc.activeElement = w.link;
  w.scroll(1200);
  expect(w.away()).toBe(false);
});

test('[WF-BAR] the tyre tool has the one top bar, "← Back to Wayfinch" to Tools, in place of its "Tools" box', async () => {
  const data = new Map<string, string>();
  const kv: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
  await act(() => { render(<TyreScreen services={{ host: () => readHost(kv, () => null), storage: kv, now: () => new Date('2026-11-08T10:00:00Z') }} />, host); });
  const bar = host.querySelector('.wf-bar.wf-bar-app');
  expect(bar).not.toBeNull();
  expect(host.querySelector('.tyre')!.firstElementChild).toBe(bar);
  const link = bar!.querySelector('a')!;
  expect(link.textContent).toBe(TL.toolsBack);
  expect(TL.toolsBack).toBe('← Back to Wayfinch');
  expect(link.getAttribute('href')).toBe('#/tools');
  expect([...host.querySelectorAll('a.btn')].some((a) => a.textContent === 'Tools')).toBe(false);
});
