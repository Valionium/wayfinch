// For each invariant: a real moment where it holds, and that moment with something broken, proving the check can fail.
import { describe, expect, test } from 'vitest';
import { buildScreen, type Screen } from '../../src/core/screen/screen.ts';
import type { ScreenInputs } from '../../src/core/types.ts';
import { bikeShop, cafe, campsite, flatRoute, pharmacy, pos, rescue, settlement, shop, tap, testTrip } from '../fixtures/build.ts';
import { DEVICE_ZONES } from '../fixtures/zones.ts';
import { inputsOf } from '../unit/core/screen/screen-helpers.ts';
import { stamps } from '../unit/core/engines/weather-helpers.ts';
import { checkOf, failsOnPart, failsOnScreen, holds } from './breaking.ts';

const SAT = '2026-10-17';
const FRI = '2026-10-16';
const OPEN_LONG = 'Mo-Su 06:00-22:00';
const morning = { positions: [pos({ km: 0.1, at: `${SAT} 07:50` })], now: `${SAT} 08:00` };
const riding = { positions: [pos({ km: 0.1, at: `${SAT} 08:30` }), pos({ km: 40, at: `${SAT} 12:00` })], now: `${SAT} 12:10` };
const RAIN = { range: [60, 70] as [number, number], stamps: stamps(SAT, 10, 16), pp: 80, mm: 1 };
const moment = inputsOf({ ...riding, spots: [{ b: cafe(OPEN_LONG), km: 50 }, { b: pharmacy(OPEN_LONG), km: 45 }, { b: tap(), km: 55 }, { b: campsite(), km: 70 }], spells: [RAIN] });

