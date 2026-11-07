// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { T } from '../../../src/core/wording/en-tyre.ts';
import { readHost } from '../../../src/tools/tyre/host.ts';
import { savedBikeIds, toolBike } from '../../../src/tools/tyre/choice.ts';
import type { KeyValueStore } from '../../../src/tools/tyre/storage.ts';
import { TyreScreen } from '../../../src/tools/tyre/ui.tsx';
import type { TyreServices } from '../../../src/tools/tyre/ui.tsx';
import { go } from '../../../src/ui/nav.ts';
import { BIKE_CHOICE_KEY, noteBikeChoice } from '../../../src/ui/tools/bike-choice.ts';
import { ToolsScreen } from '../../../src/ui/tools/tools.tsx';

const NOW = new Date('2026-11-07T10:00:00Z');
const host = document.createElement('div');
document.body.append(host);
afterEach(() => { render(null, host); });
beforeEach(() => { go('tools'); });

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const kv: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
  return { kv, data };
}
type Mem = ReturnType<typeof memory>;
const services = (mem: Mem): TyreServices => ({ host: () => readHost(mem.kv, () => null), storage: mem.kv, now: () => NOW });
const mk = (id: string, name: string) => ({
  id, name, look: { colour: null, bars: 'drop', ebike: null }, tyres: 'tubeless', frontTyre: '30-622', rearTyre: '30-622', pressure: { wheel: '700c', rim: 'hookless', rimMm: 21 },
});
const A = mk('bike_a', 'Trail Bike');
const B = mk('bike_b', 'Gravel');
const C = mk('bike_c', 'Commuter');
const summary = (bikeId: string | null) => JSON.stringify({
  app: 'load-check', kind: 'load-summary', v: 1, at: '2026-10-28T18:02:00Z', planUpdatedAt: '2026-10-28T18:02:00Z', nights: 2, month: 6, departureDate: null, mode: 'comfort', foodDays: 2, bikeId,
  bags: { count: 0, positions: [], items: [] }, decks: { bar: null, rack: null }, water: { bottles: [], cageL: 1.25, extraL: 0, totalL: 1.25 },
  weight: { kitKg: 8, cageWaterKg: 1.25, carriedKg: 9, bikeKg: 14, emptyLuggageKg: 2, byPositionKg: { fork: 0, bar: 0, top: 0, frame: 0, bottle: 0, seat: 0, rack: 0, pack: 0 }, unplacedKg: 0 }, kit: { waterFilter: false },
});
const world = (bikes: unknown[], plan: { id: string } | null = null, extra: Record<string, string> = {}): Mem => memory({
  'loadcheck:summary:v1': summary(plan?.id ?? null),
  'loadcheck:bikeProfiles': JSON.stringify(bikes),
  'loadcheck:bikeProfile': JSON.stringify(plan),
  ...extra,
});
const choice = (bikeId: string | null): Record<string, string> => ({ [BIKE_CHOICE_KEY]: JSON.stringify({ app: 'copilot', kind: 'bike-choice', v: 1, bikeId, at: '2026-11-07T09:00:00.000Z' }) });
const mountTools = async (mem: Mem) => { await act(() => { render(<ToolsScreen services={services(mem)} />, host); }); };
const mountTyre = async (mem: Mem) => { await act(() => { go('tools/tyre'); render(<TyreScreen services={services(mem)} />, host); }); };
const line = () => host.querySelector('.bike-line') as HTMLElement | null;
const lineSelect = () => host.querySelector('.bike-line select') as HTMLSelectElement | null;
const tyreSelect = () => host.querySelector('#tyre-bike') as HTMLSelectElement;
const pickIn = async (sel: HTMLSelectElement, value: string) => { await act(() => { sel.value = value; sel.dispatchEvent(new Event('change', { bubbles: true })); }); };
const options = (sel: HTMLSelectElement) => [...sel.options].map((o) => o.textContent);
const maxField = () => [...host.querySelectorAll('label')].find((l) => l.textContent?.includes(W.tyreLimitMaxLabel))!.querySelector('input') as HTMLInputElement;

