import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { progressText, type ShareFacts } from '../../../../src/core/engines/share.ts';
import { dayRide, scheduleFor } from '../../../../src/core/engines/tripday.ts';
import type { PlanTomorrow, Position, Trip } from '../../../../src/core/types.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { at, flatRoute, pos, settlement, sun, testTrip, zonesOf } from '../../../fixtures/build.ts';
import { spots, type Spot } from './water-helpers.ts';

const THU = '2026-10-15';
const FRI = '2026-10-16';
const SAT = '2026-10-17';

const route165 = flatRoute(165, { stageEnds: [78, 150, 165] });
const tripOn = (departureDate: string | null, over: Partial<Trip> = {}): Trip => testTrip({ route: route165, departureDate, ...over });

type Case = {
  trip?: Trip; positions: Position[]; now: string; position?: Position | null; places?: Spot[]; addMapLink?: boolean;
  plan?: PlanTomorrow | null; arrival?: string; routeEndDate?: string | null; sun?: Parameters<typeof sun>[0];
};
function facts(c: Case): ShareFacts {
  const trip = c.trip ?? tripOn(SAT);
  const env = { sun: sun(c.sun ?? {}), routeZones: zonesOf(trip.route.lengthKm) };
  const now = at(c.now);
  const ride = dayRide(trip, c.positions, c.plan ?? null, c.routeEndDate ?? null, now, env);
  const real = scheduleFor(ride, trip, env);
  // The rows that test the text pass a stub schedule that gives their time (section 6.14's examples are not a flat route's).
  const schedule = c.arrival ? { ...real, atKm: () => at(c.arrival!) } : real;
  const { places, matches } = spots(c.places ?? []);
  const position = c.position === undefined ? (c.positions.at(-1) ?? null) : c.position;
  return {
    ride, position, schedule, trip, settlements: places, matches, addMapLink: c.addMapLink ?? false, now, routeZones: env.routeZones,
    ...(c.plan !== undefined ? { planTomorrow: c.plan } : {}),
  };
}
const town = (name: string, km: number): Spot => ({ b: settlement(name), km });
const text = (c: Case): string | null => progressText(facts(c));

