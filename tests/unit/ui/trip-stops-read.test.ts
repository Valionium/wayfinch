// The stops on the profile and the day-end beds come from one read of the saved places (review of PR 98, M7): 13,635 places on
// Heidelberg to Cologne were read twice on every change.
import { expect, test, vi } from 'vitest';
import { flatRoute } from '../../fixtures/build.ts';

const reads = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../../src/store/inputs.ts', () => ({
  readInputs: async () => {
    reads.n += 1;
    return { trip: { route: flatRoute(100, { stageEnds: [50, 100] }), stay: 'mixed', departureDate: null }, places: [], matches: [], hours: [] };
  },
}));
vi.mock('../../../src/core/screen/route-stops.ts', () => ({ routeStops: () => [] }));

test('[TRIP-DAY-BEDS] the stops and the day-end beds asked together read the saved places once', async () => {
  const { readDayBeds, readStops } = await import('../../../src/ui/trip/stops.ts');
  const at = new Date('2026-11-09T10:00:00Z');
  await Promise.all([readStops(at), readDayBeds(at)]);
  expect(reads.n).toBe(1);
  await new Promise((r) => setTimeout(r, 300));
  await readDayBeds(at); // a later change reads afresh
  expect(reads.n).toBe(2);
});
