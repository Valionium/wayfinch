// @vitest-environment jsdom
// A change of nights chooses the nights' stops again (TRIP-DAY-STOPS); since the owner's ruling of 14 Nov 2026 the rider's own picks
// that still fit are kept (TRIP-STOPS-KEEP). Since PR 101's review (M4) it says so in one line beside the nights.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { planStages } from '../../../src/core/route/stages.ts';
import type { Trip, TripStop } from '../../../src/core/types.ts';
import { BD } from '../../../src/core/wording/en-beds.ts';
import { TF } from '../../../src/core/wording/en-trip-fields.ts';
import { DEFAULT_SETTINGS } from '../../../src/store/rules.ts';
import type { Settings } from '../../../src/store/rules.ts';
import type { SettingsOutcome, TripServices, TripSnapshot } from '../../../src/ui/trip/services.ts';
import { TripSettings } from '../../../src/ui/trip/settings.tsx';
import type { Settle } from '../../../src/ui/trip/settings.tsx';
import { flatRoute } from '../../fixtures/build.ts';

const host = document.createElement('div');
document.body.append(host);
beforeEach(() => { render(null, host); });
afterEach(() => { act(() => render(null, host)); });

const route = { ...flatRoute(270), id: 'route-flat270', hash: 'f'.repeat(64) };
const plan = [...planStages(route, { flatKph: 25, pace: 'sporting', nights: 2 })];
const stop = (km: number, by: TripStop['by']): TripStop => ({ placeId: `p-${km}`, km, name: `Camping ${km}`, town: null, by });

function snapOf(stops: TripStop[] | null, nights: number | null = 2): TripSnapshot {
  const trip: Trip = {
    route: { ...route, stages: plan }, departureDate: '2026-10-17', startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2, pace: 'sporting',
    ...(stops ? { stops: { routeId: route.id, basis: plan.slice(0, -1).map((s) => s.endKm), days: stops } } : {}),
  };
  return { now: new Date('2026-10-16T08:00:00Z'), available: true, trip, settings: { ...DEFAULT_SETTINGS, nights } as Settings, prepared: null, places: 4, forecastTo: null, forecastFetchedAt: null, zone: 'Europe/Berlin', storageMb: null, day1LeaveBy: null, heightsLookedUp: false, running: false, nothingSaved: false } as TripSnapshot;
}