describe('[SP-RIDING] riding', () => {
  test('km 112.4 at 14:20 near Rastatt, the stop near Kehl at about 16:30', () => {
    const t = text({
      positions: [pos({ km: 112.4, at: `${SAT} 14:20`, acc: 12 })], now: `${SAT} 14:25`, arrival: `${SAT} 16:28`,
      places: [town('Rastatt', 112), town('Kehl', 150)],
    });
    expect(t).toBe('Sat 17 Oct, 14:20: at km 112 of 165, near Rastatt. Planning to stop near Kehl (km 150) at about 16:30.');
  });

  test('no coordinates, and the position\'s own time, not the clock\'s', () => {
    const t = text({ positions: [pos({ km: 112.4, at: `${SAT} 14:20`, acc: 12 })], now: `${SAT} 16:00`, places: [town('Rastatt', 112), town('Kehl', 150)] })!;
    expect(t).toContain('Sat 17 Oct, 14:20:');
    expect(t).not.toMatch(/\d+\.\d{3,}/);
  });

  test('the arrival is the schedule\'s own, to 5 minutes', () => {
    const f = facts({ positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25`, places: [town('Kehl', 150)] });
    const expected = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const real = f.schedule.atKm(150);
    const rounded = new Date(Math.round(real.getTime() / 300_000) * 300_000);
    expect(progressText(f)).toContain(`at about ${expected.format(rounded)}.`);
  });
});

describe('[SP-BEFORE-TRIP] before the trip', () => {
  test('names day 1\'s start and stop, wherever the position is', () => {
    const base = { trip: tripOn(FRI), now: `${THU} 19:10`, arrival: `${FRI} 12:55`, places: [town('Heidelberg', 0), town('Karlsruhe', 78)] };
    const expected = 'Thu 15 Oct, 19:10: starting on Fri 16 Oct from near Heidelberg (km 0 of 165), leaving about 08:30. Planning to stop near Karlsruhe (km 78) at about 12:55.';
    expect(text({ ...base, positions: [pos({ km: 30, off: 40_000, at: `${THU} 19:10` })] })).toBe(expected);
    expect(text({ ...base, positions: [pos({ km: 3, at: `${THU} 19:10` })] })).toBe(expected);
  });
});

describe('[SP-BEFORE-RIDE] before the day\'s ride', () => {
  test('from the position, leaving at the daily start', () => {
    const t = text({
      positions: [pos({ km: 80, at: `${SAT} 07:10` })], now: `${SAT} 07:10`, arrival: `${SAT} 12:25`,
      places: [town('Rheinstetten', 80), town('Kehl', 150)],
    });
    expect(t).toBe('Sat 17 Oct, 07:10: starting from near Rheinstetten (km 80 of 165), leaving about 08:30. Planning to stop near Kehl (km 150) at about 12:25.');
  });

  test('day 1 with the rider at home 40 km off the route: from km 0', () => {
    const t = text({
      positions: [pos({ km: 30, off: 40_000, at: `${SAT} 07:10` })], now: `${SAT} 07:10`, arrival: `${SAT} 12:55`,
      places: [town('Heidelberg', 0), town('Karlsruhe', 78), town('Home town', 30)],
    });
    expect(t).toBe('Sat 17 Oct, 07:10: starting from near Heidelberg (km 0 of 165), leaving about 08:30. Planning to stop near Karlsruhe (km 78) at about 12:55.');
  });
});

describe('[SP-AFTER] after the day\'s ride', () => {
  const after = { trip: tripOn(FRI), positions: [pos({ km: 80, at: `${FRI} 19:10` })], now: `${FRI} 19:10`, places: [town('Rheinstetten', 80), town('Kehl', 150)] };
  test('stopped for the night near a stage end, then tomorrow\'s stop, with no time', () => {
    expect(text(after)).toBe('Fri 16 Oct, 19:10: stopped for the night near Rheinstetten (km 80 of 165). Tomorrow: planning to stop near Kehl (km 150).');
  });

  test('Plan tomorrow is a claim to a stop wherever the rider is', () => {
    const t = text({
      trip: tripOn(FRI), positions: [pos({ km: 100, at: `${FRI} 15:00` })], now: `${FRI} 15:10`, plan: { date: FRI, backToTodayAt: null },
      places: [town('Gernsbach', 100), town('Kehl', 150)],
    });
    expect(t).toBe('Fri 16 Oct, 15:00: stopped for the night near Gernsbach (km 100 of 165). Tomorrow: planning to stop near Kehl (km 150).');
  });

  test('a Plan tomorrow undone by Back to today claims nothing', () => {
    const t = text({
      trip: tripOn(FRI), positions: [pos({ km: 100, at: `${FRI} 19:10` })], now: `${FRI} 19:20`,
      plan: { date: FRI, backToTodayAt: at(`${FRI} 18:00`) }, places: [town('Gernsbach', 100)],
    });
    expect(t).not.toContain('stopped for the night');
  });
});

describe('[SP-NO-CLAIM] no claimed stop', () => {
  const trip = testTrip();
  test('after the ride, more than 3 km from every stage end: the position, then tomorrow', () => {
    const t = text({ trip, positions: [pos({ km: 138, at: `${SAT} 18:50` })], now: `${SAT} 18:50` });
    expect(t).toBe('Sat 17 Oct, 18:50: at km 138 of 300. Tomorrow: planning to stop at km 222.');
  });

  test('within 3 km of a stage end it is a stop; 3.5 km is not', () => {
    expect(text({ trip, positions: [pos({ km: 151, at: `${SAT} 18:50` })], now: `${SAT} 18:50` })).toContain('stopped for the night');
    expect(text({ trip, positions: [pos({ km: 146.5, at: `${SAT} 18:50` })], now: `${SAT} 18:50` })).not.toContain('stopped for the night');
  });
});

describe('[SP-END] the route end', () => {
  test('at km 163 of 165', () => {
    const t = text({ positions: [pos({ km: 163, at: `${SAT} 16:40` })], now: `${SAT} 16:40`, places: [town('Strasbourg', 165)] });
    expect(t).toBe('Sat 17 Oct, 16:40: reached the end of my route near Strasbourg (km 165).');
  });

  test('on a loop only near its end, never at its start', () => {
    const loop = tripOn(SAT, { route: flatRoute(100, { stageEnds: [100] }) });
    const atStart = text({ trip: loop, positions: [pos({ km: 0.4, at: `${SAT} 09:00` })], now: `${SAT} 09:00` })!;
    expect(atStart).not.toContain('reached the end');
    const atEnd = text({ trip: loop, positions: [pos({ km: 99, at: `${SAT} 16:00` })], now: `${SAT} 16:00` })!;
    expect(atEnd).toBe('Sat 17 Oct, 16:00: reached the end of my route (km 100).');
  });

  test('tonight\'s stop at the end with no position: the after-ride text without Tomorrow', () => {
    const f = facts({ positions: [], now: `${SAT} 19:00`, places: [town('Strasbourg', 165)], position: null });
    const ride = { ...f.ride, phase: 'after-ride' as const, noRide: true, tonightKm: 165, tomorrowKm: null, stopKm: 165, startKm: 165, behindFromKm: 165 };
    const t = progressText({ ...f, ride });
    expect(t).toBe('Sat 17 Oct, 19:00: stopped for the night at the end of my route near Strasbourg (km 165).');
    expect(t).not.toContain('Tomorrow');
  });
});

describe('[SP-SETTLEMENT] without a settlement within 5 km', () => {
  test('kilometres only', () => {
    const t = text({
      positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25`, arrival: `${SAT} 16:28`,
      places: [town('Too far behind', 106), town('Too far ahead', 156)],
    });
    expect(t).toBe('Sat 17 Oct, 14:20: at km 112 of 165. Planning to stop at km 150 at about 16:30.');
  });

  test('5 km is near, a settlement 600 m off the route counts that too', () => {
    const near = text({ positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25`, places: [town('Edge', 117.3)] })!;
    expect(near).toContain(', near Edge.');
    const off = text({ positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25`, places: [{ b: settlement('Off'), km: 117, off: 600 }] })!;
    expect(off).not.toContain('Off');
  });

  test('the nearest of several, and a place reached twice is named once from its nearer pass', () => {
    const t = text({ positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25`, places: [town('Far', 108), { b: settlement('Twice'), km: [20, 113] }, town('Nearest', 112.6)] })!;
    expect(t).toContain(', near Nearest.');
    const only = text({ positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25`, places: [{ b: settlement('Twice'), km: [20, 113] }] })!;
    expect(only).toContain(', near Twice.');
  });

  test('a settlement without a usable name is not named', () => {
    const t = text({ positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25`, places: [{ b: settlement('   '), km: 112 }, { b: settlement('·→'), km: 112.1 }] })!;
    expect(t).toMatch(/^Sat 17 Oct, 14:20: at km 112 of 165\. Planning to stop at km 150 at about \d\d:\d\d\.$/);
    expect(t).not.toMatch(/near\s+\./);
  });
});

describe('[SP-QUALITY] approximate, manual and off route', () => {
  const base = { now: `${SAT} 14:25`, places: [town('Rastatt', 112)] };
  test('approximate', () => {
    expect(text({ ...base, positions: [pos({ km: 112.4, at: `${SAT} 14:20`, acc: 800 })] })).toContain('Sat 17 Oct, 14:20: around km 112 of 165 (position approximate), near Rastatt.');
  });
  test('manual', () => {
    expect(text({ ...base, positions: [pos({ km: 112.4, at: `${SAT} 14:20`, manual: true })] })).toContain('Sat 17 Oct, 14:20: around km 112 of 165, near Rastatt.');
  });
  test('off route, and approximate and off route', () => {
    expect(text({ ...base, positions: [pos({ km: 112.4, at: `${SAT} 14:20`, off: 400 })] })).toContain('Sat 17 Oct, 14:20: near km 112 of 165, off my route, near Rastatt.');
    expect(text({ ...base, positions: [pos({ km: 112.4, at: `${SAT} 14:20`, off: 1200, acc: 800 })] })).toContain('near km 112 of 165, off my route (position approximate), near Rastatt.');
  });
  test('a position that counts as on the route never reads off my route', () => {
    // 250 m off with 10 m accuracy is within the 300 m of section 6.1.
    expect(text({ ...base, positions: [pos({ km: 112.4, at: `${SAT} 14:20`, off: 250 })] })).toContain(': at km 112 of 165, near Rastatt.');
    expect(text({ ...base, positions: [pos({ km: 112.4, at: `${SAT} 14:20`, off: 250 })] })).not.toContain('off my route');
  });
  test('the quality is named where a stop is claimed too', () => {
    const t = text({
      trip: tripOn(FRI), positions: [pos({ km: 80, at: `${FRI} 19:10`, acc: 800 })], now: `${FRI} 19:10`, places: [town('Rheinstetten', 80), town('Kehl', 150)],
    })!;
    expect(t).toContain('stopped for the night near Rheinstetten (around km 80 of 165, position approximate).');
  });
});

describe('[SP-NODATE] no departure date', () => {
  test('no arrival time and no date for the start', () => {
    const t = text({
      trip: tripOn(null), positions: [pos({ km: 30, at: `${THU} 19:10` })], now: `${THU} 19:10`, arrival: `${FRI} 12:55`,
      places: [town('Heidelberg', 0), town('Karlsruhe', 78)],
    });
    expect(t).toBe('Thu 15 Oct, 19:10: starting from near Heidelberg (km 0 of 165). Planning to stop near Karlsruhe (km 78).');
    expect(t).not.toMatch(/about|leaving/);
  });
});

describe('[SP-MAP] the map link', () => {
  const position: Position = { ...pos({ km: 112.4, at: `${SAT} 14:20` }), lat: 48.8574, lon: 8.2051 };
  test('three decimals, on its own line, only when asked', () => {
    const on = text({ positions: [position], now: `${SAT} 14:25`, addMapLink: true })!;
    expect(on.split('\n')[1]).toBe('Map: https://www.openstreetmap.org/?mlat=48.857&mlon=8.205#map=14/48.857/8.205');
    expect(text({ positions: [position], now: `${SAT} 14:25`, addMapLink: false })).not.toContain('openstreetmap');
  });
  test('no minus zero and no broken coordinates', () => {
    const tiny: Position = { ...position, lat: -0.0001, lon: 0.0004 };
    expect(text({ positions: [tiny], now: `${SAT} 14:25`, addMapLink: true })).toContain('mlat=0.000&mlon=0.000#map=14/0.000/0.000');
    const f = facts({ positions: [position], now: `${SAT} 14:25`, addMapLink: true });
    expect(progressText({ ...f, position: { ...position, lat: Number.NaN } })).not.toContain('Map:');
    expect(progressText({ ...f, position: { ...position, lon: Infinity } })).not.toContain('Map:');
  });
  test('before the trip the link points at the start the text names, not at home', () => {
    const home: Position = { ...pos({ km: 30, off: 40_000, at: `${THU} 19:10` }), lat: 47.1234, lon: 7.4321 };
    const t = text({ trip: tripOn(FRI), positions: [home], now: `${THU} 19:10`, addMapLink: true })!;
    expect(t).toContain('Map: https://www.openstreetmap.org/');
    expect(t).not.toContain('47.123');
    expect(t).not.toContain('7.432');
  });
});

describe('[SP-NOPOS] no position', () => {
  test('null, so the button hides', () => {
    expect(text({ positions: [], now: `${SAT} 14:25`, position: null })).toBeNull();
    expect(text({ trip: tripOn(FRI), positions: [], now: `${THU} 19:10`, position: null })).toBeNull();
  });
  test('a position whose time is no time gives nothing rather than a guess', () => {
    const f = facts({ positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25` });
    expect(progressText({ ...f, position: { ...f.position!, at: new Date(Number.NaN) } })).toBeNull();
  });
  test('a speed that gives no times still gives the text, without a time', () => {
    const t = text({ trip: tripOn(SAT, { flatKph: 0 }), positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25`, places: [town('Kehl', 150)] })!;
    expect(t).toBe('Sat 17 Oct, 14:20: at km 112 of 165. Planning to stop near Kehl (km 150).');
  });
  test('the stop is a plan: planning, about', () => {
    const t = text({ positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25` })!;
    expect(t).toMatch(/Planning to stop/);
    expect(t).toMatch(/at about \d\d:\d\d\.$/);
    expect(t).not.toMatch(/\bwill\b|\barrive\b|\bsafe/i);
  });
});

