// @vitest-environment jsdom
// The Bike care screen (sub-project 12, Task 4): tabs, the part filters, search with no match, the "Tell us" line, and a bike deleted in
// another tab. It writes nothing.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { C, CARE_TASKS, CARRY, PART_LABEL, ROAD_CARDS, SECTION_LABEL, SECTIONS, TAG_LABEL } from '../../../../src/core/wording/en-care.ts';
import { CL } from '../../../../src/core/wording/en-care-link.ts';
import { ALL_STEPS_KEY } from '../../../../src/tools/care/steps.tsx';
import { careDetails } from '../../../../src/core/care/fit.ts';
import { stepsShown } from '../../../../src/core/care/lines.ts';
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
afterEach(() => { render(null, host); vi.restoreAllMocks(); });
beforeEach(() => {
  go('tools/care');
  localStorage.clear();
  // the step view's Close takes its history entry back; here that is only counted
  vi.spyOn(history, 'back').mockImplementation(() => {});
});

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

// Since the review of PR 72 (I4) a task or card in the list is one button that opens its step view; its words are there.
const tasks = () => [...host.querySelectorAll<HTMLElement>('.care-task')];
const taskIds = () => tasks().map((d) => d.dataset.id!);
const headings = () => [...host.querySelectorAll('h3')].map((h) => h.textContent);
const tab = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent === name)!;
const filter = (part: string) => [...host.querySelectorAll<HTMLButtonElement>('.care-filters button')].find((b) => b.textContent === part)!;
const search = () => host.querySelector<HTMLInputElement>('#care-search')!;
const type = async (text: string) => { await act(() => { search().value = text; search().dispatchEvent(new Event('input', { bubbles: true })); }); };
const click = async (el: HTMLElement) => { await act(() => { el.click(); }); };
const key = async (el: HTMLElement, k: string) => { await act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }); };
/** The tasks a bike's details show, from the content's own conditions: a Not sure (null) detail keeps a task, a value in its list keeps it, anything else hides it. Written here, not a call to fit.ts. */
const oracle = (d: Record<string, string | null>): string[] => CARE_TASKS.filter((t) => Object.entries(t.applies).every(([k, vals]) => d[k] === null || (vals as string[]).includes(d[k]!))).map((t) => t.id);
const ANSWERED_DETAILS = { brakes: 'rim', tyres: 'tubes', drive: 'chain', gears: 'derailleur', shifting: 'cable', suspension: 'none', ebike: 'no' };
const TRAIL_DETAILS = { brakes: 'hydraulic-disc', tyres: 'tubeless', drive: 'chain', gears: 'derailleur', shifting: 'cable', suspension: 'full', ebike: 'no' };
/** A task's or card's words, read from its step view in All steps, which is then closed. */
async function stepsOf(item: HTMLElement): Promise<{ text: string; steps: string[] }> {
  localStorage.setItem(ALL_STEPS_KEY, '1');
  await click(item.querySelector<HTMLElement>('.care-open')!);
  const d = host.querySelector('dialog.care-steps')!;
  const out = { text: d.textContent!, steps: [...d.querySelectorAll('.care-step-all .care-step-t')].map((x) => x.textContent!) };
  await click([...d.querySelectorAll<HTMLElement>('button')].find((b) => b.getAttribute('aria-label') === C.careStepsClose)!);
  expect(host.querySelector('dialog.care-steps')).toBeNull();
  return out;
}
// Since sweep 2 of 15 Nov 2026 (#4) the line names the details that are Not sure, so it is found by its place; its words are checked where it shows.
const tellUs = () => host.querySelector<HTMLAnchorElement>('.care-tell a');

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
  expect(panel(tab(C.careTabRoad)).querySelectorAll('.care-road').length).toBe(ROAD_CARDS.length);
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

test('[BC-TABS] with no bike every task shows, each an h3 section in design order, a task a button with its name and tags that opens its steps', async () => {
  await mount(world([]));
  expect(taskIds()).toEqual(CARE_TASKS.map((t) => t.id));
  const order = SECTIONS.filter((s) => CARE_TASKS.some((t) => t.section === s)).map((s) => SECTION_LABEL[s]);
  expect(headings()).toEqual(order);
  const disc = tasks().find((d) => d.dataset.id === 'brakes-pads-disc')!;
  expect(disc.querySelector('.care-open')!.textContent).toContain('Check the disc brake pads and replace if worn');
  expect(disc.querySelector('.care-open .muted')!.textContent).toBe('if you have disc brakes');
  // opened: signs, its steps, tools and time, who, and the shop line for a critical task
  const { text: body, steps } = await stepsOf(disc);
  expect(body).toContain(C.careSigns);
  expect(steps.length).toBe(5);
  expect(body).toContain('torch, hex keys, new pads');
  expect(body).toContain(C.careTime(20, 20));
  expect(body).toContain('Yourself if you have done it before; otherwise shop');
  expect(body).toContain(C.careUnsure);
  const lube = (await stepsOf(tasks().find((d) => d.dataset.id === 'chain-lube')!)).text;
  expect(lube).not.toContain(C.careUnsure);
  expect(lube).toContain(C.careAlsoWet);
});

