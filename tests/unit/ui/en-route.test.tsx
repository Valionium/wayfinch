// @vitest-environment jsdom
// After the launch, part 4a (the owner's preview check of 8 Nov 2026): the tab is called En route (item M), it explains itself with no
// route (item M), an Emergency link at its top opens Emergency at the bottom (item B), and with no position it shows its answers from
// the route start with the bike drawn as not confirmed (item K).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import * as wording from '../../../src/core/wording/en.ts';
import { W } from '../../../src/core/wording/en.ts';
import { App } from '../../../src/ui/app.tsx';
import { AheadScreen } from '../../../src/ui/ahead/ahead.tsx';
import type { AheadTrip, AheadView } from '../../../src/ui/ahead/actions.ts';
import { go, SCREEN_NAMES } from '../../../src/ui/nav.ts';
import { bannedHits } from '../../fixtures/banned.ts';
import { FRI, rainyStop, SAT } from './ahead-fixture.ts';
import { buttonNamed, click, fakeActions, host, show, viewOf } from './ahead-helpers.tsx';

afterEach(() => { render(null, host); });

const trip = (v: ReturnType<typeof viewOf>): AheadTrip => { if (v.kind !== 'trip') throw new Error(v.kind); return v; };
const text = (): string => host.textContent ?? '';
const NAME = /\bAhead\b/;

/** Every user string a wording module holds: its strings, and each template's own source (its words are in it). */
function wordsOf(value: unknown, at: string, out: { at: string; text: string }[]): void {
  if (typeof value === 'string') out.push({ at, text: value });
  else if (typeof value === 'function') out.push({ at, text: value.toString() });
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) wordsOf(v, `${at}.${k}`, out);
}

describe('the tab is called En route (owner, 8 Nov 2026, item M)', () => {
  test('[AH-NAME] no word riders see calls it Ahead: every wording module and the legal pages say En route', async () => {
    const dir = join(process.cwd(), 'src/core/wording');
    const found: { at: string; text: string }[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const mod = (await import(/* @vite-ignore */ `../../../src/core/wording/${file}`)) as Record<string, unknown>;
      for (const [name, value] of Object.entries(mod)) wordsOf(value, `${file}:${name}`, found);
    }
    expect(found.length).toBeGreaterThan(500);
    const hits = found.filter((w) => NAME.test(w.text)).map((w) => w.at);
    expect(hits).toEqual([]);
    for (const page of ['imprint', 'privacy', 'licences']) {
      const html = readFileSync(join(process.cwd(), 'public/legal', page, 'index.html'), 'utf8');
      expect(NAME.test(html.replace(/<[^>]+>/g, ' ')), page).toBe(false);
    }
    expect(wording.W.appTabAhead).toBe('En route');
    expect(W.appTripOpenAhead).toBe('Open En route');
    for (const w of [W.appTabAhead, W.appTripOpenAhead, W.appAheadNeedTitle, W.appAheadNeedUntil, W.appTripNextGetReady]) expect(bannedHits(w)).toEqual([]);
  });

  test('[AH-NAME] the tab and the heading say En route, while its address stays #/ahead', async () => {
    expect(SCREEN_NAMES).toContain('ahead');
    go('ahead');
    await act(async () => { render(<App />, host); });
    const tabs = [...host.querySelectorAll('nav.tabs a')];
    const tab = tabs.find((a) => a.getAttribute('href') === '#/ahead')!;
    expect(tab.textContent).toBe('En route');
    expect(host.querySelector('h1')!.textContent).toBe('En route');
    expect(location.hash).toBe('#/ahead');
    await act(async () => { render(null, host); });
    go('trip');
  });
});

