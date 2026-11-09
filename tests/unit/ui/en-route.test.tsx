// @vitest-environment jsdom
// After the launch, part 4 (the owner's preview check of 8 Nov 2026): the tab is called En route (finding M), it has an Emergency
// link at its top (B), it shows its answers from km 0 with no position to choose first (K), and with no route it says what it is for.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { emergencyCard } from '../../../src/core/engines/emergency.ts';
import { buildScreen } from '../../../src/core/screen/screen.ts';
import { W } from '../../../src/core/wording/en.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb } from '../../../src/store/db.ts';
import { readInputs } from '../../../src/store/inputs.ts';
import { saveMatched, savePrepared, saveZones } from '../../../src/store/prepared.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';
import type { AheadTrip, AheadView } from '../../../src/ui/ahead/actions.ts';
import { App } from '../../../src/ui/app.tsx';
import { go } from '../../../src/ui/nav.ts';
import { browserAhead } from '../../../src/ui/shell-actions.ts';
import { railSignal } from '../../../src/ui/wide/wide.ts';
import { pos } from '../../fixtures/build.ts';
import { bannedHits } from '../../fixtures/banned.ts';
import { FRI, rainyStop, SAT } from './ahead-fixture.ts';
import { buttonNamed, click, dialled, fakeActions, host, show, viewOf } from './ahead-helpers.tsx';

beforeEach(() => {
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});
afterEach(() => { act(() => render(null, host)); railSignal.value = false; });

const trip = (v: AheadView): AheadTrip => { if (v.kind !== 'trip') throw new Error(v.kind); return v; };
const settle = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
async function until(check: () => boolean, what: string, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waited for ${what}`);
    await settle(10);
  }
}
const noRoute = (): AheadView => ({
  kind: 'no-route', canShare: false,
  emergency: emergencyCard({ position: null, now: new Date('2026-10-17T07:00:00Z'), country: null, settlements: [], shelters: [], rescuePoints: [], thunderNear: false, dataDate: '', timeZone: 'Europe/Berlin' }),
});

describe('the name (finding M)', () => {
  test('[AH-NAME] the tab and its heading read "En route"; its address stays #/ahead', async () => {
    go('ahead');
    await act(async () => { render(<App />, host); });
    expect([...host.querySelectorAll('nav.tabs a')].map((a) => a.textContent)).toEqual(['En route', 'Trip', 'Tools', 'You']);
    expect(host.querySelector('nav.tabs a[href="#/ahead"]')!.textContent).toBe('En route');
    expect(host.querySelector('h1')!.textContent).toBe('En route');
    expect(host.querySelector('main')!.dataset.screen).toBe('ahead');
  });

  test('[AH-NAME] no word a rider reads calls the tab "Ahead": the wording files and the legal pages', () => {
    const dir = join(process.cwd(), 'src/core/wording');
    const said: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        // A string, '…', "…" or `…`, holding Ahead as a word (the tab's name, capitalised; "what's ahead" is a plain word).
        for (const m of line.matchAll(/(['"`])((?:(?!\1).)*)\1/g)) if (/\bAhead\b/.test(m[2]!)) said.push(`${f}: ${m[2]}`);
      }
    }
    expect(said).toEqual([]);
    const legal = join(process.cwd(), 'public/legal');
    for (const d of readdirSync(legal, { withFileTypes: true }).filter((x) => x.isDirectory())) {
      const page = readFileSync(join(legal, d.name, 'index.html'), 'utf8').replace(/<[^>]*>/g, ' ');
      expect(page, d.name).not.toMatch(/\bAhead\b/);
    }
    expect(readFileSync(join(legal, 'privacy/index.html'), 'utf8')).toContain('Trip, En route, Tools, You');
    for (const s of [W.appTabAhead, W.appTripOpenAhead, W.appAheadNeedTitle, W.appAheadNeedUntil, W.appTripGoLater, W.appTripGetReadyLater, W.appTripNextGetReady, W.appTripDepartureNone]) {
      expect(s).toContain('En route');
      expect(bannedHits(s)).toEqual([]);
    }
  });
});

