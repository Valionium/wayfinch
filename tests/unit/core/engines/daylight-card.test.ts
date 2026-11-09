import { describe, expect, test } from 'vitest';
import { daylightAnswer } from '../../../../src/core/engines/daylight-card.ts';
import { leaveBy, stopStamp } from '../../../../src/core/engines/leaveby.ts';
import type { Answer } from '../../../../src/core/types.ts';
import { bakery, flatRoute, pos, supermarket, tap, testTrip } from '../../../fixtures/build.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { dayTo, FRI, leaveFacts, SAT, TAPS, type LeaveCase } from './leaveby-helpers.ts';

const card = (c: LeaveCase): Answer => daylightAnswer(leaveFacts(c));
const SUNSET_17 = { sunset: '17:00', dusk: '17:35' };
const texts = (a: Answer): string[] => a.items.flatMap((i) => [i.label, i.detail ?? '']);
const atStart = (time: string): LeaveCase['positions'] => [pos({ km: 0, at: `${SAT} ${time}` })];
const FROM_76 = (now: string): LeaveCase => ({
  trip: testTrip({ departureDate: FRI, stay: 'accommodation' }), now: `${SAT} ${now}`, positions: [pos({ km: 76, at: `${FRI} 19:10` })], spots: TAPS.map((t) => ({ ...t, km: Number(t.km) + 80 })),
});