describe('with no route, En route explains itself (item M)', () => {
  const noRoute = (): AheadView => ({ kind: 'no-route', canShare: false, emergency: trip(viewOf(rainyStop())).screen.chips.emergency });

  test('[AH-EMPTY] two or three lines say what it will show, offline, with "Add a route in Trip"; Emergency stays', async () => {
    await show(noRoute(), fakeActions().actions);
    const empty = host.querySelector<HTMLElement>('[data-ahead-empty]')!;
    expect(empty).not.toBeNull();
    expect(empty.textContent).toContain(W.appAheadEmptyBody);
    for (const word of ['water', 'food', 'sleep', 'weather', 'daylight', 'offline']) expect(W.appAheadEmptyBody.toLowerCase()).toContain(word);
    expect(W.appAheadEmptyBody.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(3);
    expect(bannedHits(W.appAheadEmptyBody)).toEqual([]);
    const add = [...empty.querySelectorAll('a')].find((a) => a.textContent === 'Add a route in Trip')!;
    expect(add.getAttribute('href')).toBe('#/trip');
    expect(W.appAheadToTrip).toBe('Add a route in Trip');
    expect(buttonNamed(W.appAheadChipEmergency)).toBeDefined();
  });

  test('[AH-EMPTY] a trip that cannot be read gets no empty state: it says so, with Try again', async () => {
    await show({ ...noRoute(), kind: 'unreadable' } as AheadView, fakeActions().actions);
    expect(host.querySelector('[data-ahead-empty]')).toBeNull();
    expect(text()).toContain(W.appAheadUnreadable);
  });
});

describe('an Emergency link at the top (item B)', () => {
  test('[AH-EMERGENCY-TOP] at the top of En route, before the position line; a tap opens Emergency at the bottom and brings it into view', async () => {
    const v = trip(viewOf(rainyStop()));
    await show(v, fakeActions().actions);
    const top = host.querySelector<HTMLButtonElement>('[data-emergency-top]')!;
    expect(top).not.toBeNull();
    expect(top.textContent).toContain(W.appAheadChipEmergency);
    expect(top.getAttribute('aria-controls')).toBe('chip-emergency');
    // It comes first: before the position line and the strip.
    expect(top.compareDocumentPosition(host.querySelector('[data-position-line]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelector('#chip-emergency')).toBeNull();
    let scrolled: Element | null = null;
    const was = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function scrolledTo(this: HTMLElement) { scrolled = document.getElementById(this.id) ?? this.parentElement; };
    try {
      // The render first, then the jump's scroll, as in a browser (Preact renders before a timer runs).
      await act(async () => { top.click(); });
      await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    } finally { HTMLElement.prototype.scrollIntoView = was; }
    const panel = host.querySelector('#chip-emergency')!;
    expect(panel).not.toBeNull();
    expect(panel.closest('.ah-below')).not.toBeNull();
    expect(scrolled).toBe(panel);
    expect(panel.textContent).toContain(W.emergencyCall);
    // The chip at the bottom shows it open; a second tap on the link keeps it open (it is a jump, not a toggle).
    expect(buttonNamed(W.appAheadChipEmergency, host.querySelector('.ah-chips')!).getAttribute('aria-expanded')).toBe('true');
    await click(top);
    expect(host.querySelector('#chip-emergency')).not.toBeNull();
    // The address stays En route's: the jump changes no screen.
    expect(location.hash === '' || location.hash === '#/ahead' || location.hash.startsWith('#/')).toBe(true);
  });

  test('[AH-EMERGENCY-TOP] it is there before Get ready offline too, above the card that asks for it', async () => {
    const v = trip(viewOf(rainyStop({ now: `${FRI} 07:30`, positions: [], spots: [], savedKm: [], forecast: null, roofs: [], rescuePoints: [] })));
    expect(v.beforeReady).toBe(true);
    await show(v, fakeActions().actions);
    const top = host.querySelector('[data-emergency-top]')!;
    expect(top.compareDocumentPosition(host.querySelector('[data-need-ready]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click(top);
    expect(host.querySelector('#chip-emergency')).not.toBeNull();
  });
});

describe('no position: everything from the route start, the bike not confirmed (item K)', () => {
  test('[AH-FROM-START] after Get ready, with no position before the trip or on the departure day, every answer shows from km 0 with no position choice needed', async () => {
    for (const now of ['2026-10-15 18:00', `${FRI} 07:30`, `${FRI} 11:35`]) {
      const v = trip(viewOf(rainyStop({ now, positions: [] })));
      expect(v.answers, now).toBe(true);
      expect(v.screen.ride.startKm, now).toBe(0);
      await show(v, fakeActions().actions);
      expect(host.querySelector('[data-ahead="answers"]'), now).not.toBeNull();
      expect(host.querySelectorAll('[data-card]'), now).toHaveLength(6);
      expect(host.querySelector('[data-strip]'), now).not.toBeNull();
      expect(host.querySelector('.ah-notes')!.textContent, now).toContain(W.routeNoPositionFromStart);
      // The picker does not open by itself: Update position and Set position by hand stay one tap away.
      expect(host.querySelector('#ah-picker'), now).toBeNull();
      expect(host.querySelector('[data-update-position]'), now).not.toBeNull();
      expect(text(), now).not.toContain(W.appAheadFirstUse);
    }
  });

  test('[AH-FROM-START] on a trip day after day 1 with no position the answers show too, from where the trip-day rules plan, their note naming it', async () => {
    const v = trip(viewOf(rainyStop({ now: `${SAT} 09:00`, positions: [] })));
    expect(v.answers).toBe(true);
    await show(v, fakeActions().actions);
    expect(host.querySelectorAll('[data-card]')).toHaveLength(6);
    expect(host.querySelector('[data-strip]')).not.toBeNull();
    expect(v.screen.notes.length).toBeGreaterThan(0);
    for (const n of v.screen.notes) expect(host.querySelector('.ah-notes')!.textContent).toContain(n);
    expect(host.querySelector('#ah-picker')).toBeNull();
  });

  test('[AH-BIKE-UNCONFIRMED] the strip\'s bike is drawn as not confirmed until a position is kept, and says so in words', async () => {
    const none = trip(viewOf(rainyStop({ now: `${FRI} 07:30`, positions: [] })));
    await show(none, fakeActions().actions);
    const marker = host.querySelector('[data-strip] .bike-marker')!;
    expect(marker.classList.contains('bike-marker-unconfirmed')).toBe(true);
    expect(host.querySelector('[data-strip]')!.textContent).toContain(W.appAheadBikeUnconfirmed);
    expect(bannedHits(W.appAheadBikeUnconfirmed)).toEqual([]);
    const kept = trip(viewOf(rainyStop()));
    await show(kept, fakeActions().actions);
    expect(host.querySelector('[data-strip] .bike-marker')!.classList.contains('bike-marker-unconfirmed')).toBe(false);
    expect(host.querySelector('[data-strip]')!.textContent).not.toContain(W.appAheadBikeUnconfirmed);
  });

  test('[AH-BIKE-UNCONFIRMED] the faded look is in the stylesheet, for both themes', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/ahead/ahead.css'), 'utf8');
    expect(css).toMatch(/\.bike-marker-unconfirmed\s*\{[^}]*opacity:\s*0?\.\d+/);
  });

  test('[AH-FROM-START] the page renders the shell\'s view as is', async () => {
    const v = trip(viewOf(rainyStop({ now: `${SAT} 09:00`, positions: [] })));
    await act(async () => { render(<AheadScreen view={v} actions={fakeActions().actions} />, host); });
    expect(host.querySelectorAll('[data-card]')).toHaveLength(6);
  });
});
