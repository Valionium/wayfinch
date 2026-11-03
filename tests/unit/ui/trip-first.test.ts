// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from 'vitest';
import { degradedSignal } from '../../../src/ui/degraded.ts';
import { screenSignal } from '../../../src/ui/nav.ts';
import { openOnFirstScreen } from '../../../src/ui/trip/first.ts';
import type { TripSnapshot } from '../../../src/ui/trip/services.ts';
import { DEFAULT_SETTINGS } from '../../../src/store/rules.ts';

const snap = (over: Partial<TripSnapshot> = {}): TripSnapshot => ({
  now: new Date(0), available: true, trip: null, settings: DEFAULT_SETTINGS, prepared: null, places: 0, forecastTo: null, zone: 'UTC',
  storageMb: null, day1LeaveBy: null, heightsLookedUp: false, running: false, ...over,
});
const running = snap({ running: true, trip: {} as TripSnapshot['trip'], prepared: {} as TripSnapshot['prepared'] });

beforeEach(() => { screenSignal.value = 'trip'; });
afterEach(() => { screenSignal.value = 'trip'; });

test('[TRIP-FIRST] with no running trip the app stays on Trip; with a running trip it opens on Ahead', async () => {
  await openOnFirstScreen({ load: () => Promise.resolve(snap()) }, false);
  expect(screenSignal.value).toBe('trip');
  await openOnFirstScreen({ load: () => Promise.resolve(running) }, false);
  expect(screenSignal.value).toBe('ahead');
});

test('[TRIP-FIRST] a link with its own address, or a tap on a tab before the answer arrives, is never overruled', async () => {
  await openOnFirstScreen({ load: () => Promise.resolve(running) }, true);
  expect(screenSignal.value).toBe('trip');
  await openOnFirstScreen({ load: () => { screenSignal.value = 'tools'; return Promise.resolve(running); } }, false);
  expect(screenSignal.value).toBe('tools');
});

test('[TRIP-FIRST] what the first read finds also settles which notices the shell shows', async () => {
  await openOnFirstScreen({ load: () => Promise.resolve(snap({ trip: {} as TripSnapshot['trip'], prepared: {} as TripSnapshot['prepared'] })) }, false);
  expect(degradedSignal.value).not.toContain('noRoute');
  await openOnFirstScreen({ load: () => Promise.resolve(snap()) }, false);
  expect(degradedSignal.value).toContain('noRoute');
});