test('[BC-FILTER] a filter keeps the section order and shows only that part; one at a time; a second tap clears it', async () => {
  await mount(world([]));
  const group = host.querySelector('.care-filters')!;
  expect(group.getAttribute('role')).toBe('group');
  expect(group.getAttribute('aria-label')).toBe(C.careFiltersLabel);
  await click(filter(PART_LABEL.brakes));
  expect(filter(PART_LABEL.brakes).getAttribute('aria-pressed')).toBe('true');
  expect(taskIds()).toEqual(CARE_TASKS.filter((t) => t.part === 'brakes').map((t) => t.id));
  const brakeSections = SECTIONS.filter((x) => CARE_TASKS.some((t) => t.part === 'brakes' && t.section === x)).map((x) => SECTION_LABEL[x]);
  expect(brakeSections.length).toBeGreaterThan(3);
  expect(headings()).toEqual(brakeSections);
  await click(filter(PART_LABEL.tyres));
  expect(filter(PART_LABEL.brakes).getAttribute('aria-pressed')).toBe('false');
  expect(taskIds()).toEqual(['tyres-pressure', 'tyres-sealant-check', 'tyres-sealant-topup', 'tyres-replace']);
  await click(filter(PART_LABEL.tyres));
  expect(filter(PART_LABEL.tyres).getAttribute('aria-pressed')).toBe('false');
  expect(taskIds()).toEqual(CARE_TASKS.map((t) => t.id));
});

test('[BC-NONE-MATCH] a filter and a search together show only tasks matching both; with none, "Nothing matches" and one button that clears both', async () => {
  await mount(world([]));
  await click(filter(PART_LABEL.brakes));
  await type('squeak');
  expect(taskIds()).toEqual(['brakes-pads-disc', 'brakes-pads-rim', 'brakes-squeal']);
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
  expect(taskIds()).toEqual(oracle(ANSWERED_DETAILS));
  for (const id of ['brakes-pads-rim', 'brakes-rim-wipe', 'chain-lube', 'gears-cables-look', 'gears-indexing', 'tyres-pressure']) expect(taskIds(), id).toContain(id);
  for (const id of ['brakes-pads-disc', 'brakes-hydraulic-bleed', 'tyres-sealant-topup', 'belt-inspect', 'gears-hub-oil', 'susp-fork-service', 'ebike-service', 'gears-electronic-battery']) expect(taskIds(), id).not.toContain(id);
  // every detail answered carries no tag, but for the kind of rim brake (not a Bike care detail; the owner's ruling of 14 November 2026):
  // the hydraulic rim brake's own task is tagged by its kind until the kind is told
  expect([...host.querySelectorAll('.care-open .muted')].map((e) => e.textContent)).toEqual(['if you have hydraulic rim brakes']);
  render(null, host);
  await mount(world([bike('bike_a', 'Gravel', { ...ANSWERED, rimBrake: 'caliper' })]));
  expect(host.querySelectorAll('.care-open .muted').length).toBe(0);
  render(null, host);
  await mount(world([]));
  expect(tellUs()).toBeNull();
  render(null, host);
  // No bike chosen while bikes are saved: no line, every task with tags
  await mount(world([bike('bike_a', 'Gravel', { brakes: 'rim' })], { [BIKE_CHOICE_KEY]: choice(null) }));
  expect(tellUs()).toBeNull();
  expect(taskIds()).toEqual(CARE_TASKS.map((t) => t.id));
});

// Sweep 2 of 15 Nov 2026, #4: the line names only what is Not sure, by Bike details' own field names; the e-bike alone opens Look.
test('[BC-TELL-US] the line names only the Not sure details; with only the e-bike Not sure it asks for that and opens Bike details at Look', async () => {
  await mount(world([bike('bike_a', 'Gravel', { brakes: 'rim' })]));
  expect(tellUs()!.textContent).toBe("Tell us your tyre setup, drivetrain, shifting, suspension and whether it is an e-bike in Bike details to hide what doesn't apply");
  render(null, host);
  // everything told but the e-bike (the sweep's bike: Look's e-bike is only guessed)
  const { look: _look, ...rest } = ANSWERED;
  void _look;
  await mount(world([bike('bike_a', 'Gravel', rest)]));
  expect(tellUs()!.textContent).toBe('Say whether it is an e-bike (Bike details) to hide e-bike tasks');
  expect(tellUs()!.getAttribute('href')).toBe(bikeDetailsHref('bike_a', 'care', 'look'));
  render(null, host);
  // two details: both named, no e-bike words when that is told
  await mount(world([bike('bike_a', 'Gravel', { ...ANSWERED, tyres: 'unknown', suspension: undefined })]));
  expect(tellUs()!.textContent).toBe("Tell us your tyre setup and suspension in Bike details to hide what doesn't apply");
  expect(tellUs()!.getAttribute('href')).toBe(bikeDetailsHref('bike_a', 'care'));
  render(null, host);
  await mount(world([bike('bike_a', 'Gravel', { ...rest, brakes: 'unknown' })]));
  expect(tellUs()!.textContent).toBe("Tell us your brake type and whether it is an e-bike in Bike details to hide what doesn't apply");
});

