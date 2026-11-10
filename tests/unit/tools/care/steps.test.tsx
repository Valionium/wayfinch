// @vitest-environment jsdom
// Bike care's step view (care pictures design of 7 November 2026, part 1): a card or task full screen, one step at a time, with its picture.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { idsOf, STEP_PICTURES } from '../../../../src/core/care/pictures.ts';
import { KIND_WORDS, stepTitlesFrom, SWITCH_WORDS, type PictureWords } from '../../../../src/core/wording/en-care-pictures.ts';
import CARE_WORDS from '../../../../src/core/wording/en-care-pictures.json';
import { C, CARE_TASKS, CARRY, ROAD_CARDS } from '../../../../src/core/wording/en-care.ts';
import { PART_SHORT } from '../../../../src/core/wording/en-part-names.ts';
import { ALL_STEPS_KEY } from '../../../../src/tools/care/steps.tsx';
import { CareScreen } from '../../../../src/tools/care/ui.tsx';
import { readHost } from '../../../../src/tools/tyre/host.ts';
import type { TyreServices } from '../../../../src/tools/tyre/services.ts';
import type { KeyValueStore } from '../../../../src/tools/tyre/storage.ts';
import { go } from '../../../../src/ui/nav.ts';

const NOW = new Date('2026-11-08T10:00:00Z');
const host = document.createElement('div');
document.body.append(host);

/** A stand-in for the phone's screen wake lock: what was asked for and what was let go. */
const lock: { asked: number; released: number; held: boolean; current: { released: boolean } | null; late: boolean; waiting: (() => void)[] } = { asked: 0, released: 0, held: false, current: null, late: false, waiting: [] };
function fakeWakeLock(): void {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: vi.fn((kind: string) => {
        expect(kind).toBe('screen');
        lock.asked += 1;
        lock.held = true;
        const sentinel = { released: false, release: vi.fn(() => { lock.released += 1; lock.held = false; sentinel.released = true; return Promise.resolve(); }) };
        lock.current = sentinel;
        // late: the phone answers only when the test says so (lock.waiting)
        return lock.late ? new Promise((r) => { lock.waiting.push(() => r(sentinel)); }) : Promise.resolve(sentinel);
      }),
    },
  });
}
/**
 * In the test runner a words file's address is its source file's, or a data address for a small one (the build never inlines: it ships
 * each as a file of its own); the drawings' index (/care-pictures.json, written by the build) points at their source files here.
 */
const PICTURE_WORDS: Record<string, PictureWords> = CARE_WORDS.pictures;
const REPO = process.cwd(); // vitest runs from the repository's root
const INDEX = JSON.stringify(Object.fromEntries(['pictures', 'parts'].flatMap((folder) => readdirSync(join(REPO, 'src', 'tools', 'care', folder))
  .filter((f) => f.endsWith('.svg')).map((f) => [f.slice(0, -4), `/src/tools/care/${folder}/${f}`]))));
const body = (url: string): string => (url === '/care-pictures.json' ? INDEX : url.startsWith('data:')
  ? Buffer.from(url.slice(url.indexOf(',') + 1), 'base64').toString('utf8')
  : readFileSync(join(REPO, url.replace(/\?.*$/, '')), 'utf8'));
beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({ ok: true, text: () => Promise.resolve(body(url)) })));
  go('tools/care');
  await new Promise((r) => setTimeout(r, 0)); // the hash change's own popstate comes and goes first
  // Close takes its history entry back; here that is only counted, so no late popstate reaches the next test.
  vi.spyOn(history, 'back').mockImplementation(() => {});
  localStorage.clear();
  Object.assign(lock, { asked: 0, released: 0, held: false, current: null, late: false, waiting: [] });
  fakeWakeLock();
});
afterEach(() => { render(null, host); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  const kv: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { writes.push(k); data.set(k, v); } };
  return { kv, writes };
};
const services = (kv: KeyValueStore): TyreServices => ({ host: () => readHost(kv, () => null), storage: kv, now: () => NOW });
const mount = async (kv = memory().kv) => { await act(() => { render(<CareScreen services={services(kv)} />, host); }); };
const click = async (el: Element) => { await act(() => { (el as HTMLElement).click(); }); };
const key = async (k: string, mods: KeyboardEventInit = {}) => { await act(() => { dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods })); }); };
/** Lets the picture files the view asked for arrive (each is its own module). */
const settle = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); };
/** Waits until `n` pictures show in the step view (the first load of a module can take a moment in the test runner). */
const shown = async (n: number) => { await vi.waitFor(() => expect(dialog()!.querySelectorAll('.care-steps-body [role="img"]').length).toBe(n), { timeout: 3000 }); };

const dialog = () => host.querySelector<HTMLDialogElement>('dialog.care-steps');
const button = (name: string) => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === name || b.getAttribute('aria-label') === name) ?? null;
const heading = () => dialog()!.querySelector<HTMLElement>('.care-step-h')!;
const counter = () => dialog()!.querySelector('.care-steps-count')!.textContent;
const page = () => dialog()!.querySelector('.care-step')!.textContent!;
const roadTab = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent === C.careTabRoad)!;
/** A tap on the card in the list: the step view opens at once (the owner's wish of 7 November, review of PR 72, I4). */
async function openCard(id: string): Promise<HTMLButtonElement> {
  await click(roadTab());
  const opener = host.querySelector<HTMLButtonElement>(`.care-road[data-id="${id}"] .care-open`)!;
  await click(opener);
  await settle();
  return opener;
}
async function openTask(id: string): Promise<HTMLButtonElement> {
  const opener = host.querySelector<HTMLButtonElement>(`.care-task[data-id="${id}"] .care-open`)!;
  await click(opener);
  await settle();
  return opener;
}
const card = (id: string) => ROAD_CARDS.find((c) => c.id === id)!;

