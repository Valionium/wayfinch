// @vitest-environment jsdom
// The first-run bike hint in the screens (wish 17, design of 9 Nov 2026): the card on Trip, Later, the states it shrinks to, the one-time
// line after the first bike, the places seen, the one key, and the "fits better" lines of Tyre pressure, Bike care, Tools and You.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HN } from '../../../src/core/wording/en-hint.ts';
import { WB } from '../../../src/core/wording/en-bike.ts';
import { W } from '../../../src/core/wording/en.ts';
import { Y } from '../../../src/core/wording/en-you.ts';
import { CareScreen } from '../../../src/tools/care/ui.tsx';
import { readHost } from '../../../src/tools/tyre/host.ts';
import type { KeyValueStore } from '../../../src/tools/tyre/storage.ts';
import { TyreScreen } from '../../../src/tools/tyre/ui.tsx';
import type { TyreServices } from '../../../src/tools/tyre/ui.tsx';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb } from '../../../src/store/db.ts';
import { deleteCopilotData, exportAll } from '../../../src/store/export.ts';
import { HINT_KEY, writeHint } from '../../../src/ui/bike/hint-key.ts';
import { noteSeen } from '../../../src/ui/bike/hint-seen.ts';
import { bikeSource, refreshBikeSource } from '../../../src/ui/bike/live.ts';
import type { BikeSource } from '../../../src/ui/bike/live.ts';
import { go } from '../../../src/ui/nav.ts';
import { ToolsScreen } from '../../../src/ui/tools/tools.tsx';
import { TripBike } from '../../../src/ui/trip/bike-hint.tsx';
import { BikesCards } from '../../../src/ui/you/bikes.tsx';

const host = document.createElement('div');
document.body.append(host);
const NOW = new Date('2026-11-09T10:00:00Z');

beforeEach(() => {
  render(null, host);
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  refreshBikeSource();
});
afterEach(() => { act(() => render(null, host)); vi.restoreAllMocks(); });

const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const BIKE = { id: 'bike_a', name: 'Trail Bike', look: { colour: '#1f7a7a', bars: 'drop', ebike: null }, frontTyre: '40-622', rearTyre: '40-622', pressure: { wheel: '700c' } };
const NO_BIKE: BikeSource = { bike: null, bikes: [], summary: null, known: [] };
const saved = (): BikeSource => {
  localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([BIKE]));
  localStorage.setItem('loadcheck:bikeProfile', JSON.stringify(BIKE));
  refreshBikeSource();
  return bikeSource.value;
};
const trip = async (source: BikeSource, hasTrip: boolean | null = false) => { await act(() => { render(<TripBike bike={source} trip={hasTrip} />, host); }); await settle(); };
const card = () => host.querySelector<HTMLElement>('section.bike-hint');
const later = () => [...host.querySelectorAll('button')].find((b) => b.textContent === W.bikeHintLater)!;
const key = () => localStorage.getItem(HINT_KEY);

