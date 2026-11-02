// For each invariant: a real moment where it holds, and that moment with something broken, proving the check can fail.
import { describe, expect, test } from 'vitest';
import type { Target } from '../../src/core/engines/water.ts';
import type { RainPlan, RainWindow, ScreenInputs } from '../../src/core/types.ts';
import { at, bakery, busStop, cafe, campsite, flatRoute, pos, shelter, shop, sun, tap, testTrip } from '../fixtures/build.ts';
import { inputsOf } from '../unit/core/screen/screen-helpers.ts';
import { stamps } from '../unit/core/engines/weather-helpers.ts';
import { failsOnInputs, failsOnPart, failsOnScreen, holds } from './breaking.ts';
import { world } from './world.ts';

const SAT = '2026-10-17';
const morning = { positions: [pos({ km: 0.1, at: `${SAT} 07:50` })], now: `${SAT} 08:00` };
const riding = { positions: [pos({ km: 0.1, at: `${SAT} 08:30` }), pos({ km: 40, at: `${SAT} 12:00` })], now: `${SAT} 12:10` };
const STORM = { range: [60, 70] as [number, number], stamps: stamps(SAT, 10, 16), pp: 80, mm: 1, code: 95 };
const RAIN = { range: [60, 70] as [number, number], stamps: stamps(SAT, 10, 16), pp: 80, mm: 1 };
const OPEN_LONG = 'Mo-Su 06:00-22:00';

