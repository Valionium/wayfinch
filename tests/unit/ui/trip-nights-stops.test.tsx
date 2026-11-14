// @vitest-environment jsdom
// A change of nights chooses every night's stop afresh (TRIP-DAY-STOPS: other nights choose afresh, the rider's picks for the old
// plan are not carried over). Since PR 101's review (M4) it says so in one line beside the nights.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { planStages } from '../../../src/core/route/stages.ts';
import type { Trip, TripStop } from '../../../src/core/types.ts';
import { TF } from '../../../src/core/wording/en-trip-fields.ts';
import { DEFAULT_SETTINGS } from '../../../src/store/rules.ts';
import type { Settings } from '../../../src/store/rules.ts';
import type { SettingsOutcome, TripServices, TripSnapshot } from '../../../src/ui/trip/services.ts';
import { TripSettings } from '../../../src/ui/trip/settings.tsx';
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

async function setNights(snap: TripSnapshot, value: string, outcome: SettingsOutcome = { ok: true, reasons: {}, note: null }): Promise<string> {
  const services = { writeSettings: async () => outcome } as unknown as TripServices;
  await act(async () => { render(<TripSettings services={services} snap={snap} reload={async () => undefined} part="when" />, host); });
  const input = host.querySelector<HTMLInputElement>('#trip-nights')!;
  await act(async () => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return host.querySelector<HTMLElement>('[data-nights-stops]')?.textContent ?? '';
}

describe('A change of nights says the stops are chosen afresh (review of PR 101, M4)', () => {
  test('[TRIP-DAY-STOPS] with the rider\'s own stop: "New stops for 3 nights. Stops you chose for the old nights are not kept."', async () => {
    const said = await setNights(snapOf([stop(92, 'rider'), stop(177, 'auto')]), '3');
    expect(said).toBe(TF.appTripStopsNewNights(3, true));
    expect(said).toBe('New stops for 3 nights. Stops you chose for the old nights are not kept.');
    expect(host.querySelector('[data-nights-stops]')!.getAttribute('role')).toBe('status');
  });

  test('[TRIP-DAY-STOPS] with automatic stops only: "New stops for 1 night."', async () => {
    expect(await setNights(snapOf([stop(92, 'auto'), stop(177, 'auto')]), '1')).toBe('New stops for 1 night.');
  });

  test('[TRIP-DAY-STOPS] nothing is said with no stops yet, for the same number of nights, for a day ride, or when the change is refused', async () => {
    expect(await setNights(snapOf(null), '3')).toBe('');
    expect(await setNights(snapOf([stop(92, 'rider'), stop(177, 'auto')]), '2')).toBe('');
    expect(await setNights(snapOf([stop(92, 'rider'), stop(177, 'auto')]), '0')).toBe('');
    expect(await setNights(snapOf([stop(92, 'rider'), stop(177, 'auto')]), '3', { ok: false, reasons: { nights: 'no' }, note: null })).toBe('');
  });
});

// Review of the Trip PRs, M9 (sweep 2 of 15 Nov 2026): with the nights left to the suggestion, a pace or flat speed that changes the
// suggested nights also chooses every night's stop afresh. It says so, as a change of nights does, beside those fields.
async function inDetails(snap: TripSnapshot, change: (root: HTMLElement) => void, outcome: SettingsOutcome = { ok: true, reasons: {}, note: null }): Promise<string> {
  const services = { writeSettings: async () => outcome, env: { weatherMode: 'off' } } as unknown as TripServices;
  await act(async () => { render(<TripSettings services={services} snap={snap} reload={async () => undefined} part="details" />, host); });
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
  test('[TRIP-DAY-STOPS] a slower flat speed, nights left to the suggestion (2 → 3), with the rider\'s own stop: the nights line', async () => {
    const said = await inDetails(snapOf([stop(92, 'rider'), stop(177, 'auto')], null), speed('15'));
    expect(said).toBe(TF.appTripStopsNewNights(3, true));
    expect(said).toBe('New stops for 3 nights. Stops you chose for the old nights are not kept.');
    expect(host.querySelector('[data-plan-stops]')!.getAttribute('role')).toBe('status');
  });

  test('[TRIP-DAY-STOPS] a pace that changes the suggested nights (2 → 3, 2 → 1) says so; automatic stops only: the first sentence', async () => {
    expect(await inDetails(snapOf([stop(92, 'rider'), stop(177, 'auto')], null), pace('steady'))).toBe(TF.appTripStopsNewNights(3, true));
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