describe('statuses and distances', () => {
  test('[INV-18] only Water, Weather and Daylight are ever warning', () => {
    holds('INV-18', moment);
    for (const name of ['food', 'climbing', 'sleep'] as const) failsOnScreen('INV-18', moment, (s) => { s.cards[name].status = 'warning'; }, new RegExp(`${name} card reads warning`));
  });

  const off = inputsOf({ positions: [pos({ km: 0.1, at: `${SAT} 08:30` }), pos({ km: 40, at: `${SAT} 12:00`, off: 1000 })], now: `${SAT} 12:10`, spots: [{ b: pharmacy(OPEN_LONG), km: 45 }] });
  test('[INV-19] the rejoin leg is the same on the ride; the chips add the position\'s own', () => {
    const s = holds('INV-19', off);
    expect(s.ride.startOffRouteM).toBe(1000);
    failsOnScreen('INV-19', off, (x) => { x.ride.startOffRouteM = 400; }, /the position is 1000 m off/);
    failsOnScreen('INV-19', off, (x) => { x.strip.endText = '38 km · about 16:00'; }, /with the rejoin leg/);
    failsOnScreen('INV-19', off, (x) => { x.chips.pharmacy.items[0]!.stamp = { km: 45, at: new Date(x.chips.pharmacy.items[0]!.stamp!.at!.getTime() + 600_000) }; }, /not riding there now from the position/);
    failsOnScreen('INV-19', off, (x) => { x.chips.pharmacy.items[0]!.detail = '+9 km'; }, /from the position it is/);
    failsOnScreen('INV-19', off, (x) => { x.chips.emergency.coords = '1.00000, 2.00000'; }, /Emergency's coordinates/);
  });
  test('[INV-19] no leg on a ride that does not start at the position', () => {
    const home = inputsOf({ positions: [pos({ km: 40, at: `${FRI} 20:00`, off: 40_000 })], now: `${FRI} 20:30` });
    const s = holds('INV-19', home);
    expect(s.ride.startOffRouteM).toBe(0);
    failsOnScreen('INV-19', home, (x) => { x.ride.startOffRouteM = 40_000; }, /a rejoin leg on a ride that doesn't start at the position/);
    failsOnScreen('INV-19', home, (x) => { x.strip.endText = `${x.strip.endText} `; }, /a position at home changes the strip/);
    failsOnScreen('INV-19', home, (x) => { x.cards.daylight.title = 'Another title'; }, /a position at home changes leave-by/);
  });
  const rough = inputsOf({ positions: [pos({ km: 0.1, at: `${SAT} 08:30` }), pos({ km: 40, at: `${SAT} 12:00`, acc: 2000 })], now: `${SAT} 12:10`, spots: [{ b: shop(OPEN_LONG), km: 40.5, id: 'n1' }, { b: shop(OPEN_LONG), km: 50, id: 'n2' }, { b: tap(), km: 60, id: 'n3' }], spells: [RAIN] });
  test('[INV-19] accuracy worse than 500 m: from km - accuracy, and nothing inside the radius counts', () => {
    const s = holds('INV-19', rough);
    expect(s.ride.startKm).toBe(38);
    expect(s.ride.behindFromKm).toBe(42);
    failsOnScreen('INV-19', rough, (x) => { x.ride.startKm = 40; x.ride.behindFromKm = 42; x.strip.endText = `${showDistance(x)} km`; }, /starts at 40|rejoin|start is/);
    failsOnScreen('INV-19', rough, (x) => { x.ride.behindFromKm = 41; }, /places behind are measured from 41/);
    failsOnPart('INV-19', rough, (w) => ({ ...w, targets: { s1: { kind: 'place', place: rough.places[0]!, match: rough.matches[0]!, km: 40.5, arrival: rough.now, tonight: false, back: false }, s2: w.targets!.s2 } }), /inside the radius/);
    failsOnPart('INV-19', rough, (w) => ({ ...w, ideas: { ...w.ideas!, timeline: [{ trigger: 'rhythm', placeId: 'n1', arrival: rough.now, status: 'fine', reason: 'x', km: 40.5, lines: [] }] } }), /stop idea at km 40.5 lies inside the radius/);
    failsOnPart('INV-19', rough, (w) => ({ ...w, lb: { ...w.lb!, limits: [{ id: 'food-tonight', latest: rough.now, place: 'shop at km 40.5', closes: null }] } }), /limit at km 40.5 lies inside the radius/);
  });

  test('[INV-20] one "about HH:MM" for a place on every card, chip and message', () => {
    holds('INV-20', moment);
    failsOnScreen('INV-20', moment, (s) => { s.strip.endText = '38 km · about 01:05'; }, /the strip says/);
    failsOnScreen('INV-20', moment, (s) => { const x = s.cards.water.items[0]!; x.stamp = { km: x.stamp!.km!, at: new Date(x.stamp!.at!.getTime() + 1_800_000) }; }, /Water says/);
    failsOnScreen('INV-20', moment, (s) => { const x = s.cards.water.items[0]!; x.detail = '+15 km · about 01:05'; }, /its text does not say/);
    failsOnScreen('INV-20', moment, (s) => { const x = s.cards.food.items.find((y) => y.stamp?.at)!; x.stamp = { km: x.stamp!.km!, at: new Date(x.stamp!.at!.getTime() + 1_800_000) }; }, /Food says/);
    failsOnScreen('INV-20', moment, (s) => { s.shareText = s.shareText!.replace(/at about \d\d:\d\d/, 'at about 01:05'); }, /Share says about 01:05/);
    failsOnPart('INV-20', moment, (w) => ({ ...w, plans: w.plans.map((p) => ({ ...p, covers: p.covers.map((c) => ({ ...c, arrival: new Date(c.arrival.getTime() + 600_000) })) })) }), /has its own arrival/);
  });
  test('[INV-20] the Shelter chip rides there now', () => {
    const cover = inputsOf({ ...riding, spots: [{ b: cafe(OPEN_LONG), km: 50 }] });
    holds('INV-20', cover);
    failsOnScreen('INV-20', cover, (s) => { const x = s.chips.shelter.items[0]!; x.stamp = { km: x.stamp!.km!, at: new Date(x.stamp!.at!.getTime() + 600_000) }; }, /Shelter chip says/);
  });

  test('[INV-21] shown temperatures are the raw forecast', () => {
    holds('INV-21', moment);
    failsOnScreen('INV-21', moment, (s) => { const x = s.cards.weather.items.find((y) => y.stamp === null && /°C/.test(y.detail ?? ''))!; x.detail = '13 °C'; }, /Weather shows 13 °C/);
    failsOnScreen('INV-21', moment, (s) => { s.cards.weather.items.find((y) => y.label.startsWith("Night's low"))!.label = "Night's low about 13 °C at km 78"; }, /Weather shows 13 °C/);
    failsOnScreen('INV-21', moment, (s) => { s.cards.water.detail += ' 40 °C.'; }, /Water card shows a temperature/);
  });

  test('[INV-22] a basis with ages and attribution, and no half-hour rain time beyond 48 hours', () => {
    holds('INV-22', moment);
    failsOnScreen('INV-22', moment, (s) => { s.cards.climbing.basis = []; }, /no basis/);
    failsOnScreen('INV-22', moment, (s) => { s.cards.weather.basis = ['x']; }, /without the Open-Meteo attribution/);
    failsOnScreen('INV-22', moment, (s) => { delete s.cards.weather.freshness.dataDates['weather']; }, /without its forecast's age/);
    failsOnScreen('INV-22', moment, (s) => { s.cards.sleep.basis = ['x']; }, /without the OpenStreetMap attribution/);
    failsOnScreen('INV-22', moment, (s) => { s.chips.shelter.basis = ['x']; }, /Shelter reads the forecast without the Open-Meteo attribution/);
    failsOnScreen('INV-22', moment, (s) => { s.cards.food.basis = ['x']; }, /Food reads the forecast without the Open-Meteo attribution/);
    failsOnScreen('INV-22', moment, (s) => { s.cards.sleep.freshness.dataDates = {}; }, /without their data's date/);
    failsOnScreen('INV-22', moment, (s) => { s.cards.water.freshness.dataDates['places'] = 'not a date'; }, /a data date that is no date/);
    failsOnPart('INV-22', moment, (w) => ({ ...w, windows: w.windows.map((x) => ({ ...x, detail: '30min' as const, reachAt: new Date(x.reachAt.getTime() + 5 * 86_400_000) })) }), /half-hour rain time beyond 48 hours/);
    failsOnPart('INV-22', moment, (w) => ({ ...w, windows: w.windows.map((x) => ({ ...x, detail: 'daypart' as const })) }), /a rain time to the half hour beyond 48 hours/);
    const wet = inputsOf({ ...riding, spells: [{ range: [30, 50], stamps: stamps(SAT, 11, 13), pp: 80, mm: 1 }] });
    failsOnScreen('INV-22', { ...wet, now: new Date(wet.now.getTime() + 3 * 86_400_000) }, (x) => { x.cards.weather.title = 'Rain likely here until about 14:00'; }, /rain's end told to the half hour/);
  });

  const noHeights = inputsOf({ trip: testTrip({ route: flatRoute(300, { stageEnds: [78, 150, 222, 300], ele: null }) }), ...morning });
  test('[INV-23] missing heights read unknown, and leave-by at least action', () => {
    const s = holds('INV-23', noHeights);
    expect(s.cards.climbing.status).toBe('unknown');
    failsOnScreen('INV-23', noHeights, (x) => { x.cards.climbing.status = 'fine'; }, /Climbing reads fine/);
    failsOnScreen('INV-23', noHeights, (x) => { x.cards.climbing.title = '0 m left'; }, /Climbing reads 0 m/);
    failsOnScreen('INV-23', noHeights, (x) => { x.cards.daylight.status = 'fine'; }, /leave-by reads fine/);
  });

  const share = inputsOf({ ...riding, rescuePoints: [{ ...rescue('KA-145').atKm(40, { off: 80 }), kms: [40] }], spots: [{ b: settlement('Ettlingen'), km: 41 }] });
  test('[INV-24] Share my location and Share progress keep to what they may hold', () => {
    const s = holds('INV-24', share);
    expect(s.chips.emergency.rescue).not.toBeNull();
    failsOnScreen('INV-24', share, (x) => { x.chips.emergency.rescue = null; }, /the card shows a rescue line: false/);
    failsOnScreen('INV-24', share, (x) => { x.chips.emergency.share = x.chips.emergency.share!.replace(/.*rescue.*/i, ''); }, /says rescue: false/);
    failsOnScreen('INV-24', share, (x) => { x.chips.emergency.share += '\n10 minutes ago'; }, /relative time/);
    failsOnScreen('INV-24', share, (x) => { x.chips.emergency.updatePosition = true; }, /old position/);
    failsOnScreen('INV-24', share, (x) => { x.chips.emergency.share += '\nThis position was set by hand on my route, not from GPS.'; }, /manual position/);
    failsOnScreen('INV-24', share, (x) => { x.chips.emergency.share += '\nThis position is approximate.'; }, /approximate position/);
    for (const bad of ['I have 2 L of water left.', 'Sent by Wayfinch.', 'At 49.12345, 8.40000.']) failsOnScreen('INV-24', share, (x) => { x.shareText = `${x.shareText} ${bad}`; }, /Share progress holds/);
    failsOnScreen('INV-24', share, (x) => { x.shareMapText = `At 49.12345\n${x.shareMapText}`; }, /outside the map link/);
  });

  const calls = inputsOf({ ...riding, spots: [{ b: bikeShop(OPEN_LONG, { contact: { phones: ['+49 721 123456'], website: null } }), km: 45 }, { b: pharmacy(OPEN_LONG), km: 46 }] });
  test('[INV-25] call buttons only for the four kinds, with a callable number', () => {
    holds('INV-25', calls);
    failsOnScreen('INV-25', calls, (s) => { s.chips.pharmacy.items[0]!.contact = { phones: ['+49 721 1'], website: null }; }, /a call button on a place that may have none/);
    failsOnScreen('INV-25', calls, (s) => { s.chips.bike.items[0]!.detail = 'Call not a number'; }, /a number that can't be called/);
  });
});

describe('the same screen', () => {
  const small = inputsOf({ ...morning, spots: [{ b: shop('Mo-Sa 08:00-20:00'), km: 20 }, { b: cafe('Mo-Su 09:00-18:00'), km: 30 }, { b: tap(), km: 40 }] });
  test('[INV-26] byte-identical on another phone: the check really changes the zone', () => {
    const c = checkOf('INV-26');
    expect(c.every).toBe(5);
    const seen = new Set<string>();
    for (let n = 0; n < 60; n++) {
      const i: ScreenInputs = { ...small, now: new Date(small.now.getTime() + n * 60_000) };
      const s = buildScreen(i).screen;
      c.check(i, s, (x) => {
        seen.add(process.env['TZ'] ?? '');
        expect(new Date(2026, 0, 15, 12).getTimezoneOffset()).toBe(DEVICE_ZONES.find((z) => z.zone === process.env['TZ'])!.janOffset);
        return buildScreen(x).screen;
      });
    }
    expect([...seen].sort()).toEqual(DEVICE_ZONES.map((z) => z.zone).sort());
  });
  test('[INV-26] a screen that differs breaks it', () => {
    holds('INV-26', small);
    failsOnScreen('INV-26', small, (s) => { s.notes.push('x'); }, /the screen differs on a phone set to/);
  });
  const many = inputsOf({ ...riding, spots: [{ b: cafe(OPEN_LONG), km: 50 }, { b: cafe(OPEN_LONG), km: 52 }, { b: tap(), km: 55 }], rescuePoints: [{ ...rescue('A-1').atKm(40), kms: [40] }, { ...rescue('A-2').atKm(40.1), kms: [40.1] }] });
  test('[INV-29] shuffled lists: byte-identical', () => {
    const c = checkOf('INV-29');
    expect(c.every).toBe(5);
    const s = holds('INV-29', many);
    let given: ScreenInputs | null = null;
    c.check(many, s, (x) => { given = x; return buildScreen(x).screen; });
    expect(given!.places).not.toEqual(many.places);
    expect(given!.matches).not.toEqual(many.matches);
    expect(given!.rescuePoints).not.toEqual(many.rescuePoints);
    failsOnScreen('INV-29', many, (x) => { x.notes.push('x'); }, /shuffling the lists changes the screen/);
  });
});

describe('all the words', () => {
  test('[INV-30] no broken words, no negative figures, route order, arrivals that never run back', () => {
    holds('INV-30', moment);
    for (const word of ['NaN km', 'undefined', 'null', 'Infinity km', '[object Object]']) failsOnScreen('INV-30', moment, (s) => { s.cards.food.detail = `Food ${word}`; }, /food reads/);
    failsOnScreen('INV-30', moment, (s) => { s.strip.endText = '-5 km · about 12:00'; }, /a negative figure in strip end/);
    failsOnScreen('INV-30', moment, (s) => { s.cards.water.items[0]!.stamp = { km: -1 }; }, /a stamp at km -1/);
    failsOnScreen('INV-30', moment, (s) => { s.strip.icons = [{ kind: 'food', km: 50, opens: 'food' }, { kind: 'food', km: 20, opens: 'food' }]; }, /strip icons out of route order/);
    failsOnPart('INV-30', moment, (w) => ({ ...w, ideas: { ...w.ideas!, timeline: [{ trigger: 'rhythm', placeId: 'a', arrival: null, status: 'fine', reason: 'x', km: 60, lines: [] }, { trigger: 'meal', placeId: 'b', arrival: null, status: 'fine', reason: 'x', km: 50, lines: [] }] } }), /the Food timeline out of route order/);
    failsOnPart('INV-30', moment, (w) => {
      const atKm = (km: number): Date => new Date(moment.now.getTime() + (km < 100 ? 5 : 1) * 3_600_000);
      return { ...w, schedule: { ...w.schedule, atKm } };
    }, /before the arrival at an earlier kilometre/);
    // A temperature may read below zero, and a name may say anything.
    const cold = inputsOf({ ...morning, spells: [{ range: [0, 300], stamps: stamps(SAT, 1, 23), t: -7 }], spots: [{ b: cafe(OPEN_LONG, { name: 'NaN' }), km: 20 }] });
    holds('INV-30', cold);
  });
  test('[INV-31] no banned word, with place names masked', () => {
    holds('INV-31', moment);
    failsOnScreen('INV-31', moment, (s) => { s.cards.water.title = 'This water is safe'; }, /water uses "safe"/);
    failsOnScreen('INV-31', moment, (s) => { s.cards.weather.title = 'It will be dry'; }, /weather uses "will be dry"/);
    failsOnScreen('INV-31', moment, (s) => { s.cards.food.title = 'A dry spell'; }, /food uses "dry"/);
    const named = inputsOf({ ...riding, spots: [{ b: cafe(OPEN_LONG, { name: 'Safe Harbour' }), km: 50 }] });
    expect(JSON.stringify(buildScreen(named).screen)).toContain('Safe Harbour');
    holds('INV-31', named);
  });
});

describe('the trip day', () => {
  test('[INV-32] tomorrow beyond tonight; none at the end; no tonight before the trip', () => {
    holds('INV-32', moment);
    failsOnScreen('INV-32', moment, (s) => { s.ride.tomorrowKm = s.ride.tonightKm; }, /is not beyond tonight's/);
    const before = inputsOf({ now: `${FRI} 21:00` });
    holds('INV-32', before);
    failsOnScreen('INV-32', before, (s) => { s.ride.tonightKm = 78; }, /before the trip tonight's stop is 78/);
    const end = inputsOf({ positions: [pos({ km: 299.5, at: `${SAT} 12:00` })], now: `${SAT} 12:10` });
    expect(holds('INV-32', end).phase).toBe('route-end');
    failsOnScreen('INV-32', end, (s) => { s.ride.tomorrowKm = 300; }, /at the route end tomorrow's stop is 300/);
    failsOnScreen('INV-32', end, (s) => { s.ride.phase = 'riding'; s.ride.tonightKm = 300; s.ride.tomorrowKm = 310; }, /tonight's stop is the route end/);
  });

  const evening = inputsOf({ positions: [pos({ km: 0.1, at: `${SAT} 08:30` }), pos({ km: 77.5, at: `${SAT} 19:30` })], now: `${SAT} 19:40`, spots: [{ b: tap(), km: 79 }, { b: cafe(OPEN_LONG), km: 90 }], spells: [{ range: [100, 110], stamps: stamps('2026-10-18', 10, 16), pp: 80, mm: 1 }] });
  test('[INV-33] after the ride and before the trip no card plans today, and no wait or go', () => {
    expect(holds('INV-33', evening).phase).toBe('after-ride');
    failsOnScreen('INV-33', evening, (s) => { s.ride.date = SAT; }, /the cards plan the ride of 2026-10-17/);
    failsOnScreen('INV-33', evening, (s) => { s.strip.label = 'Today'; }, /the strip says Today/);
    failsOnScreen('INV-33', evening, (s) => { s.ride.departure = evening.now; }, /departs at or before now/);
    failsOnScreen('INV-33', evening, (s) => { s.cards.weather.items.unshift({ label: "Waiting up to 3 hours won't help much.", stamp: null, status: 'fine' }); }, /wait or go is shown/);
    failsOnScreen('INV-33', evening, (s) => { s.cards.food.items.unshift({ label: 'A place', stamp: { km: 90, at: evening.now }, status: 'fine' }); }, /Food plans A place/);
    failsOnPart('INV-33', evening, (w) => ({ ...w, wg: { where: 'here', d: null, savedMin: 0, arrivalNow: evening.now, arrivalWait: null, lines: [] } }), /wait or go is shown/);
    const friday = inputsOf({ now: `${FRI} 21:00`, spots: [{ b: tap(), km: 20 }] });
    expect(holds('INV-33', friday).phase).toBe('before-trip');
    failsOnScreen('INV-33', friday, (s) => { s.cards.water.items[0]!.stamp = { km: 20, at: friday.now }; }, /Water plans/);
  });

  test('[INV-34] dates before the departure are before the trip; far-off positions set no phase', () => {
    const friday = inputsOf({ now: `${FRI} 21:00` });
    expect(holds('INV-34', friday).phase).toBe('before-trip');
    failsOnScreen('INV-34', friday, (s) => { s.ride.phase = 'riding'; s.phase = 'riding'; }, /and the phase is riding/);
    const far = inputsOf({ positions: [pos({ km: 40, at: `${SAT} 12:00`, off: 6000 })], now: `${SAT} 12:10` });
    holds('INV-34', far);
    const lying = (x: ScreenInputs): Screen => ({ ...buildScreen(x).screen, phase: 'riding' });
    failsOnScreen('INV-34', far, () => undefined, /positions over 5 km off change the phase/, lying);
  });
});

function showDistance(s: Screen): string {
  return (s.ride.stopKm - s.ride.startKm).toFixed(1);
}