describe('the choice, resolved', () => {
  const resolved = (mem: Mem) => toolBike(mem.kv, readHost(mem.kv, () => null), savedBikeIds(mem.kv));

  test('[TB-CHOICE-FALLBACK] a chosen id that no bike has, or a bike deleted since, gives the bike in use, else none; nothing throws', () => {
    // The choice stands while its bike is saved.
    const mem = world([A, B], A, choice('bike_b'));
    expect(resolved(mem)).toEqual({ id: 'bike_b', picked: true });
    // An id no bike has: the plan's bike.
    mem.data.set(BIKE_CHOICE_KEY, choice('bike_gone')[BIKE_CHOICE_KEY]!);
    expect(resolved(mem)).toEqual({ id: 'bike_a', picked: false });
    // The bike deleted since (the saved list only; the plan keeps it): the bike in use among those saved, never the removed one.
    expect(resolved(world([B], A, choice('bike_a')))).toEqual({ id: 'bike_b', picked: false });
    // No bike at all: none, and nothing throws, even on damaged records.
    expect(resolved(world([], null, choice('bike_a')))).toEqual({ id: null, picked: false });
    expect(resolved(memory({ 'loadcheck:bikeProfiles': '{oops', [BIKE_CHOICE_KEY]: '7' }))).toEqual({ id: null, picked: false });
    // No bike is a choice only when the rider picked it.
    expect(resolved(world([A, B], A, choice(null)))).toEqual({ id: null, picked: true });
    expect(resolved(world([A, B], A))).toEqual({ id: 'bike_a', picked: false });
  });

  test('[TB-CHOICE-FALLBACK] a bike deleted in the bag planner while Tools is open: the real storage event redraws the line on the fallback', async () => {
    const mem = world([A, B], A, choice('bike_b'));
    await mountTools(mem);
    expect(lineSelect()!.value).toBe('bike_b');
    mem.data.set('loadcheck:bikeProfiles', JSON.stringify([A]));
    await act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'loadcheck:bikeProfiles' })); });
    // One bike left, and it is the plan's: shown as text, the removed bike gone, nothing thrown.
    expect(lineSelect()).toBeNull();
    expect(line()!.textContent).toBe(`${W.tyreBikeLabel}: Trail Bike`);
    expect(host.textContent).not.toContain('Gravel');
  });

  test('[TB-CHOICE-FALLBACK] the line also catches up when the page shows again or becomes visible, after a change nobody announced', async () => {
    const mem = world([A, B, C], A);
    await mountTools(mem);
    expect(options(lineSelect()!)).toContain('Commuter');
    mem.data.set('loadcheck:bikeProfiles', JSON.stringify([A, B]));
    await act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    expect(options(lineSelect()!)).not.toContain('Commuter');
    mem.data.set('loadcheck:bikeProfiles', JSON.stringify([A, B, C]));
    await act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(options(lineSelect()!)).toContain('Commuter');
  });

  test("[TB-TOOLS-FOLLOW] the Tools tyre card follows a change of the plan's bike made in another tab", async () => {
    const mem = world([A, B], A);
    const { saveEntry } = await import('../../../src/tools/tyre/storage.ts');
    saveEntry(mem.kv, 'bike_a', { details: {}, last: { frontBar: 2.1, rearBar: 2.3, at: '2026-11-06T10:00:00Z', bike: 'Trail Bike' } }, NOW);
    saveEntry(mem.kv, 'bike_b', { details: {}, last: { frontBar: 3.1, rearBar: 3.3, at: '2026-11-01T10:00:00Z', bike: 'Gravel' } }, NOW);
    await mountTools(mem);
    expect(host.textContent).toContain('front 2.1');
    mem.data.set('loadcheck:summary:v1', summary('bike_b'));
    mem.data.set('loadcheck:bikeProfile', JSON.stringify(B));
    await act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'loadcheck:summary:v1' })); });
    expect(host.textContent).toContain('front 3.1');
  });
});