describe('with no route (finding M)', () => {
  test('[AH-EMPTY] two or three lines on what En route shows, and "Add a route in Trip" to Trip', async () => {
    await show(noRoute(), fakeActions().actions);
    const empty = host.querySelector<HTMLElement>('[data-empty]')!;
    // The two lines are a chunk of their own; the button is there at once.
    expect([...empty.querySelectorAll('a')].some((a) => a.textContent === 'Add a route in Trip')).toBe(true);
    await until(() => empty.querySelectorAll('p').length > 1, 'the lines');
    const lines = [...empty.querySelectorAll('p:not(:has(a))')].map((p) => p.textContent ?? '');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(3);
    const said = lines.join(' ');
    for (const w of [/water/i, /food/i, /sleep/i, /weather/i, /daylight/i, /offline/i]) expect(said).toMatch(w);
    expect(bannedHits(said)).toEqual([]);
    expect(bannedHits(said, true)).toEqual([]);
    const add = [...empty.querySelectorAll('a')].find((a) => a.textContent === 'Add a route in Trip')!;
    expect(add.getAttribute('href')).toBe('#/trip');
    expect(add.classList.contains('btn-primary')).toBe(true);
    // Emergency stays under it (AH-NO-ROUTE).
    expect(empty.compareDocumentPosition(host.querySelector('.ah-chips')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('[AH-EMPTY] a trip that cannot be read shows no empty state: it says so, with Try again', async () => {
    await show({ ...noRoute(), kind: 'unreadable' } as AheadView, fakeActions().actions);
    expect(host.querySelector('[data-empty]')).toBeNull();
    expect(host.textContent).toContain(W.appAheadUnreadable);
  });
});

describe('the Emergency link at the top (finding B)', () => {
  const link = () => host.querySelector<HTMLAnchorElement>('a[data-emergency-link]');

  for (const [name, view] of [['with a route', () => viewOf(rainyStop())], ['with no route', noRoute]] as const) {
    test(`[AH-EMERGENCY-LINK] ${name}: the first thing on En route jumps to Emergency and opens it; 112 still asks first`, async () => {
      await show(view(), fakeActions().actions);
      const a = link()!;
      expect(a.textContent).toBe(W.appAheadChipEmergency);
      // At the very top: nothing focusable before it.
      expect(host.querySelector('a, button, input, select')).toBe(a);
      expect(host.querySelector('#chip-emergency')).toBeNull();
      const hash = location.hash;
      // It jumps: the open panel is scrolled into view (jsdom has no scrolling of its own).
      const scrolled: Element[] = [];
      const was = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this); };
      try {
        await click(a);
        await settle(5);
      } finally {
        Element.prototype.scrollIntoView = was;
      }
      const panel = host.querySelector('#chip-emergency')!;
      expect(panel).not.toBeNull();
      expect(scrolled).toContain(panel);
      expect(location.hash).toBe(hash);
      expect(panel.contains(document.activeElement)).toBe(true);
      expect(await dialled(buttonNamed(W.emergencyCall, panel))).toBe('tel:112');
      // A second tap keeps it open.
      await click(link());
      expect(host.querySelector('#chip-emergency')).not.toBeNull();
    });
  }
});

describe('no position to choose first (finding K)', () => {
  test('[AH-FROM-START] on trip day 2 with no position: the strip, the six cards and the chips, from km 0, said so; the bike faded; no picker open', async () => {
    const i = rainyStop({ now: `${SAT} 09:00`, positions: [] });
    const v = trip(viewOf(i));
    expect(v.answers).toBe(true);
    expect(v.screen.ride.startKm).toBe(0);
    expect(v.screen.strip.startKm).toBe(0);
    expect(v.screen.notes).toContain(W.routeNoPositionFromStart);
    // Emergency is the real day's: its own last position, never this view's.
    expect(v.screen.chips.emergency).toEqual(buildScreen(i).screen.chips.emergency);
    await show(v, fakeActions().actions);
    expect(host.querySelector('[data-strip]')).not.toBeNull();
    expect(host.querySelectorAll('[data-card]')).toHaveLength(6);
    expect(host.querySelector('.ah-notes')!.textContent).toContain(W.routeNoPositionFromStart);
    expect(host.querySelector('[data-strip] [data-unconfirmed]')).not.toBeNull();
    expect(host.querySelector('#ah-picker')).toBeNull();
    expect(host.querySelector('[data-update-position]')).not.toBeNull();
    expect(host.textContent).not.toContain(W.appAheadFirstUse);
  });

  test('[AH-FROM-START] once a position is kept (Update position, the picker or the slider) the bike is no longer faded', async () => {
    const confirmed = trip(viewOf(rainyStop({ now: `${SAT} 09:00`, positions: [pos({ km: 3, at: `${SAT} 09:00` })] })));
    await show(confirmed, fakeActions().actions);
    expect(host.querySelector('[data-strip] .bike-marker')).not.toBeNull();
    expect(host.querySelector('[data-strip] [data-unconfirmed]')).toBeNull();
    // Day 1 with no position counted from km 0 before too: now with the bike faded.
    const dayOne = trip(viewOf(rainyStop({ now: `${FRI} 07:30`, positions: [] })));
    expect(dayOne.screen.ride.startKm).toBe(0);
    await show(dayOne, fakeActions().actions);
    expect(host.querySelector('[data-strip] [data-unconfirmed]')).not.toBeNull();
  });

  test('[AH-FROM-START] on a computer the slider is there from the start, and the view keeps no day start of its own', async () => {
    const i = rainyStop({ now: `${SAT} 09:00`, positions: [] });
    await readTrip();
    await saveTrip(i.trip);
    const id = i.trip.route.id;
    await saveMatched(id, { places: i.places, roofs: i.roofs, rescuePoints: i.rescuePoints, matches: i.matches, savedKm: i.savedKm });
    await saveZones(id, i.routeZones);
    await savePrepared(id, { at: i.now, steps: [], build: null, forecastFetchedAt: null, baselineYears: null });
    const shell = browserAhead({
      now: () => i.now, geolocation: () => undefined, online: () => false, fetch: () => Promise.reject(new Error('no network')), share: null, writeClipboard: null,
    });
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    expect(trip(shell.view.value).screen.ride.startKm).toBe(0);
    await settle(50);
    // The stage start of the real day is provisional and kept nowhere (DAY-START); km 0 of this view is not a day start either.
    expect((await readInputs(i.now))!.dayStarts).toEqual([]);
    railSignal.value = true;
    await show(shell.view.value, shell.actions);
    expect(host.querySelector('#ah-ruler, .ah-ruler, input[type=range]')).not.toBeNull();
    stop();
  });
});
