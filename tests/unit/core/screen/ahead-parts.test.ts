// What the screen hands Ahead so the page computes nothing: each card's stamp as words, and the Call and Website buttons.
import { describe, expect, test } from 'vitest';
import { helpChip } from '../../../../src/core/engines/help.ts';
import { buildScreen, screen } from '../../../../src/core/screen/screen.ts';
import { W } from '../../../../src/core/wording/en.ts';
import { bikeShop, flatRoute, pos, tap, testTrip } from '../../../fixtures/build.ts';
import { FRI, RAINY_SPOTS, rainyStop, SAT } from '../../ui/ahead-fixture.ts';
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

describe('inside the radius of an approximate fix', () => {
  test('[AH-CARD-ORDER] with a fix of ±900 m, Water says "near you, may be behind" for a place inside the radius, as Food does, never "+0.7 km"', () => {
    let seen = 0;
    for (let km = 100; km <= 150; km += 1) {
      const s = screen(rainyStop({ positions: [pos({ km, at: `${SAT} 14:20`, acc: 900 })] }));
      const { startKm, behindFromKm } = s.ride;
      for (const item of s.cards.water.items) {
        const at = item.stamp?.km;
        if (typeof at !== 'number' || !(startKm < behindFromKm && at >= startKm && at <= behindFromKm)) continue;
        seen += 1;
        expect(item.detail?.split(' · ')[0], `km ${km}: ${item.label}`).toBe(W.waterNearYou);
        expect(item.stamp?.at, `km ${km}: ${item.label} has no time`).toBeUndefined();
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
  test('[AH-CARD-ORDER] after the day’s ride, with ±900 m at the stop: tonight’s water inside the radius reads "near you, may be behind" too', () => {
    let seen = 0;
    const plan = { date: SAT, backToTodayAt: null };
    const stop = screen(rainyStop({ plan })).ride.tonightKm!;
    // A tap 0.6 km on from tonight's stop: tonight's water, chosen for riding there now.
    const spots = [...RAINY_SPOTS, { b: tap(), km: stop + 0.6 }];
    for (let d = -0.25; d <= 1.25; d += 0.25) {
      const km = stop + d;
      const s = screen(rainyStop({ plan, spots, positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km, at: `${SAT} 14:20`, acc: 900 })] }));
      for (const item of s.cards.water.items) {
        const at = item.stamp?.km;
        // Inside the fix's own radius, whatever the day's ride is doing.
        if (typeof at !== 'number' || Math.abs(at - km) > 0.9) continue;
        seen += 1;
        expect(item.detail?.split(' · ')[0], `fix at km ${km}: ${item.label} (${s.ride.phase})`).toBe(W.waterNearYou);
        expect(item.stamp?.at, `fix at km ${km}: ${item.label}`).toBeUndefined();
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('the water estimate in words', () => {
  test('[AH-WATER-Q] a short leg’s small need reads "under 0.1 L", never "expected 0 L, planned 0 L"', () => {
    const spots = [...RAINY_SPOTS, { b: tap(), km: 125.3 }];
    const s = screen(rainyStop({ spots }));
    expect(s.cards.water.detail).not.toMatch(/expected 0 L, planned 0 L/);
    expect(s.cards.water.detail).toMatch(/expected under 0\.1 L, planned under 0\.1 L\./);
  });
  test('[AH-WATER-Q] at the route end the water question asks for no "next stretch"', () => {
    const i = rainyStop({ routeEndDate: SAT, positions: [pos({ km: 165, at: `${SAT} 14:20` })] });
    const s = screen({ ...i, waterLeft: { litres: 1, at: new Date(i.now.getTime() - 60 * 60_000), confirmed: false } });
    expect(s.phase).toBe('route-end');
    expect(s.cards.water.title).not.toMatch(/next stretch/);
    expect(s.cards.water.title).toBe(W.waterConfirmAtEnd);
  });
});

describe('water times of another day', () => {
  test('[AH-WATER-Q] after the day’s ride, tomorrow’s water says "tomorrow", so two days’ times never stand side by side as one', () => {
    const s = screen(rainyStop({ plan: { date: SAT, backToTodayAt: null } }));
    const tomorrow = s.cards.water.items.find((x) => x.label === 'Café Lindenhof')!;
    expect(tomorrow.detail).toMatch(/· tomorrow about \d\d:\d\d/);
    // Today's stay as they were.
    expect(screen(rainyStop()).cards.water.items.map((x) => x.detail ?? '').join(' ')).not.toMatch(/tomorrow/);
  });
});

describe('basis words with their age', () => {
  test('[INV-22] the Water card says its age in words, as Food and Weather do: the map data date and the forecast fetch time', () => {
    const s = screen(rainyStop());
    const water = s.cards.water.basis.join(' | ');
    expect(water).toMatch(/[Mm]ap data (of|from) \d{1,2} [A-Z][a-z]{2}/);
    expect(water).toMatch(/forecast fetched \d\d:\d\d/);
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
