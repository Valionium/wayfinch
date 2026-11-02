import { beforeEach, expect, test } from 'vitest';
import { freshStore, route, trip } from './helpers.ts';
import fc from 'fast-check';
import { usableFlatKph } from '../../../src/core/engines/pace.ts';
import type { Trip } from '../../../src/core/types.ts';
import { openDb } from '../../../src/store/db.ts';
import { readInputs } from '../../../src/store/inputs.ts';
import { readSettings, writeSettings } from '../../../src/store/settings.ts';
import { readTrip, replaceRoute, saveTrip } from '../../../src/store/trip.ts';

beforeEach(freshStore);
const NOW = new Date('2026-10-17T10:00:00Z');

test('[ST-SETTINGS-RANGE] flat speed outside 15 to 40 is refused with the range named, and the last good value stays', async () => {
  await writeSettings({ flatKph: 22 });
  for (const bad of [14.9, 40.1, 0, Number.NaN, Infinity, -20]) {
    const r = await writeSettings({ flatKph: bad });
    expect(r.ok, String(bad)).toBe(false);
    expect(r.reasons.flatKph).toMatch(/15.*40/);
    expect((await readSettings()).flatKph).toBe(22);
  }
  for (const good of [15, 40]) {
    const r = await writeSettings({ flatKph: good });
    expect(r.ok).toBe(true);
    expect(r.settings.flatKph).toBe(good);
    expect((await readSettings()).flatKph).toBe(good);
  }
});

test("[ST-SETTINGS-RANGE] each setting keeps to section 3.3's range", async () => {
  const cases: [string, unknown[], unknown[]][] = [
    ['startTime', ['03:59', '14:01', '25:99', '8:30', '', 830, null], ['04:00', '14:00', '08:30']],
    ['nights', [-1, 31, 1.5, Number.NaN, '2'], [0, 30, 7, null]],
    ['campWaterL', [-0.1, 5.1, Number.NaN, '2', null], [0, 5, 1.5]],
    ['pace', ['fast', null], ['steady', 'sporting', 'hard']],
    ['stay', ['tent', null], ['camping', 'mixed', 'accommodation']],
    ['theme', ['blue'], ['auto', 'light', 'dark']],
    ['units', ['furlongs'], ['metric', 'imperial']],
    ['keepFresh', ['yes', 1], [true, false]],
    ['slashKey', ['yes', 1], [true, false]],
  ];
  for (const [field, bad, good] of cases) {
    for (const value of good) expect((await writeSettings({ [field]: value })).ok, `${field} ${String(value)}`).toBe(true);
    const last = (await readSettings() as unknown as Record<string, unknown>)[field];
    for (const value of bad) {
      const r = await writeSettings({ [field]: value });
      expect(r.ok, `${field} ${String(value)}`).toBe(false);
      expect((r.reasons as Record<string, string>)[field], field).toBeTruthy();
      expect((await readSettings() as unknown as Record<string, unknown>)[field]).toEqual(last);
    }
  }
});

test('[ST-SETTINGS-RANGE] a mixed write applies the good values and names the bad', async () => {
  const r = await writeSettings({ flatKph: 99, pace: 'hard' });
  expect(r.ok).toBe(false);
  expect(Object.keys(r.reasons)).toEqual(['flatKph']);
  expect(r.settings).toMatchObject({ pace: 'hard', flatKph: 25 });
});

test('[ST-SETTINGS-RANGE] a trip with a bad speed or time cannot be saved', async () => {
  for (const bad of [{ flatKph: 14.9 }, { flatKph: Number.NaN }, { startTime: '25:99' }, { campWaterL: 9 }, { departureDate: 'soon' }, { stay: 'tent' }] as Partial<Trip>[]) {
    await expect(saveTrip(trip(bad)), JSON.stringify(bad)).rejects.toThrow();
  }
  expect(await readTrip()).toBeNull();
});