test('[BC-STEPS-OPEN] a roadside card opens full screen: Before you start, each step with "Step n of m", then Ride on?; Back and Next only; Done closes and focus returns', async () => {
  await mount();
  const c = card('puncture-tube');
  const opener = await openCard(c.id);
  const d = dialog()!;
  expect(d.open).toBe(true);
  expect(d.getAttribute('aria-labelledby')).toBeTruthy();
  expect(host.querySelector(`#${d.getAttribute('aria-labelledby')}`)!.textContent).toBe(c.problem);
  // before you start: check first and what to carry; Back hidden
  expect(heading().textContent).toBe(C.careStepsBefore);
  expect(page()).toContain(c.checkFirst);
  for (const id of c.carry) expect(page()).toContain(CARRY.find((x) => x.id === id)!.name);
  expect(button(C.careStepsBack)).toBeNull();
  const bar = d.querySelector('.care-steps-nav')!;
  expect([...bar.querySelectorAll('button')].map((b) => b.textContent)).toEqual([C.careStepsNext]);
  // each step, counted
  for (let i = 0; i < c.steps.length; i += 1) {
    await click(button(C.careStepsNext)!);
    expect(counter()).toBe(C.careStepsCount(i + 1, c.steps.length));
    expect(heading().textContent).toBe(C.careStepN(i + 1));
    expect(page()).toContain(c.steps[i]);
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent)).toEqual([C.careStepsBack, C.careStepsNext]);
    // one progress segment per step, filled up to this one; decoration only
    const segs = [...d.querySelectorAll('.care-steps-progress span')];
    expect(segs.length).toBe(c.steps.length);
    expect(segs.filter((s) => s.classList.contains('on')).length).toBe(i + 1);
    expect(d.querySelector('.care-steps-progress')!.getAttribute('aria-hidden')).toBe('true');
  }
  // the end: Ride on?, Next reads Done
  await click(button(C.careStepsNext)!);
  expect(heading().textContent).toBe(C.careRideOn);
  expect(page()).toContain(c.rideOn);
  expect(page()).not.toContain(C.careUnsure);
  expect(button(C.careStepsNext)).toBeNull();
  // Back goes back a page
  await click(button(C.careStepsBack)!);
  expect(heading().textContent).toBe(C.careStepN(c.steps.length));
  await click(button(C.careStepsNext)!);
  await click(button(C.careStepsDone)!);
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(opener);
  // no swiping: nothing listens for touches
  expect(host.innerHTML).not.toMatch(/ontouch/i);
});

test('[BC-STEPS-OPEN] a critical card ends with "If unsure, a shop."; Close ends it from any step', async () => {
  await mount();
  const opener = await openCard('spoke-snapped');
  await click(button(C.careStepsNext)!);
  await click(button(C.careStepsNext)!);
  expect(counter()).toBe(C.careStepsCount(2, card('spoke-snapped').steps.length));
  await click(button(C.careStepsClose)!);
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(opener);
  await click(opener);
  await settle();
  // it opens at the start again once closed
  expect(heading().textContent).toBe(C.careStepsBefore);
  for (let i = 0; i <= card('spoke-snapped').steps.length; i += 1) await click(button(C.careStepsNext)!);
  expect(page()).toContain(C.careUnsure);
});

test('[BC-STEPS-OPEN] a Care task opens the same way: signs, tools and time first; its note and the shop line, when critical, at the end', async () => {
  await mount();
  const t = CARE_TASKS.find((x) => x.id === 'brakes-pads-disc')!;
  await openTask(t.id);
  expect(host.querySelector(`#${dialog()!.getAttribute('aria-labelledby')}`)!.textContent).toBe(t.name);
  expect(heading().textContent).toBe(C.careStepsBefore);
  expect(page()).toContain(t.signs);
  expect(page()).toContain(t.tools);
  expect(page()).toContain(C.careTime(20, 20));
  for (let i = 0; i < t.steps.length; i += 1) {
    await click(button(C.careStepsNext)!);
    expect(page()).toContain(t.steps[i]);
  }
  await click(button(C.careStepsNext)!);
  expect(heading().textContent).toBe(C.careStepsEnd);
  expect(page()).toContain(C.careUnsure);
  if (t.note) expect(page()).toContain(t.note);
  expect(button(C.careStepsDone)).not.toBeNull();
});

test('[BC-STEPS-KEYS] Right and Left arrows are Next and Back; Escape closes', async () => {
  await mount();
  const opener = await openCard('chain-broken');
  await key('ArrowRight');
  expect(counter()).toBe(C.careStepsCount(1, card('chain-broken').steps.length));
  await key('ArrowRight');
  expect(counter()).toBe(C.careStepsCount(2, card('chain-broken').steps.length));
  await key('ArrowLeft');
  expect(counter()).toBe(C.careStepsCount(1, card('chain-broken').steps.length));
  await key('ArrowLeft');
  await key('ArrowLeft'); // stays on the first page
  expect(heading().textContent).toBe(C.careStepsBefore);
  await key('Escape');
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(opener);
});

