// @vitest-environment jsdom
// The Bike care screen (sub-project 12, Task 4): tabs, the part filters, search with no match, the "Tell us" line, and a bike deleted in
// another tab. It writes nothing.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { C, CARE_TASKS, PART_LABEL, SECTION_LABEL, SECTIONS } from '../../../../src/core/wording/en-care.ts';
import { CareScreen } from '../../../../src/tools/care/ui.tsx';
import { readHost } from '../../../../src/tools/tyre/host.ts';
import type { TyreServices } from '../../../../src/tools/tyre/services.ts';
import type { KeyValueStore } from '../../../../src/tools/tyre/storage.ts';
import { bikeDetailsHref } from '../../../../src/ui/bike/link.ts';
import { go } from '../../../../src/ui/nav.ts';
import { BIKE_CHOICE_KEY } from '../../../../src/ui/tools/bike-choice.ts';

const NOW = new Date('2026-11-07T10:00:00Z');
const host = document.createElement('div');
document.body.append(host);
afterEach(() => { render(null, host); });
beforeEach(() => { go('tools/care'); });

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  const kv: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { writes.push(k); data.set(k, v); } };
  return { kv, data, writes };
}
type Mem = ReturnType<typeof memory>;
const services = (mem: Mem): TyreServices => ({ host: () => readHost(mem.kv, () => null), storage: mem.kv, now: () => NOW });
const bike = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, look: { colour: null, bars: 'drop', ebike: null }, frontTyre: '30-622', rearTyre: '30-622', pressure: { wheel: '700c' }, ...extra,
});
/** Every detail answered: rim brakes, tubes, a derailleur on cables, no suspension, no motor. */
const ANSWERED = { brakes: 'rim', tyres: 'tubes', drive: 'derailleur', shifting: 'cable', suspension: 'none', look: { colour: null, bars: 'drop', ebike: false } };
const world = (bikes: unknown[], extra: Record<string, string> = {}): Mem => memory({
  'loadcheck:bikeProfiles': JSON.stringify(bikes), ...(bikes[0] ? { 'loadcheck:bikeProfile': JSON.stringify(bikes[0]) } : {}), ...extra,
});
const choice = (bikeId: string | null) => JSON.stringify({ app: 'copilot', kind: 'bike-choice', v: 1, bikeId, at: '2026-11-07T09:00:00.000Z' });
const mount = async (mem: Mem) => { await act(() => { render(<CareScreen services={services(mem)} />, host); }); };

const tasks = () => [...host.querySelectorAll<HTMLElement>('details.care-task')];
const taskIds = () => tasks().map((d) => d.dataset.id!);
const headings = () => [...host.querySelectorAll('h3')].map((h) => h.textContent);
const tab = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent === name)!;
const filter = (part: string) => [...host.querySelectorAll<HTMLButtonElement>('.care-filters button')].find((b) => b.textContent === part)!;
const search = () => host.querySelector<HTMLInputElement>('#care-search')!;
const type = async (text: string) => { await act(() => { search().value = text; search().dispatchEvent(new Event('input', { bubbles: true })); }); };
const click = async (el: HTMLElement) => { await act(() => { el.click(); }); };
const key = async (el: HTMLElement, k: string) => { await act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }); };
const tellUs = () => [...host.querySelectorAll('a')].find((a) => a.textContent === C.careTellUs) ?? null;

