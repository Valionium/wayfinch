// @vitest-environment jsdom
// Ahead's page against the screen it was given (plan Tasks 15 and 16): the words are the screen's, in section 3.2's order, and
// each tap does what its words say through the actions object, and nothing else.
import { afterEach, describe, expect, test } from 'vitest';
import { options, render } from 'preact';
import { act } from 'preact/test-utils';
import { AheadScreen } from '../../../src/ui/ahead/ahead.tsx';
import { railSignal } from '../../../src/ui/wide/wide.ts';
import { buildScreen, type Screen } from '../../../src/core/screen/screen.ts';
import type { Answer } from '../../../src/core/types.ts';
import { showKm, W } from '../../../src/core/wording/en.ts';
import type { AheadTrip } from '../../../src/ui/ahead/actions.ts';
import { flatRoute, pos, testTrip } from '../../fixtures/build.ts';
import { bannedHits } from '../../fixtures/banned.ts';
import { stamps } from '../core/engines/weather-helpers.ts';
import { inputsOf } from '../core/screen/screen-helpers.ts';
import { FRI, ownersDay, rainyStop, SAT } from './ahead-fixture.ts';
import { buttonNamed, click, dialled, expandAll, fakeActions, host, show, typeInto, viewOf } from './ahead-helpers.tsx';

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

  test('[AH-CARD-ORDER] collapsed, each card shows its title, status, stamp and detail; a stale forecast is labelled on the card itself', async () => {
    const v = trip(viewOf(rainyStop({ now: `${SAT} 21:30` })));
    expect(v.screen.cards.weather.freshness.stale).toBe(true);
    await show(v, fakeActions().actions);
    expect(host.querySelectorAll('.ah-toggle[aria-expanded="true"]')).toHaveLength(0);
    for (const c of CARDS) {
      const card = host.querySelector(`[data-card="${c}"]`)!;
      const a = v.screen.cards[c];
      expect(card.querySelector('.ah-toggle')!.textContent).toBe(a.title);
      if (a.detail) expect(card.querySelector('.ah-card-detail')!.textContent).toBe(a.detail);
      expect(card.querySelector('[data-stale]')?.textContent ?? null, c).toBe(a.freshness.stale ? W.weatherStale : null);
    }
    expect(host.querySelector('[data-card="weather"] [data-stale]')!.textContent).toBe(W.weatherStale);
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
    // Sleep's "Stopping for the night? Plan tomorrow" gives the same tap.
    expect(riding.screen.cards.sleep.detail).toContain(W.sleepPlanTomorrow);
    await click(buttonNamed(W.daylightPlanTomorrow, host.querySelector('[data-card="sleep"]')!));
    expect(calls.filter((c) => c[0] === 'planTomorrow')).toEqual([['planTomorrow', SAT], ['planTomorrow', SAT]]);

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

  test('[AH-MANUAL] an open picker follows a new position: its kilometre is where the rider now is, not where it was opened', async () => {
    const { actions } = fakeActions();
    railSignal.value = true; // a computer: the picker stays open once a position is set (spec 9.2)
    const before = trip(viewOf(rainyStop({ positions: [pos({ km: 40, at: `${SAT} 14:20` })] })));
    await show(before, actions);
    if (!host.querySelector('#ah-picker')) await click(buttonNamed('Set position by hand'));
    const kmField = () => host.querySelector<HTMLInputElement>('#ah-picker input[type=number]')!;
    expect(kmField().value).toBe(String(before.screen.ride.startKm));
    // A computer keeps the picker open; a fix then moves the rider on.
    const after = trip(viewOf(rainyStop({ positions: [pos({ km: 141, at: `${SAT} 14:20` })] })));
    expect(after.screen.ride.startKm).not.toBe(before.screen.ride.startKm);
    await act(async () => { render(<AheadScreen view={after} actions={actions} />, host); }); // the same page, a new screen
    expect(kmField().value).toBe(String(after.screen.ride.startKm));
    railSignal.value = false;
  });

  test('[AH-MANUAL] a tap on Set position by hand the moment Ahead appears, before its effects have run, opens the picker', async () => {
    // Ahead's effect also ran once after the first paint and closed the picker again, so a tap before it did nothing. Here the
    // effects after the paint are held until the test lets them go: the tap comes first, as it can on a busy phone.
    const v = trip(viewOf(rainyStop()));
    expect(v.answers).toBe(true);
    await act(async () => { render(null, host); });
    const held: (() => void)[] = [];
    const was = options.requestAnimationFrame;
    options.requestAnimationFrame = (run) => { held.push(run); };
    try {
      render(<AheadScreen view={v} actions={fakeActions().actions} />, host);
      expect(host.querySelector('#ah-picker')).toBeNull();
      buttonNamed('Set position by hand').click();
      await new Promise((r) => setTimeout(r, 0));
    } finally {
      options.requestAnimationFrame = was;
      for (const run of held) run();
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
    expect(host.querySelector('#ah-picker')).not.toBeNull();
  });

  test('[AH-MANUAL] a picker the rider opened stays open with what was typed through new screens, also a new position, until it is closed or used', async () => {
    const { actions, calls } = fakeActions();
    const at = (km: number, time: string) => trip(viewOf(rainyStop({ now: `${SAT} ${time}`, positions: [pos({ km, at: `${SAT} 14:20` })] })));
    await show(at(40, '14:20'), actions);
    await click(buttonNamed('Set position by hand'));
    const kmField = () => host.querySelector<HTMLInputElement>('#ah-picker input[type=number]');
    await typeInto(kmField()!, '7');
    for (const next of [at(40, '14:21'), at(40, '14:25'), at(141, '14:30')]) {
      await act(async () => { render(<AheadScreen view={next} actions={actions} />, host); });
      expect(kmField()?.value).toBe('7');
    }
    await typeInto(kmField()!, '77');
    await click(buttonNamed('Use this position'));
    expect(calls.filter((c) => c[0] === 'setManual')).toEqual([['setManual', 77]]);
    expect(kmField()).toBeNull(); // used: on a phone it closes
    await click(buttonNamed('Set position by hand'));
    expect(kmField()).not.toBeNull();
    await click(buttonNamed('Set position by hand'));
    expect(kmField()).toBeNull(); // closed by the rider
  });

  test('[AH-FIRST-USE] on a phone the picker of first use closes when answers first show, unless the rider has started using it', async () => {
    const { actions } = fakeActions();
    const none = trip(viewOf(rainyStop({ now: `${SAT} 09:00`, positions: [] })));
    const found = trip(viewOf(rainyStop({ now: `${SAT} 09:00`, positions: [pos({ km: 3, at: `${SAT} 09:00` })] })));
    expect([none.answers, found.answers]).toEqual([false, true]);
    const kmField = () => host.querySelector<HTMLInputElement>('#ah-picker input[type=number]');
    // Untouched: a position closes it, as section 3.2's returning screen has it.
    await show(none, actions);
    expect(kmField()).not.toBeNull();
    await act(async () => { render(<AheadScreen view={found} actions={actions} />, host); });
    expect(kmField()).toBeNull();
    // Being typed into: a fix arriving then leaves the picker and the typing alone.
    await show(none, actions);
    kmField()!.focus();
    await typeInto(kmField()!, '4');
    await act(async () => { render(<AheadScreen view={found} actions={actions} />, host); });
    expect(kmField()?.value).toBe('4');
  });

  describe('what counts as using the picker (review I1 of PR 48: a keystroke, a slider move or a pick; focus alone never)', () => {
    const at = (km: number) => trip(viewOf(rainyStop({ positions: [pos({ km, at: `${SAT} 14:20` })] })));
    const kmField = () => host.querySelector<HTMLInputElement>('#ah-picker input[type=number]');
    const slider = () => host.querySelector<HTMLInputElement>('#ah-picker input[type=range]');
    const again = async (v: AheadTrip, actions: ReturnType<typeof fakeActions>['actions']) => { await act(async () => { render(<AheadScreen view={v} actions={actions} />, host); }); };
    const focusOnly = async (el: HTMLElement) => { await act(async () => { el.focus(); el.dispatchEvent(new FocusEvent('focus')); el.blur(); }); };
    afterEach(() => { railSignal.value = false; });

    test('[AH-MANUAL] on a computer a picker only focused (Tab through, no key) still follows a new position', async () => {
      const { actions } = fakeActions();
      railSignal.value = true;
      const before = at(40);
      const after = at(141);
      await show(before, actions);
      expect(kmField()!.value).toBe(String(before.screen.ride.startKm));
      await focusOnly(kmField()!);
      await focusOnly(slider()!);
      await again(after, actions);
      expect(kmField()!.value).toBe(String(after.screen.ride.startKm));
      expect(text()).not.toContain(W.appAheadManualNewer(showKm(after.screen.ride.startKm)));
    });

    test('[AH-MANUAL] on a phone a picker opened and only focused follows a new screen\'s position', async () => {
      const { actions } = fakeActions();
      const after = at(141);
      await show(at(40), actions);
      await click(buttonNamed('Set position by hand'));
      await focusOnly(kmField()!);
      await again(after, actions);
      expect(kmField()!.value).toBe(String(after.screen.ride.startKm));
    });

    test('[AH-MANUAL] a picker holding the rider\'s typing keeps it, and shows the newer position beside it, so Use never sets an older one unseen', async () => {
      for (const rail of [true, false]) {
        const { actions } = fakeActions();
        railSignal.value = rail;
        const after = at(141);
        const newer = W.appAheadManualNewer(showKm(after.screen.ride.startKm));
        await show(at(40), actions);
        if (!kmField()) await click(buttonNamed('Set position by hand'));
        await typeInto(kmField()!, '42');
        expect(text()).not.toContain(newer);
        await again(after, actions);
        expect(kmField()!.value, rail ? 'computer' : 'phone').toBe('42');
        expect(host.querySelector('#ah-picker')!.textContent, rail ? 'computer' : 'phone').toContain(newer);
        // A pick and a slider move count as using it too.
        await show(at(40), actions);
        if (!kmField()) await click(buttonNamed('Set position by hand'));
        await typeInto(slider()!, '50');
        await again(after, actions);
        expect(kmField()!.value).toBe('50');
        expect(host.querySelector('#ah-picker')!.textContent).toContain(newer);
      }
    });

    test('[AH-MANUAL] a refused position keeps the typing, also through a new screen afterwards', async () => {
      const { actions, calls } = fakeActions({ kept: false });
      await show(at(40), actions);
      await click(buttonNamed('Set position by hand'));
      await typeInto(kmField()!, '77');
      await click(buttonNamed('Use this position'));
      expect(calls.filter((c) => c[0] === 'setManual')).toEqual([['setManual', 77]]);
      expect(kmField()?.value).toBe('77');
      await again(at(141), actions);
      expect(kmField()?.value).toBe('77');
    });

    test('[AH-MANUAL] a position refused after the store moved on (a new start shown before the refusal) keeps the typed kilometre', async () => {
      const { actions: base } = fakeActions();
      const moved = at(141);
      // The new screen is shown, and its effects run, while the store's answer is still awaited.
      let shown = false;
      const actions = { ...base, setManual: async () => { await again(moved, actions); shown = true; return false; } };
      await show(at(40), actions);
      await click(buttonNamed('Set position by hand'));
      await typeInto(kmField()!, '77');
      buttonNamed('Use this position').click(); // outside act, so the new screen's effects are not held until the refusal
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      expect(shown).toBe(true);
      expect(kmField()?.value).toBe('77');
    });

    test('[AH-MANUAL] on a phone Update position closes a picker the rider opened but has not used, so the warnings show; a used one stays open', async () => {
      const { actions, calls } = fakeActions();
      await show(at(40), actions);
      await click(buttonNamed('Set position by hand'));
      await focusOnly(kmField()!);
      await click(host.querySelector('[data-update-position]'));
      expect(calls.filter((c) => c[0] === 'updatePosition')).toHaveLength(1);
      expect(kmField()).toBeNull();
      await click(buttonNamed('Set position by hand'));
      await typeInto(kmField()!, '42');
      await click(host.querySelector('[data-update-position]'));
      expect(kmField()?.value).toBe('42');
      // Not kept (denied, no fix): nothing closes.
      const refused = fakeActions({ kept: false }).actions;
      await show(at(40), refused);
      await click(buttonNamed('Set position by hand'));
      await click(host.querySelector('[data-update-position]'));
      expect(kmField()).not.toBeNull();
      // On a computer the picker stays open (spec 9.2).
      railSignal.value = true;
      await show(at(40), actions);
      await click(host.querySelector('[data-update-position]'));
      expect(kmField()).not.toBeNull();
    });
  });

  test('[AH-EMERGENCY] Update position inside Emergency says what it is doing there: finding, or why it could not', async () => {
    const { actions } = fakeActions();
    const base = trip(viewOf(rainyStop()));
    for (const [position, words] of [[{ kind: 'watching' as const }, W.appAheadFinding], [{ kind: 'said' as const, text: W.appAheadDenied }, W.appAheadDenied]] as const) {
      await show({ ...base, position }, actions);
      await click(buttonNamed('Emergency', host.querySelector('.ah-chips')!));
      const panel = host.querySelector('#chip-emergency')!;
      expect(panel.querySelector('[role="status"]')?.textContent, words).toContain(words);
    }
  });

  test('[AH-WATER-Q] with water confirmed, a refill is one tap on the closed card: the quick choices stay, "Still about" does not', async () => {
    const i = rainyStop();
    const v = trip(viewOf({ ...i, waterLeft: { litres: 1.2, at: new Date(i.now.getTime() - 5 * 60_000), confirmed: true } }));
    expect(v.screen.cards.water.title).not.toBe(W.waterConfirm);
    const { actions, calls } = fakeActions();
    await show(v, actions);
    const card = host.querySelector('[data-card="water"]')!;
    expect(card.querySelector('.ah-toggle')!.getAttribute('aria-expanded')).toBe('false');
    expect(card.textContent).not.toContain('Yes, about');
    await click(buttonNamed('2 L', card));
    expect(calls.filter((c) => c[0] === 'confirmWater')).toEqual([['confirmWater', 2]]);
    // opened, the card holds the whole question once, with another amount
    await click(card.querySelector('.ah-toggle'));
    expect(card.querySelectorAll('[data-water-question]')).toHaveLength(1);
    expect(card.querySelector('input[type=number]')).not.toBeNull();
  });
});


/**
 * Every icon of the strip is on the page once, alone at its kilometre or in a group's button ("+N"); all on the line, in one row
 * (the owner's device check of 5 November: "the icons should be on the line, spread along the route"); none covers another; each
 * button stands at its first icon's kilometre, and an icon at the day's stop at the end.
 */
function expectIconsPlaced(s: Screen['strip']): void {
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('.ah-icon')];
  const kms = buttons.flatMap((b) => (b.dataset.kms ?? b.dataset.km!).split(' ').map(Number)).sort((x, y) => x - y);
  expect(kms).toEqual(s.icons.map((x) => x.km).sort((x, y) => x - y));
  const x = (km: number): number => Math.max(0, Math.min(100, ((km - s.startKm) / (s.endKm - s.startKm)) * 100));
  for (const b of buttons) {
    expect(b.style.top, 'on the line: no second row').toBe('');
    expect(b.closest('.ah-strip-line-row'), 'in the row of the line').not.toBeNull();
    const first = Number(b.dataset.km);
    expect(parseFloat(b.style.left)).toBeCloseTo(x(first), 1);
    expect(b.dataset.kms === undefined ? [first] : b.dataset.kms.split(' ').map(Number)).toContain(first);
  }
  const lefts = buttons.map((b) => parseFloat(b.style.left)).sort((a, c) => a - c);
  lefts.forEach((l, n) => { if (n > 0) expect(l - lefts[n - 1]!).toBeGreaterThanOrEqual((46 / 230) * 100 - 0.01); });
  // A group holds only icons within one icon's width after its place.
  for (const b of buttons.filter((y) => y.dataset.kms)) for (const km of b.dataset.kms!.split(' ').map(Number)) expect(Math.abs(x(km) - parseFloat(b.style.left))).toBeLessThan((46 / 230) * 100);
}

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
      expect(b.getAttribute('aria-label')).toMatch(/^(Rain likely|Rain possible|Thunderstorm)( at your stop)?, km [\d.]+(–[\d.]+)?$/);
      expect(b.getAttribute('aria-label')).not.toMatch(/km ([\d.]+)–\1$/);
      expect(b.classList.contains(`ah-band-${b.dataset.kind}`)).toBe(true);
      expect(b.querySelector('svg.ah-bolt') !== null).toBe(b.dataset.kind === 'thunder');
    }
    expect(text()).toContain(W.appAheadStripKey);
    // A band of no length, at the day's stop: it says so, never "km 82.2–82.2".
    const atStop = { ...v, screen: { ...v.screen, strip: { ...v.screen.strip, bands: [{ fromKm: v.screen.strip.endKm, toKm: v.screen.strip.endKm, kind: 'thunder' as const, opens: 'weather' as const }] } } };
    await show(atStop, fakeActions().actions);
    expect(host.querySelector('.ah-band')!.getAttribute('aria-label')).toBe(`Thunderstorm at your stop, km ${showKm(v.screen.strip.endKm)}`);
    await show(v, fakeActions().actions);
    const s = v.screen.strip;
    expectIconsPlaced(s);
    const food = [...host.querySelectorAll<HTMLButtonElement>('.ah-icon')].find((b) => b.classList.contains('ah-icon-food'))
      ?? [...host.querySelectorAll<HTMLButtonElement>('.ah-icon-more')].find((b) => /Food/.test(b.getAttribute('aria-label') ?? ''))!;
    await click(food);
    expect(host.querySelector('[data-card="food"] .ah-toggle')!.getAttribute('aria-expanded')).toBe('true');
    await click(bands[0]);
    expect(host.querySelector('[data-card="weather"] .ah-toggle')!.getAttribute('aria-expanded')).toBe('true');
  });

  test('[AH-STRIP] six places near the start stay in two rows at 360 px; "+N" names them all and opens their cards', async () => {
    const v = trip(viewOf(rainyStop()));
    const s = v.screen.strip;
    const crowded = [126, 126.5, 127, 127.5, 128, 128.5].map((km, n) => ({ kind: (['water', 'food', 'sleep', 'cover', 'water', 'food'] as const)[n]!, km, opens: (['water', 'food', 'sleep', 'weather', 'water', 'food'] as const)[n]! }));
    await show({ ...v, screen: { ...v.screen, strip: { ...s, icons: crowded } } }, fakeActions().actions);
    expectIconsPlaced({ ...s, icons: crowded });
    // One button on the line at the first place, its icon and "+5" for the rest; its name says every one of them.
    const more = host.querySelector<HTMLButtonElement>('.ah-icon-more')!;
    expect(more.textContent).toBe('+5');
    expect(more.classList.contains('ah-icon-water')).toBe(true);
    expect(more.querySelector('svg')).not.toBeNull();
    expect(more.getAttribute('aria-label')).toBe('Water at km 126, +5: Food at km 126.5, Sleep place at km 127, Cover at km 127.5, Water at km 128, Food at km 128.5');
    await click(more);
    for (const c of ['food', 'sleep', 'weather', 'water']) expect(host.querySelector(`[data-card="${c}"] .ah-toggle`)!.getAttribute('aria-expanded'), c).toBe('true');
  });

  test('[AH-STRIP-LINE] the owner\'s day: the places spread along the line, the Sleep card\'s place at the end, nothing bunched at the left', async () => {
    const v = trip(viewOf(ownersDay()));
    const s = v.screen.strip;
    await show(v, fakeActions().actions);
    expectIconsPlaced(s);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.ah-icon')];
    // the stop's sleep place: its own icon, at the right end
    const end = buttons.find((b) => parseFloat(b.style.left) === 100)!;
    expect(end, 'an icon at the end').toBeDefined();
    expect(end.classList.contains('ah-icon-sleep')).toBe(true);
    expect(Number(end.dataset.km)).toBe(57.5);
    // the café 11.6 km on, at its own place
    const cafe = buttons.find((b) => Number(b.dataset.km) === 26.2)!;
    expect(cafe.dataset.kms).toBeUndefined();
    // spread: from the first place to the stop, not one corner
    const lefts = buttons.map((b) => parseFloat(b.style.left));
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeGreaterThan(90);
    expect(buttons.filter((b) => parseFloat(b.style.left) < 25).length).toBe(1);
    await click(end);
    expect(host.querySelector('[data-card="sleep"] .ah-toggle')!.getAttribute('aria-expanded')).toBe('true');
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
    // A call asks first (AH-CALL-CONFIRM): its button, then the question's one tel: link.
    const links = [...host.querySelectorAll<HTMLElement>('[data-card="sleep"] .ah-link')];
    const hrefs: (string | null)[] = [];
    for (const l of links) hrefs.push(l.tagName === 'A' ? l.getAttribute('href') : await dialled(l));
    expect(hrefs).toEqual(['tel:+497221123456', 'tel:+491711234567', 'https://camping-rheinaue.de']);
    for (const h of hrefs) expect(h).toMatch(/^(tel:\+\d+|https?:\/\/)/);
    const site = links[2]!;
    expect(site.getAttribute('rel')).toBe('noopener noreferrer');
    expect(site.getAttribute('target')).toBe('_blank');
    // Each button names its place: its own words, described by the item's label.
    expect(links[0]!.textContent).toBe('Call +49 7221 123456');
    expect(document.getElementById(links[0]!.getAttribute('aria-describedby')!)!.textContent).toMatch(/^Camping Rheinaue/);
    await click(buttonNamed('Bike shop', host.querySelector('.ah-chips')!));
    const panel = host.querySelector('#chip-bike')!;
    expect(await dialled(panel.querySelector('.ah-link'))).toBe('tel:+49785112345');
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

  test("[AH-SHARE] the map-link choice adds or takes out the link line only: the rider's own words stay", async () => {
    const v = trip(viewOf(rainyStop()));
    await show(v, fakeActions().actions);
    await click(buttonNamed('Share progress'));
    const sheet = host.querySelector('[data-share="progress"]')!;
    const box = sheet.querySelector('textarea')!;
    const mapLine = v.screen.shareMapText!.slice(v.screen.shareText!.length);
    expect(mapLine).toMatch(/openstreetmap\.org/);
    await typeInto(box, 'At the café, all well.');
    await click(sheet.querySelector('input[type=checkbox]'));
    expect(box.value).toBe(`At the café, all well.${mapLine}`);
    await typeInto(box, `Dry again. ${box.value}`);
    await click(sheet.querySelector('input[type=checkbox]'));
    expect(box.value).toBe('Dry again. At the café, all well.');
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
    expect(await dialled(buttonNamed(W.emergencyCall, card))).toBe('tel:112');
    expect(card.textContent).toContain(W.emergencyFallback);
    expect(card.textContent).toContain(v.screen.chips.emergency.coords!);
    expect(() => buttonNamed('Share my location', card)).not.toThrow();
    // Its lines are facts: no "Unknown" beside the route kilometre or the settlement.
    expect(card.querySelectorAll('.badge')).toHaveLength(0);
  });
  test('[AH-EMERGENCY] in every state: no route, first use, no position; 112 and the fallback line stand', async () => {
    const states = [
      { kind: 'no-route' as const, canShare: false, emergency: trip(viewOf(rainyStop({ positions: [] }))).screen.chips.emergency },
      viewOf(inputsOf({ trip: testTrip({ route: flatRoute(165, { stageEnds: [70, 165] }), departureDate: FRI }), now: `${SAT} 09:00`, positions: [] })),
      viewOf(rainyStop({ positions: [] })),
    ];
    for (const v of states) {
      const card = await emergencyIn(v);
      expect(await dialled(buttonNamed(W.emergencyCall, card)), v.kind).toBe('tel:112');
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
    expect(await dialled(buttonNamed(W.emergencyCall, card))).toBe('tel:112');
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

  test('[AH-FIRST-USE] on the departure day at 11:35 with no position, the page says its answers count from the route start', async () => {
    const v = trip(viewOf(rainyStop({ now: `${FRI} 11:35`, positions: [] })));
    expect(v.answers).toBe(true);
    await show(v, fakeActions().actions);
    expect(host.querySelectorAll('[data-card]')).toHaveLength(6);
    expect(host.querySelector('.ah-notes')!.textContent).toContain(W.routeNoPositionFromStart);
    expect(host.querySelector('.ah-notes')!.compareDocumentPosition(host.querySelector('[data-strip]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
