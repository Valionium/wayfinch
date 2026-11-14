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
  // The owner's rulings of 14 Nov 2026: own stops are kept and the other nights planned around them; one that cannot stay is named
  // with its old night, a day much longer or shorter than an even day is said, and the line says where to change a stop. (Before them:
  // "New stops for 3 nights. Stops you chose for the old nights are not kept.")
  test('[TRIP-STOPS-KEEP] 2 → 3 nights: the own stop is kept, named with its night, and the line says where to change a stop', async () => {
    const said = await setNights(snapOf([stop(92, 'rider'), stop(177, 'auto')]), '3');
    expect(said).toBe(TF.appTripStopsNewNights(3, TF.appTripStopNight('Camping 92', 2), '', ''));
    expect(said).toBe('New stops for 3 nights, planned around yours: Camping 92 (night 2). To change a stop, use Change stop under its day in Your route.');
    expect(said).toContain(BD.appTripStopChange);
    expect(said).toContain(TF.appTripSummaryTitle);
    expect(host.querySelector('[data-nights-stops]')!.getAttribute('role')).toBe('status');
  });

  test("[TRIP-STOPS-KEEP] nights up and down: own places and the rider's No stop are kept, each with its new night", async () => {
    expect(await setNights(snapOf([stop(92, 'rider'), stop(177, 'auto')]), '5')).toBe('New stops for 5 nights, planned around yours: Camping 92 (night 2). To change a stop, use Change stop under its day in Your route.');
    const noStop: TripStop = { placeId: null, km: plan[1]!.endKm, name: null, town: null, by: 'rider' };
    expect(await setNights(snapOf([stop(92, 'rider'), noStop]), '5')).toBe('New stops for 5 nights, planned around yours: Camping 92 (night 2), No stop (night 4). To change a stop, use Change stop under its day in Your route.');
    expect(await setNights(snapOf([stop(92, 'rider'), noStop]), '3')).toBe('New stops for 3 nights, planned around yours: Camping 92 (night 2), No stop (night 3). To change a stop, use Change stop under its day in Your route.');
  });

  test('[TRIP-STOPS-KEEP] fewer nights than own stops: the one between the two shortest days is named as not kept, with its old night', async () => {
    expect(await setNights(snapOf([stop(92, 'rider'), stop(177, 'rider')]), '1'))
      .toBe('New stops for 1 night, planned around yours: Camping 177 (night 1). Not kept: Camping 92 (was night 1). To change a stop, use Change stop under its day in Your route.');
  });

  test('[TRIP-STOPS-KEEP] a day much shorter or longer than an even day around an own stop is said in plain words; the stop is not moved', async () => {
    expect(await setNights(snapOf([stop(20, 'rider'), stop(177, 'auto')]), '1'))
      .toBe('New stops for 1 night, planned around yours: Camping 20 (night 1). Around your stops, day 1 (20 km) is much shorter than an even day; day 2 (250 km) is much longer than an even day. To change a stop, use Change stop under its day in Your route.');
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