test('[BC-FORK-ONLY] with a front fork only, the fork wipe names the fork legs alone, in the list and its steps; a full-suspension or Not sure bike keeps the shock shaft', async () => {
  const wipe = () => tasks().find((d) => d.dataset.id === 'susp-wipe-stanchions')!;
  await mount(world([bike('bike_a', 'Trekking', { ...ANSWERED, suspension: 'front' })]));
  expect(wipe().querySelector('.care-name')!.textContent).toBe('Wipe the fork legs');
  await click(wipe().querySelector<HTMLElement>('.care-open')!);
  expect(host.querySelector('dialog.care-steps .care-steps-name')!.textContent).toBe('Wipe the fork legs');
  render(null, host);
  await mount(world([bike('bike_a', 'Trail', { ...ANSWERED, suspension: 'full' })]));
  expect(wipe().querySelector('.care-name')!.textContent).toBe('Wipe the fork legs and shock shaft');
  render(null, host);
  await mount(world([bike('bike_a', 'Gravel', { brakes: 'rim' })]));
  expect(wipe().querySelector('.care-name')!.textContent).toBe('Wipe the fork legs and shock shaft');
  // the content's own name is unchanged (the draft's words)
  expect(CARE_TASKS.find((t) => t.id === 'susp-wipe-stanchions')!.name).toBe('Wipe the fork legs and shock shaft');
});

// Review of PR 160, m-2: under Show all a task that fits the bike opens as for the bike, so the list names it so too.
test('[BC-FORK-ONLY] under Show all, the fork wipe on a front-fork bike has the same name in the list and its steps', async () => {
  const wipe = () => tasks().find((d) => d.dataset.id === 'susp-wipe-stanchions')!;
  await mount(world([bike('bike_a', 'Trekking', { ...ANSWERED, suspension: 'front' })]));
  await click(host.querySelector<HTMLElement>('.care-fit button')!);
  expect(host.querySelector('.care-fit button')!.textContent).toBe(C.careFitMine);
  const listed = wipe().querySelector('.care-name')!.textContent;
  await click(wipe().querySelector<HTMLElement>('.care-open')!);
  expect(host.querySelector('dialog.care-steps .care-steps-name')!.textContent).toBe(listed);
  expect(listed).toBe('Wipe the fork legs');
});

test('[BC-TELL-US] the list fits the chosen bike, not the first one', async () => {
  const a = bike('bike_a', 'Gravel', ANSWERED);
  const b = bike('bike_b', 'Trail', { brakes: 'hydraulic-disc', tyres: 'tubeless', suspension: 'full', drive: 'derailleur', shifting: 'cable', look: { colour: null, bars: 'flat', ebike: false } });
  await mount(world([a, b], { [BIKE_CHOICE_KEY]: choice('bike_b') }));
  expect(taskIds()).toEqual(oracle(TRAIL_DETAILS));
  for (const id of ['brakes-pads-disc', 'brakes-hydraulic-bleed', 'tyres-sealant-topup', 'susp-shock-service', 'susp-fork-service']) expect(taskIds(), id).toContain(id);
  for (const id of ['brakes-pads-rim', 'brakes-cable-disc-service', 'belt-tension']) expect(taskIds(), id).not.toContain(id);
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
  expect(taskIds()).toEqual(oracle(ANSWERED_DETAILS));
  expect(taskIds()).not.toContain('brakes-hydraulic-bleed');
  expect(mem.writes).toEqual([]);
});

test('[BC-SCREEN] using the screen writes nothing: tabs, filters, search and opening tasks', async () => {
  const mem = world([bike('bike_a', 'Gravel')]);
  await mount(mem);
  await click(filter(PART_LABEL.chain));
  await type('oil');
  await stepsOf(tasks()[0]!);
  await key(tab(C.careTabCare), 'ArrowRight');
  expect(mem.writes).toEqual([]);
  // no Back button above the title (owner, 9 Nov 2026: the bottom bar's Tools goes back); the title is the screen's h2
  expect(host.querySelector('a[href="#/tools"]')).toBeNull();
  expect(host.querySelector('h2')!.textContent).toBe(C.careTitle);
});

