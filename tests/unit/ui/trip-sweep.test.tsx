// @vitest-environment jsdom
// Trip's clarity items from the sweep of 14 Nov 2026 (#3, #5, #6, #7, #10): the date one tap from the trip line, Bags done once a
// bag plan exists, and words that say what they mean. On the real store (fake IndexedDB), with a fixed clock.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { TF } from '../../../src/core/wording/en-trip-fields.ts';
import type { StepName, StepReport } from '../../../src/data/prepare.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb } from '../../../src/store/db.ts';
import { savePrepared } from '../../../src/store/prepared.ts';
import { readTrip } from '../../../src/store/trip.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { installOffer } from '../../../src/ui/install.ts';
import { summaryOf } from '../../../src/ui/trip/model.ts';
import { browserTripServices } from '../../../src/ui/trip/services.ts';
import type { TripServices } from '../../../src/ui/trip/services.ts';
import { TripScreen } from '../../../src/ui/trip/trip.tsx';
import { fixtureGpx } from '../../fixtures/gpx.ts';

const host = document.createElement('div');
document.body.append(host);
const NOW = new Date('2026-10-10T09:00:00Z');

beforeEach(() => {
  render(null, host);
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  refreshBikeSource();
  installOffer.value = null;
});
afterEach(() => { act(() => render(null, host)); });

