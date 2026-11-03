// What the screen hands Ahead so the page computes nothing: each card's stamp as words, and the Call and Website buttons.
import { describe, expect, test } from 'vitest';
import { helpChip } from '../../../../src/core/engines/help.ts';
import { buildScreen, screen } from '../../../../src/core/screen/screen.ts';
import { W } from '../../../../src/core/wording/en.ts';
import { bikeShop, flatRoute, pos, testTrip } from '../../../fixtures/build.ts';
import { FRI, rainyStop, SAT } from '../../ui/ahead-fixture.ts';
import { inputsOf } from './screen-helpers.ts';

describe('stamps', () => {
  test('[AH-CARD-ORDER] each card stamp reads as section 3.2 has it: "+6 km · 14:40" and "here · 14:20"', () => {
    const s = screen(rainyStop());
    expect(s.cards.food.stamp?.km).toBe(131);
    expect(s.stamps.food).toBe('+6 km · 14:40');
    expect(s.cards.weather.title).toBe('Rain likely here until about 15:00');
    expect(s.stamps.weather).toBe('here · 14:20');
    expect(s.stamps.emergency).toBeNull();
  });
  test('[AH-CARD-ORDER] a stamp behind the rider says how far back; one with no stamp has none; nothing throws on a broken one', () => {
    const i = inputsOf({ trip: testTrip({ route: flatRoute(165, { stageEnds: [78, 165] }) }), positions: [pos({ km: 80, at: `${SAT} 14:20` })] });
    const built = buildScreen(i);
    for (const [name, text] of Object.entries(built.screen.stamps)) {
      const a = name === 'emergency' ? built.screen.chips.emergency : (built.screen.cards as Record<string, { stamp: unknown }>)[name] ?? (built.screen.chips as Record<string, { stamp: unknown }>)[name];
      if (a!.stamp === null) expect(text, name).toBeNull();
      else expect(text, name).toMatch(/^(\+[\d.]+ km|[\d.]+ km back|here)( · \d\d:\d\d)?$/);
    }
    expect(built.faults).toEqual([]);
  });
});

describe('stamps agree with their items', () => {
  /** The first item at the stamp's kilometre, and where its detail says it is. */
  const whereOf = (a: { items: { stamp: { km?: number } | null; detail?: string }[] }, km: number): string =>
    (a.items.find((x) => x.stamp?.km === km)?.detail ?? '').split(' · ')[0]!;

  test('[AH-CARD-ORDER] with an approximate fix, a chip stamp behind is measured from the far edge, as its item is', () => {
    const s = screen(rainyStop({ positions: [pos({ km: 141, at: `${SAT} 14:20`, acc: 3000 })] }));
    for (const chip of ['pharmacy', 'toilets'] as const) {
      const a = s.chips[chip];
      expect(a.stamp?.km, chip).toBeLessThan(138);
      expect(s.stamps[chip]!.split(' · ')[0], chip).toBe(whereOf(a, a.stamp!.km!));
      expect(s.stamps[chip], chip).toMatch(/km back/);
    }
  });
  test('[AH-CARD-ORDER] a place inside the radius reads "near you, may be behind" on its stamp, as on its item', () => {
    const s = screen(rainyStop({ positions: [pos({ km: 136, at: `${SAT} 14:20`, acc: 3000 })] }));
    const a = s.chips.pharmacy; // at km 135, inside 133 to 139
    expect(a.stamp?.km).toBe(135);
    expect(whereOf(a, 135)).toBe(W.waterNearYou);
    expect(s.stamps.pharmacy).toBe(W.waterNearYou);
  });
  test('[AH-CARD-ORDER] with an approximate fix, a rain window that starts at the rider keeps its time: "here · 14:20"', () => {
    const s = screen(rainyStop({ positions: [pos({ km: 141, at: `${SAT} 14:20`, acc: 3000 })] }));
    expect(s.cards.weather.stamp?.km).toBe(138); // the near edge, where answers ahead measure from
    expect(s.stamps.weather).toBe('here · 14:20');
  });
  test('[AH-CARD-ORDER] a timed stamp inside the radius keeps its time beside "near you, may be behind"; an untimed one stays as its item', () => {
    const s = screen(rainyStop({ positions: [pos({ km: 136, at: `${SAT} 14:20`, acc: 3000 })] }));
    for (const [name, text] of Object.entries(s.stamps)) {
      if (text === null || !text.startsWith(W.waterNearYou)) continue;
      const a = name === 'emergency' ? s.chips.emergency : (s.cards as Record<string, { stamp: { at?: Date } | null }>)[name] ?? (s.chips as Record<string, { stamp: { at?: Date } | null }>)[name];
      if (a!.stamp?.at) expect(text, name).toMatch(/^near you, may be behind · \d\d:\d\d$/);
      else expect(text, name).toBe(W.waterNearYou);
    }
  });
  test("[AH-CARD-ORDER] a stamp at the rider's own kilometre reads \"here\", never \"+0 km\"", () => {
    const s = screen(rainyStop({ positions: [pos({ km: 141, at: `${SAT} 14:20`, acc: 3000 })] }));
    for (const text of Object.values(s.stamps)) expect(text ?? '').not.toMatch(/^\+0 km/);
  });
});