describe('one stop', () => {
  const i = inputsOf({ ...morning, spots: [{ b: cafe(OPEN_LONG), km: 30 }, { b: campsite(), km: 78 }], spells: [RAIN] });
  test('[INV-01] the strip, Daylight and Share name one stop, and it holds on a real moment', () => {
    holds('INV-01', i);
  });
  test('[INV-01] a strip ending somewhere else breaks it', () => {
    failsOnScreen('INV-01', i, (s) => { s.strip.endKm = 90; }, /strip ends at 90/);
  });
  test('[INV-01] Share planning another stop breaks it', () => {
    failsOnScreen('INV-01', i, (s) => { s.shareText = s.shareText!.replace('km 78', 'km 90'); }, /Share plans to stop at km 90/);
  });
  test('[INV-01] Food naming a place past the stop breaks it', () => {
    failsOnScreen('INV-01', i, (s) => { s.cards.food.stamp = { km: 85 }; }, /Food names km 85/);
  });
  test('[INV-01] a night\'s low at another kilometre breaks it', () => {
    failsOnScreen('INV-01', i, (s) => { s.cards.weather.items.find((x) => x.label.startsWith("Night's low"))!.stamp = { km: 40 }; }, /night's low is at km 40/);
  });
  test('[INV-02] leave-by and Share name the same kilometre', () => {
    holds('INV-02', i);
    failsOnScreen('INV-02', i, (s) => { s.shareText = s.shareText!.replace('km 78', 'km 80'); }, /Share names km 80/);
  });
});

describe('water and hours', () => {
  const i = inputsOf({ ...morning, spots: [{ b: shop(OPEN_LONG), km: 20, id: 'n1' }, { b: tap(), km: 60, id: 'n2' }] });
  test('[INV-03] a shop Water uses is open on arrival for Food', () => {
    holds('INV-03', i);
    failsOnInputs('INV-03', i, (x) => ({ ...x, hours: [] }), /not open on arrival/);
  });
  test('[INV-03] a shop Food does not count breaks it', () => {
    failsOnPart('INV-03', i, (w) => {
      const s1 = w.targets!.s1 as Target & { kind: 'place' };
      return { ...w, targets: { ...w.targets!, s1: { ...s1, place: { ...s1.place, tags: { shop: 'butcher' } } } } };
    }, /Food doesn't count/);
  });

  const fine = inputsOf({ ...morning, litres: 3, summary: null, spots: [{ b: tap(), km: 10, id: 'n1' }, { b: tap(), km: 20, id: 'n2' }] });
  test('[INV-04] Water fine needs enough at S2, confirmed, and no edge', () => {
    expect(holds('INV-04', fine).cards.water.status).toBe('fine');
    failsOnPart('INV-04', fine, (w) => ({ ...w, water: { ...w.water, waterLeft: { ...w.water.waterLeft!, litres: 0.05 } } }), /Water is fine with .* L on arrival/);
    failsOnPart('INV-04', fine, (w) => ({ ...w, water: { ...w.water, waterLeft: { ...w.water.waterLeft!, confirmed: false } } }), /unconfirmed/);
    failsOnPart('INV-04', fine, (w) => ({ ...w, targets: { ...w.targets!, s2: { kind: 'edge', km: 20 } } }), /edge of the place data/);
  });

  const unknown = (): ScreenInputs => {
    const x = inputsOf({ ...morning, spots: [{ b: shop(OPEN_LONG), km: 20, id: 'n1' }, { b: bakery(OPEN_LONG), km: 30, id: 'n2' }, { b: tap(), km: 40, id: 'n3' }, { b: tap(), km: 50, id: 'n4' }] });
    return { ...x, hours: x.hours.map((h) => (h.placeId === 'n2' ? { ...h, spans: h.spans.map((y) => ({ ...y, state: 'unknown' as const })) } : h)) };
  };
  test('[INV-05] a place with unknown hours never counts', () => {
    const i5 = unknown();
    holds('INV-05', i5);
    failsOnPart('INV-05', i5, (w) => {
      const s1 = w.targets!.s1 as Target & { kind: 'place' };
      const n2 = i5.places.find((p) => p.id === 'n2')!;
      return { ...w, targets: { ...w.targets!, s1: { ...s1, place: n2, match: { placeId: 'n2', km: 30, offRouteM: 0 }, km: 30 } } };
    }, /counts while its hours read unknown/);
  });
  test('[INV-05] leave-by resting on unknown hours breaks it', () => {
    const i5 = unknown();
    failsOnPart('INV-05', i5, (w) => ({ ...w, lb: { ...w.lb!, unrounded: new Date((w.lb!.unrounded ?? at(`${SAT} 09:00`)).getTime() - 60_000) } }), /leave-by moves when unknown hours read closed/);
  });
  test('[INV-05] a stop idea on unknown hours breaks it', () => {
    const i5 = unknown();
    failsOnPart('INV-05', i5, (w) => ({ ...w, ideas: { ...w.ideas!, timeline: [{ trigger: 'rhythm', placeId: 'n2', arrival: at(`${SAT} 10:00`), status: 'fine', reason: 'x', km: 30, lines: [] }] } }), /stop idea n2 \(rhythm\) counts/);
  });
});

describe('rain', () => {
  const plans = (w: ReturnType<typeof world>, change: (p: RainPlan) => RainPlan): ReturnType<typeof world> => ({ ...w, plans: w.plans.map(change) });
  const rainy = inputsOf({ ...morning, spots: [{ b: cafe(OPEN_LONG), km: 50, id: 'n1' }], spells: [RAIN] });
  test('[INV-06] a cover reached under 15 minutes before m, or not open for 30 minutes, breaks it', () => {
    holds('INV-06', rainy);
    failsOnPart('INV-06', rainy, (w) => plans(w, (p) => ({ ...p, covers: p.covers.map((c) => ({ ...c, arrival: new Date(w.schedule.atKm(p.m).getTime() - 5 * 60_000) })) })), /under 15/);
    failsOnInputs('INV-06', rainy, (x) => ({ ...x, hours: [] }), /is not open from arrival for 30 min/);
  });
  test('[INV-06] an earlier cover past the band while a later one counts breaks it', () => {
    const two = inputsOf({ ...morning, spots: [{ b: cafe(OPEN_LONG), km: 10, id: 'n9' }, { b: cafe(OPEN_LONG), km: 50, id: 'n1' }], spells: [RAIN] });
    holds('INV-06', two);
    failsOnPart('INV-06', two, (w) => plans(w, (p) => {
      const c = p.covers[0]!;
      return { ...p, covers: [{ ...c, km: 10, placeId: 'n9', arrival: w.schedule.atKm(10) }] };
    }), /later one counts/);
  });

  const stormy = inputsOf({ ...morning, spots: [{ b: cafe(OPEN_LONG), km: 50, id: 'n1' }], spells: [STORM] });
  test('[INV-07] a thunderstorm gives warning, a red band, classes 1-2 and the lightning line', () => {
    expect(holds('INV-07', stormy).cards.weather.status).toBe('warning');
    failsOnScreen('INV-07', stormy, (s) => { s.cards.weather.status = 'action'; }, /Weather is action/);
    failsOnScreen('INV-07', stormy, (s) => { s.strip.bands = []; }, /no red band/);
    failsOnScreen('INV-07', stormy, (s) => { for (const x of s.cards.weather.items) if (x.detail) x.detail = x.detail.replace('lightning', 'wind'); }, /no row with the lightning line/);
    failsOnPart('INV-07', stormy, (w) => plans(w, (p) => ({ ...p, covers: p.covers.map((c) => ({ ...c, coverClass: 5 as const })) })), /class 5 cover/);
    failsOnScreen('INV-07', stormy, (s) => { s.chips.shelter.status = 'fine'; }, /Shelter chip is fine/);
    failsOnScreen('INV-07', stormy, (s) => { s.chips.shelter.items = [{ label: 'Mapped as a bus stop, not checked.', stamp: { km: 5 }, status: 'fine', detail: '+5 km' }]; }, /lacks the lightning line/);
    failsOnScreen('INV-07', stormy, (s) => {
      s.chips.shelter.items = [
        { label: 'Mapped as a bus stop, not checked.', stamp: { km: 5 }, status: 'fine', detail: '+5 km · Roofs, shelters and huts give no protection from lightning.' },
        { label: 'Café · km 50', stamp: { km: 50 }, status: 'fine', detail: '+50 km' },
      ];
    }, /a roof heads the Shelter list/);
  });

  const wetHere = inputsOf({ ...riding, spells: [{ range: [30, 50], stamps: stamps(SAT, 11, 13), pp: 80, mm: 1 }] });
  test('[INV-08] rain here now and rain at the start are one value', () => {
    expect(holds('INV-08', wetHere).cards.weather.title).toMatch(/^Rain likely here/);
    failsOnScreen('INV-08', wetHere, (s) => { s.cards.weather.title = 'Calm for now'; }, /rain likely here now, and the title says/);
    const calm = inputsOf(riding);
    holds('INV-08', calm);
    failsOnScreen('INV-08', calm, (s) => { s.cards.weather.title = 'Rain likely here'; }, /the hour here is not likely/);
    failsOnPart('INV-08', wetHere, (w) => ({ ...w, ideas: { ...w.ideas!, title: { ...w.ideas!.title!, trigger: 'rhythm' }, timeline: [] } }), /no T3 idea/);
    failsOnPart('INV-08', wetHere, (w) => ({ ...w, plans: w.plans.map((p) => ({ ...p, listInstead: null })) }), /rule 5's list is false/);
    failsOnPart('INV-08', calm, (w) => ({ ...w, plans: [{ window: { fromKm: 40 } as RainWindow, listInstead: [] } as unknown as RainPlan] }), /rule 5's list is true/);
  });

  const maybe = inputsOf({ ...morning, spots: [{ b: cafe(OPEN_LONG), km: 50, id: 'n1' }], spells: [{ ...RAIN, pp: 30 }] });
  test('[INV-09] possible rain never gets a plan, a cover icon or a T3 idea', () => {
    holds('INV-09', maybe);
    const possible = world(maybe).windows.find((w) => w.cls === 'possible')!;
    failsOnPart('INV-09', maybe, (w) => ({ ...w, plans: [{ window: possible, covers: [], listInstead: null } as unknown as RainPlan] }), /got a plan/);
    failsOnScreen('INV-09', maybe, (s) => { s.strip.icons.push({ kind: 'cover', km: 50, opens: 'weather' }); }, /no likely plan names/);
    failsOnPart('INV-09', maybe, (w) => ({ ...w, ideas: { ...w.ideas!, timeline: [{ trigger: 'rain', placeId: null, arrival: null, status: 'fine', reason: 'x', km: 50, lines: [] }] } }), /T3 idea with possible rain/);
  });

  test('[INV-10] each window has its band, each first cover its icon, and each opens a card that lists it', () => {
    holds('INV-10', rainy);
    failsOnScreen('INV-10', rainy, (s) => { s.strip.bands = []; }, /no rain band/);
    failsOnScreen('INV-10', rainy, (s) => { s.strip.icons = []; }, /has no icon/);
    failsOnScreen('INV-10', rainy, (s) => { s.strip.icons.push({ kind: 'sleep', km: 33, opens: 'sleep' }); }, /sleep icon at km 33/);
    failsOnScreen('INV-10', rainy, (s) => { s.strip.icons.push({ kind: 'food', km: 33, opens: 'food' }); }, /food icon at km 33/);
    failsOnScreen('INV-10', rainy, (s) => { s.strip.icons.push({ kind: 'water', km: 33, opens: 'water' }); }, /water icon at km 33/);
    failsOnScreen('INV-10', rainy, (s) => { s.strip.icons.push({ kind: 'cover', km: 33, opens: 'weather' }); }, /cover icon at km 33/);
    failsOnScreen('INV-10', rainy, (s) => { s.strip.bands.push({ fromKm: 33, toKm: 34, kind: 'likely', opens: 'weather' }); }, /band at km 33/);
  });

  test('[INV-10] the owner\'s ruling: a plain roof as first cover goes undrawn only in or just before a storm band', () => {
    const trip = testTrip({ route: flatRoute(300, { stageEnds: [150, 300] }) });
    const stormNear = { range: [50, 60] as [number, number], stamps: stamps(SAT, 9, 14), pp: 80, mm: 1, code: 95 };
    const later = { range: [90, 100] as [number, number], stamps: stamps(SAT, 11, 16), pp: 80, mm: 1 };
    const inBand = inputsOf({ trip, ...morning, roofs: [busStop().atKm(45)], spells: [stormNear, later] });
    holds('INV-10', inBand);
    failsOnScreen('INV-10', inBand, (s) => { s.strip.icons.push({ kind: 'cover', km: 45, opens: 'weather' }); }, /a plain roof .* is drawn in or just before a thunderstorm band/);
    const outside = inputsOf({ trip, ...morning, roofs: [busStop().atKm(44)], spells: [stormNear, later] });
    holds('INV-10', outside);
    failsOnScreen('INV-10', outside, (s) => { s.strip.icons = []; }, /has no icon/);
  });

  const old = inputsOf({ ...morning, spells: [{ range: [0, 30], stamps: stamps(SAT, 7, 12), pp: 80, mm: 1 }], opts: { fetchedAt: '2026-10-16 18:00' } });
  test('[INV-11] over 12 hours old: no wait or go', () => {
    holds('INV-11', old);
    failsOnPart('INV-11', old, (w) => ({ ...w, wg: { where: 'here', d: null, savedMin: 0, arrivalNow: at(`${SAT} 12:00`), arrivalWait: null, lines: [] } }), /wait or go worked out/);
    failsOnScreen('INV-11', old, (s) => { s.cards.weather.items.unshift({ label: "Waiting up to 3 hours won't help much.", stamp: null, status: 'fine' }); }, /the card says/);
    failsOnScreen('INV-11', old, (s) => { s.cards.weather.freshness.stale = false; }, /does not read stale/);
  });

  const waitCase = (): ScreenInputs => inputsOf({ trip: testTrip({ route: flatRoute(300, { stageEnds: [40, 150, 300] }) }), positions: [pos({ km: 0.1, at: `${SAT} 09:00` })], now: `${SAT} 09:00`, spells: [{ range: [0, 40], stamps: stamps(SAT, 9, 11), pp: 80, mm: 1 }], opts: { fetchedAt: `${SAT} 07:10` } });
  test('[INV-12] wait or go stays inside its limits', () => {
    const wait = waitCase();
    expect(world(wait).wg!.d).not.toBeNull();
    holds('INV-12', wait);
    failsOnPart('INV-12', wait, (w) => ({ ...w, wg: { ...w.wg!, arrivalWait: new Date(w.wg!.arrivalWait!.getTime() + 30 * 60_000) } }), /exactly the wait/);
    failsOnPart('INV-12', wait, (w) => ({ ...w, wg: { ...w.wg!, arrivalWait: at(`${SAT} 23:00`) } }), /civil dusk/);
    failsOnPart('INV-12', wait, (w) => ({ ...w, wg: { ...w.wg!, lines: ['Waiting until about 11:00 instead of 01:00'] } }), /"instead of" differs/);
    failsOnScreen('INV-12', wait, (s) => { s.strip.endText = '40 km · about 23:55'; }, /the strip's arrival/);
    failsOnPart('INV-12', wait, (w) => ({ ...w, wg: { ...w.wg!, arrivalNow: at(`${SAT} 22:00`) } }), /is not the schedule's/);
  });
  test('[INV-12] waiting into a thunderstorm, or past a kept limit, breaks it', () => {
    const later = waitCase();
    const w = world(later);
    const d = w.wg!.d!;
    // A storm hour only the later departure meets, written into the forecast the check reads.
    const met = w.schedule.withDeparture(d).atKm(40).getTime();
    const before = w.schedule.atKm(40).getTime();
    const stormed = { ...w.forecast!, grid: w.forecast!.grid.map((g) => (g.km === 40 ? { ...g, hours: g.hours.map((h) => (h.at.getTime() > before + 2 * 3_600_000 && h.at.getTime() <= met + 2 * 3_600_000 ? { ...h, code: 95 } : h)) } : g)) };
    failsOnPart('INV-12', later, (x) => ({ ...x, forecast: stormed }), /meets a thunderstorm hour/);
    failsOnPart('INV-12', later, (x) => ({ ...x, lb: { ...x.lb!, checks: [{ id: 'water', meets: (t: Date) => t.getTime() <= x.schedule.departure.getTime(), missLine: null }] } }), /breaks the water limit/);
  });
});

describe('leave-by', () => {
  const dayLimit = inputsOf({ ...morning, spots: [{ b: shop(OPEN_LONG), km: 20, id: 'n1' }, { b: tap(), km: 60, id: 'n2' }] });
  test('[INV-13] the unrounded leave-by meets every kept limit, and later ones break one', () => {
    const lb = world(dayLimit).lb!;
    expect(lb.unrounded).not.toBeNull();
    holds('INV-13', dayLimit);
    failsOnPart('INV-13', dayLimit, (w) => ({ ...w, lb: { ...w.lb!, unrounded: new Date(lb.unrounded!.getTime() - 3_600_000) } }), /min after the leave-by .* still meets every kept limit/);
    failsOnPart('INV-13', dayLimit, (w) => ({ ...w, lb: { ...w.lb!, unrounded: new Date(lb.unrounded!.getTime() + 3_600_000) } }), /breaks: daylight/);
    failsOnScreen('INV-13', dayLimit, (s) => {
      const hide = (t: string): string => t.replace(/\d\d:\d\d/g, '00:00');
      s.cards.daylight.title = hide(s.cards.daylight.title);
      s.cards.daylight.detail = hide(s.cards.daylight.detail);
      for (const x of s.cards.daylight.items) { x.label = hide(x.label); if (x.detail) x.detail = hide(x.detail); }
      s.cards.daylight.basis = [];
    }, /does not show/);
  });
  test('[INV-14] leave-by reaches the stop within the fine limit; with none, 04:00 does not', () => {
    const lb = world(dayLimit).lb!;
    holds('INV-14', dayLimit);
    failsOnPart('INV-14', dayLimit, (w) => ({ ...w, lb: { ...w.lb!, unrounded: new Date(lb.unrounded!.getTime() + 3_600_000) } }), /past the fine limit/);
    failsOnPart('INV-14', dayLimit, (w) => ({ ...w, lb: { ...w.lb!, unrounded: null } }), /no leave-by, yet leaving at 04:00/);
    failsOnPart('INV-14', dayLimit, (w) => ({ ...w, lb: { ...w.lb!, kept: [] } }), /daylight was set aside/);
    const long = inputsOf({ trip: testTrip({ route: flatRoute(600, { stageEnds: [500, 600] }) }), ...morning, sun: sun({ sunset: '17:00', dusk: '17:35' }), spots: [{ b: tap(), km: 60 }] });
    expect(world(long).lb!.unrounded).toBeNull();
    holds('INV-14', long);
  });
  test('[INV-15] a water limit names S1 or S2 of the same ride, before the stop', () => {
    expect(world(dayLimit).lb!.waterSources).toEqual(['n1']);
    holds('INV-15', dayLimit);
    failsOnPart('INV-15', dayLimit, (w) => ({ ...w, lb: { ...w.lb!, waterSources: ['n1', 'n9'] } }), /names n9/);
    failsOnPart('INV-15', dayLimit, (w) => ({ ...w, lb: { ...w.lb!, waterSources: [] } }), /adds no water limit/);
    const outdoor = inputsOf({ ...morning, spots: [{ b: tap(), km: 20, id: 'n1' }, { b: shop(OPEN_LONG), km: 30, id: 'n2' }] });
    holds('INV-15', outdoor);
    failsOnPart('INV-15', outdoor, (w) => ({ ...w, lb: { ...w.lb!, waterSources: ['n2', 'n1'] } }), /names n1/);
  });
  const closing = inputsOf({ ...morning, spots: [{ b: shop('Mo-Sa 06:00-22:00'), km: 20, id: 'n1' }] });
  test('[INV-16] the closure limit applies exactly when T1\'s clause holds', () => {
    expect(world(closing).lb!.closure).toBe(true);
    holds('INV-16', closing);
    failsOnPart('INV-16', closing, (w) => ({ ...w, lb: { ...w.lb!, closure: false } }), /T1 says|the closure limit is false/);
    const open = inputsOf({ ...morning, spots: [{ b: shop('Mo-Sa 06:00-22:00'), km: 20, id: 'n1' }, { b: shop(OPEN_LONG), km: 100, id: 'n2' }] });
    expect(world(open).lb!.closure).toBe(false);
    holds('INV-16', open);
    failsOnPart('INV-16', open, (w) => ({ ...w, lb: { ...w.lb!, closure: true } }), /T1 says|the closure limit is true/);
  });
  test('[INV-16] neither at the route end', () => {
    const trip = testTrip({ route: flatRoute(60) });
    const end = inputsOf({ trip, ...morning, spots: [{ b: shop('Mo-Sa 06:00-22:00'), km: 20, id: 'n1' }] });
    holds('INV-16', end);
    failsOnPart('INV-16', end, (w) => ({ ...w, lb: { ...w.lb!, closure: true } }), /applies at the route end/);
  });
});

describe('sleep', () => {
  const lean = shelter({ name: 'Hut Lean', tags: { shelter_type: 'lean_to' } });
  const i = inputsOf({ ...morning, spots: [{ b: campsite({ name: 'Camp A' }), km: 70, id: 'n1' }, { b: campsite({ name: 'Camp B' }), km: 90, id: 'n2' }, { b: lean, km: 72, id: 'n3' }, { b: shelter({ name: 'Rain Roof' }), km: 74, id: 'n4' }] });
  test('[INV-17] beyond the stop never warning', () => {
    holds('INV-17', i);
    failsOnScreen('INV-17', i, (s) => { s.cards.sleep.items.find((x) => x.stamp?.km === 90)!.status = 'warning'; }, /beyond the stop reads warning/);
  });
  test('[INV-17] weather shelters are no candidates, lean-tos no stop', () => {
    failsOnScreen('INV-17', i, (s) => { s.cards.sleep.items.push({ label: 'Rain Roof · km 74', stamp: { km: 74 }, status: 'fine' }); }, /weather shelter is a sleep candidate/);
    failsOnScreen('INV-17', i, (s) => { s.cards.sleep.status = 'fine'; s.cards.sleep.title = 'Open for the night as mapped: Hut Lean, km 72'; s.cards.sleep.stamp = { km: 72 }; }, /lean-to is tonight's stop/);
  });
});
