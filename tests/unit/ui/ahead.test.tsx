// @vitest-environment jsdom
// Ahead's page against the screen it was given (plan Tasks 15 and 16): the words are the screen's, in section 3.2's order, and
// each tap does what its words say through the actions object, and nothing else.
import { afterEach, describe, expect, test } from 'vitest';
import { render } from 'preact';
import { buildScreen, type Screen } from '../../../src/core/screen/screen.ts';
import type { Answer } from '../../../src/core/types.ts';
import { W } from '../../../src/core/wording/en.ts';
import type { AheadTrip } from '../../../src/ui/ahead/actions.ts';
import { flatRoute, pos, testTrip } from '../../fixtures/build.ts';
import { bannedHits } from '../../fixtures/banned.ts';
import { stamps } from '../core/engines/weather-helpers.ts';
import { inputsOf } from '../core/screen/screen-helpers.ts';
import { FRI, rainyStop, SAT } from './ahead-fixture.ts';
import { buttonNamed, click, expandAll, fakeActions, host, show, typeInto, viewOf } from './ahead-helpers.tsx';

afterEach(() => { render(null, host); });

const text = (): string => host.textContent ?? '';
const trip = (v: ReturnType<typeof viewOf>): AheadTrip => { if (v.kind !== 'trip') throw new Error(v.kind); return v; };
const CARDS = ['water', 'food', 'daylight', 'weather', 'climbing', 'sleep'] as const;
const CHIPS = ['bike', 'pharmacy', 'train', 'toilets', 'shelter'] as const;

/** Every string of an answer the page must show. */
const answerStrings = (a: Answer): string[] => [a.title, a.detail, ...a.items.flatMap((x) => [x.label, x.detail ?? '']), ...a.basis].filter((t) => t.trim() !== '');

/** Opens one chip and gives the page's text while it is open. */
async function chipText(label: string): Promise<string> {
  await click(buttonNamed(label, host.querySelector('.ah-chips')!));
  for (const b of [...host.querySelectorAll<HTMLButtonElement>('button')].filter((x) => /^Show \d+ more$/.test(x.textContent ?? ''))) await click(b);
  return text();
}