describe('the Daylight card: leave-by in the title', () => {
  test('[LB-CLOSURE] the title names the shop', () => {
    const a = card({ sun: SUNSET_17, spots: [...TAPS, { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 }] });
    expect(a.title).toContain('about 09:45');
    expect(a.title).toContain('supermarket at km 30');
    expect(a.topic).toBe('daylight');
  });

  test('[LB-UNKNOWN] title the daylight time; expanded names what was not counted', () => {
    const a = card({ sun: SUNSET_17, now: `${SAT} 07:00`, positions: atStart('06:50'), spots: [...TAPS, { b: supermarket(null), km: 30 }] });
    expect(a.title).toContain('about 11:15');
    expect(texts(a)).toContain("No food shop on today's ride is mapped as open before Sunday · 1 shop with unknown hours");
  });

  test('[LB-UNKNOWN] with a limit kept, what was not counted reads "Not included"', () => {
    const a = card({ sun: SUNSET_17, spots: [...TAPS, { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 }, { b: supermarket(null), km: 40 }, { b: bakery(null), km: 41 }] });
    expect(texts(a)).toContain('Not included: 2 shops with unknown hours');
  });

  test('[LB-CLASH] expanded says the bakery cannot be reached on a departure that suits the water plan', () => {
    const a = card({ sun: SUNSET_17, spots: [{ b: bakery('Mo-Su 07:00-11:00'), km: 80 }, { b: supermarket('Mo-Su 08:00-18:00', { kind: 'cafe', tags: { amenity: 'cafe' } }), km: 10 }, { b: tap(), km: 50 }] });
    expect(a.title).toContain('about 11:15');
    expect(texts(a)).toContain("The bakery at km 80, open until 11:00, can't be reached on a departure that suits the water plan");
  });

  test('[LB-NO-DAYLIGHT] no leave-by, status action, the title gives the 04:00 arrival', () => {
    const a = card({ trip: dayTo(240), spots: TAPS });
    expect(a.title).toBe('Even leaving at 04:00, you would reach km 240 only at about 17:30 (sunset 18:42)');
    expect(a.status).toBe('action');
  });

  test('[LB-DEPARTURE-DAY] 07:00: fine, assuming 08:30', () => {
    const f = leaveFacts({ sun: SUNSET_17, now: `${SAT} 07:00`, positions: atStart('06:50'), spots: TAPS });
    const a = daylightAnswer(f);
    expect(f.ride.departure.getTime()).toBe(f.schedule.departure.getTime());
    expect(a.status).toBe('fine');
    expect(a.title).toContain('about 11:15');
  });

  test('[LB-DEPARTURE-DAY] 12:00: passed, action, "You would have needed"', () => {
    const a = card({ sun: SUNSET_17, now: `${SAT} 12:00`, positions: atStart('11:50'), spots: TAPS });
    expect(a.status).toBe('action');
    expect(a.title.startsWith('You would have needed')).toBe(true);
  });

  test('[LB-DEPARTURE-DAY] 12:35: about 17:40, after dusk, warning', () => {
    const a = card({ sun: SUNSET_17, now: `${SAT} 12:35`, positions: atStart('12:30'), spots: TAPS });
    expect(a.status).toBe('warning');
    expect(a.title).toBe('Leaving now, you would reach km 90 after dark (dark from 17:35).');
    expect(a.detail).toContain('about 17:40');
  });

  test('[LB-STATUS] 25 min away: action; 31 min away: fine', () => {
    const f = (now: string): Answer => card({ sun: SUNSET_17, now: `${SAT} ${now}`, positions: atStart('06:50'), spots: TAPS });
    expect(f('10:52:34').status).toBe('action');
    expect(f('10:46:30').status).toBe('fine');
  });

  test('[LB-STATUS] passed: action, with "You would have needed"; arriving after dusk leaving now: warning', () => {
    const passed = card({ ...FROM_76('14:45') });
    expect(passed.status).toBe('action');
    expect(passed.title.startsWith('You would have needed')).toBe(true);
    expect(card({ ...FROM_76('15:30') }).status).toBe('warning');
  });

  test('[LB-STATUS] before the daily start: action, today and tomorrow', () => {
    const shopBy = { b: bakery('Mo-Sa 07:00-10:30'), km: 30 };
    const today = card({ sun: SUNSET_17, now: `${SAT} 06:00`, positions: atStart('05:50'), spots: [...TAPS, shopBy] });
    expect(today.status).toBe('action');
    expect(today.title).toContain('min before your usual start');
    const tomorrow = card({ sun: SUNSET_17, spots: [...TAPS, shopBy] });
    expect(tomorrow.status).toBe('action');
  });

  test('[LB-STATUS] a leave-by comfortably after the usual start, on any phase: fine', () => {
    expect(card({ sun: SUNSET_17, spots: TAPS }).status).toBe('fine');
  });

  test('[LB-FIRST-LIGHT] leave-by 06:50, dawn 07:58: "before first light (07:58)", action', () => {
    const a = card({ sun: { ...SUNSET_17, dawn: '07:58' }, spots: [...TAPS, { b: bakery('Mo-Sa 05:00-09:01'), km: 30 }] });
    expect(a.title).toContain('about 06:50');
    expect(a.title).toContain('before first light (07:58)');
    expect(a.status).toBe('action');
  });

  test('[LB-FIRST-LIGHT] after the usual start and hours away, before first light alone is action', () => {
    const a = card({ trip: dayTo(90, { startTime: '05:00' }), sun: { ...SUNSET_17, dawn: '07:58' }, spots: [...TAPS, { b: bakery('Mo-Sa 05:00-09:01'), km: 30 }] });
    expect(a.status).toBe('action');
    const light = card({ trip: dayTo(90, { startTime: '05:00' }), sun: { ...SUNSET_17, dawn: '06:00' }, spots: [...TAPS, { b: bakery('Mo-Sa 05:00-09:01'), km: 30 }] });
    expect(light.status).toBe('fine');
  });

  test('[LB-FIRST-LIGHT] no dawn that day adds nothing, and a broken dawn does not throw', () => {
    const a = card({ sun: { ...SUNSET_17, dawn: null }, spots: TAPS });
    expect(a.title).not.toContain('first light');
  });
});