describe('the bike line in Tools', () => {
  test('[TB-LINE] no bike: no line; one: its name as text; three: a select labelled Bike with three bikes and No bike, the current one selected', async () => {
    await mountTools(world([], null));
    expect(line()).toBeNull();
    render(null, host);
    await mountTools(world([A], A));
    expect(line()!.textContent).toBe(`${W.tyreBikeLabel}: Trail Bike`);
    expect(lineSelect()).toBeNull();
    render(null, host);
    const mem = world([A, B, C], A, choice('bike_c'));
    await mountTools(mem);
    const sel = lineSelect()!;
    expect(options(sel)).toEqual(['Trail Bike' + W.tyreBikeInPlan, 'Gravel', 'Commuter', T.tyreBikeWithout]);
    expect(sel.value).toBe('bike_c');
    const label = [...host.querySelectorAll('label')].find((l) => l.getAttribute('for') === sel.id);
    expect(label?.textContent).toContain(W.tyreBikeLabel);
    // "No bike" is a choice the rider can make here, and the line then says so.
    await pickIn(sel, 'default');
    expect(JSON.parse(mem.data.get(BIKE_CHOICE_KEY)!)).toMatchObject({ bikeId: null });
    expect(lineSelect()!.value).toBe('default');
  });

  test('[TB-LINE-UNSAVED] a plan bike missing from the saved list is not offered or chosen (PR 51: a removed bike never is); the saved ones are', async () => {
    await mountTools(world([B, C], A));
    const sel = lineSelect()!;
    expect(options(sel)).toEqual(['Gravel', 'Commuter', T.tyreBikeWithout]);
    expect(host.textContent).not.toContain('Trail Bike');
    expect(sel.value).toBe('bike_c');
  });
});

describe('the choice follows the rider between the tools', () => {
  test("[TB-SWITCH] choosing a bike in the tyre tool is the line's bike in Tools after a remount and after a reload; the tyre tool opens on that bike's own details", async () => {
    const mem = world([A, B], A);
    await mountTyre(mem);
    expect(tyreSelect().value).toBe('bike_a');
    await pickIn(tyreSelect(), 'bike_b');
    expect(JSON.parse(mem.data.get(BIKE_CHOICE_KEY)!)).toMatchObject({ app: 'copilot', kind: 'bike-choice', v: 1, bikeId: 'bike_b' });
    // Type a maximum for B, so B has details of its own.
    await act(() => { maxField().value = '6'; maxField().dispatchEvent(new Event('input', { bubbles: true })); });
    render(null, host);
    await mountTools(mem);
    expect(lineSelect()!.value).toBe('bike_b');
    // A reload: a fresh start over the same storage.
    render(null, host);
    const reloaded = memory(Object.fromEntries(mem.data));
    await mountTools(reloaded);
    expect(lineSelect()!.value).toBe('bike_b');
    render(null, host);
    await mountTyre(reloaded);
    expect(tyreSelect().value).toBe('bike_b');
    expect(maxField().value).toBe('6');
    // And the other way: the line in Tools moves the tyre tool.
    render(null, host);
    await mountTools(reloaded);
    await pickIn(lineSelect()!, 'bike_a');
    render(null, host);
    await mountTyre(reloaded);
    expect(tyreSelect().value).toBe('bike_a');
  });

  test('[TB-SWITCH] a choice made while the tyre tool is open moves it; "No bike" only by the rider\'s pick, never because no bike existed', async () => {
    const mem = world([A, B], A);
    await mountTyre(mem);
    await act(() => { noteBikeChoice('bike_b', NOW, mem.kv); });
    expect(tyreSelect().value).toBe('bike_b');
    // No bike saved yet: nothing is written, and the first bike saved becomes the choice.
    render(null, host);
    const empty = world([], null);
    await mountTyre(empty);
    expect(empty.data.has(BIKE_CHOICE_KEY)).toBe(false);
    empty.data.set('loadcheck:bikeProfiles', JSON.stringify([C]));
    await act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'loadcheck:bikeProfiles' })); });
    expect(tyreSelect().value).toBe('bike_c');
    expect(empty.data.has(BIKE_CHOICE_KEY)).toBe(false);
  });
});