describe('the words are the screen\'s', () => {
  test('[AH-TEXTS] on the 165 km rainy fixture, every string of the screen is on the page, in section 3.2\'s order', async () => {
    const v = trip(viewOf(rainyStop()));
    const s: Screen = v.screen;
    const { actions } = fakeActions();
    await show(v, actions);
    await expandAll();
    const page = text();
    const wanted = [
      s.positionLine!, ...s.notes, s.strip.label, s.strip.endText,
      ...CARDS.flatMap((c) => [...answerStrings(s.cards[c]), ...(s.stamps[c] ? [s.stamps[c]!] : [])]),
    ];
    for (const t of wanted) expect(page, t).toContain(t);
    // Top to bottom: the position line, the strip, then the cards in their order, then the chips.
    const at = (sel: string): Element => host.querySelector(sel)!;
    const order = [at('[data-position-line]'), at('[data-strip]'), ...CARDS.map((c) => at(`[data-card="${c}"]`)), at('.ah-chips')];
    for (let n = 1; n < order.length; n++) expect(order[n - 1]!.compareDocumentPosition(order[n]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The chips, one at a time, and Emergency.
    const labels: Record<(typeof CHIPS)[number], string> = { bike: 'Bike shop', pharmacy: 'Pharmacy', train: 'Bail out by train', toilets: 'Toilets', shelter: 'Shelter' };
    for (const c of CHIPS) {
      const shown = await chipText(labels[c]);
      for (const t of [...answerStrings(s.chips[c]), ...(s.stamps[c] ? [s.stamps[c]!] : [])]) expect(shown, `${c}: ${t}`).toContain(t);
    }
    const e = s.chips.emergency;
    const shown = await chipText('Emergency');
    for (const t of [e.title, e.detail, ...e.notes, ...answerStrings(e)]) expect(shown, `emergency: ${t}`).toContain(t);
  });

  test('[AH-TEXTS] what the page adds of its own passes the banned-words test', async () => {
    const v = trip(viewOf(rainyStop()));
    await show(v, fakeActions().actions);
    await expandAll();
    for (const el of [...host.querySelectorAll('button, a, label, legend')]) {
      const words = (el.getAttribute('aria-label') ?? '') + ' ' + (el.textContent ?? '');
      expect(bannedHits(words), words).toEqual([]);
    }
  });
});

describe('cards', () => {
  test('[AH-CARD-ORDER] Water, Food, Daylight, Weather, Climbing, Sleep, always, each with its status in words and its stamp', async () => {
    for (const i of [rainyStop(), rainyStop({ now: `${FRI} 10:00`, positions: [] }), rainyStop({ litres: null })]) {
      const v = trip(viewOf(i));
      await show(v, fakeActions().actions);
      expect([...host.querySelectorAll('[data-card]')].map((x) => x.getAttribute('data-card'))).toEqual([...CARDS]);
      for (const c of CARDS) {
        const card = host.querySelector(`[data-card="${c}"]`)!;
        expect(card.querySelector('.badge')!.textContent).toBe({ fine: 'Fine', action: 'Action needed', warning: 'Warning', unknown: 'Unknown' }[v.screen.cards[c].status]);
        if (v.screen.stamps[c]) expect(card.querySelector('.ah-stamp')!.textContent).toBe(v.screen.stamps[c]);
      }
    }
  });

  test('[AH-EXPAND] a tap expands that card only; Weather lists its items in order, then Update weather, then the basis', async () => {
    const v = trip(viewOf(rainyStop()));
    await show(v, fakeActions().actions);
    const weather = host.querySelector('[data-card="weather"]')!;
    expect(weather.querySelector('.ah-items')).toBeNull();
    await click(weather.querySelector('.ah-toggle'));
    expect(weather.querySelector('.ah-toggle')!.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-card="food"] .ah-items')).toBeNull();
    const lines = [...weather.querySelectorAll('.ah-items li')].map((li) => li.textContent);
    expect(lines.map((l) => l!.slice(0, 20))).toEqual(v.screen.cards.weather.items.map((x) => x.label.slice(0, 20)));
    expect(v.screen.cards.weather.items[0]!.label).toMatch(/^Waiting until about 15:00/); // wait or go first (section 3.2)
    const update = buttonNamed('Update weather', weather);
    const basis = weather.querySelector('.ah-basis')!;
    expect(weather.querySelector('.ah-items')!.compareDocumentPosition(update) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(update.compareDocumentPosition(basis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('[AH-EXPAND] "Raining anyway? Shelter" opens the Shelter chip', async () => {
    const v = trip(viewOf(rainyStop()));
    await show(v, fakeActions().actions);
    await click(host.querySelector('[data-card="weather"] .ah-toggle'));
    await click(buttonNamed(W.weatherRainingAnyway));
    const panel = host.querySelector('#chip-shelter')!;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain(v.screen.chips.shelter.title);
  });

  test('[AH-PLAN-TOMORROW] Plan tomorrow shows while the screen offers it and plans the ride\'s own date; Back to today undoes it', async () => {
    const riding = trip(viewOf(rainyStop()));
    const { actions, calls } = fakeActions();
    await show(riding, actions);
    await click(host.querySelector('[data-card="daylight"] .ah-toggle'));
    await click(buttonNamed(W.daylightPlanTomorrow));
    expect(calls).toContainEqual(['planTomorrow', riding.screen.ride.date]);
    expect(riding.screen.ride.date).toBe(SAT);

    const after = trip(viewOf(rainyStop({ plan: { date: SAT, backToTodayAt: null } })));
    expect(after.screen.phase).toBe('after-ride');
    await show(after, actions);
    await click(host.querySelector('[data-card="daylight"] .ah-toggle'));
    expect(() => buttonNamed(W.daylightPlanTomorrow)).toThrow();
    await click(buttonNamed(W.daylightBackToToday));
    expect(calls.at(-1)).toEqual(['backToToday']);
  });

  test('[AH-WATER-Q] unconfirmed water reads unknown and asks: 0 to 3 L, another amount, and "Still about 0.6 L?" in one tap', async () => {
    const i = rainyStop();
    const v = trip(viewOf({ ...i, waterLeft: { litres: 1.2, at: new Date(i.now.getTime() - 60 * 60_000), confirmed: false } }));
    expect(v.screen.cards.water.status).toBe('unknown');
    expect(v.screen.cards.water.title).toBe(W.waterConfirm);
    expect(v.stillAboutL).not.toBeNull();
    const { actions, calls } = fakeActions();
    await show(v, actions);
    const card = host.querySelector('[data-card="water"]')!;
    expect(card.textContent).toContain('How much water do you have?');
    expect([...card.querySelectorAll('.ah-water .row:first-child button, fieldset .row:first-of-type button')].map((b) => b.textContent))
      .toEqual(['0 L', '0.25 L', '0.5 L', '0.75 L', '1 L', '1.5 L', '2 L', '3 L']);
    expect(card.textContent).toContain(W.waterStillAbout(String(v.stillAboutL)));
    await click(buttonNamed(`Yes, about ${v.stillAboutL} L`, card));
    await click(buttonNamed('0 L', card));
    await typeInto(card.querySelector<HTMLInputElement>('input[type=number]')!, '1.8');
    await click(buttonNamed('Set', card));
    expect(calls.filter((c) => c[0] === 'confirmWater')).toEqual([['confirmWater', v.stillAboutL], ['confirmWater', 0], ['confirmWater', 1.8]]);
  });
});

describe('the strip', () => {
  test('[AH-STRIP] bands are solid, hatched or red with a bolt, and say so in words; icons sit at their kilometre and open their card', async () => {
    const thunder = { range: [150, 155] as [number, number], stamps: stamps(SAT, 16, 17), pp: 80, code: 95, mm: 2 };
    const i = rainyStop({ spells: [{ range: [100, 137], stamps: stamps(SAT, 13, 15), pp: 80, mm: 1 }, { range: [140, 146], stamps: stamps(SAT, 15, 16), pp: 40, mm: 0.3 }, thunder] });
    const v = trip(viewOf(i));
    const kinds = v.screen.strip.bands.map((b) => b.kind);
    expect(kinds).toEqual(expect.arrayContaining(['thunder', 'possible']));
    expect(trip(viewOf(rainyStop())).screen.strip.bands.map((b) => b.kind)).toContain('likely');
    await show(v, fakeActions().actions);
    const bands = [...host.querySelectorAll<HTMLButtonElement>('.ah-band')];
    expect(bands.map((b) => b.dataset.kind)).toEqual(kinds);
    for (const b of bands) {
      expect(b.getAttribute('aria-label')).toMatch(/^(Rain likely|Rain possible|Thunderstorm), km [\d.]+–[\d.]+$/);
      expect(b.classList.contains(`ah-band-${b.dataset.kind}`)).toBe(true);
      expect(b.querySelector('svg.ah-bolt') !== null).toBe(b.dataset.kind === 'thunder');
    }
    expect(text()).toContain(W.appAheadStripKey);
    const s = v.screen.strip;
    const icons = [...host.querySelectorAll<HTMLButtonElement>('.ah-icon')];
    expect(icons.length).toBe(s.icons.length);
    s.icons.forEach((icon, n) => {
      expect(Number(icons[n]!.dataset.km)).toBe(icon.km);
      expect(parseFloat(icons[n]!.style.left)).toBeCloseTo(((icon.km - s.startKm) / (s.endKm - s.startKm)) * 100, 1);
    });
    const food = icons.find((b) => b.classList.contains('ah-icon-food'))!;
    await click(food);
    expect(host.querySelector('[data-card="food"] .ah-toggle')!.getAttribute('aria-expanded')).toBe('true');
    await click(bands[0]);
    expect(host.querySelector('[data-card="weather"] .ah-toggle')!.getAttribute('aria-expanded')).toBe('true');
  });

  test('[BK-WHERE-STRIP] [AH-STRIP] the bike marker sits at the left end, facing the way of travel, at most 24 px tall, decorative', async () => {
    const v = trip(viewOf(rainyStop()));
    await show(v, fakeActions().actions);
    const body = host.querySelector('.ah-strip-body')!;
    const marker = body.firstElementChild!;
    expect(marker.classList.contains('bike-marker')).toBe(true);
    expect(marker.getAttribute('aria-hidden')).toBe('true');
    const svg = marker.querySelector('svg')!;
    expect(Number(svg.getAttribute('height'))).toBeLessThanOrEqual(24);
    // The front wheel is the right-hand one: the bike rides to the day's stop at the right end.
    const wheels = [...svg.querySelectorAll('circle.bk-tyre')].map((c) => Number(c.getAttribute('cx')));
    expect(wheels).toHaveLength(2);
    expect(wheels[1]!).toBeGreaterThan(wheels[0]!);
    expect(marker.closest('a, button')).toBeNull();
  });
});

describe('call ahead', () => {
  test('[AH-CALL] Call is a tel: link and Website an http(s) link that sends no referrer; a place with none says so', async () => {
    const v = trip(viewOf(rainyStop()));
    await show(v, fakeActions().actions);
    await click(host.querySelector('[data-card="sleep"] .ah-toggle'));
    const links = [...host.querySelectorAll<HTMLAnchorElement>('[data-card="sleep"] a.ah-link')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['tel:+497221123456', 'tel:+491711234567', 'https://camping-rheinaue.de']);
    for (const a of links) expect(a.getAttribute('href')).toMatch(/^(tel:\+\d+|https?:\/\/)/);
    const site = links[2]!;
    expect(site.getAttribute('rel')).toBe('noopener noreferrer');
    expect(site.getAttribute('target')).toBe('_blank');
    // Each button names its place: its own words, described by the item's label.
    expect(links[0]!.textContent).toBe('Call +49 7221 123456');
    expect(document.getElementById(links[0]!.getAttribute('aria-describedby')!)!.textContent).toMatch(/^Camping Rheinaue/);
    await click(buttonNamed('Bike shop', host.querySelector('.ah-chips')!));
    const panel = host.querySelector('#chip-bike')!;
    expect(panel.querySelector<HTMLAnchorElement>('a.ah-link')!.getAttribute('href')).toBe('tel:+49785112345');
    expect(panel.textContent).toContain(W.callNoContact);
  });
});

describe('share progress', () => {
  test('[AH-SHARE] an editable preview of the message; the map-link choice switches it and is kept; no share sheet: SMS and Copy', async () => {
    const v = trip(viewOf(rainyStop()));
    const { actions, calls } = fakeActions();
    await show(v, actions);
    expect(v.canShare).toBe(false);
    await click(buttonNamed('Share progress'));
    const sheet = host.querySelector('[data-share="progress"]')!;
    const box = sheet.querySelector('textarea')!;
    expect(box.value).toBe(v.screen.shareText);
    expect(() => buttonNamed('Share…', sheet)).toThrow();
    const sms = [...sheet.querySelectorAll('a')].find((a) => a.textContent === 'SMS')!;
    expect(sms.getAttribute('href')).toBe(`sms:?&body=${encodeURIComponent(v.screen.shareText!)}`);
    await click(sheet.querySelector('input[type=checkbox]'));
    expect(calls).toContainEqual(['setMapLink', true]);
    expect(box.value).toBe(v.screen.shareMapText);
    await typeInto(box, 'At the café, all well.');
    await click(buttonNamed('Copy', sheet));
    expect(calls).toContainEqual(['copy', 'At the café, all well.']);
    expect(sheet.textContent).toContain(W.appAheadShareNothingSent);
    expect(sheet.textContent).toContain(W.appAheadShareMapNote);
  });

  test('[AH-SHARE] with a share sheet, Share… hands it the text; the button hides with no position', async () => {
    const v = trip(viewOf(rainyStop(), { share: () => Promise.resolve() }));
    const { actions, calls } = fakeActions();
    await show(v, actions);
    await click(buttonNamed('Share progress'));
    await click(buttonNamed('Share…'));
    expect(calls).toContainEqual(['share', v.screen.shareText]);
    const none = trip(viewOf(rainyStop({ now: `${FRI} 10:00`, positions: [] })));
    await show(none, actions);
    expect(none.screen.shareText).toBeNull();
    expect(() => buttonNamed('Share progress')).toThrow();
  });
});

describe('Emergency', () => {
  const emergencyIn = async (v: ReturnType<typeof viewOf>): Promise<Element> => {
    await show(v, fakeActions().actions);
    await click(buttonNamed('Emergency', host.querySelector('.ah-chips')!));
    return host.querySelector('#chip-emergency')!;
  };
  test('[AH-EMERGENCY] with a position: 112 to call, the fallback line, the coordinates and Share my location', async () => {
    const v = trip(viewOf(rainyStop()));
    const card = await emergencyIn(v);
    expect(card.querySelector('a[href="tel:112"]')).not.toBeNull();
    expect(card.textContent).toContain(W.emergencyFallback);
    expect(card.textContent).toContain(v.screen.chips.emergency.coords!);
    expect(() => buttonNamed('Share my location', card)).not.toThrow();
  });
  test('[AH-EMERGENCY] in every state: no route, first use, no position; 112 and the fallback line stand', async () => {
    const states = [
      { kind: 'no-route' as const, canShare: false, emergency: trip(viewOf(rainyStop({ positions: [] }))).screen.chips.emergency },
      viewOf(inputsOf({ trip: testTrip({ route: flatRoute(165, { stageEnds: [70, 165] }), departureDate: FRI }), now: `${SAT} 09:00`, positions: [] })),
      viewOf(rainyStop({ positions: [] })),
    ];
    for (const v of states) {
      const card = await emergencyIn(v);
      expect(card.querySelector('a[href="tel:112"]'), v.kind).not.toBeNull();
      expect(card.textContent).toContain(W.emergencyFallback);
    }
  });
});

describe('degraded', () => {
  test('[AH-BAD-SPEED] a stored flat speed out of range: every card that needs it says it can\'t be worked out, Emergency stands, and the settings link shows', async () => {
    const i = rainyStop();
    const bad = { ...i, trip: { ...i.trip, flatKph: 50 } };
    const built = buildScreen(bad);
    expect(built.screen.chips.emergency.numbers).toContain('112');
    const v = trip(viewOf(bad));
    expect(v.badSpeed).toBe(true);
    await show(v, fakeActions().actions);
    for (const c of CARDS) {
      const title = v.screen.cards[c].title;
      if (c === 'climbing') continue; // climbing is heights only: it needs no speed
      expect(title, c).toMatch(/can't be worked out/);
    }
    const link = [...host.querySelectorAll('a')].find((a) => a.textContent === W.appAheadSpeedLink)!;
    expect(link.getAttribute('href')).toBe('#/trip');
    const card = await (async () => { await click(buttonNamed('Emergency', host.querySelector('.ah-chips')!)); return host.querySelector('#chip-emergency')!; })();
    expect(card.querySelector('a[href="tel:112"]')).not.toBeNull();
  });

  test('[AH-FIRST-USE] no position on a trip day after day 1: only Update position and the picker, no answers; before the trip, day 1\'s answers show', async () => {
    const day2 = trip(viewOf(rainyStop({ now: `${SAT} 09:00`, positions: [] })));
    expect(day2.answers).toBe(false);
    await show(day2, fakeActions().actions);
    expect(host.querySelector('[data-ahead="first-use"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-card]')).toHaveLength(0);
    expect(host.querySelector('[data-strip]')).toBeNull();
    expect(host.querySelector('[data-update-position]')).not.toBeNull();
    expect(host.querySelector('#ah-picker')).not.toBeNull();
    expect(text()).toContain(W.appAheadFirstUse);

    const before = trip(viewOf(rainyStop({ now: '2026-10-15 18:00', positions: [] })));
    expect(before.screen.phase).toBe('before-trip');
    expect(before.answers).toBe(true);
    await show(before, fakeActions().actions);
    expect(host.querySelectorAll('[data-card]')).toHaveLength(6);
    const dayOne = trip(viewOf(rainyStop({ now: `${FRI} 07:30`, positions: [] })));
    expect(dayOne.answers).toBe(true);
  });

  test('[AH-RETURN] reopened later: the answers of the last position, "as of 14:20, 40 min ago", and Update position first', async () => {
    const v = trip(viewOf(rainyStop({ now: `${SAT} 15:00` })));
    expect(v.screen.positionLine).toContain('as of 14:20, 40 min ago');
    await show(v, fakeActions().actions);
    expect(host.querySelector('[data-position-line]')!.textContent).toContain('as of 14:20, 40 min ago');
    const update = host.querySelector('[data-update-position]')!;
    expect(update.classList.contains('btn-primary')).toBe(true);
    expect(update.compareDocumentPosition(host.querySelector('[data-strip]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelectorAll('[data-card]')).toHaveLength(6);
  });

  test('[AH-APPROX-HELP] worse than about 1 km: how to allow precise location; over 500 m: marked approximate on the line', async () => {
    const far = trip(viewOf(rainyStop({ positions: [pos({ km: 125, at: `${SAT} 14:20`, acc: 1500 })] })));
    expect(far.approximateHelp).toBe(true);
    await show(far, fakeActions().actions);
    expect(text()).toContain(W.appAheadApproxHelp);
    const mid = trip(viewOf(rainyStop({ positions: [pos({ km: 125, at: `${SAT} 14:20`, acc: 800 })] })));
    expect(mid.approximateHelp).toBe(false);
    expect(mid.screen.positionLine).toMatch(/approximate/);
    await show(mid, fakeActions().actions);
    expect(text()).not.toContain(W.appAheadApproxHelp);
    expect(host.querySelector('[data-position-line]')!.textContent).toMatch(/approximate/);
  });
});