describe('wording', () => {
  test('[LB-WORDING] from km 76', () => {
    const f = leaveFacts(FROM_76('07:00'));
    expect(daylightAnswer(f).title).toBe('Leave by about 14:00 · to reach km 150 before sunset (18:42).');
    expect(stopStamp(f.ride)).toBe('km 150 · 74 km');
  });

  test('[LB-WORDING] the card carries the stamp', () => {
    expect(card(FROM_76('07:00')).detail).toContain('km 150 · 74 km');
  });

  test('[LB-WORDING] day 1, before the trip', () => {
    expect(card({ trip: testTrip({ stay: 'accommodation' }), spots: TAPS }).title).toBe('Day 1, Sat 17 Oct: leave by about 13:45 · to reach km 78 before sunset (18:42).');
  });

  test('[LB-WORDING] tomorrow, before the usual start, a bakery binding', () => {
    const FRI2 = '2026-10-23';
    const f = leaveFacts({
      trip: testTrip({ stay: 'accommodation' }), now: `${FRI2} 18:00`, positions: [pos({ km: 150, at: `${FRI2} 17:50` })], plan: { date: FRI2, backToTodayAt: null },
      spots: [{ b: tap(), km: 151, id: 'n1' }, { b: tap(), km: 152, id: 'n2' }, { b: bakery('Mo-Sa 07:00-12:00'), km: 215 }],
    });
    expect(f.ride.phase).toBe('after-ride');
    expect(daylightAnswer(f).title).toBe('Tomorrow, Sat 24 Oct: leave by about 07:50 · 40 min before your usual start · bakery at km 215 before Sunday, closes 12:00.');
    expect(stopStamp(f.ride)).toBe('km 222 · 72 km');
  });

  test('[LB-WORDING] the last shop before Sunday', () => {
    const a = card({ now: `${SAT} 07:00`, positions: atStart('06:50'), spots: [...TAPS, { b: supermarket('Mo-Sa 08:00-13:00'), km: 64 }] });
    expect(a.title).toBe('Leave by about 08:50 · last shop before Sunday: supermarket at km 64, closes 13:00.');
  });

  test('[LB-WORDING] passed, and after dark', () => {
    expect(card(FROM_76('14:45')).title).toBe('You would have needed to leave by about 14:00 to reach km 150 before sunset. Leaving now: about 18:55, lights on from 18:42.');
    expect(card(FROM_76('15:30')).title).toBe('Leaving now, you would reach km 150 after dark (dark from 19:17).');
  });

  test('[LB-WORDING] the water plan line', () => {
    const a = card({ sun: SUNSET_17, spots: [{ b: bakery('Mo-Su 06:00-12:00'), km: 12 }, { b: tap(), km: 50 }] });
    expect(texts(a)).toContain('Water plan: the next reliable water, the bakery at km 12, counts only while it is open (until 12:00).');
  });

  test('[LB-WORDING] the expanded view lists each limit, binding first, the usual start, the sun items', () => {
    const a = card({ sun: SUNSET_17, spots: [...TAPS, { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 }] });
    const labels = a.items.map((i) => i.label);
    expect(labels[0]).toContain('supermarket at km 30');
    expect(labels[1]).toContain('km 90');
    expect(labels).toContain('Your usual start 08:30');
    expect(labels.some((l) => l.startsWith('Sunset 17:00 at km 90 · dark from 17:35'))).toBe(true);
  });

  test('[LB-WORDING] nothing on the card uses a banned word', () => {
    const a = card({ sun: SUNSET_17, spots: [...TAPS, { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 }] });
    expect(bannedHits([a.title, a.detail, ...texts(a), ...a.basis].join(' '))).toEqual([]);
  });

  test('[LB-BASIS] pace, breaks, the start, the exclusions, the assumption and the map date', () => {
    const a = card({
      trip: testTrip({ departureDate: FRI, stay: 'accommodation', pace: 'sporting' }), now: `${SAT} 07:00`, positions: [pos({ km: 76, at: `${FRI} 19:10` })],
      spots: [{ b: tap({ dataDate: '2026-10-28' }), km: 80 }],
    });
    expect(a.basis[0]).toBe('Your planned pace (sporting, 25 km/h flat) plus 15% for breaks, from km 76 (your position at 19:10 yesterday). Wind, weather and extra stops are not included. Sunday closing is an assumption. Map data from 28 Oct.');
    expect(a.basis).toContain('© OpenStreetMap contributors');
  });

  test('[LB-BASIS] from the route start with no position, no assumption on a weekday', () => {
    const a = card({ trip: dayTo(90, { departureDate: '2026-10-20' }), now: '2026-10-19 20:00' });
    expect(a.basis[0]).toBe('Your planned pace (25 km/h flat) plus 15% for breaks, from km 0. Wind, weather and extra stops are not included.');
  });
});