describe('a choice made elsewhere while the tyre tool is open', () => {
  const status = () => [...host.querySelectorAll('[role="status"]')].map((e) => e.textContent ?? '').find((t) => t.includes(T.tyreChosenElsewhere)) ?? null;
  const type = async (v: string) => { await act(() => { maxField().value = v; maxField().dispatchEvent(new Event('input', { bubbles: true })); }); };

  test('[TB-ELSEWHERE] untouched: it follows silently, with no line', async () => {
    const mem = world([A, B], A);
    await mountTyre(mem);
    await act(() => { noteBikeChoice('bike_b', NOW, mem.kv); });
    expect(tyreSelect().value).toBe('bike_b');
    expect(status()).toBeNull();
  });

  test('[TB-ELSEWHERE] after the rider typed: it never switches and never drops an answer; one quiet line offers Switch, and Switch moves it', async () => {
    const mem = world([A, B], A);
    await mountTyre(mem);
    await type('6');
    await act(() => { noteBikeChoice('bike_b', NOW, mem.kv); });
    expect(tyreSelect().value).toBe('bike_a');
    expect(maxField().value).toBe('6');
    expect(status()).toContain('Gravel');
    expect(status()).toContain(T.tyreChosenSwitch);
    // A half-typed answer survives a second choice too.
    await type('6.');
    await act(() => { noteBikeChoice('bike_b', new Date(NOW.getTime() + 1000), mem.kv); });
    expect(maxField().value).toBe('6.');
    expect(tyreSelect().value).toBe('bike_a');
    const sw = [...host.querySelectorAll('button')].find((b) => b.textContent === T.tyreChosenSwitch)!;
    await act(() => { sw.click(); });
    expect(tyreSelect().value).toBe('bike_b');
    expect(status()).toBeNull();
    await pickIn(tyreSelect(), 'bike_a');
    expect(status()).toBeNull();
  });

  test('[TB-ELSEWHERE] a rider who picked a bike here is touched too; the choice coming back to what is shown withdraws the line', async () => {
    const mem = world([A, B], A);
    await mountTyre(mem);
    await pickIn(tyreSelect(), 'bike_b');
    await act(() => { noteBikeChoice('bike_a', NOW, mem.kv); });
    expect(tyreSelect().value).toBe('bike_b');
    expect(status()).toContain('Trail Bike');
    await act(() => { noteBikeChoice('bike_b', new Date(NOW.getTime() + 1000), mem.kv); });
    expect(status()).toBeNull();
  });
});

describe('no choice path writes a loadcheck key', () => {
  const lc = (mem: Mem) => JSON.stringify([...mem.data].filter(([k]) => k.startsWith('loadcheck:')).sort());

  test('[TB-NO-LC-WRITE] the Tools line, the tyre box and a choice made while the tool is open leave every loadcheck:* entry as it was', async () => {
    const mem = world([A, B, C], A);
    const before = lc(mem);
    await mountTools(mem);
    await pickIn(lineSelect()!, 'bike_b');
    await pickIn(lineSelect()!, 'default');
    render(null, host);
    await mountTyre(mem);
    await pickIn(tyreSelect(), 'bike_c');
    await act(() => { noteBikeChoice('bike_a', NOW, mem.kv); });
    expect(mem.data.has(BIKE_CHOICE_KEY)).toBe(true);
    expect(lc(mem)).toBe(before);
  });
});

describe('Tools loads as its own chunk', () => {
  test('[TB-TOOLS-LAZY] the bag card with the bike drawing is there at the first render (the bike glides back from the bag planner); the line and the tyre card follow when the chunk has loaded', async () => {
    const { App } = await import('../../../src/ui/app.tsx');
    localStorage.clear();
    localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([A, B]));
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify(A));
    const { refreshBikeSource } = await import('../../../src/ui/bike/live.ts');
    refreshBikeSource();
    go('tools');
    const root = document.createElement('div');
    document.body.append(root);
    await act(() => { render(<App />, root); });
    // The very first frame: the bag card and a place kept for the line (nothing moves later); no tyre card yet.
    const cards = () => root.querySelectorAll('main[data-screen="tools"] > .card');
    expect(cards().length).toBeGreaterThanOrEqual(1);
    expect(root.querySelector('main[data-screen="tools"] .bike-large svg')).not.toBeNull();
    expect(root.querySelector('.bike-line')).not.toBeNull();
    // Then the whole screen: the line, both cards.
    await vi.waitFor(() => expect(cards().length).toBe(2));
    expect(root.querySelector('.bike-line select')).not.toBeNull();
    expect(root.querySelectorAll('.bike-line').length).toBe(1);
    render(null, root);
    root.remove();
    localStorage.clear();
  });
});