const settle = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
async function until(check: () => boolean, what: string, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waited for ${what}`);
    await settle(10);
  }
}
const step = (name: string) => host.querySelector<HTMLElement>(`[data-step="${name}"]`)!;
const openSteps = () => [...host.querySelectorAll<HTMLElement>('[data-step][data-open]')].map((e) => e.dataset.step);
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const buttonIn = (root: ParentNode, name: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  if (!found) throw new Error(`no button ${name}`);
  return found;
};

async function withRoute(): Promise<TripServices> {
  const svc = browserTripServices(() => NOW);
  await act(async () => { render(<TripScreen services={svc} />, host); });
  await until(() => host.querySelector('[data-add-route] input[type=file]') !== null, 'the file picker');
  const input = host.querySelector<HTMLInputElement>('[data-add-route] input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [new File([await fixtureGpx('heidelberg-strasbourg')], 'ride.gpx', { type: 'application/gpx+xml' })], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await until(() => host.querySelector('[data-summary]') !== null, 'the summary');
  return svc;
}

const steps: StepName[] = ['heights', 'places', 'hours', 'weather', 'baseline', 'save'];
const allOk = (): StepReport[] => steps.map((s) => ({ step: s, ok: true, note: null }));

/** The bag planner's load summary (Contract 1), as it saves one. */
const plan = (over: Record<string, unknown> = {}) => JSON.stringify({
  app: 'load-check', kind: 'load-summary', v: 1, at: '2026-10-10T08:00:00Z', planUpdatedAt: '2026-10-10T08:00:00Z', nights: 2, month: 9,
  departureDate: '2026-10-10', mode: 'comfort', foodDays: 2, bikeId: null,
  bags: { count: 1, positions: ['frame'], items: [] },
  decks: { bar: null, rack: null }, water: { bottles: [], cageL: 0, extraL: 0, totalL: 0 },
  weight: { kitKg: 1.5, cageWaterKg: 0, carriedKg: 1.5, bikeKg: 14, emptyLuggageKg: 0.2, byPositionKg: { fork: 0, bar: 0, top: 0, frame: 1.5, bottle: 0, seat: 0, rack: 0, pack: 0 }, unplacedKg: 0 },
  kit: { waterFilter: false },
  ...over,
});

describe('The departure date one tap from the trip line (sweep #3)', () => {
  test('[TRIP-LINE-DATE] with a route the trip line offers Change date: it opens the Route step and puts the focus on the departure date', async () => {
    await withRoute();
    const line = host.querySelector<HTMLElement>('[data-trip-line]')!;
    expect(openSteps()).not.toContain('route');
    await click(buttonIn(line, W.appTripChangeDate));
    expect(openSteps()).toEqual(['route']);
    await until(() => document.activeElement?.id === 'trip-date', 'the focus on the date');
    // Open already, the same tap moves the focus back to the date.
    (document.activeElement as HTMLElement).blur();
    await click(buttonIn(line, W.appTripChangeDate));
    await until(() => document.activeElement?.id === 'trip-date', 'the focus on the date again');
  });

  test('[TRIP-LINE-DATE] with no trip the line says "No trip yet" and offers no date', async () => {
    await act(async () => { render(<TripScreen services={browserTripServices(() => NOW)} />, host); });
    await until(() => host.querySelector('[data-trip-line]') !== null, 'the trip line');
    expect(host.querySelector('[data-trip-line]')!.textContent).toBe(W.appTripNoTrip);
    expect(host.querySelector('[data-trip-line] button')).toBeNull();
  });
});

describe('Bags shows a bag plan (sweep #5)', () => {
  test('[TRIP-BAGS-DONE] with a bag plan saved, Bags is done: its tick, "1 bag · 1.5 kg" and Change; once prepared, Go is the step to do', async () => {
    localStorage.setItem('loadcheck:summary:v1', plan());
    refreshBikeSource();
    await withRoute();
    expect(step('bags').dataset.state).toBe('done');
    expect(step('bags').querySelector('.trip-dot')!.textContent).toBe('✓');
    expect(step('bags').textContent).toContain(W.tyreBagCardLine(1, '1.5'));
    expect(step('bags').textContent).not.toContain(W.appTripBagsLater);
    await click(buttonIn(step('bags'), W.appTripStepChange));
    expect(openSteps()).toEqual(['bags']);
    expect(step('bags').textContent).toContain(W.appHandoffButton);
    // Prepared: Bags is done too, so Go is the step to do.
    const trip = (await readTrip())!;
    await savePrepared(trip.route.id, { at: NOW, steps: allOk(), build: { id: 'b', builtAt: '2026-10-28', countries: {} }, forecastFetchedAt: null, baselineYears: null });
    act(() => render(null, host));
    await act(async () => { render(<TripScreen services={browserTripServices(() => NOW)} />, host); });
    await until(() => step('go')?.dataset.state === 'next', 'Go as the next step');
    expect(openSteps()).toEqual(['go']);
  });

  test('[TRIP-BAGS-DONE] an empty plan, or none, leaves Bags as a step still to do', async () => {
    localStorage.setItem('loadcheck:summary:v1', JSON.stringify({ app: 'load-check', kind: 'load-summary', v: 1, at: '2026-10-10T08:00:00Z', empty: true }));
    refreshBikeSource();
    await withRoute();
    expect(step('bags').dataset.state).not.toBe('done');
    expect(step('bags').textContent).toContain(W.appTripBagsLater);
  });
});

describe('Trip\'s words say what they mean (sweep #6, #7, #10)', () => {
  test('[TRIP-CLEAR-WORDS] the nights hint names its basis, the storage line says it counts the whole app', () => {
    expect(TF.appTripNightsSuggested(0)).toBe('Suggested for this distance and pace: 0 nights.');
    expect(TF.appTripNightsSuggested(1)).toBe('Suggested for this distance and pace: 1 night.');
    expect(TF.appTripStorage('4.2')).toBe('Wayfinch uses 4.2 MB on this phone (all trips).');
  });

  test('[TRIP-CLEAR-WORDS] the planned start reads "start 08:30", apart from the latest "leave by"; climbing is "m up" everywhere', async () => {
    expect(W.appTripDetailsLine('Sporting', '25', 'Camping', '08:30')).toBe('Sporting · 25 km/h · Camping · start 08:30');
    await withRoute();
    const trip = (await readTrip())!;
    const s = summaryOf(trip, { day1LeaveBy: 'about 13:45' });
    expect(s.climbing).toMatch(/^[\d,]+ m up$/);
    expect(host.querySelector('[data-summary]')!.textContent).not.toMatch(/m climbing/);
  });
});
