import { beforeEach, describe, expect, test, vi } from 'vitest';
import { freshStore } from './helpers.ts';
import { reportRide } from '../../../src/core/engines/ride-report.ts';
import { W } from '../../../src/core/wording/en.ts';
import { exportAll } from '../../../src/store/export.ts';
import { readProfile } from '../../../src/store/profile.ts';
import { logRide, readRides, writeProfile } from '../../../src/store/you.ts';

beforeEach(freshStore);
const NOW = new Date('2026-10-17T10:00:00Z');

test('[YOU-RIDER] a profile field is kept with its stamp; a value out of range is refused with the range named and the last good value stays', async () => {
  await readProfile();
  expect(await writeProfile({ weightKg: 82, capacityL: 2.5, ebike: true }, NOW)).toMatchObject({ ok: true, profile: { weightKg: 82, capacityL: 2.5, ebike: true } });
  const bad = await writeProfile({ weightKg: 19, capacityL: 21, thirst: 'lots', ebike: 'yes' }, NOW);
  expect(bad.ok).toBe(false);
  expect(bad.reasons).toEqual({ weightKg: W.appStoreWeightRange, capacityL: W.appStoreCapacityRange, thirst: W.appStoreThirstChoice, ebike: W.appStoreEbikeChoice });
  expect(await readProfile()).toMatchObject({ weightKg: 82, capacityL: 2.5, ebike: true, thirst: 'average' });
  // Empty is allowed: null clears.
  expect((await writeProfile({ weightKg: null, capacityL: null }, NOW)).ok).toBe(true);
  expect(await readProfile()).toMatchObject({ weightKg: null, capacityL: null });
  // Fields that are not the profile's are ignored.
  expect((await writeProfile({ k: 9, sumW: 9 } as never, NOW)).profile.k).toBe(1);
});

test('[YOU-RIDER] a window that has not read the profile since another changed it writes nothing', async () => {
  await readProfile();
  await writeProfile({ weightKg: 80 }, NOW);
  // Another window, with its own idea of which version it holds, changes the profile.
  vi.resetModules();
  const other = await import('../../../src/store/you.ts');
  const otherProfile = await import('../../../src/store/profile.ts');
  await otherProfile.readProfile();
  await other.writeProfile({ weightKg: 90 }, NOW);
  vi.resetModules();
  const mine = await writeProfile({ weightKg: 70 }, NOW);
  expect(mine.ok).toBe(false);
  expect(mine.newerReason).toBe(W.appStoreChangedElsewhere);
  expect((await readProfile()).weightKg).toBe(90);
  // After it reads again it may write.
  expect((await writeProfile({ weightKg: 70 }, NOW)).ok).toBe(true);
});

test('[YOU-WATER-LEARN] a logged ride moves k, the evidence and k_drink in one go, and the export carries the ride', async () => {
  await readProfile();
  await readRides();
  const report = (o: Partial<Parameters<typeof reportRide>[0]>) => {
    const r = reportRide({ at: NOW, hours: 5, intakeL: 3, feel: 'C', temp: 'warm', ...o }, { weightKg: 75, thirst: 'average', ebike: false, capacityL: null, k: 1, sumW: 0, kDrink: 1, weighedRides: 0 }, 25);
    if (!r.ok) throw new Error('refused');
    return r.ride;
  };
  const first = await logRide(report({}), NOW);
  expect(first.ok).toBe(true);
  expect(first.profile.k).toBeGreaterThan(1);
  expect(first.profile.sumW).toBeGreaterThan(0.4);
  expect(first.profile.weighedRides).toBe(0);
  expect(first.profile.kDrink).toBe(1);
  const second = await logRide(report({ at: new Date(NOW.getTime() + 86_400_000), feel: null, massLossKg: 1.5 }), new Date(NOW.getTime() + 86_400_000));
  expect(second.profile.weighedRides).toBe(1);
  expect(await readRides()).toHaveLength(2);
  expect((await exportAll()).calibration.rides).toHaveLength(2);
  expect((await readProfile()).sumW).toBe(second.profile.sumW);
});

test('[YOU-RIDER] a changed thirst answer moves the starting point of k and keeps the rides', async () => {
  await readProfile();
  await writeProfile({ thirst: 'more' }, NOW);
  expect((await readProfile()).k).toBeCloseTo(1.2, 6);
  await writeProfile({ thirst: 'less' }, NOW);
  expect((await readProfile()).k).toBeCloseTo(1, 6); // "less" never lowers the prior
  await writeProfile({ thirst: 'average' }, NOW);
  expect((await readProfile()).thirst).toBe('average');
});

describe('hilly reports (owner ruling "small": one tap, kept apart)', () => {
  const profile0 = { weightKg: 75, thirst: 'average' as const, ebike: false, capacityL: null, k: 1, sumW: 0, kDrink: 1, weighedRides: 0 };
  const ride = (o: Partial<Parameters<typeof reportRide>[0]>) => {
    const r = reportRide({ at: NOW, hours: 5, intakeL: 3, feel: 'C', temp: 'warm', ...o }, profile0, 25);
    if (!r.ok) throw new Error('refused');
    return r.ride;
  };

  test('[YOU-TERRAIN] a hilly report is kept but moves neither k, nor the evidence, nor k_drink, nor the weighed count', async () => {
    await readProfile();
    await readRides();
    const before = await readProfile();
    const hilly = await logRide(ride({ hilly: true }), NOW);
    expect(hilly.ok).toBe(true);
    expect(hilly.profile).toEqual(before);
    const weighedHilly = await logRide(ride({ hilly: true, massLossKg: 2, at: new Date(NOW.getTime() + 1) }), NOW);
    expect(weighedHilly.profile).toEqual(before);
    expect(await readRides()).toHaveLength(2);
    // A flat report after them moves the factors exactly as it would have alone.
    const flat = await logRide(ride({ at: new Date(NOW.getTime() + 2) }), NOW);
    expect(flat.profile.k).toBeGreaterThan(1);
    const alone = (await import('../../../src/core/engines/water-factors.ts')).updateCarrying({ thirst: 'average' }, [ride({ at: new Date(NOW.getTime() + 2) })], NOW);
    expect(flat.profile.k).toBeCloseTo(alone.k, 9);
    expect(flat.profile.sumW).toBeCloseTo(alone.sumW, 9);
  });

  test('[YOU-TERRAIN] the export format is unchanged: a hilly report never travels, and an import keeps the hilly reports on the phone', async () => {
    await readProfile();
    await readRides();
    await logRide(ride({ hilly: true }), NOW);
    await logRide(ride({ at: new Date(NOW.getTime() + 1) }), NOW);
    const file = await exportAll();
    expect(file.calibration.rides).toHaveLength(1);
    expect(Object.keys(file.calibration.rides[0]!).sort()).toEqual(['at', 'feel', 'intakeL', 'predictedL']);
    expect(JSON.stringify(file)).not.toContain('hilly');
    const { importAll } = await import('../../../src/store/export.ts');
    await readProfile();
    await readRides();
    expect((await importAll(JSON.parse(JSON.stringify(file)))).ok).toBe(true);
    const rides = await readRides();
    expect(rides).toHaveLength(2);
    expect(rides.filter((r) => r.hilly === true)).toHaveLength(1);
  });
});