test('[BC-TABS] two tabs, Care and Roadside repairs, in a named tablist; one selected, arrows, Home and End move; only its panel shows', async () => {
  await mount(world([]));
  const list = host.querySelector('[role="tablist"]')!;
  expect(list.getAttribute('aria-label')).toBe(C.careTabsLabel);
  expect([...list.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual([C.careTabCare, C.careTabRoad]);
  const panel = (t: HTMLElement) => host.querySelector<HTMLElement>(`#${t.getAttribute('aria-controls')}`)!;
  expect(tab(C.careTabCare).getAttribute('aria-selected')).toBe('true');
  expect(panel(tab(C.careTabCare)).hidden).toBe(false);
  expect(panel(tab(C.careTabRoad)).hidden).toBe(true);
  expect(panel(tab(C.careTabRoad)).getAttribute('role')).toBe('tabpanel');
  await key(tab(C.careTabCare), 'ArrowRight');
  expect(tab(C.careTabRoad).getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(tab(C.careTabRoad));
  expect(panel(tab(C.careTabCare)).hidden).toBe(true);
  expect(panel(tab(C.careTabRoad)).textContent).toContain(C.careRoadLater);
  await key(tab(C.careTabRoad), 'ArrowRight'); // wraps
  expect(tab(C.careTabCare).getAttribute('aria-selected')).toBe('true');
  await key(tab(C.careTabCare), 'End');
  expect(tab(C.careTabRoad).getAttribute('aria-selected')).toBe('true');
  await key(tab(C.careTabRoad), 'Home');
  expect(tab(C.careTabCare).getAttribute('aria-selected')).toBe('true');
  await key(tab(C.careTabCare), 'ArrowLeft');
  expect(tab(C.careTabRoad).getAttribute('aria-selected')).toBe('true');
  await click(tab(C.careTabCare));
  expect(panel(tab(C.careTabCare)).hidden).toBe(false);
});

test('[BC-TABS] with no bike every sample task shows, each an h3 section in design order, a task a details with its name and tags', async () => {
  await mount(world([]));
  expect(taskIds()).toEqual(CARE_TASKS.map((t) => t.id));
  const order = SECTIONS.filter((s) => CARE_TASKS.some((t) => t.section === s)).map((s) => SECTION_LABEL[s]);
  expect(headings()).toEqual(order);
  const disc = tasks().find((d) => d.dataset.id === 'brakes-pads-disc')!;
  expect(disc.querySelector('summary')!.textContent).toContain('Check the disc brake pads and replace if worn');
  expect(disc.querySelector('summary .muted')!.textContent).toBe('if you have disc brakes');
  // opened: signs, steps as a numbered list, tools and time, who, and the shop line for a critical task
  const body = disc.textContent!;
  expect(body).toContain(C.careSigns);
  expect(disc.querySelectorAll('ol > li').length).toBe(5);
  expect(body).toContain('torch, hex keys, new pads');
  expect(body).toContain(C.careTime(20, 20));
  expect(body).toContain('Yourself if you have done it before; otherwise shop');
  expect(body).toContain(C.careUnsure);
  const lube = tasks().find((d) => d.dataset.id === 'chain-lube')!;
  expect(lube.textContent).not.toContain(C.careUnsure);
  expect(lube.textContent).toContain(C.careAlsoWet);
});

test('[BC-FILTER] a filter keeps the section order and shows only that part; one at a time; a second tap clears it', async () => {
  await mount(world([]));
  const group = host.querySelector('.care-filters')!;
  expect(group.getAttribute('role')).toBe('group');
  expect(group.getAttribute('aria-label')).toBe(C.careFiltersLabel);
  await click(filter(PART_LABEL.brakes));
  expect(filter(PART_LABEL.brakes).getAttribute('aria-pressed')).toBe('true');
  expect(taskIds()).toEqual(CARE_TASKS.filter((t) => t.part === 'brakes').map((t) => t.id));
  expect(headings()).toEqual([SECTION_LABEL.week]);
  await click(filter(PART_LABEL.tyres));
  expect(filter(PART_LABEL.brakes).getAttribute('aria-pressed')).toBe('false');
  expect(taskIds()).toEqual(['tyres-sealant-topup']);
  await click(filter(PART_LABEL.tyres));
  expect(filter(PART_LABEL.tyres).getAttribute('aria-pressed')).toBe('false');
  expect(taskIds()).toEqual(CARE_TASKS.map((t) => t.id));
});

test('[BC-NONE-MATCH] a filter and a search together show only tasks matching both; with none, "Nothing matches" and one button that clears both', async () => {
  await mount(world([]));
  await click(filter(PART_LABEL.brakes));
  await type('squeak');
  expect(taskIds()).toEqual(['brakes-pads-disc', 'brakes-pads-rim']);
  await type('lube');
  expect(taskIds()).toEqual([]);
  expect(host.textContent).toContain(C.careNothing);
  expect(headings()).toEqual([]);
  const clear = [...host.querySelectorAll('button')].filter((b) => b.textContent === C.careClear);
  expect(clear.length).toBe(1);
  await click(clear[0]!);
  expect(search().value).toBe('');
  expect(filter(PART_LABEL.brakes).getAttribute('aria-pressed')).toBe('false');
  expect(taskIds()).toEqual(CARE_TASKS.map((t) => t.id));
  expect(document.activeElement).toBe(search());
  // the search box is labelled
  expect(host.querySelector(`label[for="care-search"]`)!.textContent).toBe(C.careSearchLabel);
});

test('[BC-TELL-US] shown with a Not sure detail, leading to the bike\'s details with back=care; hidden when all are answered and with no bike', async () => {
  const mem = world([bike('bike_a', 'Gravel', { brakes: 'rim' })]);
  await mount(mem);
  expect(tellUs()?.getAttribute('href')).toBe(bikeDetailsHref('bike_a', 'care'));
  expect(tellUs()!.closest('p')!.classList.contains('muted')).toBe(true);
  expect(host.querySelectorAll('a').length).toBeGreaterThan(0);
  render(null, host);
  await mount(world([bike('bike_a', 'Gravel', ANSWERED)]));
  expect(tellUs()).toBeNull();
  // fitted: rim brakes, tubes, a derailleur, no suspension, no motor
  expect(taskIds()).toEqual(['brakes-pads-rim', 'wheels-spokes-check', 'frame-bolts-check', 'chain-lube']);
  expect(host.querySelectorAll('summary .muted').length).toBe(0);
  render(null, host);
  await mount(world([]));
  expect(tellUs()).toBeNull();
  render(null, host);
  // No bike chosen while bikes are saved: no line, every task with tags
  await mount(world([bike('bike_a', 'Gravel', { brakes: 'rim' })], { [BIKE_CHOICE_KEY]: choice(null) }));
  expect(tellUs()).toBeNull();
  expect(taskIds()).toEqual(CARE_TASKS.map((t) => t.id));
});

test('[BC-TELL-US] the list fits the chosen bike, not the first one', async () => {
  const a = bike('bike_a', 'Gravel', ANSWERED);
  const b = bike('bike_b', 'Trail', { brakes: 'hydraulic-disc', tyres: 'tubeless', suspension: 'full', drive: 'derailleur', shifting: 'cable', look: { colour: null, bars: 'flat', ebike: false } });
  await mount(world([a, b], { [BIKE_CHOICE_KEY]: choice('bike_b') }));
  expect(taskIds()).toEqual(['brakes-pads-disc', 'wheels-spokes-check', 'frame-bolts-check', 'chain-lube', 'tyres-sealant-topup', 'susp-fork-service']);
  expect(host.querySelector<HTMLSelectElement>('#tools-bike')!.value).toBe('bike_b');
});

test('[BC-BIKE-GONE] the chosen bike deleted in another tab: the list refits to the fallback, nothing throws, nothing is written', async () => {
  const a = bike('bike_a', 'Gravel', ANSWERED);
  const b = bike('bike_b', 'Trail', { brakes: 'hydraulic-disc' });
  const mem = world([a, b], { [BIKE_CHOICE_KEY]: choice('bike_b') });
  await mount(mem);
  expect(taskIds()).toContain('brakes-pads-disc');
  // the bag planner, in another tab, deletes Trail
  mem.data.set('loadcheck:bikeProfiles', JSON.stringify([a]));
  await act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'loadcheck:bikeProfiles' })); });
  expect(taskIds()).toEqual(['brakes-pads-rim', 'wheels-spokes-check', 'frame-bolts-check', 'chain-lube']);
  expect(mem.writes).toEqual([]);
});