describe('degraded', () => {
  test('[LB-DEGRADED] no date: no leave-by, missing date', () => {
    const a = card({ trip: dayTo(90, { departureDate: null }) });
    expect(a.missing).toContain('date');
    expect(a.title).not.toContain('Leave by');
    expect(a.status).toBe('unknown');
    expect(texts(a)).toContain('Leave-by needs a departure date (Trip settings).');
  });

  test('[LB-DEGRADED] not prepared: daylight only, "Shop hours need Prepare this route"', () => {
    const a = card({ sun: SUNSET_17, savedKm: [], spots: [...TAPS, { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 }] });
    expect(a.detail).toContain('Shop hours need Prepare this route');
    expect(a.title).toContain('about 11:15');
    expect(a.missing).toContain('hours');
  });

  test('[LB-DEGRADED] places but no prepared hours: the same', () => {
    const a = card({ sun: SUNSET_17, hours: [], spots: [...TAPS, { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 }] });
    expect(a.detail).toContain('Shop hours need Prepare this route');
  });

  test('[LB-DEGRADED] outside coverage: daylight only, "No place data here", missing places', () => {
    const a = card({ sun: SUNSET_17, savedKm: [{ fromKm: 0, toKm: 40 }], spots: [...TAPS, { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 }] });
    expect(a.detail).toContain('No place data here');
    expect(a.title).toContain('about 11:15');
    expect(a.missing).toContain('places');
  });

  test('[LB-DEGRADED] broken saved ranges read as no data', () => {
    const a = card({ sun: SUNSET_17, savedKm: [{ fromKm: Number.NaN, toKm: Number.NaN }], spots: TAPS });
    expect(a.detail).toContain('No place data here');
  });

  test('[LB-DEGRADED] no heights: the line, at least action, missing heights', () => {
    const route = flatRoute(400, { stageEnds: [90, 190], ele: null });
    const a = card({ trip: dayTo(90, { route }), sun: SUNSET_17, spots: TAPS });
    expect(a.detail).toContain('Climbing unknown: times assume a flat route, so in hills leave earlier.');
    expect(a.status).toBe('action');
    expect(a.missing).toContain('heights');
  });

  test('[LB-DEGRADED] one broken height is no height', () => {
    const route = flatRoute(400, { stageEnds: [90, 190] });
    route.points[5] = { ...route.points[5]!, ele: null };
    const a = card({ trip: dayTo(90, { route }), sun: SUNSET_17, spots: TAPS });
    expect(a.status).toBe('action');
    expect(a.missing).toContain('heights');
  });

  test('[LB-DEGRADED] light all night with no other limit: "No leave-by limit today"', () => {
    const a = card({ sun: { lightAllNight: true, sunset: null, dusk: null }, spots: TAPS });
    expect(a.title).toBe('No leave-by limit today');
    expect(a.status).toBe('fine');
    expect(leaveBy(leaveFacts({ sun: { lightAllNight: true, sunset: null, dusk: null }, spots: TAPS }), leaveFacts({ sun: { lightAllNight: true, sunset: null, dusk: null }, spots: TAPS }).ride).unrounded).toBeNull();
  });

  test('[LB-DEGRADED] light all night with a shop before Sunday: leave-by from the shop', () => {
    const a = card({ sun: { lightAllNight: true, sunset: null, dusk: null }, spots: [...TAPS, { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 }] });
    expect(a.title).toContain('about 09:45');
  });

  test('[LB-DEGRADED] sun times that are no times: unknown, and nothing throws', () => {
    const f = leaveFacts({ spots: TAPS });
    const a = daylightAnswer({ ...f, sun: () => ({ dawn: new Date(Number.NaN), sunrise: new Date(Number.NaN), sunset: new Date(Number.NaN), dusk: new Date(Number.NaN), lightAllNight: false }) });
    expect(a.status).toBe('unknown');
  });

  test('[LB-DEGRADED] a flat speed outside 15-40 or an invalid clock: unknown, and nothing throws', () => {
    expect(card({ trip: dayTo(90, { flatKph: 0 }) }).status).toBe('unknown');
    expect(card({ trip: dayTo(90, { flatKph: Number.NaN }) }).status).toBe('unknown');
    expect(card({ now: new Date(Number.NaN) }).status).toBe('unknown');
  });

  test('[LB-DEGRADED] a day the sun never rises: no leave-by, warning, no throw', () => {
    const a = card({ sun: { sunset: null, dusk: null, sunrise: null, dawn: null }, spots: TAPS });
    expect(a.status).toBe('warning');
  });
});