describe('the card on Trip', () => {
  test('[HINT-NEW] a new rider: a section named by its heading, the grey typical bike, the sentence, Make it yours and Later; nothing takes the focus', async () => {
    const before = document.activeElement;
    await trip(NO_BIKE);
    const box = card()!;
    expect(box).not.toBeNull();
    expect(box.classList.contains('trip-bike')).toBe(true);
    const heading = box.querySelector('h2')!;
    expect(heading.textContent).toBe(W.bikeHintTitle);
    expect(box.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(box.textContent).toContain(W.bikeHintBody);
    expect(W.bikeHintTitle).toBe('Design your bike');
    expect(W.bikeHintBody).toBe("The app's answers are more accurate when it knows your bike's size and frame type.");
    // The drawing is the typical one, unpainted, and a tap on it opens Look, as today; Make it yours opens Bike details at its top, where
    // frame style and size are entered (the owner's ruling of 9 Nov 2026: "Open it at size and frame type").
    expect(box.querySelector('.bk-paint')).toBeNull();
    const links = [...box.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/tools/bags/#bike-details=new&back=trip&section=look', '/tools/bags/#bike-details=new&back=trip']);
    expect(links[1]!.textContent).toBe(WB.bikeMakeItYours);
    expect(later().getAttribute('aria-label')).toBe('Later: show this smaller');
    expect(box.querySelector('.btn-primary')).toBeNull();
    expect(box.querySelector('[role=status], [aria-live]')).toBeNull();
    expect(document.activeElement).toBe(before);
    expect(key()).toBe('a');
  });

  test('[HINT-NEW] before Trip has read the trip, the card may show but nothing is written', async () => {
    await trip(NO_BIKE, null);
    expect(card()).not.toBeNull();
    expect(key()).toBeNull();
  });

  test('[HINT-SMALL] Later shrinks it at once to today\'s line, moves the focus to its Add your bike, and it never grows back', async () => {
    await trip(NO_BIKE);
    await act(() => { later().click(); });
    await settle();
    expect(card()).toBeNull();
    const caption = host.querySelector('.trip-bike figcaption')!;
    expect(caption.textContent!.replace(/ /g, ' ')).toBe('A typical gravel bike · Add your bike');
    expect(document.activeElement).toBe(caption.querySelector('a'));
    expect(key()).toContain('s');
    render(null, host);
    await trip(NO_BIKE);
    expect(card()).toBeNull();
  });

  test('[HINT-SMALL] Later tapped before the card has written its letter (a slow phone): the key keeps small, never written over', async () => {
    // Rendered without act, so the effect that writes the card's letter waits, as it does on a slow phone; the rider taps Later meanwhile.
    render(<TripBike bike={NO_BIKE} trip={false} />, host);
    expect(key()).toBeNull();
    localStorage.setItem(HINT_KEY, 's');
    // Preact runs it after the next frame, or 100 ms at the latest.
    await new Promise((r) => setTimeout(r, 200));
    expect(key()).toContain('s');
    render(null, host);
    await trip(NO_BIKE);
    expect(card()).toBeNull();
  });

  test('[HINT-SMALL] a tap on Make it yours or the drawing counts as seen: back without saving, the line is small', async () => {
    for (const which of [0, 1]) {
      localStorage.clear();
      render(null, host);
      await trip(NO_BIKE);
      const link = card()!.querySelectorAll('a')[which]!;
      link.addEventListener('click', (e) => e.preventDefault());
      await act(() => { link.click(); });
      expect(key()).toContain('s');
      render(null, host);
      await trip(NO_BIKE);
      expect(card()).toBeNull();
    }
  });

  test('[HINT-SMALL] riders who already use the app start small: a trip, a bag plan, a tyre result, anything Wayfinch saved', async () => {
    await trip(NO_BIKE, true);
    expect(card()).toBeNull();
    expect(key()).toContain('s');
    for (const [k, v] of [['loadcheck:summary:v1', null], ['copilot:tyre:v1', '{}'], ['copilot:changed', '{"at":1,"section":"trip"}']] as const) {
      localStorage.clear();
      render(null, host);
      if (v === null) {
        localStorage.setItem(k, JSON.stringify({ app: 'load-check', kind: 'load-summary', v: 1, at: '2026-10-28T18:02:00Z', planUpdatedAt: '2026-10-28T18:02:00Z', nights: 2, month: 6, departureDate: null, mode: 'comfort', foodDays: 2, bikeId: null, bags: { count: 0, positions: [], items: [] }, decks: { bar: null, rack: null }, water: { bottles: [], cageL: 1.25, extraL: 0, totalL: 1.25 }, weight: { kitKg: 8, cageWaterKg: 1.25, carriedKg: 9, bikeKg: 14, emptyLuggageKg: 2, byPositionKg: { fork: 0, bar: 0, top: 0, frame: 0, bottle: 0, seat: 0, rack: 0, pack: 0 }, unplacedKg: 0 }, kit: { waterFilter: false } }));
        refreshBikeSource();
        expect(bikeSource.value.summary, 'the plan reads').not.toBeNull();
        await trip(bikeSource.value);
      } else {
        localStorage.setItem(k, v);
        await trip(NO_BIKE);
      }
      expect(card(), k).toBeNull();
      expect(key(), k).toContain('s');
    }
  });

  test('[HINT-NEW] a route added while the card shows does not shrink it under the rider\'s fingers; the next visit to Trip is small', async () => {
    await trip(NO_BIKE, false);
    localStorage.setItem('copilot:changed', '{"at":1,"section":"trip"}');
    await trip(NO_BIKE, true);
    expect(card()).not.toBeNull();
    render(null, host);
    await trip(NO_BIKE, true);
    expect(card()).toBeNull();
  });

  test('[HINT-SMALL] two of Tools, You, Tyre pressure, Bike care and the Gear advisor make it small; one alone does not', async () => {
    await trip(NO_BIKE);
    render(null, host);
    noteSeen('t');
    noteSeen('t');
    await trip(NO_BIKE);
    expect(card()).not.toBeNull();
    render(null, host);
    noteSeen('g');
    await trip(NO_BIKE);
    expect(card()).toBeNull();
  });
});

describe('after the first bike', () => {
  test('[HINT-GONE] a saved bike: today\'s caption, and for this one return a polite line that the bike is in every tool now; never again', async () => {
    await trip(NO_BIKE);
    render(null, host);
    await trip(saved());
    expect(card()).toBeNull();
    expect(host.querySelector('.trip-bike figcaption')!.textContent).toContain(WB.bikeMakeItYours);
    const line = host.querySelector('.bike-hint-done')!;
    expect(line.getAttribute('role')).toBe('status');
    await settle();
    expect(line.textContent).toBe(HN.hintEveryTool);
    expect(HN.hintEveryTool).toBe('Your bike is in every tool now: bags, tyre pressure and bike care fit it.');
    // Still there while the rider stays on Trip (a redraw), gone at the next visit.
    await trip(bikeSource.value);
    expect(host.querySelector('.bike-hint-done')!.textContent).toBe(HN.hintEveryTool);
    render(null, host);
    await trip(bikeSource.value);
    expect(host.querySelector('.bike-hint-done')).toBeNull();
  });

  test('[HINT-GONE] the status is in the page, and never hidden, before its words arrive, so a screen reader says them when they do', async () => {
    await trip(NO_BIKE);
    render(null, host);
    await act(() => { render(<TripBike bike={saved()} trip={false} />, host); });
    const line = host.querySelector<HTMLElement>('.bike-hint-done')!;
    expect(line.getAttribute('role')).toBe('status');
    expect(line.textContent).toBe('');
    // No rule of Trip's or the bike's stylesheet takes it out of the page while it is empty.
    const css = ['../../../src/ui/trip/trip.css', '../../../src/ui/bike/bike.css'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
    const rules = css.match(/[^{}]*bike-hint-done[^{]*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule, rule).not.toMatch(/display:\s*none|visibility:\s*hidden/);
    await settle();
    expect(line.textContent).toBe(HN.hintEveryTool);
  });

  test('[HINT-GONE] a bike saved in another tab while the card shows: the line comes in this visit', async () => {
    await trip(NO_BIKE);
    await trip(saved());
    await settle();
    expect(host.querySelector('.bike-hint-done')!.textContent).toBe(HN.hintEveryTool);
  });

  test('[HINT-GONE] a rider who had a bike before never sees the line; all bikes removed later: small, never the card', async () => {
    await trip(saved(), true);
    expect(host.querySelector('.bike-hint-done')).toBeNull();
    render(null, host);
    localStorage.removeItem('copilot:changed');
    await trip(NO_BIKE, false);
    expect(card()).toBeNull();
  });
});

describe('the one key, on the phone only', () => {
  test('[HINT-LOCAL] one copilot: key of a few letters; Delete co-pilot data removes it (a fresh start shows the card), the export leaves it out, nothing is sent', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('no network in this test')));
    await trip(NO_BIKE);
    await act(() => { later().click(); });
    noteSeen('t');
    expect(key()).toMatch(/^[atypcgsw]+$/);
    const hintKeys = Object.keys(localStorage).filter((k) => /hint/i.test(k));
    expect(hintKeys).toEqual([HINT_KEY]);
    expect(JSON.stringify(await exportAll())).not.toContain('bikeHint');
    await deleteCopilotData();
    expect(key()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('[HINT-LOCAL] storage refused: the card follows the same rules for this visit, from memory', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    await trip(NO_BIKE);
    expect(card()).not.toBeNull();
    await act(() => { later().click(); });
    await settle();
    expect(card()).toBeNull();
    render(null, host);
    await trip(NO_BIKE);
    expect(card()).toBeNull();
    // Storage that keeps the key again ends the memory.
    vi.restoreAllMocks();
    writeHint('');
    expect(key()).toBe('');
  });
});

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const kv: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
  return { kv, data };
}
const services = (mem: ReturnType<typeof memory>): TyreServices => ({ host: () => readHost(mem.kv, () => null), storage: mem.kv, now: () => NOW });
const fitLines = () => [...host.querySelectorAll<HTMLElement>('[data-fit-line]')];

describe('the places seen and the "fits better" lines', () => {
  test('[HINT-SMALL] Tools, You, Tyre pressure and Bike care each note themselves once; the Gear advisor when opened from Tools', async () => {
    const none = memory({ 'loadcheck:bikeProfiles': '[]' });
    go('tools');
    await act(() => { render(<ToolsScreen services={services(none)} />, host); });
    expect(key()).toBe('t');
    const advisor = [...host.querySelectorAll('a')].find((a) => a.getAttribute('href')?.includes('gear-advisor'))!;
    advisor.addEventListener('click', (e) => e.preventDefault());
    await act(() => { advisor.click(); });
    expect(key()).toContain('g');
    expect(key()).toContain('s');
    for (const [place, mount] of [
      ['p', () => { go('tools/tyre'); render(<TyreScreen services={services(none)} />, host); }],
      ['c', () => { go('tools/care'); render(<CareScreen services={services(none)} />, host); }],
      ['y', () => { go('you'); render(<BikesCards />, host); }],
    ] as const) {
      localStorage.clear();
      render(null, host);
      await act(mount);
      expect(key(), place).toBe(place);
    }
  });

  test('[FIT-LINE] Tyre pressure with no saved bike: one quiet line under the bike box, its link into Bike details and back; a saved bike, none', async () => {
    go('tools/tyre');
    await act(() => { render(<TyreScreen services={services(memory({ 'loadcheck:bikeProfiles': '[]' }))} />, host); });
    expect(fitLines().length).toBe(1);
    const line = fitLines()[0]!;
    expect(line.textContent).toBe(`${HN.hintFitTyre} ${HN.hintAdd} ${HN.hintFitTyreAfter}`);
    expect(line.textContent).toBe('No saved bike, so nothing is filled in. Add your bike and its tyre sizes fill in here.');
    expect(line.classList.contains('muted')).toBe(true);
    expect(line.querySelector('a')!.getAttribute('href')).toBe('/tools/bags/#bike-details=new&back=tyre');
    expect(host.querySelector('label[for="tyre-bike"]')!.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    render(null, host);
    await act(() => { render(<TyreScreen services={services(memory({ 'loadcheck:bikeProfiles': JSON.stringify([BIKE]), 'loadcheck:bikeProfile': JSON.stringify(BIKE) }))} />, host); });
    expect(fitLines()).toEqual([]);
  });

  test('[FIT-LINE] Bike care with no saved bike: the line in the bike line\'s place; a saved bike, its bike line and no fits line', async () => {
    go('tools/care');
    await act(() => { render(<CareScreen services={services(memory({ 'loadcheck:bikeProfiles': '[]' }))} />, host); });
    expect(fitLines().map((l) => l.textContent)).toEqual(['For any bike: everything shows. Add your bike and only what fits it shows.']);
    expect(fitLines()[0]!.querySelector('a')!.getAttribute('href')).toBe('/tools/bags/#bike-details=new&back=care');
    render(null, host);
    await act(() => { render(<CareScreen services={services(memory({ 'loadcheck:bikeProfiles': JSON.stringify([BIKE]), 'loadcheck:bikeProfile': JSON.stringify(BIKE) }))} />, host); });
    expect(fitLines()).toEqual([]);
    expect(host.querySelector('.bike-line select')).not.toBeNull();
  });

  test('[HINT-TOOLS] Tools with no bike: "Bike: a typical gravel bike · Add yours" in the bike line\'s place; a plan-only bike keeps no line', async () => {
    go('tools');
    await act(() => { render(<ToolsScreen services={services(memory({ 'loadcheck:bikeProfiles': '[]' }))} />, host); });
    const line = host.querySelector<HTMLElement>('.bike-line[data-hint-line]')!;
    expect(line.textContent).toBe('Bike: a typical gravel bike · Add yours');
    expect(line.querySelector('a')!.getAttribute('href')).toBe('/tools/bags/#bike-details=new&back=tools');
    render(null, host);
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify(BIKE));
    refreshBikeSource();
    await act(() => { render(<ToolsScreen services={services(memory({ 'loadcheck:bikeProfiles': '[]', 'loadcheck:bikeProfile': JSON.stringify(BIKE) }))} />, host); });
    expect(host.querySelector('.bike-line')).toBeNull();
  });

  test('[HINT-TOOLS] You with no bike: the small grey typical bike beside what adding one changes, and Add a bike', async () => {
    go('you');
    await act(() => { render(<BikesCards />, host); });
    const none = host.querySelector<HTMLElement>('.you-bike-none')!;
    expect(none.querySelector('svg.bk')).not.toBeNull();
    expect(none.querySelector('.bk-paint')).toBeNull();
    expect(none.textContent).toBe(Y.youBikesNone);
    expect(Y.youBikesNone).toBe('No bike yet. Add yours: its colour, tyres and bars. The Bag planner, Tyre pressure and Bike care then fit it.');
    expect([...host.querySelectorAll('a')].some((a) => a.textContent === Y.youBikeAdd)).toBe(true);
  });
});
