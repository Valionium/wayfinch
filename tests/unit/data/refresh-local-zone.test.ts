// A trip prepared while the boundary file failed has no zones stored. Update weather then tells its times in the phone's zone, as
// every other screen does before the route's zone is known, never in UTC (review of the Trip PRs, M1; sweep of 14 Nov 2026, #1).
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { formatHm } from '../../../src/core/answers/time.ts';
import type { StoredForecast } from '../../../src/core/types.ts';
import { refreshWeather } from '../../../src/data/refresh.ts';
import { openDb, CURRENT } from '../../../src/store/db.ts';
import { readStretchState } from '../../../src/store/stretch.ts';
import { saveTrip } from '../../../src/store/trip.ts';
import { markPrepared, readWeatherState, weatherStore } from '../../../src/store/weather.ts';
import { at, testTrip } from '../../fixtures/build.ts';
import { stubFetch } from '../../fixtures/openmeteo.ts';
import { freshStore } from '../store/helpers.ts';

const TZ_BEFORE = process.env.TZ;
function phoneIn(zone: string): void {
  process.env.TZ = zone;
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
}
beforeEach(freshStore);
afterAll(() => { if (TZ_BEFORE === undefined) delete process.env.TZ; else process.env.TZ = TZ_BEFORE; });

/** Prepared, but the boundary file failed: no zones stored (PREP-ZONES). A forecast fetched ten minutes ago. */
async function preparedWithoutZones(fetchedAt: Date): Promise<void> {
  const trip = testTrip();
  await saveTrip(trip);
  await markPrepared(trip.route.id);
  const forecast: StoredForecast = { fetchedAt, runs: [], grid: [{ km: 0, lat: 49, lon: 8.4, hours: [], rain15: undefined as never }], has15: false };
  await (await openDb()).put('forecast', forecast, CURRENT);
}

describe('Update weather without stored zones (review M1)', () => {
  test('[TRIP-LOCAL-ZONE] the weather and stretch reads hand on the phone\'s zone when none is stored', async () => {
    phoneIn('America/New_York');
    await preparedWithoutZones(at('2026-10-17 09:50'));
    expect((await readWeatherState())!.routeZones[0]!.timeZone).toBe('America/New_York');
    expect((await readStretchState())!.routeZones[0]!.timeZone).toBe('America/New_York');
  });

  test('[TRIP-LOCAL-ZONE] a tap within half an hour says when to try again in the phone\'s time, not UTC', async () => {
    phoneIn('America/New_York');
    const now = at('2026-10-17 10:00');
    await preparedWithoutZones(at('2026-10-17 09:50'));
    const f = stubFetch(() => { throw new Error('nothing may be asked'); });
    const out = await refreshWeather({ mode: 'tap', fetch: f, now: () => now, signal: true, keepFresh: true, store: weatherStore }, 'tap');
    expect(out.fetched).toBe(false);
    expect(out.say).toContain(formatHm(new Date(now.getTime() + 20 * 60_000), 'America/New_York'));
    expect(out.say).not.toContain(formatHm(new Date(now.getTime() + 20 * 60_000), 'UTC'));
  });
});