describe('by phase', () => {
  const riding = (now: string, km: number): LeaveCase => ({
    trip: testTrip({ departureDate: FRI, stay: 'accommodation' }), now: `${SAT} ${now}`, positions: [pos({ km: 76, at: `${FRI} 19:10` }), pos({ km, at: `${SAT} ${now}` })], spots: [{ b: tap(), km: km + 1, id: 'n1' }, { b: tap(), km: km + 2, id: 'n2' }],
  });

  test('[LB-SINGLE-DAY-RIDE] while riding: judges the stop\'s arrival, and expanded adds "Leave here by about 15:40" and Plan tomorrow', () => {
    const f = leaveFacts(riding('12:00', 105));
    expect(f.ride.phase).toBe('riding');
    const a = daylightAnswer(f);
    expect(a.status).toBe('fine');
    expect(a.title).toBe('km 150 about 14:30 · before sunset (18:42)');
    expect(a.items.map((i) => i.label)).toContain('Leave here by about 15:40');
    expect(a.items.map((i) => i.label)).toContain('Plan tomorrow');
  });

  test('[LB-SINGLE-DAY-RIDE] while riding, the status is the arrival\'s, not leave-by\'s', () => {
    const late = daylightAnswer(leaveFacts(riding('16:10', 105)));
    expect(late.status).toBe('action');
    expect(late.title).toContain('lights on from 18:42');
    const dark = daylightAnswer(leaveFacts(riding('17:00', 105)));
    expect(dark.status).toBe('warning');
    expect(dark.title).toContain('dark from 19:17');
  });

  test('[LB-SINGLE-DAY-RIDE] after the ride: "Tomorrow: leave by about 14:05 · your usual start 08:30", with Back to today', () => {
    const f = leaveFacts({
      trip: testTrip({ departureDate: FRI, stay: 'accommodation' }), now: `${SAT} 18:00`, positions: [pos({ km: 150, at: `${SAT} 17:50` })], plan: { date: SAT, backToTodayAt: null },
      spots: [{ b: tap(), km: 151, id: 'n1' }, { b: tap(), km: 152, id: 'n2' }],
    });
    expect(f.ride.phase).toBe('after-ride');
    const a = daylightAnswer(f);
    expect(a.title).toBe('Tomorrow: leave by about 14:05 · your usual start 08:30');
    expect(a.items.map((i) => i.label)).toContain('Back to today');
  });

  test('[LB-SINGLE-DAY-RIDE] before the day\'s ride: Plan tomorrow is offered; before the trip it is not', () => {
    expect(card(FROM_76('07:00')).items.map((i) => i.label)).toContain('Plan tomorrow');
    expect(card({ spots: TAPS }).items.map((i) => i.label)).not.toContain('Plan tomorrow');
  });

  test('[LB-SINGLE-DAY-RIDE] no heights while riding: at least action', () => {
    const route = flatRoute(300, { stageEnds: [78, 150, 222], ele: null });
    const a = daylightAnswer(leaveFacts({ ...riding('12:00', 105), trip: testTrip({ departureDate: FRI, stay: 'accommodation', route }) }));
    expect(a.status).toBe('action');
    expect(a.missing).toContain('heights');
  });

  const MON = '2026-10-19';
  const endTrip = (): ReturnType<typeof testTrip> => testTrip();
  test('[LB-ROUTE-END-DAY] km 298 on Monday at 15:00, at 22:00 that day: judges km 300, "dark from 19:17"', () => {
    const a = card({ trip: endTrip(), now: `${MON} 22:00`, positions: [pos({ km: 298, at: `${MON} 15:00` })] });
    expect(a.title).toContain('dark from 19:17');
    expect(a.title).toContain('km 300');
    expect(a.status).toBe('warning');
    expect(a.title).not.toContain('Leave by');
  });

  test('[LB-ROUTE-END-DAY] Tuesday 22:00, and Wednesday with no position left: "The sun set at 18:42", fine', () => {
    const tue = card({ trip: endTrip(), now: '2026-10-20 22:00', positions: [pos({ km: 298, at: `${MON} 15:00` })], routeEndDate: MON });
    expect(tue.title).toContain('The sun set at 18:42');
    expect(tue.status).toBe('fine');
    const wed = card({ trip: endTrip(), now: '2026-10-21 22:00', routeEndDate: MON });
    expect(wed.title).toContain('The sun set at 18:42');
    expect(wed.status).toBe('fine');
  });

  test('[LB-SINGLE-DAY-RIDE] route end: no leave-by; judges the arrival on the end date', () => {
    const a = card({ trip: endTrip(), now: `${MON} 15:00`, positions: [pos({ km: 298, at: `${MON} 15:00` })] });
    expect(a.status).toBe('fine');
    expect(a.title).toContain('km 300');
    expect(texts(a).join(' ')).not.toContain('Leave here');
  });

  test('[LB-SINGLE-DAY-RIDE] tonight\'s stop is the route end, with no ride: daylight left, fine', () => {
    const trip = testTrip({ route: flatRoute(90), departureDate: SAT });
    const a = card({ trip, now: `${SAT} 21:00` });
    expect(a.title).toContain('The sun set');
    expect(a.status).toBe('fine');
  });
});