/** `settle`: the stops as the settle leaves them once the nights have their places (none here unless a test gives them). */
async function setNights(snap: TripSnapshot, value: string, outcome: SettingsOutcome = { ok: true, reasons: {}, note: null }, settle: Settle = async () => null): Promise<string> {
  const services = { writeSettings: async () => outcome } as unknown as TripServices;
  await act(async () => { render(<TripSettings services={services} snap={snap} reload={async () => undefined} part="when" settle={settle} />, host); });
  const input = host.querySelector<HTMLInputElement>('#trip-nights')!;
  await act(async () => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return host.querySelector<HTMLElement>('[data-nights-stops]')?.textContent ?? '';
}

describe('A change of nights says the stops are chosen afresh (review of PR 101, M4)', () => {
  // The owner's rulings of 14 Nov 2026: own stops are kept and the other nights planned around them; one that cannot stay is named
  // with its old night, a day much longer or shorter than an even day is said, and the line says where to change a stop. (Before them:
  // "New stops for 3 nights. Stops you chose for the old nights are not kept.")
  test('[TRIP-STOPS-KEEP] 2 → 3 nights: the own stop is kept, named with its night, and the line says where to change a stop', async () => {
    const said = await setNights(snapOf([stop(92, 'rider'), stop(177, 'auto')]), '3');
    expect(said).toBe(TF.appTripStopsNewNights(3, TF.appTripStopNight('Camping 92', 2), '', ''));
    expect(said).toBe('New stops for 3 nights, keeping yours: Camping 92 (night 2). To change a stop, use Change stop under its day in Your route.');
    expect(said).toContain(BD.appTripStopChange);
    expect(said).toContain(TF.appTripSummaryTitle);
    expect(host.querySelector('[data-nights-stops]')!.getAttribute('role')).toBe('status');
  });

  // The coordinator's ruling on the rework's review (I-2): the rider's No stop is no fixed end; it stays on its night while that night
  // exists and no picked place ends it, and goes, named, otherwise.
  test("[TRIP-STOPS-KEEP] nights up and down: own places are kept with their new nights; the rider's No stop stays on its night or is named", async () => {
    const change = 'To change a stop, use Change stop under its day in Your route.';
    expect(await setNights(snapOf([stop(92, 'rider'), stop(177, 'auto')]), '5')).toBe(`New stops for 5 nights, keeping yours: Camping 92 (night 2). ${change}`);
    const noStop: TripStop = { placeId: null, km: plan[1]!.endKm, name: null, town: null, by: 'rider' };
    expect(await setNights(snapOf([stop(92, 'auto'), noStop]), '3')).toBe(`New stops for 3 nights, keeping yours: No stop (night 2). ${change}`);
    expect(await setNights(snapOf([stop(92, 'auto'), noStop]), '1')).toBe(`New stops for 1 night. Not kept: No stop (was night 2). ${change}`);
    // night 2 now ends at the place picked for night 1
    expect(await setNights(snapOf([stop(92, 'rider'), noStop]), '5')).toBe(`New stops for 5 nights, keeping yours: Camping 92 (night 2). Not kept: No stop (was night 2). ${change}`);
  });

  test('[TRIP-STOPS-KEEP] fewer nights than own stops: the one between the two shortest days is named as not kept, with its old night', async () => {
    expect(await setNights(snapOf([stop(92, 'rider'), stop(177, 'rider')]), '1'))
      .toBe('New stops for 1 night, keeping yours: Camping 177 (night 1). Not kept: Camping 92 (was night 1). To change a stop, use Change stop under its day in Your route.');
  });

  test('[TRIP-STOPS-KEEP] a day much shorter or longer than an even day around an own stop is said in plain words; the stop is not moved', async () => {
    const settled = async () => ({ routeId: route.id, basis: [20], days: [stop(20, 'rider')] });
    expect(await setNights(snapOf([stop(20, 'rider'), stop(177, 'auto')]), '1', undefined, settled))
      .toBe('New stops for 1 night, keeping yours: Camping 20 (night 1). Around your stops, day 1 (20 km) is much shorter than an even day; day 2 (250 km) is much longer than an even day. To change a stop, use Change stop under its day in Your route.');
  });

  // Review of the rework, m-3: the figure is the day as it ends once the other nights have their places, not the planned day.
  test('[TRIP-STOPS-KEEP] the length said is the day as it ends with the places chosen for the other nights', async () => {
    const one = [...planStages(route, { flatKph: 25, pace: 'sporting', nights: 1 })];
    const snap = snapOf(null, 1);
    snap.trip = { ...snap.trip!, route: { ...route, stages: one }, stops: { routeId: route.id, basis: [one[0]!.endKm], days: [stop(10, 'rider')] } };
    // planned 10 / 140 / 270: day 2 is 130 km, not much longer; the place for night 2 is at 150 km, so day 2 is 140 km
    const settled = async () => ({ routeId: route.id, basis: [10, 140], days: [stop(10, 'rider'), stop(150, 'auto')] });
    expect(await setNights(snap, '2', undefined, settled)).toBe('New stops for 2 nights, keeping yours: Camping 10 (night 1). Around your stops, day 1 (10 km) is much shorter than an even day; day 2 (140 km) is much longer than an even day. To change a stop, use Change stop under its day in Your route.');
  });

  test('[TRIP-STOPS-KEEP] a day ride has no nights: the own stops are named as not kept, never dropped without a word', async () => {
    expect(await setNights(snapOf([stop(92, 'rider'), stop(177, 'auto')]), '0')).toBe('A day ride has no nights, so your stops are not kept: Camping 92 (was night 1).');
  });

  test('[TRIP-DAY-STOPS] with automatic stops only: "New stops for 1 night."', async () => {
    expect(await setNights(snapOf([stop(92, 'auto'), stop(177, 'auto')]), '1')).toBe('New stops for 1 night.');
  });

  test('[TRIP-DAY-STOPS] nothing is said with no stops yet, for the same number of nights, for a day ride, or when the change is refused', async () => {
    expect(await setNights(snapOf(null), '3')).toBe('');
    expect(await setNights(snapOf([stop(92, 'rider'), stop(177, 'auto')]), '2')).toBe('');
    // a day ride with automatic stops only (with own stops it names them: TRIP-STOPS-KEEP, the owner's ruling of 14 Nov 2026)
    expect(await setNights(snapOf([stop(92, 'auto'), stop(177, 'auto')]), '0')).toBe('');
    expect(await setNights(snapOf([stop(92, 'rider'), stop(177, 'auto')]), '3', { ok: false, reasons: { nights: 'no' }, note: null })).toBe('');
  });
});

// Review of the Trip PRs, M9 (sweep 2 of 15 Nov 2026): with the nights left to the suggestion, a pace or flat speed that changes the
// suggested nights also plans the nights again (since the owner's rulings of 14 Nov 2026, around the rider's own stops). It says so,
// as a change of nights does, beside those fields, through the same line with the new pace or speed (review of PRs 160 and 163, I-1).
async function inDetails(snap: TripSnapshot, change: (root: HTMLElement) => void, outcome: SettingsOutcome = { ok: true, reasons: {}, note: null }, settle: Settle = async () => null): Promise<string> {
  const services = { writeSettings: async () => outcome, env: { weatherMode: 'off' } } as unknown as TripServices;
  await act(async () => { render(<TripSettings services={services} snap={snap} reload={async () => undefined} part="details" settle={settle} />, host); });
  await act(async () => { change(host); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return host.querySelector<HTMLElement>('[data-plan-stops]')?.textContent ?? '';
}
const speed = (value: string) => (root: HTMLElement): void => {
  const input = root.querySelector<HTMLInputElement>('#trip-kph')!;
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
const pace = (value: string) => (root: HTMLElement): void => {
  root.querySelector<HTMLInputElement>(`input[name="pace"][value="${value}"]`)!.click();
};

describe('A pace or flat speed that changes the suggested nights says the stops are chosen afresh (review of the Trip PRs, M9)', () => {
  // The owner's rulings of 14 Nov 2026 change these words: the own stop is kept, and the line says so (was "… Stops you chose for the
  // old nights are not kept.").
  test("[TRIP-DAY-STOPS] [TRIP-STOPS-KEEP] a slower flat speed, nights left to the suggestion (2 → 3), with the rider's own stop: kept, and said so", async () => {
    const said = await inDetails(snapOf([stop(92, 'rider'), stop(177, 'auto')], null), speed('15'));
    expect(said).toBe(TF.appTripStopsNewNights(3, TF.appTripStopNight('Camping 92', 2), '', ''));
    expect(said).toBe('New stops for 3 nights, keeping yours: Camping 92 (night 2). To change a stop, use Change stop under its day in Your route.');
    expect(host.querySelector('[data-plan-stops]')!.getAttribute('role')).toBe('status');
  });

  test('[TRIP-DAY-STOPS] a pace that changes the suggested nights (2 → 3, 2 → 1) says so; automatic stops only: the first sentence', async () => {
    expect(await inDetails(snapOf([stop(92, 'rider'), stop(177, 'auto')], null), pace('steady'))).toBe(TF.appTripStopsNewNights(3, TF.appTripStopNight('Camping 92', 2), '', ''));
    // a faster pace with two own stops (2 → 1): the one between the two shortest days is named as not kept
    act(() => render(null, host));
    expect(await inDetails(snapOf([stop(92, 'rider'), stop(177, 'rider')], null), pace('hard'))).toBe('New stops for 1 night, keeping yours: Camping 177 (night 1). Not kept: Camping 92 (was night 1). To change a stop, use Change stop under its day in Your route.');
    act(() => render(null, host));
    expect(await inDetails(snapOf([stop(92, 'auto'), stop(177, 'auto')], null), pace('hard'))).toBe('New stops for 1 night.');
  });

  test('[TRIP-DAY-STOPS] nothing is said when the nights are set, the suggestion stays, there are no stops, or the change is refused', async () => {
    // nights set by the rider: the days end where they did, the stops hold
    expect(await inDetails(snapOf([stop(92, 'rider'), stop(177, 'auto')], 2), speed('15'))).toBe('');
    expect(await inDetails(snapOf([stop(92, 'rider'), stop(177, 'auto')], 2), pace('steady'))).toBe('');
    // 26 km/h still suggests 2 nights
    expect(await inDetails(snapOf([stop(92, 'rider'), stop(177, 'auto')], null), speed('26'))).toBe('');
    expect(await inDetails(snapOf(null, null), speed('15'))).toBe('');
    expect(await inDetails(snapOf([stop(92, 'rider'), stop(177, 'auto')], null), speed('15'), { ok: false, reasons: { flatKph: 'no' }, note: null })).toBe('');
  });
});
