// @vitest-environment jsdom
// Trip prep's list on its own (design of 15 November 2026): the items, their links, and the ticks on this phone.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Trip } from '../../../src/core/types.ts';
import { PR } from '../../../src/core/wording/en-prep.ts';
import { PREP_TICKS_KEY } from '../../../src/store/prep-ticks.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { toolHref } from '../../../src/ui/tools/bike-link.ts';
import { BeforeYouGo } from '../../../src/ui/trip/prep.tsx';
import type { TripSnapshot } from '../../../src/ui/trip/services.ts';
import { testTrip } from '../../fixtures/build.ts';

const host = document.createElement('div');
document.body.append(host);
// Trip's bike is the bag planner's current one.
const withBike = (): void => { localStorage.setItem('loadcheck:bikeProfile', JSON.stringify({ id: 'bike_1', name: 'Blue', brakes: 'rim', drive: 'derailleur' })); refreshBikeSource(); };
const snap = (trip: Trip): Pick<TripSnapshot, 'trip'> => ({ trip });

beforeEach(() => { render(null, host); localStorage.clear(); refreshBikeSource(); });
afterEach(() => { render(null, host); vi.restoreAllMocks(); });

const boxes = (): HTMLInputElement[] => [...host.querySelectorAll<HTMLInputElement>('[data-prep] input[type=checkbox]')];
const item = (id: string): HTMLElement => host.querySelector<HTMLElement>(`[data-prep-item="${id}"]`)!;

test('[TRIP-PREP-ITEMS] [TRIP-PREP-LINKS] a heading, a line that the ticks are the rider\'s own, one box per item, and a link where the app does it', async () => {
  withBike();
  await act(() => { render(<BeforeYouGo snap={snap(testTrip())} />, host); });
  expect(host.querySelector('[data-prep] h3')!.textContent).toBe(PR.prepTitle);
  expect(host.textContent).toContain(PR.prepIntro);
  expect(boxes().length).toBe(host.querySelectorAll('[data-prep-item]').length);
  expect(boxes().every((b) => !b.checked)).toBe(true);
  // each box has its item's words as its name
  expect(item('kit').querySelector('label')!.textContent).toContain(PR.prepKit);
  // Bike care, with Trip's bike chosen there; the accessible name starts with the words shown
  const care = item('brakes-pads-rim').querySelector('a')!;
  expect(care.getAttribute('href')).toBe('#/tools/care?bike=bike_1');
  expect(care.getAttribute('href')).toBe(toolHref('tools/care', 'bike_1'));
  expect(care.textContent).toBe(PR.prepInCare);
  expect(care.getAttribute('aria-label')).toBe(PR.prepInCareLabel('Check the rim brake pads and rim wear'));
  expect(item('kit').querySelector('a')!.getAttribute('href')).toBe('#/tools/care?bike=bike_1');
  expect(item('tell').querySelector('a, button')).toBeNull();
  expect(item('charge').querySelector('a, button')).toBeNull();
  expect(item('night').querySelector('a, button')).toBeNull();
  // the forecast is this step's own button, above the list
  expect(item('forecast').querySelector('a, button')).toBeNull();
});

test('[TRIP-PREP-LINKS] with no bike, Bike care opens as it is', async () => {
  await act(() => { render(<BeforeYouGo snap={snap(testTrip())} />, host); });
  expect(item('tyres-pressure').querySelector('a')!.getAttribute('href')).toBe('#/tools/care');
});

test('[TRIP-PREP-TICKS] a tick is kept on this phone for this route and shows again; a refused tick stays on screen and the rider is told', async () => {
  withBike();
  const trip = testTrip();
  await act(() => { render(<BeforeYouGo snap={snap(trip)} />, host); });
  const kit = item('kit').querySelector<HTMLInputElement>('input')!;
  await act(() => { kit.click(); });
  expect(kit.checked).toBe(true);
  expect(JSON.parse(localStorage.getItem(PREP_TICKS_KEY)!)).toEqual({ route: trip.route.id, ticked: ['kit'] });
  expect(host.querySelector('[role=status]')).toBeNull();
  // drawn again (the step folded and opened): the tick is read back
  await act(() => { render(null, host); });
  await act(() => { render(<BeforeYouGo snap={snap(trip)} />, host); });
  expect(item('kit').querySelector<HTMLInputElement>('input')!.checked).toBe(true);
  // another route: no ticks
  await act(() => { render(<BeforeYouGo snap={snap({ ...trip, route: { ...trip.route, id: 'route-other' } })} />, host); });
  expect(boxes().every((b) => !b.checked)).toBe(true);
  // storage refused: the tick shows, and the line says it is not kept
  await act(() => { render(<BeforeYouGo snap={snap(trip)} />, host); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  const charge = item('charge').querySelector<HTMLInputElement>('input')!;
  await act(() => { charge.click(); });
  expect(charge.checked).toBe(true);
  expect(host.querySelector('[role=status]')!.textContent).toBe(PR.prepNotKept);
  expect(JSON.parse(localStorage.getItem(PREP_TICKS_KEY)!)).toEqual({ route: trip.route.id, ticked: ['kit'] });
});

test('[TRIP-PREP-ITEMS] with no trip there is no list', async () => {
  await act(() => { render(<BeforeYouGo snap={{ trip: null }} />, host); });
  expect(host.querySelector('[data-prep]')).toBeNull();
});