describe('no position', () => {
  test('[AH-FIRST-USE] with no position, the screen says its answers count from the route start, and how to get them from here', () => {
    expect(screen(rainyStop({ now: `${FRI} 11:35`, positions: [] })).notes).toContain(W.routeNoPositionFromStart);
    expect(screen(rainyStop({ now: '2026-10-15 18:00', positions: [] })).notes).toContain(W.routeNoPositionFromStart);
    expect(screen(rainyStop()).notes).not.toContain(W.routeNoPositionFromStart);
  });
});

describe('call ahead buttons', () => {
  test('[AH-CALL] a Sleep item with numbers gets a tel: button per callable number and an http(s) Website, each text found in its detail', () => {
    const s = screen(rainyStop());
    const camp = s.cards.sleep.items.find((x) => x.label.startsWith('Camping Rheinaue'))!;
    expect(camp.links?.map((l) => [l.kind, l.href, l.secondary])).toEqual([
      ['tel', 'tel:+497221123456', false], ['tel', 'tel:+491711234567', true], ['web', 'https://camping-rheinaue.de', false],
    ]);
    for (const l of camp.links!) expect(camp.detail!.split(' · ')).toContain(l.shown);
    expect(camp.links![0]!.label).toBe('Call Camping Rheinaue, +49 7221 123456');
  });
  test('[AH-CALL] a bike shop shows Call where mapped, "No phone or website mapped." where not, and the source line under the first', () => {
    const s = screen(rainyStop());
    const velo = s.chips.bike.items.find((x) => x.label.startsWith('Velo Kehl'))!;
    expect(velo.links?.map((l) => l.href)).toEqual(['tel:+49785112345']);
    expect(velo.detail).toContain('Call +49 7851 12345');
    expect(velo.detail).toContain('As mapped in OpenStreetMap (28 Oct), not checked.');
    const hecht = s.chips.bike.items.find((x) => x.label.startsWith('Rad Hecht'))!;
    expect(hecht.detail).toContain(W.callNoContact);
    expect(hecht.links).toBeUndefined();
  });
  test('[AH-CALL] a number that can\'t be called stays text, with no button', () => {
    const shop = bikeShop('24/7', { name: 'Velo', contact: { phones: ['Tel. nach Vereinbarung'], website: null } });
    const i = inputsOf({ positions: [pos({ km: 100, at: `${SAT} 14:00` })], spots: [{ b: shop, km: 105 }] });
    const built = buildScreen(i);
    const a = helpChip('bike', { ...i, ride: built.screen.ride });
    const item = a.items.find((x) => x.label.startsWith('Velo'))!;
    expect(item.detail).toContain('Phone Tel. nach Vereinbarung');
    expect(item.links).toBeUndefined();
  });
});