test('[ST-SETTINGS-RANGE] screen() never receives a bad speed through the store: not from settings, nor from a damaged record', async () => {
  await saveTrip(trip());
  await readSettings();
  await fc.assert(fc.asyncProperty(fc.oneof(fc.double(), fc.constantFrom(0, 14.9, 40.1, Number.NaN, 15, 40, 25)), async (speed) => {
    await writeSettings({ flatKph: speed });
    const i = (await readInputs(NOW))!;
    expect(usableFlatKph(i.trip.flatKph)).toBe(true);
    expect(Number.isFinite(i.trip.flatKph)).toBe(true);
  }), { numRuns: 25 });

  // A record damaged some other way, say by a rollback.
  await writeSettings({ flatKph: 23 });
  const db = await openDb();
  for (const bad of [Number.NaN, 3, 400, 'fast', undefined]) {
    await db.put('trip', { ...trip(), flatKph: bad, startTime: '99:99', campWaterL: -4, stay: 'tent', departureDate: 'soon', pace: 'zoom' }, 'current');
    const i = (await readInputs(NOW))!;
    expect(i.trip.flatKph).toBe(23);
    expect(i.trip).toMatchObject({ startTime: '08:30', stay: 'camping', campWaterL: 2, departureDate: null });
    expect(i.trip.pace).toBeUndefined();
  }
});

test('[ST-SETTINGS-RANGE] a damaged settings record reads as the defaults, field by field', async () => {
  localStorage.setItem('copilot:settings', '{not json');
  expect((await readSettings()).flatKph).toBe(25);
  localStorage.setItem('copilot:settings', JSON.stringify({ updatedAt: 'x', flatKph: 'fast', pace: 'hard' }));
  expect(await readSettings()).toMatchObject({ flatKph: 25, pace: 'hard' });
});

test("[ST-CAMP-ONE] the screen's camp water always equals the trip's, whichever way it was changed", async () => {
  await saveTrip(trip({ campWaterL: 1.5 }));
  await readSettings();
  const same = async (litres: number): Promise<void> => {
    const i = (await readInputs(NOW))!;
    expect(i.settings.campWaterL).toBe(litres);
    expect(i.trip.campWaterL).toBe(litres);
    expect((await readSettings()).campWaterL).toBe(litres);
  };
  await same(1.5);
  await writeSettings({ campWaterL: 3 });
  await same(3);
  await saveTrip({ ...(await readTrip())!, campWaterL: 4 });
  await same(4);
  await writeSettings({ campWaterL: 9 });
  await same(4);
  await readTrip();
  await replaceRoute(route({ id: 'route-new' }, 50));
  await same(4);
});

test('[ST-CAMP-ONE] changing stay to accommodation gives 0 by default; an edit afterwards stays', async () => {
  await saveTrip(trip({ campWaterL: 1.5 }));
  await readSettings();
  await writeSettings({ stay: 'accommodation' });
  expect((await readInputs(NOW))!.settings.campWaterL).toBe(0);

  await writeSettings({ campWaterL: 1 });
  expect((await readInputs(NOW))!.settings.campWaterL).toBe(1);
  await writeSettings({ pace: 'hard' });
  await writeSettings({ stay: 'accommodation' });
  expect((await readInputs(NOW))!.settings.campWaterL).toBe(1);
});

test('[ST-CAMP-ONE] the same holds before any route, and a value given with the stay wins', async () => {
  await writeSettings({ stay: 'accommodation' });
  expect((await readSettings()).campWaterL).toBe(0);
  await writeSettings({ stay: 'camping' });
  expect((await readSettings()).campWaterL).toBe(2);
  await writeSettings({ stay: 'accommodation', campWaterL: 0.5 });
  expect((await readSettings()).campWaterL).toBe(0.5);
  await replaceRoute(route({ id: 'route-first' }));
  expect((await readTrip())!.campWaterL).toBe(0.5);
});
