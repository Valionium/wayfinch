// @vitest-environment jsdom
// Ahead's real actions on the real store (fake IndexedDB): the position routine, the manual picker, Update weather, a phone
// opened days later. Only src/ui/shell-actions.ts reaches the store and the network for Ahead.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Route, ScreenInputs } from '../../../src/core/types.ts';
import { W } from '../../../src/core/wording/en.ts';
import { H } from '../../../src/core/wording/en-here.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb, DB_NAME } from '../../../src/store/db.ts';
import { readInputs } from '../../../src/store/inputs.ts';
import { addPosition } from '../../../src/store/positions.ts';
import { saveForecast, saveHours, saveMatched, savePrepared, saveZones } from '../../../src/store/prepared.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';
import { AheadScreen } from '../../../src/ui/ahead/ahead.tsx';
import { App } from '../../../src/ui/app.tsx';
import { browserAhead } from '../../../src/ui/shell-actions.ts';
import type { AheadDeps } from '../../../src/ui/shell-actions.ts';
import { go } from '../../../src/ui/nav.ts';
import { ROUTINE, watchBest } from '../../../src/ui/position.ts';
import { at, flatRoute, pointAtKm, rescue } from '../../fixtures/build.ts';
import { rainyStop, SAT } from './ahead-fixture.ts';
import { buttonNamed, click, dialled, host, typeInto } from './ahead-helpers.tsx';

beforeEach(() => {
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});
afterEach(() => { act(() => render(null, host)); vi.useRealTimers(); });

