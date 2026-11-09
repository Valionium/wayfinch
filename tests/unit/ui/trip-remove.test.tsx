// @vitest-environment jsdom
// Remove this trip on Trip (owner's wish, 9 November 2026): only in the open Route step, with a trip; a confirm step that names what
// goes and what stays; afterwards Trip is what a phone that never had the trip shows, with the focus on its first step. On the real
// store (fake IndexedDB), with a fixed clock.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { RT } from '../../../src/core/wording/en-remove.ts';
import type { StepName, StepReport } from '../../../src/data/prepare.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb, openDb } from '../../../src/store/db.ts';
import { savePrepared } from '../../../src/store/prepared.ts';
import { readTrip } from '../../../src/store/trip.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { installOffer } from '../../../src/ui/install.ts';
import { browserTripServices } from '../../../src/ui/trip/services.ts';
import type { TripServices } from '../../../src/ui/trip/services.ts';
import { TripScreen } from '../../../src/ui/trip/trip.tsx';
import { runningSignal } from '../../../src/ui/trip/run-state.ts';
import { fixtureGpx } from '../../fixtures/gpx.ts';

const host = document.createElement('div');
document.body.append(host);
const NOW = new Date('2026-10-10T09:00:00Z');

const freshPhone = (): void => {
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
};
beforeEach(() => {
  render(null, host);
  freshPhone();
  localStorage.clear();
  refreshBikeSource();
  installOffer.value = null;
});
afterEach(() => { act(() => render(null, host)); });

