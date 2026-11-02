// What the simulator found that the rule tests had missed. Each saved failure in tests/regressions/ has its plain case here.
import { describe, expect, test } from 'vitest';
import { buildScreen, screen } from '../../../../src/core/screen/screen.ts';
import { at, bakery, cafe, pos, shop, tap } from '../../../fixtures/build.ts';
import { inputsOf } from './screen-helpers.ts';

describe('what the simulator found', () => {
  test('[INV-22] a place whose data date is no date gives the Water card no such date', () => {
    const i = inputsOf({ spots: [{ b: tap(), km: 20 }, { b: tap({ dataDate: 'not a date' }), km: 30 }] });
    expect(screen(i).cards.water.freshness.dataDates['places']).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  test('[INV-03] a shop that Food does not count as food is no water source', () => {
    const odd = shop('Mo-Su 00:00-24:00', { tags: { shop: 'constructor' } });
    const i = inputsOf({ spots: [{ b: odd, km: 100, id: 'n1' }, { b: tap(), km: 120, id: 'n2' }, { b: tap(), km: 130, id: 'n3' }], now: '2026-10-17 08:00' });
    const { s1 } = buildScreen(i).parts.targets!;
    expect(s1.kind === 'place' ? s1.place.id : s1.kind).toBe('n2');
  });

  test('[INV-19] two fixes of the same moment: the ride and everything measured from the position read the same one, whichever came first', () => {
    const rough = pos({ km: 40, at: '2026-10-17 12:00', acc: 2000 });
    const good = pos({ km: 40, at: '2026-10-17 12:00', acc: 15 });
    for (const positions of [[rough, good], [good, rough]]) {
      const b = buildScreen(inputsOf({ positions, now: '2026-10-17 12:10' }));
      expect(b.parts.position?.accuracyM).toBe(15);
      expect(b.screen.ride.startKm).toBe(40);
      expect(b.screen.ride.behindFromKm).toBe(40);
    }
  });

  test('[INV-19] a position at home, 40 km off the route, says nothing about water: the amount still stands', () => {
    const spots = [{ b: tap(), km: 5 }, { b: tap(), km: 20 }, { b: tap(), km: 40 }];
    const base = inputsOf({ now: '2026-10-17 08:00', spots });
    const moment = { ...base, waterLeft: { litres: 2, at: at('2026-10-17 07:30'), confirmed: true } };
    const home = { ...moment, positions: [pos({ km: 30, at: '2026-10-17 07:55', off: 40_000 })] };
    expect(screen(home).cards.water.title).toBe(screen(moment).cards.water.title);
    expect(screen(home).cards.water.status).toBe(screen(moment).cards.water.status);
  });

  test('[INV-29] the places inside an approximate position radius come in one order on the Food card', () => {
    const open = 'Mo-Su 06:00-22:00';
    const a = inputsOf({ positions: [pos({ km: 40, at: '2026-10-17 12:00', acc: 2000 })], now: '2026-10-17 12:10', spots: [{ b: cafe(open, { name: 'One' }), km: 39.5, id: 'n1' }, { b: cafe(open, { name: 'Two' }), km: 40.5, id: 'n2' }, { b: cafe(open, { name: 'Three' }), km: 41, id: 'n3' }] });
    const b = { ...a, places: [...a.places].reverse(), matches: [...a.matches].reverse() };
    expect(screen(b).cards.food.items.map((x) => x.label)).toEqual(screen(a).cards.food.items.map((x) => x.label));
  });

  test('[INV-29] two food places with the same latest departure are named in the same order, however the list comes', () => {
    const until = bakery('Mo-Su 06:00-22:00');
    const spots = [{ b: until, km: 40, id: 'n11' }, { b: until, km: 50, id: 'n12' }, { b: until, km: [60, 70], id: 'n13' }];
    const a = inputsOf({ spots, now: '2026-10-17 07:00' });
    const b = { ...a, places: [...a.places].reverse(), matches: [...a.matches].reverse() };
    expect(JSON.stringify(screen(b).cards.daylight)).toBe(JSON.stringify(screen(a).cards.daylight));
  });
});