describe('[SP-PLAIN] plain characters', () => {
  const names = fc.oneof(
    fc.string({ minLength: 0, maxLength: 14 }),
    fc.constantFrom('Müllheim (Baden)', 'Łódź', 'Saint-Ouen-l’Aumône', 'Bad · Name → Town', '⚠ Wayfinch water', '日本語', 'Frankfurt/Oder', '  ', 'A\u0000B\u202eC'),
  );
  const pick = fc.constantFrom<Case>(
    { positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25` },
    { trip: tripOn(FRI), positions: [pos({ km: 80, at: `${FRI} 19:10` })], now: `${FRI} 19:10` },
    { trip: tripOn(FRI), positions: [pos({ km: 30, off: 40_000, at: `${THU} 19:10` })], now: `${THU} 19:10` },
    { positions: [pos({ km: 80, at: `${SAT} 07:10` })], now: `${SAT} 07:10` },
    { positions: [pos({ km: 163, at: `${SAT} 16:40` })], now: `${SAT} 16:40` },
    { trip: testTrip(), positions: [pos({ km: 138, at: `${SAT} 18:50` })], now: `${SAT} 18:50` },
  );
  fcTest.prop([pick, names, names, fc.boolean()])('no dot, arrow or symbol, no body or app words, no coordinates outside the link; names keep their letters', (c, a, b, link) => {
    const placed = [town(a, 112), town(b, 150), town(a, 80), town(b, 163), town(a, 0), town(b, 78), town(a, 165)];
    const t = text({ ...c, places: placed, addMapLink: link })!;
    const [body = '', map = ''] = t.split('\n');
    expect(t.split('\n').length).toBe(link ? 2 : 1);
    if (link) expect(map).toMatch(/^Map: https:\/\/www\.openstreetmap\.org\/\?mlat=-?\d+\.\d{3}&mlon=-?\d+\.\d{3}#map=14\/-?\d+\.\d{3}\/-?\d+\.\d{3}$/);
    // The names are masked, as in section 11.2's INV-31.
    let masked = body;
    for (const n of [a, b]) if (n.trim() !== '') masked = masked.split(n.trim()).join('NAME');
    expect(masked).not.toMatch(/[·→←↑↓↔⇒⇐►▶◀•✓✗]/u);
    expect(body).not.toMatch(/[\p{S}\p{Cc}\p{Cf}]/u);
    expect(body).not.toMatch(/\d+\.\d{3,}/);
    expect(body).not.toMatch(/wayfinch|load check/i);
    expect(body).not.toMatch(/water|health|body|drink|thirst|sweat|litre|bottle|heart|pain/i);
    expect(bannedHits(masked)).toEqual([]);
  });

  test('place names keep their own letters', () => {
    const t = text({ positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25`, places: [town('Müllheim (Baden)', 112), town('Łódź', 150)] })!;
    expect(t).toContain('near Müllheim (Baden).');
    expect(t).toContain('near Łódź (km 150)');
  });

  test('a name with symbols loses only the symbols', () => {
    const t = text({ positions: [pos({ km: 112.4, at: `${SAT} 14:20` })], now: `${SAT} 14:25`, places: [town('Bad · Name → Town', 112)] })!;
    expect(t).toContain('near Bad Name Town.');
  });
});
