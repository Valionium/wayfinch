// @vitest-environment jsdom
// Trip prep's list on its own (design of 15 November 2026): the items, their links, and the ticks on this phone.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { normaliseBike } from '../../../src/core/bike/normalise.ts';
import { PR } from '../../../src/core/wording/en-prep.ts';
import { PREP_TICKS_KEY } from '../../../src/store/prep-ticks.ts';
import { BeforeYouGo } from '../../../src/ui/trip/prep.tsx';
import { testTrip } from '../../fixtures/build.ts';

const host = document.createElement('div');
document.body.append(host);
const bike = normaliseBike({ id: 'bike_1', name: 'Blue', brakes: 'rim', drive: 'derailleur' })!;

beforeEach(() => { render(null, host); localStorage.clear(); });
afterEach(() => { render(null, host); vi.restoreAllMocks(); });

const boxes = (): HTMLInputElement[] => [...host.querySelectorAll<HTMLInputElement>('[data-prep] input[type=checkbox]')];
const item = (id: string): HTMLElement => host.querySelector<HTMLElement>(`[data-prep-item="${id}"]`)!;

test('[TRIP-PREP-ITEMS] [TRIP-PREP-LINKS] a heading, a line that the ticks are the rider\'s own, one box per item, and a link where the app does it', async () => {
  const openPrepare = vi.fn();
  await act(() => { render(<BeforeYouGo trip={testTrip()} bike={bike} prepared openPrepare={openPrepare} />, host); });
  expect(host.querySelector('[data-prep] h3')!.textContent).toBe(PR.prepTitle);
  expect(host.textContent).toContain(PR.prepIntro);
  expect(boxes().length).toBe(host.querySelectorAll('[data-prep-item]').length);
  expect(boxes().every((b) => !b.checked)).toBe(true);
  // each box has its item's words as its name
  expect(item('kit').querySelector('label')!.textContent).toContain(PR.prepKit);
  // Bike care, with Trip's bike chosen there; the accessible name starts with the words shown
  const care = item('brakes-pads-rim').querySelector('a')!;
  expect(care.getAttribute('href')).toBe('#/tools/care?bike=bike_1');
  expect(care.textContent).toBe(PR.prepInCare);
  expect(care.getAttribute('aria-label')).toBe(PR.prepInCareLabel('Check the rim brake pads and rim wear'));
  expect(item('kit').querySelector('a')!.getAttribute('href')).toBe('#/tools/care?bike=bike_1');
  expect(item('tell').querySelector('a')!.getAttribute('href')).toBe('#/ahead');
  expect(item('charge').querySelector('a, button')).toBeNull();
  expect(item('night').querySelector('a, button')).toBeNull();
  const open = item('forecast').querySelector('button')!;
  expect(open.textContent).toBe(PR.prepOpenPrepare);
  await act(() => { open.click(); });
  expect(openPrepare).toHaveBeenCalledTimes(1);
});

test('[TRIP-PREP-LINKS] with no bike, Bike care opens as it is; not yet prepared, telling someone links nowhere', async () => {
  await act(() => { render(<BeforeYouGo trip={testTrip()} bike={null} prepared={false} openPrepare={() => undefined} />, host); });
  expect(item('tyres-pressure').querySelector('a')!.getAttribute('href')).toBe('#/tools/care');
  expect(item('tell').querySelector('a, button')).toBeNull();
});

test('[TRIP-PREP-TICKS] a tick is kept on this phone for this route and shows again; a refused tick stays on screen and the rider is told', async () => {
  const trip = testTrip();
  await act(() => { render(<BeforeYouGo trip={trip} bike={bike} prepared openPrepare={() => undefined} />, host); });
  const kit = item('kit').querySelector<HTMLInputElement>('input')!;
  await act(() => { kit.click(); });
  expect(kit.checked).toBe(true);
  expect(JSON.parse(localStorage.getItem(PREP_TICKS_KEY)!)).toEqual({ route: trip.route.id, ticked: ['kit'] });
  expect(host.querySelector('[role=status]')).toBeNull();
  // drawn again (the step folded and opened): the tick is read back
  await act(() => { render(null, host); });
  await act(() => { render(<BeforeYouGo trip={trip} bike={bike} prepared openPrepare={() => undefined} />, host); });
  expect(item('kit').querySelector<HTMLInputElement>('input')!.checked).toBe(true);
  // another route: no ticks
  await act(() => { render(<BeforeYouGo trip={{ ...trip, route: { ...trip.route, id: 'route-other' } }} bike={bike} prepared openPrepare={() => undefined} />, host); });
  expect(boxes().every((b) => !b.checked)).toBe(true);
  // storage refused: the tick shows, and the line says it is not kept
  await act(() => { render(<BeforeYouGo trip={trip} bike={bike} prepared openPrepare={() => undefined} />, host); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  const charge = item('charge').querySelector<HTMLInputElement>('input')!;
  await act(() => { charge.click(); });
  expect(charge.checked).toBe(true);
  expect(host.querySelector('[role=status]')!.textContent).toBe(PR.prepNotKept);
  expect(JSON.parse(localStorage.getItem(PREP_TICKS_KEY)!)).toEqual({ route: trip.route.id, ticked: ['kit'] });
});