const settle = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
async function until(check: () => boolean, what: string | (() => string), ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waited for ${typeof what === 'string' ? what : what()}`);
    await settle(10);
  }
}
const step = (name: string) => host.querySelector<HTMLElement>(`[data-step="${name}"]`)!;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const buttons = (root: ParentNode, name: string): HTMLButtonElement[] => [...root.querySelectorAll('button')].filter((b) => b.textContent?.trim() === name);
const buttonIn = (root: ParentNode, name: string): HTMLButtonElement => {
  const found = buttons(root, name)[0];
  if (!found) throw new Error(`no button ${name}`);
  return found;
};

const stepNames: StepName[] = ['heights', 'places', 'hours', 'weather', 'baseline', 'save'];
const allOk = (): StepReport[] => stepNames.map((s) => ({ step: s, ok: true, note: null }));

const services = (over: Partial<TripServices> = {}): TripServices => ({ ...browserTripServices(() => NOW), ...over });

async function show(svc: TripServices = services()): Promise<TripServices> {
  act(() => render(null, host));
  await act(async () => { render(<TripScreen services={svc} />, host); });
  await until(() => host.querySelector('[data-trip-loaded]') !== null, 'Trip to load');
  await until(() => host.querySelector('[data-step="route"][data-open]') === null || host.querySelector('[data-add-route]') !== null, 'Add a route');
  return svc;
}

async function withRoute(svc?: TripServices): Promise<TripServices> {
  const s = await show(svc);
  await until(() => host.querySelector('[data-add-route] input[type=file]') !== null, 'the file picker');
  const input = host.querySelector<HTMLInputElement>('[data-add-route] input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [new File([await fixtureGpx('heidelberg-strasbourg')], 'ride.gpx', { type: 'application/gpx+xml' })], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await until(() => host.querySelector('[data-summary]') !== null && host.querySelector('[data-getready]') !== null, 'the route');
  return s;
}

/** Waits for Remove this trip in the folded Route step's row, next to Change (owner, 9 Nov 2026, replacing: in the open step). */
async function openRoute(): Promise<void> {
  await until(() => step('route').querySelector('.trip-step-head [data-remove-trip] button') !== null, 'Remove this trip');
}

/** Trip as a phone that never had a trip shows it, with this phone's settings: the same keys, a new database. */
async function freshTrip(): Promise<string> {
  act(() => render(null, host));
  freshPhone();
  await show();
  await settle(50);
  return host.innerHTML;
}

test('[TRIP-REMOVE-ASK] Remove this trip is only in the folded Route step, next to Change, and only with a trip', async () => {
  await show();
  expect(host.querySelector('[data-remove-trip]')).toBeNull();
  expect(buttons(host, RT.appTripRemove)).toEqual([]);
  await withRoute();
  // The Route step folded (done): in its head row, beside Change, with its own name.
  await openRoute();
  expect(buttons(host, RT.appTripRemove).length).toBe(1);
  const head = step('route').querySelector('.trip-step-head')!;
  expect(head.contains(buttons(host, RT.appTripRemove)[0]!)).toBe(true);
  expect(head.contains(buttonIn(step('route'), W.appTripStepChange))).toBe(true);
  expect(buttonIn(step('route'), W.appTripStepChange).getAttribute('aria-label')).not.toBe(RT.appTripRemove);
  // Opened with Change: the row is gone with Change, and the upload area has no Remove beside it.
  await click(buttonIn(step('route'), W.appTripStepChange));
  await until(() => host.querySelector('[data-add-route] input[type=file]') !== null, 'the open step');
  expect(buttons(host, RT.appTripRemove)).toEqual([]);
  expect(host.querySelector('[data-add-route] [data-remove-trip]')).toBeNull();
  // Not under the step (Trip details), nor in any other step.
  expect(host.querySelector('[data-trip-details] [data-remove-trip]')).toBeNull();
  for (const name of ['getready', 'bags', 'go']) {
    await click(step(name).querySelector('button')!);
    await settle(20);
    expect(buttons(step(name), RT.appTripRemove), name).toEqual([]);
  }
});

test('[TRIP-REMOVE-ASK] the confirm step names the route, what goes and what stays; Keep it changes nothing and gives the focus back', async () => {
  await withRoute();
  await openRoute();
  const opener = buttonIn(step('route'), RT.appTripRemove);
  await click(opener);
  const ask = host.querySelector<HTMLElement>('[data-remove-ask]')!;
  expect(ask.getAttribute('role')).toBe('alertdialog');
  const title = host.querySelector(`#${ask.getAttribute('aria-labelledby')}`)!;
  expect(title.textContent).toBe(RT.appTripRemoveAsk);
  expect(document.activeElement).toBe(title);
  expect(ask.textContent).toContain(RT.appTripRemoveGoes('Fixture: Heidelberg to Strasbourg'));
  expect(ask.textContent).toContain(RT.appTripRemoveStays);
  await click(buttonIn(ask, RT.appTripRemoveNo));
  expect(host.querySelector('[data-remove-ask]')).toBeNull();
  expect(document.activeElement?.textContent).toBe(RT.appTripRemove);
  // Escape on the question is Keep it too.
  await click(buttonIn(step('route'), RT.appTripRemove));
  await act(async () => { host.querySelector('[data-remove-ask]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(host.querySelector('[data-remove-ask]')).toBeNull();
  expect((await readTrip())?.route.name).toBe('Fixture: Heidelberg to Strasbourg');
});

test('[TRIP-REMOVE] after Remove trip, Trip is exactly what a phone that never had the trip shows, and the focus is on its first step', async () => {
  await withRoute();
  await openRoute();
  const heard: unknown[] = [];
  const hear = (e: Event): void => { heard.push((e as CustomEvent).detail); };
  window.addEventListener('copilot:changed-here', hear);
  await click(buttonIn(step('route'), RT.appTripRemove));
  await click(buttonIn(host.querySelector('[data-remove-ask]')!, RT.appTripRemoveYes));
  await until(() => host.querySelector('[data-trip-line]')?.textContent === W.appTripNoTrip, () => `no trip: ${host.textContent?.slice(0, 300)}`);
  await until(() => host.querySelector('[data-add-route] input[type=file]') !== null, 'the file picker');
  await settle(50);
  expect(document.activeElement).toBe(step('route').querySelector('h2'));
  expect(await readTrip()).toBeNull();
  // This window's other screens are told (En route's position routine stops: review of PR 86, M3), and a screen reader hears it
  // (M6), from outside Trip's own markup, which stays that of a fresh start.
  window.removeEventListener('copilot:changed-here', hear);
  expect(heard).toContain('all');
  const said = (): (string | null)[] => [...document.querySelectorAll('[role=status]')].filter((e) => !host.contains(e)).map((e) => e.textContent);
  await until(() => said().includes(RT.appTripRemoved), () => `the spoken line: ${JSON.stringify(said())}`);
  const removed = host.innerHTML;
  expect(removed).toBe(await freshTrip());
});

test('[TRIP-REMOVE-FAIL] a removal the database refuses says so, and leaves the trip whole', async () => {
  await withRoute();
  await openRoute();
  const db = await openDb();
  const proto = Object.getPrototypeOf(db.transaction('handoffs').store) as { clear: () => unknown };
  const real = proto.clear;
  proto.clear = function (this: { name?: string }) {
    if (this.name === 'handoffs') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    return real.call(this);
  };
  try {
    await click(buttonIn(step('route'), RT.appTripRemove));
    await click(buttonIn(host.querySelector('[data-remove-ask]')!, RT.appTripRemoveYes));
    await until(() => host.querySelector('[data-remove-trip] [role=alert]') !== null, 'the refusal');
  } finally {
    proto.clear = real;
  }
  expect(host.querySelector('[data-remove-trip] [role=alert]')!.textContent).toBe(RT.appTripRemoveFailed);
  expect((await readTrip())?.route.name).toBe('Fixture: Heidelberg to Strasbourg');
  expect(host.querySelector('[data-summary]')?.textContent).toContain('Fixture: Heidelberg to Strasbourg');
  expect(host.querySelector('[data-trip-line]')?.textContent).toContain('Fixture: Heidelberg to Strasbourg');
});

test('[TRIP-REMOVE-WINDOWS] Prepare this route under way: Trip waits for it to stop at its next step, then shows no trip and no "Working…"', async () => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => { release = r; });
  let refused = false;
  const svc = services({
    prepare: async (onProgress) => {
      const trip = (await readTrip())!;
      onProgress('places', 1, 4);
      await held;
      // Its next step's write, for a route that is gone: refused.
      try {
        await savePrepared(trip.route.id, { at: NOW, steps: allOk(), build: null, forecastFetchedAt: null, baselineYears: null });
      } catch {
        refused = true;
      }
      return allOk();
    },
  });
  await withRoute(svc);
  await click(step('getready').querySelector('[data-getready] button.btn-primary')!);
  await until(() => runningSignal.value, 'the run');
  await openRoute();
  await click(buttonIn(step('route'), RT.appTripRemove));
  await click(buttonIn(host.querySelector('[data-remove-ask]')!, RT.appTripRemoveYes));
  let gone = false;
  await until(() => { void readTrip().then((t) => { gone = t === null; }); return gone; }, 'the trip gone');
  await settle(100);
  release();
  await until(() => !runningSignal.value, 'the run to end');
  await until(() => host.querySelector('[data-trip-line]')?.textContent === W.appTripNoTrip, 'no trip');
  await settle(50);
  expect(refused).toBe(true);
  expect(step('getready').textContent).not.toContain(W.appTripWorking);
  expect(step('getready').textContent).toContain(W.appTripGetReadyLater);
  expect(await (await openDb()).getAllKeys('meta')).not.toContain('route:preparedSteps');
  expect(host.innerHTML).toBe(await freshTrip());
});