test('[BC-SCREEN] opening the screen puts the focus on its title', async () => {
  await mount(world([bike('bike_a', 'Gravel')]));
  expect(document.activeElement).toBe(host.querySelector('h2'));
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
    expect((await stepsOf(d)).text.includes(C.careUnsure), t.id).toBe(t.critical);
  }
  expect(CARE_TASKS.filter((t) => t.critical).length).toBeGreaterThanOrEqual(4);
});

test('[BC-TELL-US] a single-speed bike sees hub gear oil once, tagged "If your hub has gears"; a hub-gear bike on cables sees it untagged (coordinator\'s ruling R3)', async () => {
  await mount(world([bike('bike_a', 'Fixie', { ...ANSWERED, drive: 'chain-hub', shifting: 'none' })]));
  const oil = () => tasks().find((d) => d.dataset.id === 'gears-hub-oil');
  expect(oil()!.querySelector('.care-open .muted')!.textContent).toBe('If your hub has gears');
  render(null, host);
  await mount(world([bike('bike_a', 'Town', { ...ANSWERED, drive: 'chain-hub', shifting: 'cable' })]));
  expect(oil()).toBeDefined();
  expect(oil()!.querySelector('.care-open .muted')).toBeNull();
});

// ---- Roadside repairs and What to carry (sub-project 12, group 3: Tasks 6 and 7) ----
const road = () => [...host.querySelectorAll<HTMLElement>('.care-road')];
const roadIds = () => road().map((d) => d.dataset.id!);
const carry = () => [...host.querySelectorAll<HTMLElement>('.care-carry li')];
const carryIds = () => carry().map((li) => li.dataset.id!);
const hits = () => [...host.querySelectorAll<HTMLButtonElement>('.care-road-hit')];
const openRoad = async () => { await click(tab(C.careTabRoad)); };
/** A bike on tubeless tyres, hydraulic discs, a motor and a derailleur on cables. */
const TRAIL = { ...ANSWERED, brakes: 'hydraulic-disc', tyres: 'tubeless', suspension: 'full', look: { colour: null, bars: 'flat', ebike: true } };

test("[BC-ROAD] with no bike the Roadside tab lists every card in the draft's order, each with Check first, numbered steps, Ride on?, what to carry, and the shop line only on a critical card", async () => {
  await mount(world([]));
  await openRoad();
  expect(roadIds()).toEqual(ROAD_CARDS.map((c) => c.id));
  for (const d of road()) {
    const c = ROAD_CARDS.find((x) => x.id === d.dataset.id)!;
    expect(d.querySelector('.care-open')!.textContent, c.id).toContain(c.problem);
    const { text: body, steps } = await stepsOf(d);
    expect(body, c.id).toContain(`${C.careRoadCheckFirst}: ${c.checkFirst}`);
    // with no bike, brakes are Not sure: every line shows, a disc line before a rim line (care pictures redo, T9)
    expect(steps, c.id).toEqual(stepsShown(c.id, c.steps.length, careDetails(null)).map((i) => c.steps[i]));
    expect(body, c.id).toContain(C.careRideOn);
    expect(body, c.id).toContain(c.rideOn);
    expect(body, c.id).toContain(C.careRoadCarry);
    for (const id of c.carry) expect(body, `${c.id} ${id}`).toContain(CARRY.find((x) => x.id === id)!.name);
    expect(body.includes(C.careUnsure), c.id).toBe(c.critical);
  }
  // the first tab's tasks are not in this panel
  expect(host.querySelectorAll('#care-panel-road .care-task').length).toBe(0);
});