const settle = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
async function until(check: () => boolean, what: string | (() => string), ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waited for ${typeof what === 'string' ? what : what()}`);
    await settle(10);
  }
}

/** The inputs into the store as Get ready and the position routine would leave them. */
async function seed(i: ScreenInputs, o: { prepared?: boolean } = {}): Promise<void> {
  await readTrip();
  await saveTrip(i.trip);
  const id = i.trip.route.id;
  await saveMatched(id, { places: i.places, roofs: i.roofs, rescuePoints: i.rescuePoints, matches: i.matches, savedKm: i.savedKm });
  await saveZones(id, i.routeZones);
  await saveHours(id, i.hours);
  if (i.forecast) await saveForecast(id, i.forecast, i.forecast.fetchedAt);
  for (const p of i.positions) await addPosition(p, p.at, id);
  if (o.prepared !== false) await savePrepared(id, { at: i.now, steps: [], build: null, forecastFetchedAt: i.forecast?.fetchedAt ?? null, baselineYears: null });
}

type Geo = Geolocation & { calls: number; emit: (accuracy: number, km?: number) => void; emitAt: (lat: number, lon: number, accuracy: number) => void; fail: (code: number) => void };
function fakeGeo(): Geo {
  let success: PositionCallback | null = null;
  let failure: PositionErrorCallback | null = null;
  const geo = {
    calls: 0,
    watchPosition(ok: PositionCallback, bad?: PositionErrorCallback | null) { geo.calls += 1; success = ok; failure = bad ?? null; return 7; },
    clearWatch: vi.fn(),
    getCurrentPosition() { geo.calls += 1; },
    emit(accuracy: number, km = 125) {
      const { lat, lon } = pointAtKm(km);
      success?.({ coords: { latitude: lat, longitude: lon, accuracy }, timestamp: Date.now() } as unknown as GeolocationPosition);
    },
    emitAt(latitude: number, longitude: number, accuracy: number) {
      success?.({ coords: { latitude, longitude, accuracy }, timestamp: Date.now() } as unknown as GeolocationPosition);
    },
    fail(code: number) { failure?.({ code, message: '' } as GeolocationPositionError); },
  };
  return geo as unknown as Geo;
}

function deps(over: Partial<AheadDeps> = {}): AheadDeps {
  return {
    now: () => new Date(), geolocation: () => undefined, online: () => false, fetch: () => Promise.reject(new Error('offline')),
    share: null, writeClipboard: null, ...over,
  };
}

describe('the position routine', () => {
  test('[AH-ROUTINE] it stops as soon as a reading is within 50 m, with high accuracy and readings up to 30 s old', async () => {
    const geo = fakeGeo();
    const options: PositionOptions[] = [];
    const spy = { ...geo, watchPosition: (a: PositionCallback, b?: PositionErrorCallback | null, o?: PositionOptions) => { options.push(o!); return geo.watchPosition(a, b); } } as Geolocation;
    const done = watchBest(ROUTINE, spy);
    geo.emit(400);
    geo.emit(120);
    geo.emit(45);
    const fix = await done;
    expect(fix).toMatchObject({ accuracyM: 45 });
    expect(options[0]).toEqual({ enableHighAccuracy: true, maximumAge: 30_000, timeout: 45_000 });
    expect(geo.clearWatch).toHaveBeenCalledWith(7);
  });
  test('[AH-ROUTINE] at 45 s it keeps the best reading so far; with none, it says why', async () => {
    vi.useFakeTimers();
    const geo = fakeGeo();
    const done = watchBest(ROUTINE, geo);
    geo.emit(900);
    geo.emit(300);
    geo.emit(600);
    await vi.advanceTimersByTimeAsync(44_999);
    let settled = false;
    void done.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await done).toMatchObject({ accuracyM: 300 });
    const none = watchBest(ROUTINE, fakeGeo());
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await none).toEqual({ kind: 'timeout' });
  });
  test('[AH-ROUTINE] the accuracy is always on the position line', async () => {
    const i = rainyStop();
    await seed(i);
    const geo = fakeGeo();
    const shell = browserAhead(deps({ now: () => i.now, geolocation: () => geo }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    const tapped = shell.actions.updatePosition();
    geo.emit(12, 126);
    await tapped;
    await until(() => shell.view.value.kind === 'trip' && /km 126 of 165/.test(shell.view.value.screen.positionLine ?? ''), 'the new position');
    expect((shell.view.value as { screen: { positionLine: string } }).screen.positionLine).toMatch(/±12 m/);
    stop();
  });
});

describe('position only after a tap', () => {
  test('[AH-NO-AUTO-POS] opening Ahead, reading the store and changing tabs ask for no position', async () => {
    const i = rainyStop();
    await seed(i);
    const geo = fakeGeo();
    const shell = browserAhead(deps({ now: () => i.now, geolocation: () => geo }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    window.dispatchEvent(new StorageEvent('storage', { key: 'copilot:changed', newValue: JSON.stringify({ at: Date.now(), section: 'positions' }) }));
    document.dispatchEvent(new Event('visibilitychange'));
    await settle(50);
    expect(geo.calls).toBe(0);
    stop();
  });
  test('[AH-NO-AUTO-POS] no source file of Ahead or the shell calls geolocation outside position.ts', () => {
    const root = join(process.cwd(), 'src', 'ui');
    const files = readdirSync(root, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name));
    for (const f of files) {
      const path = join(f.parentPath, f.name);
      const src = readFileSync(path, 'utf8');
      if (/watchPosition|getCurrentPosition/.test(src)) expect(path.replace(/\\/g, '/')).toMatch(/src\/ui\/position\.ts$/);
    }
  });
});

describe('manual position', () => {
  test('[AH-MANUAL] with location denied, the picker sets the position by kilometre and by town, and it overrides GPS', async () => {
    const i = rainyStop();
    await seed(i);
    const geo = fakeGeo();
    let tick = 0;
    const shell = browserAhead(deps({ now: () => new Date(i.now.getTime() + 1000 * tick++), geolocation: () => geo }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    const tapped = shell.actions.updatePosition();
    geo.fail(1);
    await tapped;
    const v = shell.view.value;
    expect(v.kind === 'trip' && v.position).toEqual({ kind: 'said', text: W.appAheadDenied });

    await act(async () => { render(<Live shell={shell} />, host); });
    await click(buttonNamed('Set position by hand'));
    await typeInto(host.querySelector<HTMLInputElement>('#ah-picker input[type=number]')!, '140');
    await click(buttonNamed('Use this position'));
    await until(() => /km 140 of 165/.test(host.querySelector('[data-position-line]')?.textContent ?? ''), () => `the position by hand: ${host.textContent?.slice(0, 400)}`, 3000);
    expect(host.querySelector('[data-position-line]')!.textContent).toContain('set by hand');

    await click(buttonNamed('Set position by hand'));
    const select = host.querySelector<HTMLSelectElement>('#ah-picker select')!;
    expect([...select.options].map((o) => o.textContent)).toContain('Rheinstetten (km 124)');
    await act(async () => { select.value = String([...select.options].findIndex((o) => o.textContent === 'Rheinstetten (km 124)') - 1); select.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(buttonNamed('Use this position'));
    await until(() => /km 124 of 165/.test(host.querySelector('[data-position-line]')?.textContent ?? ''), 'the town');
    stop();
  }, 20_000);
  test('[AH-MANUAL] on a phone, an open picker keeps what the rider typed across the minute tick, a new GPS fix and a re-read, and closes once the typed position is used', async () => {
    // The review of PR 47 found it: the picker closed at each minute tick, since an effect watched the position line, whose
    // "N min ago" changes every minute, and the kilometre typed so far went with it. A rider typing slowly must keep both.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const i = rainyStop();
    await seed(i);
    let clock = new Date(i.now.getTime());
    const geo = fakeGeo();
    const shell = browserAhead(deps({ now: () => clock, geolocation: () => geo }));
    const stop = shell.start();
    await act(async () => { render(<Live shell={shell} />, host); });
    await until(() => host.querySelector('[data-position-line]') !== null, 'the position line');
    const line = () => host.querySelector('[data-position-line]')!.textContent ?? '';
    const kmField = () => host.querySelector<HTMLInputElement>('#ah-picker input[type=number]');
    await click(buttonNamed('Set position by hand'));
    const typed = kmField()!;
    typed.focus();
    await typeInto(typed, '12.5');

    // The minute tick: the line's age moves on, the picker and its typing stay.
    const first = line();
    clock = new Date(clock.getTime() + 3 * 60_000);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await until(() => line() !== first, () => `the line to move on: ${line()}`);
    expect(line()).toMatch(/3 min ago/);
    expect(kmField()).toBe(typed);
    expect(typed.value).toBe('12.5');

    // A new GPS fix from an earlier Update position: the rider moved on, the picker and its typing stay.
    const fixed = shell.actions.updatePosition();
    geo.emit(10, 131);
    await fixed;
    await until(() => /km 131 of 165/.test(line()), () => `the new fix: ${line()}`);
    expect(kmField()).toBe(typed);
    expect(typed.value).toBe('12.5');

    // The page shown again re-reads the store: the same.
    document.dispatchEvent(new Event('visibilitychange'));
    await settle(50);
    expect(kmField()).toBe(typed);
    expect(typed.value).toBe('12.5');

    // Using it sets the position and closes the picker, as on a phone before.
    await click(buttonNamed('Use this position'));
    await until(() => /km 12\.5 of 165/.test(line()), () => `the position by hand: ${line()}`, 3000);
    expect(kmField()).toBeNull();
    stop();
  }, 20_000);
  test('[AH-MANUAL] a kilometre outside the route is refused in words, and nothing is kept', async () => {
    const i = rainyStop();
    await seed(i);
    const shell = browserAhead(deps({ now: () => i.now }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    await shell.actions.setManual(400);
    const v = shell.view.value;
    expect(v.kind === 'trip' && v.position).toEqual({ kind: 'said', text: W.appAheadManualBadKm('165') });
    expect((await readInputs(i.now))!.positions.every((p) => p.source === 'gps')).toBe(true);
    stop();
  });
});

function Live({ shell }: { shell: ReturnType<typeof browserAhead> }) {
  return <AheadScreen view={shell.view.value} actions={shell.actions} />;
}

describe('no route', () => {
  test('[AH-NO-ROUTE] "Add a route to see what\'s ahead", a way to Trip, Emergency, and no demo', async () => {
    go('ahead');
    await act(async () => { render(<App />, host); });
    await until(() => host.querySelector('[data-ahead="no-route"]') !== null, 'Ahead with no route');
    expect(host.textContent).toContain("Add a route to see what's ahead");
    expect(host.querySelector('a[href="#/trip"]')).not.toBeNull();
    expect(host.textContent).not.toMatch(/demo/i);
    await click(buttonNamed('Emergency'));
    expect(await dialled(host.querySelector('#chip-emergency [data-call]'))).toBe('tel:112');   // it asks first (AH-CALL-CONFIRM)
    // Once a route's answers show, the notice goes.
    await seed(rainyStop());
    window.dispatchEvent(new StorageEvent('storage', { key: 'copilot:changed', newValue: JSON.stringify({ at: Date.now() + 1, section: 'trip' }) }));
    await until(() => host.querySelector('.ahead[data-ahead="answers"], .ahead[data-ahead="first-use"]') !== null, 'the route on Ahead');
    expect(host.textContent).not.toContain("Add a route to see what's ahead");
  });
});

describe('Update weather', () => {
  test('[AH-WEATHER-UPDATE] Update weather runs the refresh with the tap trigger, and says its sentence: offline, "No signal. Forecast fetched 07:10."', async () => {
    const refresh = await import('../../../src/data/refresh.ts');
    const i = rainyStop();
    await seed(i);
    const shell = browserAhead(deps({ now: () => i.now, online: () => false }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    await shell.actions.updateWeather();
    const v = shell.view.value;
    expect(v.kind === 'trip' && v.weatherSay).toBe(W.weatherNoSignal('07:10'));
    expect(refresh.decideRefresh({ mode: 'tap', trigger: 'tap', runs: null, held: [], lastFetchAt: i.forecast!.fetchedAt, now: i.now, keepFresh: false, signal: false, timeZone: 'Europe/Berlin' }).say)
      .toBe(W.weatherNoSignal('07:10'));
    stop();
  });
  test('[AH-WEATHER-UPDATE] before Get ready offline nothing is contacted, and it says what to do', async () => {
    const i = rainyStop();
    await seed(i, { prepared: false });
    const asked: string[] = [];
    const shell = browserAhead(deps({ now: () => i.now, online: () => true, fetch: (input) => { asked.push(String(input)); return Promise.resolve(new Response(null, { status: 200 })); } }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    await shell.actions.updateWeather();
    const v = shell.view.value;
    expect(v.kind === 'trip' && v.weatherSay).toBe(W.weatherNotPrepared);
    expect(asked.filter((u) => /open-meteo/.test(u))).toEqual([]);
    stop();
  });
  test('[AH-WEATHER-UPDATE] with a signal and a fetch within 30 minutes, nothing is sent and it says when it can update again', async () => {
    const i = rainyStop();
    await seed(i);
    const asked: string[] = [];
    const shell = browserAhead(deps({
      now: () => at(`${SAT} 07:30`), online: () => true,
      fetch: (input) => { asked.push(String(input)); return Promise.resolve(new Response(null, { status: 200 })); },
    }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    await shell.actions.updateWeather();
    const v = shell.view.value;
    expect(v.kind === 'trip' && v.weatherSay).toBe(W.weatherSpaced('07:10', '07:40'));
    expect(asked).toEqual(['/']); // only the connectivity check, to the app's own address
    stop();
  });
});

describe('opened days later', () => {
  test('[APP-OLD-OPEN] data 3 days old: on the page the forecast is labelled stale on its card, its age is true, no wait or go, old positions gone', async () => {
    // Prepared and ridden on Saturday 17 October; the next leg leaves Tuesday 20 October, and the phone opens that morning.
    const i = rainyStop();
    await seed({ ...i, trip: { ...i.trip, departureDate: '2026-10-20' } });
    const later = at('2026-10-20 09:00');
    expect((await readInputs(i.now))!.positions.length).toBeGreaterThan(0);
    const shell = browserAhead(deps({ now: () => later }));
    const stop = shell.start();
    await act(async () => { render(<Live shell={shell} />, host); });
    await until(() => host.querySelector('[data-card="weather"]') !== null, () => `the cards: ${host.textContent?.slice(0, 200)}`);
    expect((await readInputs(later))!.positions).toEqual([]); // ST-RETENTION: none is under 48 h old
    const weather = host.querySelector('[data-card="weather"]')!;
    expect(weather.querySelector('[data-stale]')!.textContent).toBe(W.weatherStale); // on the collapsed card
    await click(weather.querySelector('.ah-toggle'));
    expect(weather.textContent).toContain('Open-Meteo forecast fetched Sat 17 Oct, 07:10'); // the age, as it is
    expect(weather.textContent).not.toMatch(/Waiting until/);
    expect(host.querySelector('[data-position-line]')).toBeNull();
    expect(host.textContent).toContain(W.routeNoPositionFromStart);
    stop();
  });
});

describe('a screen left open', () => {
  test('[AH-RETURN] while Ahead stays in front, its ages follow the clock once a minute with no reload, no store write and no request; hidden, it waits', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const i = rainyStop();
    await seed(i);
    let clock = new Date(i.now.getTime());
    let asked = 0;
    const shell = browserAhead(deps({ now: () => clock, fetch: () => { asked += 1; return Promise.reject(new Error('offline')); } }));
    const stop = shell.start();
    await act(async () => { render(<Live shell={shell} />, host); });
    await until(() => host.querySelector('[data-position-line]') !== null, 'the position line');
    const line = () => host.querySelector('[data-position-line]')!.textContent ?? '';
    const first = line();
    const writes = (await readInputs(clock))!.positions.length;
    // An hour on, the page still in front: within a minute the line says the fix is an hour old.
    clock = new Date(clock.getTime() + 61 * 60_000);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await until(() => line() !== first, () => `the line to move on: ${line()}`);
    expect(line()).toMatch(/1 h/);
    await click(buttonNamed('Emergency', host.querySelector('.ah-chips')!));
    expect(host.querySelector('#chip-emergency')!.textContent).toMatch(/position at \d\d:\d\d \(1 h 1 min ago\)/);
    expect(asked).toBe(0);
    expect((await readInputs(clock))!.positions.length).toBe(writes);
    // Hidden: no rebuild until it is shown again.
    const hidden = line();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    clock = new Date(clock.getTime() + 90 * 60_000);
    await act(async () => { vi.advanceTimersByTime(120_000); });
    await settle(30);
    expect(line()).toBe(hidden);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await until(() => line() !== hidden, () => `the line on return: ${line()}`);
    stop();
  }, 20_000);
});

describe('refusals and failures', () => {
  test('[AH-PLAN-TOMORROW] a Plan tomorrow the browser would not keep is said on the page, and the plan is unchanged', async () => {
    const i = rainyStop();
    await seed(i);
    const shell = browserAhead(deps({ now: () => i.now }));
    const stop = shell.start();
    await act(async () => { render(<Live shell={shell} />, host); });
    await until(() => host.querySelector('[data-card="daylight"]') !== null, 'the cards');
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    await click(host.querySelector('[data-card="daylight"] .ah-toggle'));
    await click(buttonNamed(W.daylightPlanTomorrow, host.querySelector('[data-card="daylight"]')!));
    await until(() => host.textContent?.includes(W.appAheadChoiceNotKept) ?? false, 'the refusal');
    refuse.mockRestore();
    expect(shell.view.value.kind === 'trip' && shell.view.value.screen.phase).toBe('riding');
    stop();
  });
  test('[AH-NO-ROUTE] a trip that cannot be read is said so, with Try again, never "Add a route"', async () => {
    const i = rainyStop();
    await seed(i);
    closeDb();
    const real = globalThis.indexedDB;
    globalThis.indexedDB = { databases: () => Promise.resolve([{ name: DB_NAME, version: 1 }]), open: () => { throw new Error('blocked'); } } as unknown as IDBFactory;
    const shell = browserAhead(deps({ now: () => i.now }));
    const stop = shell.start();
    await act(async () => { render(<Live shell={shell} />, host); });
    await until(() => host.querySelector('[data-ahead="unreadable"]') !== null, 'the unreadable view');
    expect(host.textContent).toContain(W.appAheadUnreadable);
    expect(host.textContent).not.toContain(W.appAheadToTrip);
    globalThis.indexedDB = real;
    await click(buttonNamed(W.appAheadRetry));
    await until(() => host.querySelector('[data-ahead="answers"]') !== null, 'the answers after Try again');
    stop();
  });
});

describe('Emergency\'s own Update position (owner\'s iPhone check, 6 November 2026)', () => {
  /** Ahead with no route, through the shell and the page, with Emergency open. */
  async function noRouteEmergency(geo: Geolocation, now: () => Date = () => new Date()) {
    const shell = browserAhead(deps({ now, geolocation: () => geo }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'no-route', 'Ahead with no route');
    await act(async () => { render(<Live shell={shell} />, host); });
    await click(buttonNamed('Emergency', host.querySelector('.ah-chips')!));
    const panel = (): Element => host.querySelector('#chip-emergency')!;
    return { shell, stop, panel };
  }

  test('[AH-EMERGENCY-POSITION] with no route, Emergency has Update position: a tap finds the position and shows its coordinates and age, and nothing is stored', async () => {
    const geo = fakeGeo();
    const { shell, stop, panel } = await noRouteEmergency(geo);
    expect(panel().textContent).toContain(W.appAheadEmergencyNoPosition);
    expect(geo.calls).toBe(0);   // only after the tap (section 9.2)
    await click(buttonNamed(W.emergencyUpdatePosition, panel()));
    expect(geo.calls).toBe(1);
    expect(panel().querySelector('[role="status"]')!.textContent).toContain(W.appAheadFinding);
    await act(async () => { geo.emit(12, 40); await new Promise((r) => setTimeout(r, 0)); });
    await until(() => /\d+\.\d{5}, \d+\.\d{5}/.test(panel().textContent ?? ''), 'the coordinates');
    const { lat, lon } = pointAtKm(40);
    expect(panel().textContent).toContain(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    expect(panel().textContent).toMatch(/Last position at \d{2}:\d{2} \((just now|1 min ago)\)/);   // its time and age (W.emergencyPositionAt)
    expect(panel().textContent).not.toContain(W.appAheadEmergencyNoPosition);
    // 112 still asks first, and the number stands
    expect(await dialled(panel().querySelector('[data-call]'))).toBe('tel:112');
    // nothing written: there is no route to keep it on
    expect(await readInputs(new Date())).toBeNull();
    expect(shell.view.value.kind).toBe('no-route');
    stop();
  });

  test('[AH-EMERGENCY-POSITION] with no route, permission denied, no fix and the 45 s timeout each say what to do', async () => {
    // denied ends the routine at once; "no fix" and nothing at all end it at 45 s
    for (const [why, words] of [[1, H.hereDenied], [2, H.hereNoFix], [null, H.hereTimeout]] as const) {
      const geo = fakeGeo();
      const { stop, panel } = await noRouteEmergency(geo);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      await act(async () => { buttonNamed(W.emergencyUpdatePosition, panel()).click(); });
      await act(async () => {
        if (why !== null) geo.fail(why);
        await vi.advanceTimersByTimeAsync(why === 1 ? 0 : 45_000);
      });
      vi.useRealTimers();
      await until(() => (panel().textContent ?? '').includes(words), words);
      expect(panel().textContent).not.toMatch(/\d+\.\d{5}, \d+\.\d{5}/);
      expect(panel().textContent).toContain(W.appAheadEmergencyNoPosition);
      stop();
      act(() => render(null, host));
    }
  });

  test('[AH-EMERGENCY-POSITION] with a route, Emergency\'s Update position is Ahead\'s: the position is kept on the route and Emergency shows the same one', async () => {
    const i = rainyStop();
    await seed(i);
    const geo = fakeGeo();
    const shell = browserAhead(deps({ now: () => i.now, geolocation: () => geo }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    await act(async () => { render(<Live shell={shell} />, host); });
    await click(buttonNamed('Emergency', host.querySelector('.ah-chips')!));
    await click(buttonNamed(W.emergencyUpdatePosition, host.querySelector('#chip-emergency')!));
    await act(async () => { geo.emit(12, 126); await new Promise((r) => setTimeout(r, 0)); });
    await until(() => shell.view.value.kind === 'trip' && /km 126 of 165/.test(shell.view.value.screen.positionLine ?? ''), 'the new position');
    const v = shell.view.value;
    if (v.kind !== 'trip') throw new Error(v.kind);
    expect((await readInputs(i.now))!.positions.some((p) => Math.abs(p.km - 126) < 0.5)).toBe(true);
    await until(() => (host.querySelector('#chip-emergency')?.textContent ?? '').includes(v.screen.chips.emergency.coords!), 'the same coordinates in Emergency');
    stop();
  });
});

describe('Emergency\'s Update position never waits on a question (review of PR 53)', () => {
  /** Out to km 75 and back along the same line: km 32 and km 118 are the same spot. */
  function outAndBack(): Route {
    const points = [];
    for (let k = 0; k <= 150; k++) points.push({ ...pointAtKm(k <= 75 ? k : 150 - k), ele: 100, km: k });
    return { ...flatRoute(150), points, lengthKm: 150 };
  }

  test('[AH-EMERGENCY-POSITION] on an out-and-back route with no stored position, a fix where both passes meet shows its coordinates in Emergency at once; Ahead still asks which pass', async () => {
    const i = rainyStop({ positions: [] });
    await seed({ ...i, trip: { ...i.trip, route: outAndBack() } });
    const geo = fakeGeo();
    const shell = browserAhead(deps({ now: () => i.now, geolocation: () => geo }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    await act(async () => { render(<Live shell={shell} />, host); });
    await click(buttonNamed('Emergency', host.querySelector('.ah-chips')!));
    const panel = (): Element => host.querySelector('#chip-emergency')!;
    expect(panel().textContent).not.toMatch(/\d+\.\d{5}, \d+\.\d{5}/);
    await click(buttonNamed(W.emergencyUpdatePosition, panel()));
    const { lat, lon } = pointAtKm(32);
    await act(async () => { geo.emit(12, 32); await new Promise((r) => setTimeout(r, 0)); });
    await until(() => shell.view.value.kind === 'trip' && shell.view.value.position.kind === 'ask', 'the question on Ahead');
    await until(() => (panel().textContent ?? '').includes(`${lat.toFixed(5)}, ${lon.toFixed(5)}`), 'the fix in Emergency');
    expect(panel().textContent).toMatch(/Last position at \d{2}:\d{2} \((just now|1 min ago)\)/);
    expect((await readInputs(i.now))!.positions).toEqual([]);   // nothing kept until the rider picks the pass
    stop();
  });

  test('[AH-ASK-NOTE] while Ahead asks which pass, the notes say a position was found and waits for the answer, never "No position yet"; a re-read keeps it, and once the pass is chosen neither shows', async () => {
    const i = rainyStop({ positions: [] });
    await seed({ ...i, trip: { ...i.trip, route: outAndBack(), departureDate: SAT } });
    const geo = fakeGeo();
    const shell = browserAhead(deps({ now: () => i.now, geolocation: () => geo }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    await act(async () => { render(<Live shell={shell} />, host); });
    const notes = (): string => host.querySelector('.ah-notes')?.textContent ?? '';
    expect(notes()).toContain(W.routeNoPositionFromStart);   // before the tap it is true: there is no position
    const tapped = shell.actions.updatePosition();
    await act(async () => { geo.emit(12, 32); await new Promise((r) => setTimeout(r, 0)); });
    expect(await tapped).toBe(false);
    await until(() => shell.view.value.kind === 'trip' && shell.view.value.position.kind === 'ask', 'the question on Ahead');
    await settle();
    expect(notes()).toContain(W.routeAskPassFromStart);
    expect(notes()).not.toContain(W.routeNoPositionFromStart);
    // the page shown again reads the store and builds the screen again: still the same words while the question is open
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await settle(50);
    expect(shell.view.value.kind === 'trip' && shell.view.value.position.kind).toBe('ask');
    expect(notes()).toContain(W.routeAskPassFromStart);
    expect(notes()).not.toContain(W.routeNoPositionFromStart);
    const v = shell.view.value;
    const km = v.kind === 'trip' && v.position.kind === 'ask' ? v.position.options[0]!.km : NaN;
    expect(await shell.actions.choosePass(km)).toBe(true);
    await until(() => host.querySelector('[data-position-line]') !== null, 'the position line');
    expect(notes()).not.toContain(W.routeAskPassFromStart);
    expect(notes()).not.toContain(W.routeNoPositionFromStart);
    stop();
  });

  test('[AH-EMERGENCY-POSITION] while Ahead asks which pass, Emergency adds no "not stored" note for a fix that lies on the route: the rescue line shows without it', async () => {
    const i = rainyStop({ positions: [], rescuePoints: [{ ...rescue('KA-032').atKm(32, { off: 600 }), kms: [32, 118] }] });
    await seed({ ...i, trip: { ...i.trip, route: outAndBack() } });
    const geo = fakeGeo();
    const shell = browserAhead(deps({ now: () => i.now, geolocation: () => geo }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    const tapped = shell.actions.updatePosition();
    await act(async () => { geo.emit(12, 32); await new Promise((r) => setTimeout(r, 0)); });
    expect(await tapped).toBe(false);
    await until(() => shell.view.value.kind === 'trip' && shell.view.value.position.kind === 'ask', 'the question on Ahead');
    const v = shell.view.value;
    const card = v.kind === 'trip' ? v.screen.chips.emergency : null;
    expect(card?.rescue?.ref).toBe('KA-032');
    const said = JSON.stringify(card);
    expect(said).not.toContain(W.emergencyRescueNotStored);
    expect(said).not.toContain(W.emergencySettlementsFar);
    stop();
  });

  test('[AH-EMERGENCY-POSITION] while Ahead asks which pass, a fix more than 1 km from the route still gets the "not stored" note', async () => {
    const i = rainyStop({ positions: [], rescuePoints: [{ ...rescue('KA-032').atKm(32, { off: 1800 }), kms: [32, 118] }] });
    await seed({ ...i, trip: { ...i.trip, route: outAndBack() } });
    const geo = fakeGeo();
    const shell = browserAhead(deps({ now: () => i.now, geolocation: () => geo }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'trip', 'the screen');
    const sign = i.rescuePoints[0]!;
    const { lat, lon } = pointAtKm(32);
    // 1.2 km from the route, toward the sign: the sign is then 600 m away
    const f = 1200 / 1800;
    const tapped = shell.actions.updatePosition();
    await act(async () => { geo.emitAt(lat + (sign.lat - lat) * f, lon + (sign.lon - lon) * f, 12); await new Promise((r) => setTimeout(r, 0)); });
    expect(await tapped).toBe(false);
    await until(() => shell.view.value.kind === 'trip' && shell.view.value.position.kind === 'ask', 'the question on Ahead');
    const v = shell.view.value;
    const card = v.kind === 'trip' ? v.screen.chips.emergency : null;
    expect(card?.rescue?.ref).toBe('KA-032');
    expect(JSON.stringify(card)).toContain(W.emergencyRescueNotStored);
    stop();
  });

  test('[AH-EMERGENCY-POSITION] with no route, a fix at 0, 0 (what a phone gives for none) is said, not dropped in silence', async () => {
    const geo = fakeGeo();
    const shell = browserAhead(deps({ geolocation: () => geo }));
    const stop = shell.start();
    await until(() => shell.view.value.kind === 'no-route', 'Ahead with no route');
    const tapped = shell.actions.updatePosition();
    geo.emitAt(0, 0, 10);
    expect(await tapped).toBe(false);
    await until(() => { const v = shell.view.value; return v.kind === 'no-route' && v.position?.kind === 'said'; }, 'a message');
    const v = shell.view.value;
    expect(v.kind === 'no-route' && v.position).toEqual({ kind: 'said', text: H.hereUnusable });
    expect(v.kind === 'no-route' && v.emergency.coords).toBeNull();
    stop();
  });

});
