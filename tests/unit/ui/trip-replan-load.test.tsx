// @vitest-environment jsdom
// Trip M5's two small points (review of PR 175, m-1 and m-2): a change of nights plans its days with the stops' code, a chunk of its
// own (src/data/heights.ts and src/data/day-stops.ts). On a first visit on a slow link the taps after the change waited for that code;
// when it could not load, the nights were kept and the days stayed as they were, until the rider changed the nights again.
// Here the two chunks load as a slow link or a lost connection would let them: late, or not at all. On the real store (fake IndexedDB).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb } from '../../../src/store/db.ts';
import { readLocalSettings } from '../../../src/store/settings-local.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { installOffer } from '../../../src/ui/install.ts';
import { browserTripServices } from '../../../src/ui/trip/services.ts';
import type { TripServices } from '../../../src/ui/trip/services.ts';
import { TripScreen } from '../../../src/ui/trip/trip.tsx';
import { fixtureGpx } from '../../fixtures/gpx.ts';

/**
 * How the stops' two chunks load: when each was first asked for, and a link that is slow (`slowMs` from that first ask) or gone
 * (`fail`). A chunk loads once per page: asked for with `fail`, its import is refused; once loaded, every use of it is refused
 * instead, which is what the code that asks for it sees of a chunk that cannot load. The slow test comes first, while neither is loaded.
 */
const code = vi.hoisted(() => ({ asked: [] as string[], slowMs: 0, fail: false }));
const gone = (name: string) => new TypeError(`Failed to fetch dynamically imported module: ${name}.js`);
async function loading(name: string): Promise<void> {
  code.asked.push(name);
  if (code.slowMs > 0) await new Promise((r) => setTimeout(r, code.slowMs));
  if (code.fail) throw gone(name);
}
vi.mock('../../../src/data/heights.ts', async (original) => {
  await loading('heights');
  const m = await original<typeof import('../../../src/data/heights.ts')>();
  return { ...m, replan: (now: () => Date) => (code.fail ? Promise.reject(gone('heights')) : m.replan(now)) };
});
vi.mock('../../../src/data/day-stops.ts', async (original) => {
  await loading('day-stops');
  const m = await original<typeof import('../../../src/data/day-stops.ts')>();
  return {
    ...m,
    settleStops: (...a: Parameters<typeof m.settleStops>) => (code.fail ? Promise.reject(gone('day-stops')) : m.settleStops(...a)),
    settleInTurn: (...a: Parameters<typeof m.settleInTurn>) => (code.fail ? Promise.reject(gone('day-stops')) : m.settleInTurn(...a)),
  };
});

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
  Object.assign(code, { asked: [], slowMs: 0, fail: false });
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
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const buttonIn = (root: ParentNode, name: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  if (!found) throw new Error(`no button ${name}`);
  return found;
};
const services = (): TripServices => browserTripServices(() => NOW);

async function show(svc: TripServices = services()): Promise<TripServices> {
  act(() => render(null, host));
  await act(async () => { render(<TripScreen services={svc} />, host); });
  await until(() => host.querySelector('[data-trip-loaded]') !== null, 'Trip to load');
  return svc;
}