test('[BC-STEPS-BACK] opening adds one history entry, steps add none; the back gesture closes it in one go; Close takes the entry back', async () => {
  await mount();
  // the entry is only counted here, so a pop finds the entry before it, as on the phone
  const push = vi.spyOn(history, 'pushState').mockImplementation(() => {});
  const replace = vi.spyOn(history, 'replaceState');
  const back = vi.spyOn(history, 'back').mockImplementation(() => {});
  await openCard('puncture-tube');
  expect(push).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 4; i += 1) await click(button(C.careStepsNext)!);
  expect(push).toHaveBeenCalledTimes(1);
  // the phone's back gesture: the browser pops the entry
  await act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
  expect(dialog()).toBeNull();
  expect(back).not.toHaveBeenCalled();
  // opened again and closed with Close: the entry is taken back once
  await click(host.querySelector('.care-road[data-id="puncture-tube"] .care-open')!);
  await settle();
  expect(push).toHaveBeenCalledTimes(2);
  await click(button(C.careStepsClose)!);
  expect(back).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();
  // the hash, and so the screen, never changes
  expect(location.hash).toBe('#/tools/care');
});

test('[BC-STEPS-SR] focus moves to the heading on every page; a polite live region says "Step n of m"; a picture is one image named and described from the wording', async () => {
  await mount();
  // the first card with a picture, at its first picture
  const c = ROAD_CARDS.find((x) => (STEP_PICTURES[x.id] ?? []).some(Boolean))!;
  const at = STEP_PICTURES[c.id]!.findIndex(Boolean);
  const words = PICTURE_WORDS[idsOf(STEP_PICTURES[c.id]![at]!)[0]!]!;
  await openCard(c.id);
  expect(document.activeElement).toBe(heading());
  for (let i = 0; i <= at; i += 1) {
    await click(button(C.careStepsNext)!);
    expect(document.activeElement).toBe(heading());
    expect(heading().tagName).toBe('H2');
    const live = dialog()!.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toBe(C.careStepsCount(i + 1, c.steps.length));
  }
  await shown(1);
  const img = dialog()!.querySelector('.care-step [role="img"]')!;
  expect(img).not.toBeNull();
  expect(img.getAttribute('aria-label')).toBe(words.name);
  expect(host.querySelector(`#${img.getAttribute('aria-describedby')}`)!.textContent).toBe(words.description);
  expect(img.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  // ids inside the drawing carry a prefix of this view
  for (const el of img.querySelectorAll('[id]')) expect(el.id.startsWith('cs-')).toBe(true);
  if (words.caption) expect(dialog()!.querySelector('.care-step figcaption')!.textContent).toBe(words.caption);
});

test('[BC-PIC-NONE] a step with no picture shows its text alone, with no empty frame', async () => {
  await mount();
  const c = ROAD_CARDS.find((x) => x.steps.some((_, i) => !STEP_PICTURES[x.id]?.[i]))!;
  const at = c.steps.findIndex((_, i) => !STEP_PICTURES[c.id]?.[i]);
  await openCard(c.id);
  for (let i = 0; i <= at; i += 1) await click(button(C.careStepsNext)!);
  await settle();
  expect(page()).toContain(c.steps[at]);
  // (the "What is it, where is it?" button's small bike, bike view design 2.1, is no picture)
  expect(dialog()!.querySelectorAll('.care-step figure, .care-step [role="img"], .care-step svg:not(.care-where-bike)').length).toBe(0);
  expect(dialog()!.querySelector('.care-step')!.classList.contains('care-step-pic')).toBe(false);
  // and the before-you-start page has none either
  await click(button(C.careStepsClose)!);
});

test('[BC-STEPS-ALL] All steps shows every step on one page with its pictures; the choice is remembered on the phone', async () => {
  await mount();
  // a card with pictures (care pictures redo, batch 1: the puncture cards' pictures are not yet redrawn)
  const c = card('brake-rub-disc');
  await openCard(c.id);
  const all = button(C.careStepsAll)!;
  expect(all.getAttribute('aria-pressed')).toBe('false');
  await click(all);
  const pictures = (STEP_PICTURES[c.id] ?? []).filter(Boolean).length;
  await shown(pictures);
  expect(button(C.careStepsAll)!.getAttribute('aria-pressed')).toBe('true');
  const steps = [...dialog()!.querySelectorAll('.care-step-all')];
  // a step for some bikes only carries its title (the owner's decision of 9 November 2026): here the cable brakes' last step
  const titles = stepTitlesFrom(CARE_WORDS)!;
  expect(steps.map((s) => s.querySelector('h3')!.textContent)).toEqual(c.steps.map((_, i) => titles[c.id]?.[i] ?? C.careStepN(i + 1)));
  steps.forEach((s, i) => expect(s.textContent).toContain(c.steps[i]));
  expect(dialog()!.querySelectorAll('.care-step-all [role="img"]').length).toBe(pictures);
  expect(dialog()!.textContent).toContain(c.checkFirst);
  expect(dialog()!.textContent).toContain(c.rideOn);
  expect(localStorage.getItem(ALL_STEPS_KEY)).toBe('1');
  // closed and opened again: still all steps
  await click(button(C.careStepsDone)!);
  await click(host.querySelector('.care-road[data-id="brake-rub-disc"] .care-open')!);
  await settle();
  expect(dialog()!.querySelectorAll('.care-step-all').length).toBe(c.steps.length);
  await click(button(C.careStepsAll)!);
  expect(localStorage.getItem(ALL_STEPS_KEY)).toBe('0');
  expect(heading().textContent).toBe(C.careStepsBefore);
});

test('[BC-STEPS-AWAKE] a roadside card keeps the screen awake while open, asks again when the page shows again, and lets go on close; a Care task never asks', async () => {
  await mount();
  await openCard('bolt-loose');
  expect(lock.asked).toBe(1);
  expect(lock.held).toBe(true);
  await click(button(C.careStepsNext)!);
  expect(lock.asked).toBe(1);
  // the phone let go while the page was hidden; it shows again
  lock.held = false;
  lock.current!.released = true;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
  await settle();
  expect(lock.asked).toBe(2);
  await click(button(C.careStepsClose)!);
  await settle();
  expect(lock.held).toBe(false);
  expect(lock.released).toBeGreaterThanOrEqual(1);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
  expect(lock.asked).toBe(2);
  // a Care task
  await click([...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent === C.careTabCare)!);
  await openTask('chain-lube');
  expect(dialog()).not.toBeNull();
  expect(lock.asked).toBe(2);
});

test('[BC-STEPS-AWAKE] with no wake lock on the phone, a roadside card opens and works all the same', async () => {
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
  await mount();
  await openCard('bolt-loose');
  await click(button(C.careStepsNext)!);
  expect(counter()).toBe(C.careStepsCount(1, card('bolt-loose').steps.length));
});

test('[BC-SCREEN] the step view writes nothing to the bike store: opening, moving, All steps, closing', async () => {
  const mem = memory();
  await mount(mem.kv);
  await openCard('puncture-tube');
  await click(button(C.careStepsNext)!);
  await click(button(C.careStepsAll)!);
  await click(button(C.careStepsDone)!);
  expect(mem.writes).toEqual([]);
});

// ---- Review of PR 72 ----
test('[BC-STEPS-OPEN] a tap on a roadside card or a Care task in the list opens its step view at once; the list item is one button, its words only in the step view (I4)', async () => {
  await mount();
  const item = host.querySelector<HTMLElement>('.care-task[data-id="brakes-pads-disc"]')!;
  expect(item.tagName).not.toBe('DETAILS');
  const open = item.querySelector<HTMLButtonElement>('.care-open')!;
  expect(open.getAttribute('aria-haspopup')).toBe('dialog');
  expect(open.textContent).toContain('Check the disc brake pads and replace if worn');
  expect(item.textContent).not.toContain(CARE_TASKS.find((t) => t.id === 'brakes-pads-disc')!.signs);
  await click(open);
  expect(dialog()).not.toBeNull();
  expect(heading().textContent).toBe(C.careStepsBefore);
  await click(button(C.careStepsClose)!);
  expect(document.activeElement).toBe(open);
  await click(roadTab());
  await click(host.querySelector('.care-road[data-id="chain-broken"] .care-open')!);
  expect(host.querySelector(`#${dialog()!.getAttribute('aria-labelledby')}`)!.textContent).toBe(card('chain-broken').problem);
});

/** A saved bike with rim brakes, the given bars (or none told) and the given rim brake kind (or none told), the bike in use. */
const rimBike = (bars: string | null, rimBrake?: string) => memory({
  'loadcheck:bikeProfiles': JSON.stringify([{ id: 'bike_a', name: 'Mine', brakes: 'rim', ...(rimBrake ? { rimBrake } : {}), ...(bars ? { look: { colour: null, bars, ebike: false } } : {}) }]),
  'loadcheck:bikeProfile': JSON.stringify({ id: 'bike_a', name: 'Mine' }),
}).kv;
/** Brake rubbing, step 5 ("Open the brake's quick release"), for the bike in `kv`. */
async function brakeStep5(kv: KeyValueStore): Promise<void> {
  render(null, host);
  await mount(kv);
  await openCard('brake-rub-rim');
  for (let i = 0; i < 5; i += 1) await click(button(C.careStepsNext)!);
}
const imgNames = () => [...dialog()!.querySelectorAll('.care-step [role="img"]')].map((i) => i.getAttribute('aria-label'));

const kindButtons = () => [...dialog()!.querySelectorAll('.care-step .care-kinds button')].map((b) => b.textContent);

test("[BC-PIC-DETAILS] the brake's quick release follows the kind of rim brake: one picture, the bike's own kind; not told, bars break the tie, no bike the caliper", async () => {
  const name = (id: string) => PICTURE_WORDS[id]!.name;
  await brakeStep5(rimBike('drop', 'hydraulic'));
  await shown(1);
  expect(imgNames()).toEqual([name('hydro-rim-open')]);
  await brakeStep5(rimBike('drop', 'v-brake'));
  await shown(1);
  expect(imgNames()).toEqual([name('vbrake-open')]);
  await brakeStep5(rimBike('flat'));
  await shown(1);
  expect(imgNames()).toEqual([name('vbrake-open')]);
  for (const bars of ['drop', 'other', null]) {
    await brakeStep5(rimBike(bars));
    await shown(1);
    expect(imgNames(), String(bars)).toEqual([name('brake-qr-open')]);
  }
  await brakeStep5(memory().kv); // no bike at all
  await shown(1);
  expect(imgNames()).toEqual([name('brake-qr-open')]);
  // step 6 closes it again: the V-brake's own picture
  await brakeStep5(rimBike('flat', 'v-brake'));
  await click(button(C.careStepsNext)!);
  await shown(1);
  expect(imgNames()).toEqual([name('vbrake-close')]);
});

test("[BC-PIC-SWITCH] \"Other kinds\" offers each other kind with one tap; a tap shows that kind and offers the bike's own again; no switch where a picture has one kind", async () => {
  await brakeStep5(rimBike('flat'));
  await shown(1);
  const group = dialog()!.querySelector('.care-step .care-kinds')!;
  expect(group.getAttribute('role')).toBe('group');
  expect(group.getAttribute('aria-label')).toBe(SWITCH_WORDS.other);
  expect(kindButtons()).toEqual([KIND_WORDS.caliper, KIND_WORDS.hydraulic]);
  const caliper = [...group.querySelectorAll('button')].find((b) => b.textContent === KIND_WORDS.caliper)!;
  expect(caliper.getAttribute('aria-label')).toBe(SWITCH_WORDS.show(KIND_WORDS.caliper!));
  await click(caliper);
  expect(imgNames()).toEqual([PICTURE_WORDS['brake-qr-open']!.name]);
  expect(kindButtons()).toEqual([KIND_WORDS['v-brake'], KIND_WORDS.hydraulic]);
  // the caliper bolts: one picture, one kind, no switch
  render(null, host);
  await mount();
  await openCard('brake-rub-disc');
  for (let i = 0; i < 3; i += 1) await click(button(C.careStepsNext)!);
  await shown(1);
  expect(dialog()!.querySelector('.care-step .care-kinds')).toBeNull();
});

// Final review of PR 72, M1: the pressed "Other kinds" button leaves the row as its picture shows, so focus must not fall to the page body; it
// goes to the button that switches back to the kind just shown.
test('[BC-PIC-SWITCH] after a tap on another kind, focus is on the button that switches back, never the page body', async () => {
  await brakeStep5(rimBike('flat'));
  await shown(1);
  const caliper = [...dialog()!.querySelectorAll<HTMLButtonElement>('.care-step .care-kinds button')].find((b) => b.textContent === KIND_WORDS.caliper)!;
  caliper.focus();
  await click(caliper);
  const now = document.activeElement as HTMLElement;
  expect(now).not.toBe(document.body);
  expect(now.closest('.care-kinds')).not.toBeNull();
  expect(now.textContent).toBe(KIND_WORDS['v-brake']);
  // and back again: focus on the caliper's button
  await click(now);
  expect((document.activeElement as HTMLElement).textContent).toBe(KIND_WORDS.caliper);
});

test('[BC-STEP-LINES] the snapped-spoke card shows a disc bike the disc line only, a rim bike the rim lines only, and with no bike every line, the disc line first', async () => {
  const spoke = card('spoke-snapped');
  const lines = async (kv: KeyValueStore): Promise<string[]> => {
    render(null, host);
    await mount(kv);
    await openCard('spoke-snapped');
    if (button(C.careStepsAll)!.getAttribute('aria-pressed') !== 'true') await click(button(C.careStepsAll)!);
    const got = [...dialog()!.querySelectorAll('.care-step-all .care-step-t')].map((p) => p.textContent!);
    await click(button(C.careStepsAll)!);
    return got;
  };
  const disc = memory({ 'loadcheck:bikeProfiles': JSON.stringify([{ id: 'bike_d', name: 'Disc', brakes: 'hydraulic-disc' }]), 'loadcheck:bikeProfile': JSON.stringify({ id: 'bike_d', name: 'Disc' }) }).kv;
  expect(await lines(disc)).toEqual(spoke.steps.filter((t) => !t.startsWith('Rim brakes:')));
  expect(await lines(rimBike('drop'))).toEqual(spoke.steps.filter((t) => !t.startsWith('Disc brakes:')));
  const all = await lines(memory().kv);
  expect(all).toEqual([spoke.steps[0], spoke.steps[2], spoke.steps[1], spoke.steps[3], spoke.steps[4]]);
});

// The owner's decision of 9 November 2026: the count is of the steps this bike sees; a step for some bikes only has a title saying so.
test('[BC-STEP-LINES] the step count is of the steps the bike sees, and a step for some bikes only is titled so: "Step 2 of 3" on a disc bike, "of 5" with no bike', async () => {
  const disc = memory({ 'loadcheck:bikeProfiles': JSON.stringify([{ id: 'bike_d', name: 'Disc', brakes: 'hydraulic-disc' }]), 'loadcheck:bikeProfile': JSON.stringify({ id: 'bike_d', name: 'Disc' }) }).kv;
  await mount(disc);
  await openCard('spoke-snapped');
  if (button(C.careStepsAll)!.getAttribute('aria-pressed') === 'true') await click(button(C.careStepsAll)!);
  await click(button(C.careStepsNext)!);
  await click(button(C.careStepsNext)!);
  expect(counter()).toBe(C.careStepsCount(2, 3));
  await settle();
  expect(heading().textContent).toBe('Disc brakes only: check the wheel spins clear');
  render(null, host);
  await mount(rimBike('drop'));
  await openCard('spoke-snapped');
  await click(button(C.careStepsNext)!);
  await click(button(C.careStepsNext)!);
  await settle();
  expect(counter()).toBe(C.careStepsCount(2, 4));
  expect(heading().textContent).toBe('Rim brakes only: let the wobbly wheel pass the pads');
  await click(button(C.careStepsNext)!);
  await click(button(C.careStepsNext)!);
  await settle();
  expect(heading().textContent).toBe('Rim brakes only: close the brake again');
  render(null, host);
  await mount();
  await openCard('spoke-snapped');
  await click(button(C.careStepsNext)!);
  await settle();
  expect(counter()).toBe(C.careStepsCount(1, 5));
  expect(heading().textContent).toBe(C.careStepN(1));
});

test("[BC-STEPS-KEYS] Alt or Ctrl with an arrow is the browser's own: the step view lets it pass", async () => {
  await mount();
  await openCard('chain-broken');
  await key('ArrowRight');
  await key('ArrowRight');
  await key('ArrowLeft', { altKey: true });
  await key('ArrowRight', { ctrlKey: true });
  expect(counter()).toBe(C.careStepsCount(2, card('chain-broken').steps.length));
});

test('[BC-STEPS-AWAKE] the page showing again while the first ask is still open asks no second time, and the lock is let go on close; the back gesture lets go too', async () => {
  lock.late = true;
  await mount();
  await openCard('bolt-loose');
  expect(lock.asked).toBe(1);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
  expect(lock.asked).toBe(1);
  await click(button(C.careStepsClose)!);
  // the phone answers after the card has closed
  await act(async () => { for (const answer of lock.waiting.splice(0)) answer(); await new Promise((r) => setTimeout(r, 0)); });
  // the one lock this card asked for came late, and was let go at once
  expect(lock.asked).toBe(1);
  expect(lock.current!.released).toBe(true);
  expect(lock.held).toBe(false);
  // the back gesture
  lock.late = false;
  await click(host.querySelector('.care-road[data-id="bolt-loose"] .care-open')!);
  await settle();
  expect(lock.held).toBe(true);
  const state = vi.spyOn(history, 'state', 'get').mockReturnValue(null);
  await act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
  state.mockRestore();
  await settle();
  expect(dialog()).toBeNull();
  expect(lock.held).toBe(false);
});

// ---- The bike view (design of 9 November 2026; the parts guide of care pictures design 4 grown into it): a part's name in a step, or the
// "What is it, where is it?" button under every step, opens it over the step view ----
const sheet = () => document.querySelector<HTMLDialogElement>('dialog.part-sheet');
const partLink = (text: string) => [...dialog()!.querySelectorAll<HTMLButtonElement>('.care-step .care-part')].find((b) => b.textContent === text) ?? null;
const sheetButton = (name: string) => [...sheet()!.querySelectorAll('button')].find((b) => b.textContent === name || b.getAttribute('aria-label') === name) ?? null;
const sheetOpen = async () => { await vi.waitFor(() => expect(sheet()).not.toBeNull(), { timeout: 3000 }); await settle(); };
const entryName = () => sheet()!.querySelector('.bv-entry h3')?.textContent ?? null;
const listButton = (name: string) => [...sheet()!.querySelectorAll<HTMLButtonElement>('.bv-parts button')].find((b) => b.textContent === name) ?? null;
const pressed = () => [...sheet()!.querySelectorAll('.bv-parts button[aria-pressed="true"]')].map((b) => b.textContent);
const drawing = () => sheet()!.querySelector('.bv-canvas[role="img"]')!;
const labels = () => [...sheet()!.querySelectorAll<SVGGElement>('.bv-label')].map((g) => g.dataset.part!);
const where = () => [...dialog()!.querySelectorAll<HTMLButtonElement>('.care-where')];

test("[PG-SHEET-OPEN] a part's name in a step is a button that reads as the text; a tap opens the bike view over the step with that part's entry, focus on the view's title; Close returns focus to the name, the step view stays", async () => {
  const push = vi.spyOn(history, 'pushState');
  await brakeStep5(rimBike('drop'));
  const step = card('brake-rub-rim').steps[4]!;
  expect(dialog()!.querySelector('.care-step-t')!.textContent).toBe(step);
  const link = partLink("brake's quick release")!;
  expect(link.tagName).toBe('BUTTON');
  expect(link.getAttribute('aria-haspopup')).toBe('dialog');
  await click(link);
  await sheetOpen();
  const s = sheet()!;
  expect(s.open).toBe(true);
  // the view is named for the card; its title has the focus; the tapped part's entry below the drawing
  expect(s.getAttribute('aria-label')).toBe(`Where to find: ${card('brake-rub-rim').problem}`);
  expect(s.querySelector('h2')!.textContent).toBe(card('brake-rub-rim').problem);
  expect(document.activeElement).toBe(s.querySelector('h2'));
  expect(entryName()).toBe("The brake's quick release");
  expect(pressed()).toEqual(['Brake quick release']);
  expect(push.mock.calls.at(-1)![0]).toMatchObject({ careSteps: 'brake-rub-rim', carePart: 'brake-qr' });
  expect(s.textContent).toContain('Only on bikes with rim brakes');
  const back = vi.mocked(history.back).mock.calls.length;
  await click(sheetButton('Close')!);
  expect(sheet()).toBeNull();
  expect(vi.mocked(history.back).mock.calls.length).toBe(back + 1);
  expect(dialog()!.open).toBe(true);
  expect(counter()).toBe(C.careStepsCount(5, 6));
  expect(document.activeElement).toBe(partLink("brake's quick release"));
});

test('[PG-SHEET-KEYS] in the view, Escape closes it alone and the arrows leave the steps where they are; the back gesture closes it and leaves the step view', async () => {
  await brakeStep5(rimBike('drop'));
  await click(partLink("brake's quick release")!);
  await sheetOpen();
  const s = sheet()!;
  await act(() => { s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
  expect(counter()).toBe(C.careStepsCount(5, 6));
  await act(() => { s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  expect(sheet()).toBeNull();
  expect(dialog()!.open).toBe(true);
  // back gesture: the view's entry is left for the step view's own
  await click(partLink("brake's quick release")!);
  await sheetOpen();
  await act(() => { history.replaceState({ careSteps: 'brake-rub-rim' }, ''); window.dispatchEvent(new PopStateEvent('popstate', { state: { careSteps: 'brake-rub-rim' } })); });
  expect(sheet()).toBeNull();
  expect(dialog()!.open).toBe(true);
});

test('[PG-SHEET-MIXED] Not to be mixed up with swaps the entry, its name taking the focus, and Back brings the first one again', async () => {
  await brakeStep5(rimBike('drop'));
  await click(partLink("brake's quick release")!);
  await sheetOpen();
  expect(sheet()!.textContent).toContain('Not to be mixed up with');
  await click(sheetButton("The wheel's quick release")!);
  expect(entryName()).toBe("The wheel's quick release");
  expect(document.activeElement).toBe(sheet()!.querySelector('.bv-entry h3'));
  // the swapped part stands out on the drawing too
  expect(sheet()!.querySelector('.bv-label-hot')!.getAttribute('data-part')).toBe('wheel-qr');
  await click(sheetButton('Back')!);
  expect(entryName()).toBe("The brake's quick release");
  expect(sheetButton('Back')).toBeNull();
});

test("[PG-SHEET-BIKE] the view draws a typical bike of the rider's type, never the rider's own colour or details (owner's answer 1); the close-ups with the bike's own first; a part the card's bike lacks is borrowed when tapped", async () => {
  const caliper = PICTURE_WORDS['brake-qr-open']!.name;
  const vbrake = PICTURE_WORDS['vbrake-open']!.name;
  // a red road bike (28 mm tyres) with flat bars and rim brakes
  await brakeStep5(memory({
    'loadcheck:bikeProfiles': JSON.stringify([{ id: 'bike_a', name: 'Mine', brakes: 'rim', frontTyre: '28-622', rearTyre: '28-622', look: { colour: '#d02020', bars: 'flat', ebike: false } }]),
    'loadcheck:bikeProfile': JSON.stringify({ id: 'bike_a', name: 'Mine' }),
  }).kv);
  await click(partLink("brake's quick release")!);
  await sheetOpen();
  const art = drawing();
  expect(art.getAttribute('aria-label')).toContain('A typical road bike, greyed out.');
  expect(art.getAttribute('aria-label')).toContain('Marked: brake quick release.');
  expect(art.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  expect(art.innerHTML).not.toMatch(/d02020|bk-paint/i);
  expect(sheet()!.querySelector('.bv-about')!.textContent).toBe("A typical road bike, your bike's type.");
  // a road bike's drop bars, not the rider's flat bars
  expect(art.querySelector('.bk-hood')).not.toBeNull();
  expect(art.querySelector('.bk-grip')).toBeNull();
  // the close-ups still follow the rider's brakes (the guide's rule): a V-brake's first on flat bars
  await vi.waitFor(() => expect(sheet()!.querySelectorAll('.care-pic [role="img"]').length).toBe(2), { timeout: 3000 });
  expect([...sheet()!.querySelectorAll('.care-pic [role="img"]')].map((i) => i.getAttribute('aria-label'))).toEqual([vbrake, caliper]);
  // a disc card: the caliper stands out; its mix-up, the rim brake, is borrowed onto the drawing when opened
  render(null, host);
  await mount(memory({
    'loadcheck:bikeProfiles': JSON.stringify([{ id: 'bike_d', name: 'Disc', brakes: 'hydraulic-disc' }]),
    'loadcheck:bikeProfile': JSON.stringify({ id: 'bike_d', name: 'Disc' }),
  }).kv);
  await openCard('brake-rub-disc');
  for (let i = 0; i < 3; i += 1) await click(button(C.careStepsNext)!);
  await click(partLink('caliper')!);
  await sheetOpen();
  expect(sheet()!.querySelector('.bv-label-hot')!.getAttribute('data-part')).toBe('caliper');
  await click(sheetButton('Rim brake (caliper, V-brake or hydraulic)')!);
  expect(entryName()).toBe('Rim brake (caliper, V-brake or hydraulic)');
  expect(sheet()!.querySelector('.bv-label-hot')!.getAttribute('data-part')).toBe('rim-brake');
  expect(sheet()!.textContent).not.toContain('Not on this drawing.');
});

test('[PG-SHEET-OPEN] with no bike the view shows the typical gravel bike and "Add your bike"; every part a step names is a link; All steps carries the same part names', async () => {
  await mount();
  await openCard('puncture-tube');
  await click(button(C.careStepsNext)!);
  await click(button(C.careStepsNext)!);
  // every part named in the step, in the text's order (the owner's wish: every part name is a link)
  expect([...dialog()!.querySelectorAll('.care-step .care-part')].map((b) => b.textContent)).toEqual(['tyre', 'rim', 'tyre bead', 'spoke', 'tube']);
  await click(partLink('tyre bead')!);
  await sheetOpen();
  expect(sheet()!.querySelector('.bv-about')!.textContent).toBe('A typical gravel bike. Add your bike and this shows your type of bike.');
  expect(sheet()!.querySelector('.bv-about a')!.getAttribute('href')).toBe('/tools/bags/#bike-details=new&back=care');
  await click(sheetButton('Close')!);
  await click(button(C.careStepsAll)!);
  expect(dialog()!.querySelectorAll('.care-step-list .care-part').length).toBeGreaterThan(5);
});

test('[BV-BUTTON] "What is it, where is it?" sits under the text on every screen of a card, the card\'s parts below it; it opens the view with no part tapped, focus on its title, and gives the focus back', async () => {
  await mount();
  const c = card('puncture-tube');
  await openCard(c.id);
  const screens = c.steps.length + 2;
  for (let i = 0; i < screens; i += 1) {
    expect(where().length, `screen ${i}`).toBe(1);
    const b = where()[0]!;
    expect(b.querySelector('.care-where-name')!.textContent).toBe(C.careWhere);
    // under the text: the screen's words come before it
    expect(b.previousElementSibling, `screen ${i}`).not.toBeNull();
    if (i < screens - 1) await click(button(C.careStepsNext)!);
  }
  expect(where()[0]!.querySelector('.care-where-parts')!.textContent).toBe('Disc caliper, brake lever, tyre, rim, tyre bead, spokes, inner tube, valve, brake disc, brake pads');
  const b = where()[0]!;
  expect(b.getAttribute('aria-haspopup')).toBe('dialog');
  await click(b);
  await sheetOpen();
  expect(pressed()).toEqual([]);
  expect(sheet()!.querySelector('.bv-label-hot')).toBeNull();
  expect(sheet()!.querySelector('.bv-hint')!.textContent).toBe('Tap a name, here or on the bike, to see what it is.');
  expect(document.activeElement).toBe(sheet()!.querySelector('h2'));
  expect(sheet()!.querySelector('.bv-tools')!.textContent).toContain('Tools for this card: Spare tube');
  await click(sheetButton('Close')!);
  expect(document.activeElement).toBe(where()[0]);
  // in All steps: one button, after Before you start; a task whose steps name no part has none
  await click(button(C.careStepsAll)!);
  expect(where().length).toBe(1);
  expect(where()[0]!.closest('.care-step-before')).not.toBeNull();
  await click(button(C.careStepsDone)!);
  await openTask('belt-rinse');
  expect(where().length).toBe(0);
});

test("[BV-VIEW] the card's parts as buttons and as labels on the drawing; a tap on either moves the one blaze part there, said politely; the labels are not offered to the keyboard", async () => {
  await mount();
  await openCard('brake-rub-disc');
  await click(where()[0]!);
  await sheetOpen();
  const parts = [...sheet()!.querySelectorAll('.bv-parts button')].map((b) => b.textContent);
  expect(parts).toEqual(['Thru-axle', 'Wheel quick release', 'Dropouts', 'Brake pads', 'Disc caliper', 'Brake lever', 'Pad adjuster', 'Brake disc']);
  expect(sheet()!.querySelector('.bv-parts')!.getAttribute('aria-label')).toBe('Parts in this card');
  // each label is one of the card's parts, inside the hidden picture, and none can take the focus
  expect(labels().length).toBeGreaterThan(3);
  for (const id of labels()) expect(parts).toContain(PART_SHORT[id as keyof typeof PART_SHORT]);
  expect(sheet()!.querySelectorAll('.bv-label [tabindex], .bv-label a, .bv-label button').length).toBe(0);
  await click(listButton('Disc caliper')!);
  expect(pressed()).toEqual(['Disc caliper']);
  expect(entryName()).toBe('Disc brake caliper');
  expect(sheet()!.querySelectorAll('.bv-label-hot').length).toBe(1);
  expect(sheet()!.querySelector('.bv-arrow')).not.toBeNull();
  expect(sheet()!.querySelector('[aria-live="polite"]')!.textContent).toMatch(/^Disc caliper: /);
  // the caliper is on the far side: its label says so
  expect(sheet()!.querySelector('.bv-label[data-part="caliper"]')!.textContent).toBe('DISC CALIPER(other side)');
  const other = labels().find((id) => id !== 'caliper')!;
  const label = sheet()!.querySelector<SVGGElement>(`.bv-label[data-part="${other}"]`)!;
  await act(() => { label.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(pressed()).toEqual([PART_SHORT[other as keyof typeof PART_SHORT]]);
  expect(sheet()!.querySelectorAll('.bv-label-hot').length).toBe(1);
});

test('[BV-ZOOM] a card whose parts sit close together opens zoomed in on them; Whole bike, Zoom in and Zoom out are buttons; a card spread over the bike opens whole', async () => {
  await mount();
  await openCard('ebike-no-power');
  await click(where()[0]!);
  await sheetOpen();
  const zoomed = () => sheet()!.querySelector('.bv-canvas')!.classList.contains('bv-zoomed');
  // this card names the frame, which spans the bike (the puncture card, once spread by its warning's brake lever, now opens on its
  // wheel: review of PR 107, M3)
  expect(zoomed()).toBe(false);
  await click(sheetButton('Close')!);
  render(null, host);
  await mount();
  await openCard('chain-broken');
  await click(where()[0]!);
  await sheetOpen();
  expect(zoomed()).toBe(true);
  expect(drawing().getAttribute('aria-label')).toContain('Zoomed in.');
  expect(sheetButton('Zoom out')!.disabled).toBe(false);
  await click(sheetButton('Whole bike')!);
  expect(zoomed()).toBe(false);
  expect(sheetButton('Zoom out')!.disabled).toBe(true);
  expect(sheetButton('Whole bike')!.disabled).toBe(true);
  await click(sheetButton('Zoom in')!);
  expect(zoomed()).toBe(true);
  const box = sheet()!.querySelector('.bv-art')!.getAttribute('viewBox');
  await click(sheetButton('Zoom in')!);
  expect(sheet()!.querySelector('.bv-art')!.getAttribute('viewBox')).not.toBe(box);
});
