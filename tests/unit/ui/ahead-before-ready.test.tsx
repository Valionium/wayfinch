// @vitest-environment jsdom
// Ahead before Get ready offline (guided Trip design §2.3, owner's answer 7): what the route alone gives, a card with its own Get
// ready offline button, and one muted line on each card that needs what Get ready offline saves.
import { afterEach, describe, expect, test } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { W } from '../../../src/core/wording/en.ts';
import type { StepReport } from '../../../src/data/prepare.ts';
import { browserAhead } from '../../../src/ui/shell-actions.ts';
import type { AheadActions, AheadTrip } from '../../../src/ui/ahead/actions.ts';
import { bannedHits } from '../../fixtures/banned.ts';
import { rainyStop, FRI } from './ahead-fixture.ts';
import { buttonNamed, click, fakeActions, host, show, viewOf } from './ahead-helpers.tsx';

afterEach(() => { render(null, host); });

const trip = (v: ReturnType<typeof viewOf>): AheadTrip => { if (v.kind !== 'trip') throw new Error(v.kind); return v; };
const text = (): string => host.textContent ?? '';
/** The morning of the departure day, with the route and nothing Get ready offline saves: no places, no saved stretch, no forecast. */
const bare = () => rainyStop({ now: `${FRI} 07:30`, positions: [], spots: [], savedKm: [], forecast: null, roofs: [], rescuePoints: [] });
const until = async (check: () => boolean, what: string): Promise<void> => {
  for (let i = 0; i < 400 && !check(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  if (!check()) throw new Error(`waited for ${what}`);
};

describe('Ahead before Get ready offline', () => {
  test('[AH-BEFORE-READY] the shell tells a route with nothing saved from one with places, a saved stretch or a forecast', () => {
    expect(trip(viewOf(bare())).beforeReady).toBe(true);
    expect(trip(viewOf(rainyStop({ now: `${FRI} 07:30`, positions: [] }))).beforeReady).toBe(false);
    expect(trip(viewOf({ ...bare(), savedKm: [{ fromKm: 0, toKm: 165 }] })).beforeReady).toBe(false);
    expect(trip(viewOf(rainyStop({ now: `${FRI} 07:30`, positions: [], spots: [], savedKm: [] }))).beforeReady).toBe(false);
  });

  test('[AH-BEFORE-READY] a card at the top asks for Get ready offline and says why; what the route alone gives shows, the rest says "After Get ready offline"', async () => {
    const v = trip(viewOf(bare()));
    await show(v, fakeActions().actions);
    await until(() => host.querySelector('[data-need-ready] button') !== null, 'the card');
    const need = host.querySelector<HTMLElement>('[data-need-ready]')!;
    // At the top: only the Emergency link comes before it (owner's preview check, 8 Nov 2026, item B).
    expect(host.querySelector('.ah-main')!.firstElementChild!.querySelector('[data-emergency-top]')).not.toBeNull();
    expect(host.querySelector('.ah-main')!.firstElementChild!.nextElementSibling).toBe(need);
    expect(need.textContent).toContain(W.appAheadNeedTitle);
    expect(need.textContent).toContain(W.appAheadNeedBody);
    expect(need.textContent).toContain(W.appAheadNeedUntil);
    expect(buttonNamed(W.appTripGetReadyButton, need)).toBeDefined();
    // The strip: its line and the bike, no icons, and why.
    const strip = host.querySelector('[data-strip]')!;
    expect(strip.querySelectorAll('.ah-icon')).toHaveLength(0);
    expect(strip.textContent).toContain(W.appAheadStopsAfter);
    // Daylight and Climbing are worked out from the route alone; the four others wait, in a muted line and no warning colour.
    for (const name of ['daylight', 'climbing']) {
      const card = host.querySelector(`[data-card="${name}"]`)!;
      expect(card.querySelector('.ah-toggle')!.textContent).toBe(v.screen.cards[name as 'daylight'].title);
    }
    for (const name of ['water', 'food', 'weather', 'sleep']) {
      const card = host.querySelector<HTMLElement>(`[data-card="${name}"]`)!;
      expect(card.textContent, name).toContain(W.appAheadAfterReady);
      expect(card.querySelector('.ah-toggle'), name).toBeNull();
      expect(card.className).not.toMatch(/ah-status-(warning|action)/);
      expect(card.className).toContain('ah-later');
    }
    expect([...host.querySelectorAll('[data-card]')].map((c) => c.getAttribute('data-card'))).toEqual(['water', 'food', 'daylight', 'weather', 'climbing', 'sleep']);
    // The Emergency chip stays, as in every state; the other chips are answered from saved places too.
    expect([...host.querySelectorAll('.ah-chips button')].map((b) => b.textContent)).toEqual([W.appAheadChipEmergency]);
    for (const s of [W.appAheadNeedTitle, W.appAheadNeedBody, W.appAheadNeedUntil, W.appAheadAfterReady, W.appAheadStopsAfter]) expect(bannedHits(s)).toEqual([]);
  });

  test('[AH-BEFORE-READY] its Get ready offline is the same prepare as Trip\'s, with the same progress, and Ahead reads again once it ends', async () => {
    const { actions, calls } = fakeActions();
    let finish: () => void = () => undefined;
    const ended = new Promise<void>((r) => { finish = r; });
    const getReady: AheadActions['getReady'] = async (onProgress) => {
      calls.push(['getReady']);
      onProgress('places', 3, 14);
      await ended;
      return [];
    };
    await show(trip(viewOf(bare())), { ...actions, getReady });
    await until(() => host.querySelector('[data-need-ready] button') !== null, 'the card');
    await click(buttonNamed(W.appTripGetReadyButton, host.querySelector('[data-need-ready]')!));
    await until(() => text().includes(W.appTripProgress(2, 6, W.appTripStepPlaces)), 'the progress');
    expect(text()).toContain(W.appTripProgressPart(3, 14));
    expect(text()).toContain(W.appTripWorking);
    finish();
    await until(() => calls.some(([n]) => n === 'retry'), 'the read after it');
    expect(calls.filter(([n]) => n === 'getReady')).toHaveLength(1);
  });
});

describe('What the review of PR 73 found', () => {
  const noSignal = (): StepReport[] => [
    { step: 'heights', ok: true, note: null },
    { step: 'places', ok: false, note: W.appPrepNoConnection },
    { step: 'hours', ok: false, note: W.appPrepNoConnection },
    { step: 'weather', ok: false, note: W.appPrepNoConnection },
    { step: 'baseline', ok: false, note: W.appPrepNoConnection },
  ];

  test('[AH-BEFORE-READY] a run without signal names the steps not saved, says so plainly, and offers Try again', async () => {
    const { actions } = fakeActions();
    await show(trip(viewOf(bare())), { ...actions, getReady: async () => noSignal() });
    await until(() => host.querySelector('[data-need-ready] button') !== null, 'the card');
    await click(buttonNamed(W.appTripGetReadyButton, host.querySelector('[data-need-ready]')!));
    await until(() => text().includes(W.appTripMissingHeading), 'the steps not saved');
    const card = host.querySelector('[data-need-ready]')!;
    expect(card.textContent).toContain(W.appTripStepPlaces);
    expect(card.textContent).toContain(W.appPrepNoConnection);
    expect(card.textContent).toContain(W.appPrepNoSignal);
    expect(buttonNamed(W.appTripRetryButton, card)).toBeDefined();
  });

  test('[AH-BEFORE-READY] after a run with a step missing (Ahead no longer "before"), the top card still names it, with Try again', async () => {
    const v: AheadTrip = { ...trip(viewOf(rainyStop({ now: `${FRI} 07:30`, positions: [] }))), failedSteps: [{ step: 'places', ok: false, note: W.appPrepStorageFull(6, 14) }] };
    expect(v.beforeReady).toBe(false);
    await show(v, fakeActions().actions);
    await until(() => host.querySelector('[data-need-ready] button') !== null, 'the card');
    const card = host.querySelector('[data-need-ready]')!;
    expect(card.textContent).toContain(W.appTripMissingHeading);
    expect(card.textContent).toContain(W.appPrepStorageFull(6, 14));
    expect(card.textContent).not.toContain(W.appAheadNeedTitle);
    expect(buttonNamed(W.appTripRetryButton, card)).toBeDefined();
    // The cards answer as usual: only the steps missing are named.
    expect(host.querySelector('[data-card="water"] .ah-toggle')).not.toBeNull();
  });

  test('[AH-BEFORE-READY] Ahead\'s Get ready offline is the prepare it was given: the same callbacks reach it', async () => {
    const seen: unknown[] = [];
    const prepare: AheadActions['getReady'] = async (a, b) => { seen.push(a, b); return []; };
    const shell = browserAhead({ now: () => new Date(), geolocation: () => undefined, online: () => false, fetch: () => Promise.reject(new Error('no')), share: null, writeClipboard: null, prepare });
    const onProgress = () => undefined;
    const onNotice = () => undefined;
    await shell.actions.getReady(onProgress, onNotice);
    expect(seen).toEqual([onProgress, onNotice]);
  });
});