test('[BC-SCREEN] using the screen writes nothing: tabs, filters, search and opening tasks', async () => {
  const mem = world([bike('bike_a', 'Gravel')]);
  await mount(mem);
  await click(filter(PART_LABEL.chain));
  await type('oil');
  await click(tasks()[0]!.querySelector('summary')!);
  await key(tab(C.careTabCare), 'ArrowRight');
  expect(mem.writes).toEqual([]);
  // the back link goes to Tools, and the title is the screen's h2
  expect(host.querySelector('a[href="#/tools"]')!.textContent).toBe(C.careBack);
  expect(host.querySelector('h2')!.textContent).toBe(C.careTitle);
});

test('[BC-FROM-YOU] #/tools/care is a screen (a ?bike= after it too); Tools has a Bike care card; each bike in You has Care for this bike', async () => {
  const { screenFromHash } = await import('../../../../src/ui/nav.ts');
  expect(screenFromHash('#/tools/care', 'trip')).toBe('tools/care');
  expect(screenFromHash('#/tools/care?bike=bike_b', 'trip')).toBe('tools/care');
  const { CL } = await import('../../../../src/core/wording/en-care-link.ts');
  const { toolHref } = await import('../../../../src/ui/tools/bike-link.ts');
  const { ToolsScreen } = await import('../../../../src/ui/tools/tools.tsx');
  const mem = world([bike('bike_a', 'Gravel'), bike('bike_b', 'Trail')]);
  await act(() => { render(<ToolsScreen services={services(mem)} />, host); });
  const card = [...host.querySelectorAll('section.card')].find((s) => s.querySelector('h2')?.textContent === CL.careCardTitle)!;
  expect(card.querySelector('a')!.getAttribute('href')).toBe('#/tools/care');
  render(null, host);
  const { bikeSource } = await import('../../../../src/ui/bike/live.ts');
  const { normaliseBike } = await import('../../../../src/core/bike/normalise.ts');
  const { BikesCards } = await import('../../../../src/ui/you/bikes.tsx');
  const records = [bike('bike_a', 'Gravel'), bike('bike_b', 'Trail')].map((b) => normaliseBike(b)!);
  bikeSource.value = { bike: null, bikes: records, summary: null, known: ['bike_a', 'bike_b'] };
  await act(() => { render(<BikesCards />, host); });
  const links = [...host.querySelectorAll('a')].filter((a) => a.textContent?.startsWith(CL.careForBike));
  expect(links.map((a) => a.getAttribute('href'))).toEqual([toolHref('tools/care', 'bike_a'), toolHref('tools/care', 'bike_b')]);
  expect(links[1]!.textContent).toBe(`${CL.careForBike} Trail`);
});