test("[BC-CARRY] at the bottom of the Roadside tab, What to carry is a plain list of every item with no bike, in the content's order, tagged when it depends on a Not sure detail; no ticks", async () => {
  await mount(world([]));
  await openRoad();
  expect(carryIds()).toEqual(CARRY.map((c) => c.id));
  carry().forEach((li, i) => expect(li.textContent!.startsWith(CARRY[i]!.name), CARRY[i]!.id).toBe(true));
  const panel = host.querySelector('#care-panel-road')!;
  expect([...panel.querySelectorAll('h3')].map((x) => x.textContent)).toEqual([C.careRoadHeading, C.careCarryTitle]);
  // a heading comes before the first card (review of PR 59, M5)
  expect(panel.querySelector('h3')!.compareDocumentPosition(road()[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const list = host.querySelector('.care-carry')!;
  expect(list.tagName).toBe('UL');
  // below the cards
  expect(road().at(-1)!.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(host.querySelectorAll('.care-carry input, .care-carry button').length).toBe(0);
  // each conditioned item is tagged with its Not sure details
  expect(carry().find((li) => li.dataset.id === 'carry-plug-kit')!.querySelector('.muted')!.textContent).toBe('if you have tubeless tyres');
  expect(carry().find((li) => li.dataset.id === 'carry-spare-tube')!.querySelector('.muted')!.textContent).toBe('if you have inner tubes or tubeless tyres');
  expect(carry().find((li) => li.dataset.id === 'carry-tyre-levers')!.querySelector('.muted')).toBeNull();
});

test('[BC-CARRY] a tube bike lists a spare tube, levers and a patch kit and no plugs; a tubeless bike lists plugs and a knife and no patch kit; a motor adds the charger', async () => {
  await mount(world([bike('bike_a', 'Gravel', ANSWERED)]));
  await openRoad();
  expect(carryIds()).toEqual(['carry-spare-tube', 'carry-tyre-levers', 'carry-pump', 'carry-patch-kit', 'carry-tyre-boot', 'carry-quick-link', 'carry-chain-tool', 'carry-multi-tool', 'carry-zip-ties', 'carry-spoke-key', 'carry-cloth']);
  expect(carry().every((li) => li.querySelector('.muted') === null)).toBe(true);
  expect(roadIds()).toEqual(['puncture-tube', 'chain-broken', 'spoke-snapped', 'brake-rub-rim', 'brake-weak-rim', 'gears-skipping', 'bolt-loose', 'tyre-torn']);
  render(null, host);
  await mount(world([bike('bike_t', 'Trail', TRAIL)]));
  await openRoad();
  expect(carryIds()).toEqual(['carry-spare-tube', 'carry-tyre-levers', 'carry-pump', 'carry-plug-kit', 'carry-knife', 'carry-tyre-boot', 'carry-quick-link', 'carry-chain-tool', 'carry-multi-tool', 'carry-zip-ties', 'carry-spoke-key', 'carry-cloth', 'carry-charger']);
  expect(roadIds()).toEqual(['puncture-tubeless', 'chain-broken', 'spoke-snapped', 'brake-rub-disc', 'brake-weak-disc', 'gears-skipping', 'bolt-loose', 'tyre-torn', 'ebike-no-power']);
});

test("[BC-ROAD] a card that depends on a Not sure detail carries its tag; the screen's own bike line refits the cards and the carry list at once", async () => {
  const a = bike('bike_a', 'Gravel', ANSWERED);
  const b = bike('bike_b', 'Trail', TRAIL);
  const mem = world([a, b, bike('bike_u', 'Old one', {})], { [BIKE_CHOICE_KEY]: choice('bike_a') });
  await mount(mem);
  await openRoad();
  expect(roadIds()).toContain('puncture-tube');
  expect(roadIds()).not.toContain('puncture-tubeless');
  const select = host.querySelector<HTMLSelectElement>('#tools-bike')!;
  await act(() => { select.value = 'bike_b'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(roadIds()).toContain('puncture-tubeless');
  expect(roadIds()).not.toContain('puncture-tube');
  expect(carryIds()).toContain('carry-plug-kit');
  expect(carryIds()).not.toContain('carry-patch-kit');
  expect(roadIds()).toContain('ebike-no-power');
  // an old bike with nothing told: every card, each conditioned one tagged; its 30 mm tyres make it a road bike, which sorts the cards
  // usual on a road bike first, the tubeless puncture after them (bike view design 4, the owner's answer 5 (a)): none is hidden
  await act(() => { select.value = 'bike_u'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect([...roadIds()].sort()).toEqual(ROAD_CARDS.map((c) => c.id).sort());
  expect(roadIds()).toEqual([...ROAD_CARDS.map((c) => c.id).filter((id) => id !== 'puncture-tubeless'), 'puncture-tubeless']);
  expect(road().find((d) => d.dataset.id === 'puncture-tube')!.querySelector('.care-open .muted')!.textContent).toBe('if you have inner tubes');
  expect(road().find((d) => d.dataset.id === 'bolt-loose')!.querySelector('.care-open .muted')).toBeNull();
  expect(road().find((d) => d.dataset.id === 'brake-rub-disc')!.querySelector('.care-open .muted')!.textContent).toBe('if you have disc brakes');
});

test('[BC-ROAD-SEARCH] "puncture" in the Care tab lists both puncture cards under "Roadside repairs", below the Care results; with no query no cards show', async () => {
  await mount(world([]));
  expect(hits().length).toBe(0);
  expect(headings()).not.toContain(C.careTabRoad);
  await type('puncture');
  expect(hits().map((h) => h.textContent)).toEqual(['Puncture (inner tube)', 'Puncture (tubeless)']);
  expect(headings().at(-1)).toBe(C.careTabRoad);
  expect(host.querySelector('.care-road-results h3')!.textContent).toBe(C.careTabRoad);
  expect(host.querySelector('[role="status"]')!.textContent).toBe(C.careFoundBoth(taskIds().length, 2));
  // the card list follows the bike: a tube bike finds only its own card
  render(null, host);
  await mount(world([bike('bike_a', 'Gravel', ANSWERED)]));
  await type('puncture');
  expect(hits().map((h) => h.textContent)).toEqual(['Puncture (inner tube)']);
});

test('[BC-ROAD-SEARCH] every form of a word finds the same cards as the plain word on the screen: "punctures", "Punctured", "  PUNCTURE "', async () => {
  await mount(world([]));
  await type('puncture');
  const plain = hits().map((h) => h.textContent);
  expect(plain.length).toBe(2);
  for (const q of ['punctures', 'Punctured', '  PUNCTURE ', 'puncturé']) {
    await type(q);
    expect(hits().map((h) => h.textContent), q).toEqual(plain);
  }
});

test('[BC-ROAD-SEARCH] the part filter limits the cards too; a filter and a search that match nothing say "Nothing matches" once, and cards alone are not "Nothing"', async () => {
  await mount(world([]));
  await type('puncture');
  await click(filter(PART_LABEL.tyres));
  expect(hits().length).toBe(2);
  expect(host.textContent).not.toContain(C.careNothing);
  await click(filter(PART_LABEL.brakes));
  expect(hits().length).toBe(0);
  expect(host.textContent).toContain(C.careNothing);
  expect([...host.querySelectorAll('button')].filter((b) => b.textContent === C.careClear).length).toBe(1);
});

test("[BC-ROAD-SEARCH] a tap on a card in the Care results opens the Roadside tab and that card's step view; closed, focus is on that card", async () => {
  await mount(world([]));
  await type('puncture');
  await click(hits().find((h) => h.textContent === 'Puncture (tubeless)')!);
  expect(tab(C.careTabRoad).getAttribute('aria-selected')).toBe('true');
  const d = host.querySelector('dialog.care-steps')!;
  expect(host.querySelector(`#${d.getAttribute('aria-labelledby')}`)!.textContent).toBe('Puncture (tubeless)');
  await click([...d.querySelectorAll<HTMLElement>('button')].find((b) => b.getAttribute('aria-label') === C.careStepsClose)!);
  const card = road().find((x) => x.dataset.id === 'puncture-tubeless')!;
  expect(document.activeElement).toBe(card.querySelector('.care-open'));
});

test('[BC-ROAD] using the Roadside tab writes nothing: opening cards, switching tabs, searching for a card', async () => {
  const mem = world([bike('bike_a', 'Gravel')]);
  await mount(mem);
  await type('puncture');
  await click(hits()[0]!);
  await stepsOf(road()[0]!);
  await click(tab(C.careTabCare));
  await openRoad();
  expect(mem.writes).toEqual([]);
});

test('[BC-ROAD-SEARCH] with no bike, each search hit carries its tag beside it: the tubeless hit says "if you have tubeless tyres" (review of PR 59, M4)', async () => {
  await mount(world([]));
  await type('puncture');
  const line = (name: string) => hits().find((h) => h.textContent === name)!.closest('li')!;
  expect(line('Puncture (tubeless)').querySelector('.muted')!.textContent).toBe('if you have tubeless tyres');
  expect(line('Puncture (inner tube)').querySelector('.muted')!.textContent).toBe('if you have inner tubes');
});

test("[BV-ORDER] on a road bike (30 mm tyres, nothing else told) the cards and tasks usual on road bikes come first; the others follow, greyed, still buttons, said in words; with no bike nothing is greyed", async () => {
  await mount(world([bike('bike_u', 'Old one', {})]));
  // Care: within its section, a tubeless task after the others, greyed
  const sealant = tasks().find((d) => d.dataset.id === 'tyres-sealant-check')!;
  expect(sealant.classList.contains('care-other-type')).toBe(true);
  expect(sealant.querySelector('.care-open')!.tagName).toBe('BUTTON');
  expect(sealant.querySelector('.visually-hidden')!.textContent).toBe(` (${C.careLessUsual('road')})`);
  const month = taskIds().filter((id) => CARE_TASKS.find((t) => t.id === id)!.section === 'month');
  expect(month.indexOf('tyres-sealant-check')).toBeGreaterThan(month.indexOf('wheels-hubs-check'));
  expect(tasks().find((d) => d.dataset.id === 'chain-lube')!.classList.contains('care-other-type')).toBe(false);
  // Roadside: the tubeless puncture last, greyed
  await openRoad();
  expect(roadIds().at(-1)).toBe('puncture-tubeless');
  expect(road().at(-1)!.classList.contains('care-other-type')).toBe(true);
  expect(road().filter((d) => d.classList.contains('care-other-type')).length).toBe(1);
  render(null, host);
  await mount(world([]));
  expect(host.querySelectorAll('.care-other-type').length).toBe(0);
  await openRoad();
  expect(host.querySelectorAll('.care-other-type').length).toBe(0);
});

// The live-site sweep of 14 November 2026, item 45: no task says its condition twice, and no name contradicts its section.
test('[BC-TAGS-ONCE] with nothing told, hub gear oil says its condition once ("If your hub has gears"), not "if you have hub gears or a single speed" beside it; the soft tag still stands alone when only the shifter is Not sure', async () => {
  const oil = () => tasks().find((d) => d.dataset.id === 'gears-hub-oil')!.querySelector('.care-open .muted')!.textContent;
  await mount(world([]));
  expect(oil()).toBe('If your hub has gears');
  render(null, host);
  await mount(world([bike('bike_a', 'Unsure', {})]));
  expect(oil()).toBe('If your hub has gears');
  render(null, host);
  // the shifter told (cables), the gears not: the gears tag alone
  await mount(world([bike('bike_a', 'Cables', { shifting: 'cable' })]));
  expect(oil()).toBe(TAG_LABEL('gears', ['hub']));
  render(null, host);
  await mount(world([bike('bike_a', 'Hub', { drive: 'chain-hub' })]));
  expect(oil()).toBe('If your hub has gears');
});

test('[BC-TAGS-ONCE] a task listed under Every month says it is monthly, not only after washes or rain: Lube the chain', async () => {
  const lube = CARE_TASKS.find((t) => t.id === 'chain-lube')!;
  expect(lube.section).toBe('month');
  expect(lube.name).toMatch(/monthly/);
  await mount(world([]));
  const month = [...host.querySelectorAll('.care-section')].find((s) => s.querySelector('h3')!.textContent === SECTION_LABEL.month)!;
  expect(month.querySelector('.care-task[data-id="chain-lube"] .care-name')!.textContent).toBe(lube.name);
});

// ---- What fits your bike (the owner's wish of 14 November 2026) ----
const fitLine = () => host.querySelector<HTMLElement>('.care-fit');
const fitButton = () => fitLine()?.querySelector<HTMLButtonElement>('button') ?? null;
/** Hydraulic discs with mineral oil, electronic gears; nothing else told. */
const HYDRO_E = { brakes: 'hydraulic-disc', brakeFluid: 'mineral', shifting: 'electronic' };

test('[BC-FIT-LINE] a line at the top names what the list fits; Show all shows every card and task, and Fit to my bike brings the fit back; the button keeps the focus; nothing is written', async () => {
  const mem = world([bike('bike_h', 'Hydro', HYDRO_E)]);
  await mount(mem);
  const line = fitLine()!;
  expect(line).not.toBeNull();
  // at the top: before the tabs
  expect(line.compareDocumentPosition(host.querySelector('[role="tablist"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(line.querySelector('.care-fit-text')!.textContent).toBe(C.careFitShowing('hydraulic disc brakes (mineral oil), electronic gears'));
  // the text is a polite live region, so a change is read out
  expect(line.querySelector('.care-fit-text')!.getAttribute('aria-live')).toBe('polite');
  const b = fitButton()!;
  expect(b.textContent).toBe(C.careFitShowAll);
  expect(b.getAttribute('type')).toBe('button');
  const fittedIds = taskIds();
  expect(fittedIds).toContain('brakes-hydraulic-bleed');
  expect(fittedIds).toContain('gears-electronic-battery');
  for (const id of ['brakes-pads-rim', 'brakes-cable-disc-service', 'gears-cables-look']) expect(fittedIds, id).not.toContain(id);
  b.focus();
  await click(b);
  // every task, as with no bike, each conditioned one tagged
  expect(taskIds().sort()).toEqual(CARE_TASKS.map((t) => t.id).sort());
  expect(fitLine()!.querySelector('.care-fit-text')!.textContent).toBe(C.careFitAll);
  expect(fitButton()!.textContent).toBe(C.careFitMine);
  expect(document.activeElement).toBe(fitButton());
  await openRoad();
  expect(roadIds().sort()).toEqual(ROAD_CARDS.map((c) => c.id).sort());
  await click(tab(C.careTabCare));
  await click(fitButton()!);
  expect(taskIds()).toEqual(fittedIds);
  expect(fitLine()!.querySelector('.care-fit-text')!.textContent).toBe(C.careFitShowing('hydraulic disc brakes (mineral oil), electronic gears'));
  expect(document.activeElement).toBe(fitButton());
  expect(mem.writes).toEqual([]);
});

test('[BC-FIT-LINE] Show all is not remembered: the screen opened again fits the bike; no line with no bike, no bike chosen, or nothing told', async () => {
  const mem = world([bike('bike_h', 'Hydro', HYDRO_E)]);
  await mount(mem);
  const keys = (): string[] => Object.keys(localStorage).sort();
  const before = keys();
  await click(fitButton()!);
  expect(fitButton()!.textContent).toBe(C.careFitMine);
  render(null, host);
  await mount(mem);
  expect(fitButton()!.textContent).toBe(C.careFitShowAll);
  expect(taskIds()).not.toContain('brakes-pads-rim');
  // nothing stored for it, in either app's storage
  expect(keys()).toEqual(before);
  expect(mem.writes).toEqual([]);
  for (const m of [world([]), world([bike('bike_h', 'Hydro', HYDRO_E)], { [BIKE_CHOICE_KEY]: choice(null) }), world([bike('bike_u', 'Old one', {})])]) {
    render(null, host);
    await mount(m);
    expect(fitLine()).toBeNull();
  }
});

test('[BC-STEP-WORDS] on screen: the bleed names the bike\'s fluid; under Show all a card that does not fit the bike opens as for no bike, one that fits as for the bike', async () => {
  await mount(world([bike('bike_h', 'Hydro', HYDRO_E)]));
  const bleed = await stepsOf(tasks().find((d) => d.dataset.id === 'brakes-hydraulic-bleed')!);
  expect(bleed.steps.join(' ')).toMatch(/mineral oil, never DOT fluid/);
  // the maker cross-check stays (review of PR 129, m2)
  expect(bleed.steps.join(' ')).toMatch(/Shimano usually uses mineral oil, SRAM usually DOT fluid/);
  await click(fitButton()!);
  // fits the bike: still its own fluid
  expect((await stepsOf(tasks().find((d) => d.dataset.id === 'brakes-hydraulic-bleed')!)).steps.join(' ')).toMatch(/mineral oil, never DOT fluid/);
  // a rim card on this disc bike: every line, as with no bike
  await openRoad();
  const rim = await stepsOf(road().find((d) => d.dataset.id === 'brake-rub-rim')!);
  const card = ROAD_CARDS.find((c) => c.id === 'brake-rub-rim')!;
  expect(rim.steps).toEqual(stepsShown(card.id, card.steps.length, careDetails(null)).map((i) => card.steps[i]!));
});

// The live-site sweep of 14 November 2026, items 44 and 47: the words say what fits depends on (the bike's details) and where the
// "Tell us" link goes (the bag planner's Bike details).
test('[BC-TELL-US] the "Tell us" link says it opens Bike details; the Tools card says the list is fitted to the bike\'s details', async () => {
  await mount(world([bike('bike_a', 'Gravel', { brakes: 'rim' })]));
  expect(tellUs()!.textContent).toMatch(/\bin Bike details\b/);
  expect(tellUs()!.getAttribute('href')).toBe(bikeDetailsHref('bike_a', 'care'));
  expect(CL.careCardBody).toMatch(/fitted to your bike's details/);
});

// The owner's ruling of 14 November 2026: the hydraulic rim brake's spongy lever and electronic gears' adjusting show only for bikes they
// fit, and under Show all. The kind of rim brake not told: the task shows, its tag naming the kind.
const tagOf = (id: string): string | null => host.querySelector(`.care-task[data-id="${id}"] .care-tags`)?.textContent ?? null;
test('[BC-FIT-RIM-KIND] a hydraulic rim brake sees its spongy-lever task, a V-brake not; the kind Not sure tags it "if you have hydraulic rim brakes"; Show all shows it', async () => {
  await mount(world([bike('bike_m', 'Magura', { brakes: 'rim', rimBrake: 'hydraulic', brakeFluid: 'mineral', drive: 'derailleur', shifting: 'electronic' })]));
  expect(taskIds()).toContain('brakes-hydro-rim-spongy');
  expect(taskIds()).toContain('gears-electronic-adjust');
  expect(tagOf('brakes-hydro-rim-spongy')).toBeNull();
  render(null, host);
  await mount(world([bike('bike_v', 'V-brake', { brakes: 'rim', rimBrake: 'v-brake', drive: 'derailleur', shifting: 'cable' })]));
  expect(taskIds()).not.toContain('brakes-hydro-rim-spongy');
  expect(taskIds()).not.toContain('gears-electronic-adjust');
  await click(fitButton()!);
  expect(taskIds()).toContain('brakes-hydro-rim-spongy');
  expect(taskIds()).toContain('gears-electronic-adjust');
  expect(tagOf('brakes-hydro-rim-spongy')).toBe('if you have hydraulic rim brakes');
  render(null, host);
  // opened under Show all on a bike it does not fit (hydraulic discs with DOT fluid): as for no bike, the content's own words, never
  // "Your bike's details say DOT fluid" in a mineral-oil rim brake's steps
  await mount(world([bike('bike_d', 'Disc', { brakes: 'hydraulic-disc', brakeFluid: 'dot' })]));
  expect(taskIds()).not.toContain('brakes-hydro-rim-spongy');
  await click(fitButton()!);
  const task = CARE_TASKS.find((t) => t.id === 'brakes-hydro-rim-spongy')!;
  const opened = await stepsOf(host.querySelector<HTMLElement>('.care-task[data-id="brakes-hydro-rim-spongy"]')!);
  expect(opened.steps).toEqual(task.steps);
  expect(opened.text).not.toMatch(/details say/);
  render(null, host);
  await mount(world([bike('bike_r', 'Rim', { brakes: 'rim' })]));
  expect(taskIds()).toContain('brakes-hydro-rim-spongy');
  expect(tagOf('brakes-hydro-rim-spongy')).toBe('if you have hydraulic rim brakes');
});
