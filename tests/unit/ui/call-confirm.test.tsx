// @vitest-environment jsdom
// No phone number is dialled by the first tap (owner's iPhone check, 6 November 2026): the home-screen app on an iPhone opens a tel:
// link with no question of its own, and the owner reached the police by accident. Every call button first asks, in its own place.
// The browser path, online and offline, is in tests/e2e/app-ahead.spec.ts.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { W } from '../../../src/core/wording/en.ts';
import type { AheadTrip } from '../../../src/ui/ahead/actions.ts';
import { EmergencyPanel } from '../../../src/ui/ahead/emergency.tsx';
import { rainyStop } from './ahead-fixture.ts';
import { buttonNamed, click, expandAll, fakeActions, host, show, viewOf } from './ahead-helpers.tsx';

afterEach(() => { render(null, host); });

const trip = (v: ReturnType<typeof viewOf>): AheadTrip => { if (v.kind !== 'trip') throw new Error(v.kind); return v; };
const telLinks = (root: ParentNode = host): HTMLAnchorElement[] => [...root.querySelectorAll<HTMLAnchorElement>('a[href]')].filter((a) => /^\s*tel:/i.test(a.getAttribute('href') ?? ''));
const ask = (root: ParentNode = host): HTMLElement | null => root.querySelector<HTMLElement>('[data-call-ask]');
const CHIPS = ['Bike shop', 'Pharmacy', 'Bail out by train', 'Toilets', 'Shelter', 'Emergency'];

describe('no number on the first tap', () => {
  test('[AH-CALL-CONFIRM] on Ahead with every card, every chip and Emergency open, and with no route, no tel: link is on the page until a call button is tapped', async () => {
    const v = trip(viewOf(rainyStop()));
    await show(v, fakeActions().actions);
    await expandAll();
    expect(host.querySelectorAll('[data-call]').length).toBeGreaterThan(0);
    for (const chip of CHIPS) {
      await click(buttonNamed(chip, host.querySelector('.ah-chips')!));
      await expandAll();
      expect(telLinks(), chip).toEqual([]);
    }
    await show({ kind: 'no-route', canShare: false, emergency: v.screen.chips.emergency }, fakeActions().actions);
    await click(buttonNamed('Emergency', host.querySelector('.ah-chips')!));
    expect(host.querySelectorAll('[data-call]').length).toBeGreaterThan(0);
    expect(telLinks()).toEqual([]);
  });

  test('[AH-CALL-CONFIRM] in the code: only the confirmation writes a tel: link, and no page either app serves holds one or lets the phone make one of a number', () => {
    const files = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && /\.(tsx?|html)$/.test(e.name)).map((e) => join(e.parentPath, e.name));
    const writers = files('src/ui').filter((f) => /tel:|kind === 'tel'/.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/\\/g, '/'));
    expect(writers).toEqual(['src/ui/call.tsx']);
    // The pages: Wayfinch's shell, the bag planner (only counted, never printed), and the legal pages.
    const pages = ['index.html', 'public/tools/bags/index.html', ...files('public/legal').filter((f) => f.endsWith('.html'))];
    for (const p of pages) {
      const html = readFileSync(p, 'utf8');
      expect(/tel:/i.test(html), p).toBe(false);
      // a number in the text never becomes a link on an iPhone (Safari's phone-number detection)
      expect(/<meta name="format-detection" content="telephone=no">/.test(html), p).toBe(true);
    }
  });
});

describe('the confirmation', () => {
  test('[AH-CALL-CONFIRM] Call 112 asks first: the number and who it is, "Call 112 now" is the exact tel:112, and Cancel does nothing', async () => {
    const v = trip(viewOf(rainyStop()));
    const { actions, calls } = fakeActions();
    await show(v, actions);
    await click(buttonNamed('Emergency', host.querySelector('.ah-chips')!));
    const card = host.querySelector('#chip-emergency')!;
    const before = card.innerHTML;
    const opener = buttonNamed(W.emergencyCall, card);
    await click(opener);
    const box = ask(card)!;
    expect(box.getAttribute('role')).toBe('alertdialog');
    expect(box.textContent).toContain(W.callAsk('112'));
    expect(box.textContent).toContain(W.emergencyGeneralName);
    const now = telLinks(card);
    expect(now).toHaveLength(1);
    expect(now[0]!.getAttribute('href')).toBe('tel:112');
    expect(now[0]!.textContent).toBe(W.callNow('112'));
    expect(now[0]!.hasAttribute('target')).toBe(false);
    expect(document.activeElement).toBe(box.querySelector('[tabindex="-1"]'));   // a screen reader reads the question first
    await click(buttonNamed(W.callCancel, box));
    expect(ask(card)).toBeNull();
    expect(telLinks(card)).toEqual([]);
    expect(card.innerHTML).toBe(before);
    expect(document.activeElement?.textContent).toBe(W.emergencyCall);   // back on the button that was tapped
    expect(calls).toEqual([]);
  });

  test('[AH-CALL-CONFIRM] Escape is a Cancel, and a tap beside the question leaves it open', async () => {
    const v = trip(viewOf(rainyStop()));
    await show(v, fakeActions().actions);
    await click(buttonNamed('Emergency', host.querySelector('.ah-chips')!));
    const card = host.querySelector('#chip-emergency')!;
    await click(buttonNamed(W.emergencyCall, card));
    await click(card.querySelector('.ah-emergency-fallback'));
    expect(ask(card)).not.toBeNull();
    await act(async () => { ask(card)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(ask(card)).toBeNull();
    expect(telLinks(card)).toEqual([]);
  });

  test('[AH-CALL-CONFIRM] a mountain rescue number asks with its own name; the number is dialled as written', async () => {
    const e = trip(viewOf(rainyStop())).screen.chips.emergency;
    const card = { ...e, numbers: [...e.numbers, '140'], items: [...e.items, { label: '140', stamp: null, status: 'action' as const, detail: 'Mountain rescue (Bergrettung)' }] };
    await act(async () => { render(<EmergencyPanel card={card} canShare={false} actions={fakeActions().actions} />, host); });
    await click(buttonNamed('140', host));
    const box = ask()!;
    expect(box.textContent).toContain(W.callAsk('140'));
    expect(box.textContent).toContain('Mountain rescue (Bergrettung)');
    expect(telLinks().map((a) => a.getAttribute('href'))).toEqual(['tel:140']);
  });

  test('[AH-CALL-CONFIRM] a place\'s Call asks with the place\'s name; Call now is the place\'s exact tel:', async () => {
    const v = trip(viewOf(rainyStop()));
    await show(v, fakeActions().actions);
    await click(host.querySelector('[data-card="sleep"] .ah-toggle'));
    const sleep = host.querySelector('[data-card="sleep"]')!;
    await click(buttonNamed('Call +49 7221 123456', sleep));
    const box = ask(sleep)!;
    expect(box.textContent).toContain(W.callAsk('+497221123456'));
    expect(box.textContent).toMatch(/Camping Rheinaue/);
    expect(telLinks(sleep).map((a) => a.getAttribute('href'))).toEqual(['tel:+497221123456']);
    await click(buttonNamed(W.callCancel, box));
    expect(telLinks(sleep)).toEqual([]);
  });
});