test('[BC-BIKE-GONE] switching bike on the screen\'s own bike line refits the list at once, rim to disc and back (review of PR 58, I4)', async () => {
  const a = bike('bike_a', 'Gravel', ANSWERED);
  const b = bike('bike_b', 'Trail', { ...ANSWERED, brakes: 'hydraulic-disc' });
  const mem = world([a, b], { [BIKE_CHOICE_KEY]: choice('bike_a') });
  await mount(mem);
  expect(taskIds()).toContain('brakes-pads-rim');
  expect(taskIds()).not.toContain('brakes-pads-disc');
  const select = host.querySelector<HTMLSelectElement>('#tools-bike')!;
  await act(() => { select.value = 'bike_b'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(taskIds()).toContain('brakes-pads-disc');
  expect(taskIds()).not.toContain('brakes-pads-rim');
  await act(() => { select.value = 'bike_a'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(taskIds()).toContain('brakes-pads-rim');
  expect(taskIds()).not.toContain('brakes-pads-disc');
  // the one write is Wayfinch's own choice record
  expect([...new Set(mem.writes)]).toEqual([BIKE_CHOICE_KEY]);
});

test('[BC-SCREEN] every rendered task says "If unsure, a shop." exactly when it is critical (review of PR 58, M1)', async () => {
  await mount(world([]));
  expect(tasks().length).toBe(CARE_TASKS.length);
  for (const d of tasks()) {
    const t = CARE_TASKS.find((x) => x.id === d.dataset.id)!;
    expect(d.textContent!.includes(C.careUnsure), t.id).toBe(t.critical);
  }
  expect(CARE_TASKS.filter((t) => t.critical).length).toBeGreaterThanOrEqual(4);
});

test('[BC-TELL-US] a single-speed bike sees hub gear oil once, tagged "If your hub has gears"; a hub-gear bike on cables sees it untagged (coordinator\'s ruling R3)', async () => {
  await mount(world([bike('bike_a', 'Fixie', { ...ANSWERED, drive: 'chain-hub', shifting: 'none' })]));
  const oil = () => tasks().find((d) => d.dataset.id === 'gears-hub-oil');
  expect(oil()!.querySelector('summary .muted')!.textContent).toBe('If your hub has gears');
  render(null, host);
  await mount(world([bike('bike_a', 'Town', { ...ANSWERED, drive: 'chain-hub', shifting: 'cable' })]));
  expect(oil()).toBeDefined();
  expect(oil()!.querySelector('summary .muted')).toBeNull();
});