/** Trip with the Heidelberg to Strasbourg route (no Prepare this route yet), from a GPX file as the rider adds it. */
async function withRoute(): Promise<TripServices> {
  const svc = await show();
  await until(() => host.querySelector('[data-add-route] input[type=file]') !== null, 'the file picker');
  const input = host.querySelector<HTMLInputElement>('[data-add-route] input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [new File([await fixtureGpx('heidelberg-strasbourg')], 'ride.gpx', { type: 'application/gpx+xml' })], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await until(() => host.querySelector('[data-summary]') !== null, 'the summary');
  return svc;
}

async function openDetails(): Promise<HTMLElement> {
  const details = host.querySelector<HTMLElement>('[data-trip-details]')!;
  await click(buttonIn(details, W.appTripDetails));
  await until(() => details.querySelector('#trip-nights') !== null, 'the nights');
  return details;
}

/** The rider types `n` into the nights and leaves the field; the change is not waited for. */
async function typeNights(details: HTMLElement, n: number): Promise<void> {
  const nights = details.querySelector<HTMLInputElement>('#trip-nights')!;
  await act(async () => { nights.value = String(n); nights.dispatchEvent(new Event('input', { bubbles: true })); nights.dispatchEvent(new Event('change', { bubbles: true })); });
}

const days = async (): Promise<number> => (await readTrip())!.route.stages.length;
const ONE_LINE = 'The setting is kept. The days update when Wayfinch can load again.';

describe('The stops\' code for a change of nights (review of PR 175, m-1 and m-2)', () => {
  test('[TRIP-REPLAN-LOAD] opening Trip details starts loading the stops\' code, so on a slow link (2 s a chunk) a date set after a change of nights does not wait for it (m-1)', async () => {
    code.slowMs = 2000;
    const svc = await withRoute();
    expect(code.asked).toEqual([]);
    const details = await openDetails();
    // asked for as Trip details opens, before any change
    await until(() => code.asked.includes('heights') && code.asked.includes('day-stops'), 'the stops\' code asked for');
    // the rider reads and types meanwhile, and the code arrives
    await settle(2100);
    const before = await days();
    await typeNights(details, before);
    // the date set straight after the change of nights takes its turn behind it, and lands at once
    const from = Date.now();
    expect(await svc.setDeparture('2026-10-17')).toBeNull();
    expect(Date.now() - from).toBeLessThan(1500);
    expect(readLocalSettings().settings.nights).toBe(before);
    expect(await days()).toBe(before + 1);
    expect((await readTrip())!.departureDate).toBe('2026-10-17');
  }, 20_000);

  test('[TRIP-REPLAN-LOAD] when the stops\' code cannot load, a change of nights keeps the nights and says in one line beside them that the days update when Wayfinch can load again, naming no new stops; back online, the days follow (m-2)', async () => {
    await withRoute();
    // stops on the trip, so a change of nights that worked would say "New stops for … nights."
    const trip = (await readTrip())!;
    const ends = trip.route.stages.slice(0, -1).map((x) => x.endKm);
    expect(ends.length).toBeGreaterThan(0);
    await saveTrip({ ...trip, stops: { routeId: trip.route.id, basis: ends, days: ends.map((km, i) => ({ placeId: `p-${i}`, km, name: `Camping ${i + 1}`, town: null, by: 'auto' as const })) } });
    const before = trip.route.stages.length;
    code.fail = true;
    await show();
    const details = await openDetails();
    const n = before;
    await typeNights(details, n);
    const line = () => details.querySelector('#trip-nights-problem')?.textContent ?? '';
    await until(() => line() !== '', 'the line beside the nights');
    expect(line()).toBe(ONE_LINE);
    expect(details.querySelector('[data-nights-stops]')!.textContent).toBe('');
    // the nights are kept, the days are as they were
    expect(readLocalSettings().settings.nights).toBe(n);
    expect(await days()).toBe(before);
    expect((details.querySelector<HTMLInputElement>('#trip-nights'))!.value).toBe(String(n));
    // Back online: the code loads, and the days are planned for the nights set, without another change.
    code.fail = false;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await until(() => host.querySelector('[data-summary] .trip-days')?.children.length === n + 1, 'the days for the nights set');
    expect(await days()).toBe(n + 1);
    expect(readLocalSettings().settings.nights).toBe(n);
    // and the line that said they would goes
    await until(() => line() === '', 'the line gone');
  }, 20_000);

  test('[TRIP-REPLAN-LOAD] the days a change of nights could not plan are planned on the next open of Trip, once the code loads (m-2)', async () => {
    await withRoute();
    const before = await days();
    code.fail = true;
    const details = await openDetails();
    await typeNights(details, before);
    await until(() => (details.querySelector('#trip-nights-problem')?.textContent ?? '') !== '', 'the line beside the nights');
    expect(await days()).toBe(before);
    // Trip left, and opened again (the next visit) with the code there.
    act(() => render(null, host));
    code.fail = false;
    await show();
    await until(() => host.querySelector('[data-summary] .trip-days')?.children.length === before + 1, 'the days for the nights set');
    expect(await days()).toBe(before + 1);
    expect(readLocalSettings().settings.nights).toBe(before);
  }, 20_000);
});
