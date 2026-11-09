// @vitest-environment jsdom
// The Trip screen on the real store (fake IndexedDB), with a fixed clock and a stand-in for the network.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { options, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildScreen } from '../../../src/core/screen/screen.ts';
import { planStages } from '../../../src/core/route/stages.ts';
import { W } from '../../../src/core/wording/en.ts';
import { TR } from '../../../src/core/wording/en-trip.ts';
import type { StepName, StepReport } from '../../../src/data/prepare.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb, openDb } from '../../../src/store/db.ts';
import { readInputs } from '../../../src/store/inputs.ts';
import { savePrepared } from '../../../src/store/prepared.ts';
import { preparedStore } from '../../../src/store/prepared.ts';
import { readTrip } from '../../../src/store/trip.ts';
import { planned } from '../../../src/ui/trip/model.ts';
import { routeFromGpx } from '../../../src/ui/trip/read-gpx.ts';
import { askForHomeScreen, installOffer } from '../../../src/ui/install.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { TripScreen } from '../../../src/ui/trip/trip.tsx';
import { browserTripServices } from '../../../src/ui/trip/services.ts';
import type { TripServices } from '../../../src/ui/trip/services.ts';
import { fixtureGpx } from '../../fixtures/gpx.ts';
import { bannedHits } from '../../fixtures/banned.ts';

const host = document.createElement('div');
document.body.append(host);

const NOW = new Date('2026-10-10T09:00:00Z');

beforeEach(async () => {
  render(null, host);
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  refreshBikeSource();
  installOffer.value = null;
});
afterEach(() => { act(() => render(null, host)); });

const settle = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
async function until(check: () => boolean, what: string, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waited for ${what}`);
    await settle(10);
  }
}
const text = () => host.textContent ?? '';

function services(over: Partial<TripServices> = {}): TripServices {
  return { ...browserTripServices(() => NOW), ...over };
}

async function show(svc: TripServices = services()): Promise<TripServices> {
  act(() => render(null, host));
  await act(async () => { render(<TripScreen services={svc} />, host); });
  await until(() => host.querySelector('[data-trip-loaded]') !== null, 'Trip to load');
  // Add a route is a chunk of its own, in the open Route step.
  await until(() => host.querySelector('[data-step="route"][data-open]') === null || host.querySelector('[data-add-route]') !== null, 'Add a route');
  return svc;
}

/**
 * The guided Trip (design of 8 Nov 2026) shows one step at a time: this opens one as the rider does, with its title, or its Change
 * or Update once it is done.
 */
async function openStep(name: 'route' | 'getready' | 'bags' | 'go'): Promise<void> {
  const li = host.querySelector(`[data-step="${name}"]`)!;
  if (li.hasAttribute('data-open')) return;
  await act(async () => { li.querySelector<HTMLButtonElement>('.trip-step-head button')!.click(); });
}
/** The trip details fold to one line under the Route step (TRIP-DETAILS): their fields show once Trip details is tapped. */
async function openDetails(): Promise<void> {
  const toggle = host.querySelector<HTMLButtonElement>('[data-trip-details] button')!;
  if (toggle.getAttribute('aria-expanded') !== 'true') await act(async () => { toggle.click(); });
  await until(() => host.querySelector('#trip-start') !== null, 'the trip details');
}

async function pick(content: string, name = 'ride.gpx'): Promise<void> {
  // With a route, the file picker is in the Route step, opened by its Change.
  if (!host.querySelector('[data-add-route] input[type=file]')) await openStep('route');
  await until(() => host.querySelector('[data-add-route] input[type=file]') !== null, 'the file picker');
  const input = host.querySelector<HTMLInputElement>('[data-add-route] input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [new File([content], name, { type: 'application/gpx+xml' })], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

const button = (name: string | RegExp): HTMLButtonElement => {
  const found = [...host.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? '')));
  if (!found) throw new Error(`no button ${String(name)}`);
  return found;
};
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

async function withRoute(id: 'heidelberg-strasbourg' | 'loop' | 'alpine-pass' = 'heidelberg-strasbourg'): Promise<TripServices> {
  const svc = await show();
  await pick(await fixtureGpx(id));
  await until(() => host.querySelector('[data-summary]') !== null, 'the summary');
  return svc;
}

describe('Add a route and the summary (spec section 3.3)', () => {
  test('[TRIP-GPX] a GPX file becomes the route: the summary shows distance, climbing, profile and the stage model\'s days', async () => {
    await withRoute();
    const trip = (await readTrip())!;
    const summary = host.querySelector('[data-summary]')!;
    expect(summary.textContent).toContain(`${Math.round(trip.route.lengthKm * 10) / 10} km`);
    expect(summary.textContent).toMatch(/[\d,]+ m climbing/);
    expect(summary.querySelector('svg[role=img]')).not.toBeNull();
    const expected = planStages(trip.route, { flatKph: 25, pace: 'sporting', nights: planStages(trip.route, { flatKph: 25, pace: 'sporting', nights: 0 }).suggestedNights });
    expect(summary.querySelectorAll('ol li')).toHaveLength(expected.length);
    expect(trip.route.stages).toEqual([...expected]);
    expect(trip.departureDate).toBe('2026-10-10');
  });

  test('[TRIP-GPX-BAD] a bad file says its own plain reason, and the old route stays', async () => {
    await withRoute('loop');
    const before = (await readTrip())!.route.id;
    await pick('this is not a GPX file');
    await until(() => text().includes(W.routeGpxUnreadable), 'the refusal');
    expect(text()).toContain(W.appTripUnchanged);
    await pick('x'.repeat(21 * 1024 * 1024));
    await until(() => text().includes(W.routeGpxTooLarge), 'the size refusal');
    expect(text()).not.toContain(W.routeGpxUnreadable);
    expect((await readTrip())!.route.id).toBe(before);
    expect(host.querySelector('[data-replace]')).toBeNull();
  });

  test('[TRIP-GPX-BAD] a file that cannot be read at all is told in words, with nothing thrown at the rider', async () => {
    await show();
    const input = host.querySelector<HTMLInputElement>('[data-add-route] input[type=file]')!;
    const broken = { name: 'a.gpx', size: 10, text: () => Promise.reject(new Error('boom')) };
    Object.defineProperty(input, 'files', { value: [broken], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await until(() => text().includes(W.appTripFileFailed), 'the refusal');
    expect(await readTrip()).toBeNull();
  });

  test('[TRIP-REPLACE-ASKS] a second route asks first; Cancel keeps everything, Replace changes the route and drops the old date', async () => {
    const svc = await withRoute('loop');
    await svc.setDeparture('2026-10-17');
    await settle(20);
    const first = (await readTrip())!;
    await pick(await fixtureGpx('alpine-pass'));
    await until(() => host.querySelector('[data-replace]') !== null, 'the question');
    expect(host.querySelector('[data-replace]')!.textContent).toContain(first.route.name);
    expect((await readTrip())!.route.id).toBe(first.route.id);
    await click(button(W.appTripReplaceCancel));
    expect(host.querySelector('[data-replace]')).toBeNull();
    const kept = (await readTrip())!;
    expect(kept.route.id).toBe(first.route.id);
    expect(kept.departureDate).toBe('2026-10-17');

    await pick(await fixtureGpx('alpine-pass'));
    await until(() => host.querySelector('[data-replace]') !== null, 'the question again');
    await click(button(W.appTripReplaceYes));
    await until(() => text().includes('Altdorf'), 'the new route');
    const replaced = (await readTrip())!;
    expect(replaced.route.id).not.toBe(first.route.id);
    expect(replaced.departureDate).toBe('2026-10-10');
  });

  test('[TRIP-REPLACE-ASKS] the same file again is no new route: nothing asks and nothing changes', async () => {
    await withRoute('loop');
    const before = (await readTrip())!;
    await pick(await fixtureGpx('loop'));
    await until(() => text().includes(W.appTripSameRoute), 'the note');
    expect(host.querySelector('[data-replace]')).toBeNull();
    expect((await readTrip())!.route.id).toBe(before.route.id);
  });

  test('[TRIP-SUMMARY] a route without heights says climbing is unknown and that Prepare this route looks them up; once looked up, Copernicus is credited', async () => {
    await show();
    await pick(await fixtureGpx('loop', { heights: false }));
    await until(() => host.querySelector('[data-summary]') !== null, 'the summary');
    expect(text()).toContain(W.appTripClimbingUnknown);
    expect(text()).toContain(TR.appTripHeightsPending);
    expect(text()).not.toContain(W.appTripHeightsCredit);
    // What Prepare this route's heights step does: the same line with heights in it.
    const trip = (await readTrip())!;
    const withHeights = { ...trip, route: { ...trip.route, ascentM: 120, points: trip.route.points.map((p) => ({ ...p, ele: 150 })) } };
    const { saveTrip } = await import('../../../src/store/trip.ts');
    await readTrip();
    await saveTrip(withHeights);
    await show(services());
    expect(text()).toContain(W.appTripHeightsCredit);
    expect(text()).not.toContain(TR.appTripHeightsPending);
  });

  test('[TRIP-DAY1-LEAVEBY] the day before departure, Day 1 reads "Day 1 · N km · leave by about HH:MM", the very time of the Daylight card', async () => {
    const svc = await withRoute();
    await svc.setDeparture('2026-10-11');
    await show(svc);
    const row = host.querySelector('[data-summary] ol li')!.textContent!;
    expect(row).toMatch(/^Day 1 · [\d.]+ km · leave by about \d\d:\d\d/);
    const inputs = (await readInputs(NOW))!;
    const card = buildScreen(inputs).screen.cards.daylight.title;
    const cardTime = /leave by (about \d\d:\d\d)/.exec(card)?.[1];
    expect(cardTime).toBeDefined();
    expect(row).toContain(`leave by ${cardTime}`);
  });

  test('[TRIP-DAY1-LEAVEBY] on any other day Day 1 shows no leave-by time', async () => {
    const svc = await withRoute();
    await svc.setDeparture('2026-10-13');
    await show(svc);
    expect(host.querySelector('[data-summary] ol li')!.textContent).not.toContain('leave by');
  });
});

const stepNames: StepName[] = ['heights', 'places', 'hours', 'weather', 'baseline', 'save'];

/** A Prepare this route that ends as told, and leaves in the store what the real one would have. */
function preparing(reports: (routeId: string) => StepReport[], o: { places?: number; weatherTo?: Date | null; at?: Date; seen?: string[]; notice?: string; fetchedAt?: Date; sourceDate?: string | null } = {}): Partial<TripServices> {
  return {
    prepare: async (onProgress, onNotice) => {
      const trip = (await readTrip())!;
      if (o.notice) { onNotice(o.notice); await settle(25); o.seen?.push(text()); }
      for (const step of stepNames) { onProgress(step, 1, 2); await settle(25); o.seen?.push(text()); }
      const db = await openDb();
      for (let i = 0; i < (o.places ?? 0); i++) await db.put('places', { id: `node/${i}`, kind: 'water' });
      if (o.weatherTo) await db.put('forecast', { fetchedAt: o.fetchedAt ?? NOW, runs: [], grid: [{ km: 0, lat: 49, lon: 8, hours: [{ at: o.weatherTo }] }], has15: false }, 'current');
      const steps = reports(trip.route.id);
      await savePrepared(trip.route.id, { at: o.at ?? NOW, steps, build: { id: 'b', builtAt: '2026-10-28', countries: o.sourceDate === undefined ? {} : { DE: o.sourceDate } }, forecastFetchedAt: null, baselineYears: null });
      return steps;
    },
  };
}
const allOk = (): StepReport[] => stepNames.map((step) => ({ step, ok: true, note: null }));

describe('Settings and Get ready (spec sections 3.3 and 9.4)', () => {
  test('[TRIP-SETTINGS] the defaults of the table show: 08:30, Sporting, Camping, 2.0 L; accommodation makes camp water 0 and camping gives 2 back', async () => {
    await withRoute();
    await openDetails();
    expect(host.querySelector<HTMLInputElement>('#trip-start')!.value).toBe('08:30');
    expect(host.querySelector<HTMLInputElement>('input[name=pace]:checked')!.value).toBe('sporting');
    expect(host.querySelector<HTMLInputElement>('input[name=stay]:checked')!.value).toBe('camping');
    expect(host.querySelector<HTMLInputElement>('#trip-camp')!.value).toBe('2');
    expect(host.querySelector<HTMLInputElement>('#trip-kph')!.value).toBe('25');
    const accommodation = host.querySelector<HTMLInputElement>('input[name=stay][value=accommodation]')!;
    await click(accommodation);
    await until(() => host.querySelector<HTMLInputElement>('#trip-camp')!.value === '0', 'camp water 0');
    await click(host.querySelector<HTMLInputElement>('input[name=stay][value=camping]')!);
    await until(() => host.querySelector<HTMLInputElement>('#trip-camp')!.value === '2', 'camp water back');
    expect((await readTrip())!.stay).toBe('camping');
  });

  test('[TRIP-SETTINGS] a refused value goes back at once, beside its message, even while reading the trip again is slow (a busy phone)', async () => {
    const real = services();
    let slow = false;
    const svc: TripServices = { ...real, load: async () => { if (slow) await new Promise((r) => setTimeout(r, 1500)); return real.load(); } };
    await show(svc);
    await pick(await fixtureGpx('heidelberg-strasbourg'));
    await until(() => host.querySelector('[data-summary]') !== null, 'the summary');
    await openDetails();
    slow = true;
    const input = host.querySelector<HTMLInputElement>('#trip-start')!;
    await act(async () => { input.value = '03:00'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
    await until(() => text().includes(W.appStoreStartTimeRange), 'the start range', 1000);
    await settle(30);
    expect(host.querySelector<HTMLInputElement>('#trip-start')!.value).toBe('08:30');
  }, 20_000);

  test('[TRIP-SETTINGS] nights typed the moment the settings appear, before their effects have run, stay in the field and are kept', async () => {
    // Review M3 of PR 47, the twin of YOU-RIDER's: a field's effect that also ran after the first paint put the read value back over
    // what was typed before it. The effects after that paint are held here until the test lets them go, so the typing comes first.
    await withRoute();
    act(() => render(null, host));
    const real = services();
    let asked = false;
    let loaded!: () => void;
    const gate = new Promise<void>((r) => { loaded = r; });
    render(<TripScreen services={{ ...real, load: async () => { asked = true; await gate; return real.load(); } }} />, host);
    for (let i = 0; i < 500 && !asked; i++) await new Promise<void>((r) => setTimeout(r, 10));
    expect(asked).toBe(true);
    const held: (() => void)[] = [];
    const was = options.requestAnimationFrame;
    options.requestAnimationFrame = (run) => { held.push(run); };
    let nights!: HTMLInputElement;
    try {
      loaded();
      // The nights are in the Route step, opened by its Change (TRIP-STEPS): the field appears with that tap.
      for (let i = 0; i < 5000 && !host.querySelector('[data-step="route"] .trip-step-head button'); i++) await new Promise<void>((r) => setTimeout(r, 0));
      host.querySelector<HTMLButtonElement>('[data-step="route"] .trip-step-head button')!.click();
      for (let i = 0; i < 5000 && !host.querySelector('#trip-nights'); i++) await new Promise<void>((r) => setTimeout(r, 0));
      nights = host.querySelector<HTMLInputElement>('#trip-nights')!;
      nights.focus();
      nights.value = '3';
      nights.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    } finally {
      options.requestAnimationFrame = was;
      for (const run of held) run();
    }
    await settle(150);
    expect(host.querySelector('#trip-nights')).toBe(nights);
    expect(nights.value).toBe('3');
    await act(async () => { nights.dispatchEvent(new Event('change', { bubbles: true })); });
    await until(() => host.querySelectorAll('[data-summary] ol li').length === 4, 'four days');
    expect((await readTrip())!.route.stages).toHaveLength(4);
  }, 20_000);

  test('[TRIP-SETTINGS] a value out of range is refused with the range named, the last good value stays, and nothing is saved', async () => {
    await withRoute();
    await openStep('route');
    await openDetails();
    const set = async (id: string, value: string) => {
      const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
      await act(async () => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
    };
    await set('trip-kph', '60');
    await until(() => text().includes(W.appStoreFlatKphRange), 'the speed range');
    await settle(30);
    expect(host.querySelector<HTMLInputElement>('#trip-kph')!.value).toBe('25');
    await set('trip-start', '03:00');
    await until(() => text().includes(W.appStoreStartTimeRange), 'the start range');
    await settle(30);
    expect(host.querySelector<HTMLInputElement>('#trip-start')!.value).toBe('08:30');
    await set('trip-camp', '9');
    await until(() => text().includes(W.appStoreCampWaterRange), 'the camp water range');
    await set('trip-nights', '31');
    await until(() => text().includes(W.appStoreNightsRange), 'the nights range');
    const trip = (await readTrip())!;
    expect([trip.flatKph, trip.startTime, trip.campWaterL]).toEqual([25, '08:30', 2]);
    await set('trip-kph', '30');
    await until(() => !text().includes(W.appStoreFlatKphRange), 'the message to go');
    expect((await readTrip())!.flatKph).toBe(30);
  });

  test('[TRIP-SETTINGS] pace, speed and nights change the days on screen and in the store together', async () => {
    await withRoute();
    await openStep('route');
    const days = () => host.querySelectorAll('[data-summary] ol li').length;
    const before = days();
    const nights = host.querySelector<HTMLInputElement>('#trip-nights')!;
    await act(async () => { nights.value = String(before + 2); nights.dispatchEvent(new Event('input', { bubbles: true })); nights.dispatchEvent(new Event('change', { bubbles: true })); });
    await until(() => days() === before + 3, 'more days');
    const trip = (await readTrip())!;
    expect(trip.route.stages).toHaveLength(before + 3);
    expect(trip.route.sampleGrid.length).toBeGreaterThan(5);
    await click(button(W.appTripNightsUseSuggested));
    await until(() => days() === before, 'the suggested days');
    expect((await readTrip())!.route.stages).toHaveLength(before);
  });

  test('[TRIP-SETTINGS] the departure date starts as today, the day the route was added, as a value to change; it saves once typing has settled, and an empty date says what is lost', async () => {
    await withRoute();
    await openStep('route');
    const date = () => host.querySelector<HTMLInputElement>('#trip-date')!;
    expect(date().value).toBe('2026-10-10');
    // The date starts as today, so there is no "Set to today"; "Clear the date" is a tap, not only the browser's own field.
    expect([...host.querySelectorAll('button')].some((x) => /today/i.test(x.textContent ?? ''))).toBe(false);
    expect(text()).not.toContain(W.appTripDepartureNone);
    await act(async () => { date().value = '2026-10-01'; date().dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { date().value = '2026-10-17'; date().dispatchEvent(new Event('change', { bubbles: true })); });
    await settle(900);
    expect((await readTrip())!.departureDate).toBe('2026-10-17');
    await act(async () => { date().value = ''; date().dispatchEvent(new Event('change', { bubbles: true })); date().dispatchEvent(new Event('blur', { bubbles: true })); });
    await until(() => text().includes(W.appTripDepartureNone), 'the note');
    expect((await readTrip())!.departureDate).toBeNull();
    expect([...host.querySelectorAll('button')].some((x) => x.textContent === W.appTripDateClear)).toBe(false);
  });

  test('[TRIP-SETTINGS] "Clear the date" takes the date away in one tap, also over a date still settling, and says what is lost', async () => {
    await withRoute();
    await openStep('route');
    const date = () => host.querySelector<HTMLInputElement>('#trip-date')!;
    await act(async () => { date().value = '2026-10-17'; date().dispatchEvent(new Event('change', { bubbles: true })); });
    await click(button(W.appTripDateClear));
    await settle(900);
    await until(() => text().includes(W.appTripDepartureNone), 'the note');
    expect((await readTrip())!.departureDate).toBeNull();
    expect(date().value).toBe('');
  });

  test('[WXR-TAP-HIDDEN] the shipped (automatic) build shows "Keep trip data fresh when online" on Trip and it saves; the tap-only build still hides it', async () => {
    const auto = services();
    expect(auto.env.weatherMode).toBe('auto');
    await show(auto);
    await openDetails();
    expect(text()).toContain(W.weatherKeepFresh);
    const box = host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(box.checked).toBe(true);
    await click(box);
    await settle(30);
    expect(JSON.parse(localStorage.getItem('copilot:settings')!).keepFresh).toBe(false);
    render(null, host);
    const tap = services({ env: { ...auto.env, weatherMode: 'tap' } });
    await show(tap);
    await openDetails();
    expect(text()).not.toContain(W.weatherKeepFresh);
  });

  test('[TRIP-GETREADY] the steps show their progress, and the result reads "1,214 places (map data of 25 Oct), weather to Friday (fetched 2 h ago)" with the storage used and Update', async () => {
    const seen: string[] = [];
    const svc = services(preparing(allOk, { places: 1214, weatherTo: new Date('2026-10-16T12:00:00Z'), fetchedAt: new Date(NOW.getTime() - 2 * 3_600_000), sourceDate: '2026-10-25', seen, notice: W.appPrepHeightsNotice }));
    await show(svc);
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-getready]') !== null, 'Prepare this route');
    expect(text()).toContain(W.appTripNothingSaved);
    expect(text()).toContain(W.appTripFlightMode);
    await click(button(W.appTripGetReadyButton));
    await until(() => text().includes('1,214 places'), 'the result');
    expect(seen.some((t) => t.includes(W.appTripProgress(2, 6, W.appTripStepPlaces)))).toBe(true);
    expect(seen.some((t) => t.includes(W.appPrepHeightsNotice))).toBe(true);
    expect(text()).toContain('1,214 places (map data of 25 Oct), weather to Friday (fetched 2 h ago)');
    expect(button(W.appTripUpdateButton)).toBeDefined();
    expect(text()).toContain(W.appTripFlightMode);
    // The steps that went through name the data saved, the same right after the run as after a reload: "Saving" is not one.
    const ok = [...host.querySelectorAll('p.muted')].find((p) => p.textContent?.startsWith(W.appTripStepsOk))!.textContent!;
    expect(ok).not.toContain(W.appTripStepSave);
  });

  test('[TRIP-GETREADY] a failed step shows what is not saved, a retry, and nothing is hidden or disabled', async () => {
    const fake = preparing((id) => {
      void id;
      return allOk().map((r) => (r.step === 'weather' ? { ...r, ok: false, note: W.appPrepWeatherFailed } : r.step === 'places' ? { ...r, ok: false, note: W.appPrepStorageFull(6, 14) } : r));
    }, { places: 0 });
    await show(services(fake));
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-getready]') !== null, 'Prepare this route');
    await click(button(W.appTripGetReadyButton));
    await until(() => text().includes(W.appPrepWeatherFailed), 'the failed step');
    expect(text()).toContain(W.appPrepStorageFull(6, 14));
    expect(text()).toContain(W.appTripMissingHeading);
    expect(text()).toContain(TR.appTripPartial);
    expect(text()).toContain(W.appTripNoPlaces);
    const retry = button(W.appTripRetryButton);
    expect(retry.disabled).toBe(false);
    for (const b of host.querySelectorAll('button')) expect(b.disabled, b.textContent ?? '').toBe(false);
    expect(host.querySelector('[hidden]')).toBeNull();
  });

  test('[TRIP-GETREADY] a Prepare this route that throws is told as "this could not be saved", and the screen keeps working', async () => {
    await show(services({ prepare: () => Promise.reject(new Error('boom')) }));
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-getready]') !== null, 'Prepare this route');
    await click(button(W.appTripGetReadyButton));
    await until(() => text().includes(W.appPrepSaveFailed), 'the sentence');
    expect(button(W.appTripGetReadyButton).disabled).toBe(false);
  });

  test('[TRIP-NOT-READY-WORD] no string on Trip calls the trip ready, safe or complete; "Prepare this route" is the only use of "ready"', async () => {
    const trip = Object.entries(W).filter(([k]) => k.startsWith('appTrip') || k.startsWith('appAb'));
    expect(trip.length).toBeGreaterThan(40);
    const samples = (v: unknown): string[] => {
      if (typeof v === 'string') return [v];
      if (typeof v !== 'function') return [];
      const f = v as (...a: never[]) => unknown;
      const args: unknown[][] = [['a'], ['a', 'b'], ['a', 'b', 'c'], [1], [1, 2], [1, 2, 'c'], [null], ['1'], ['1', null]];
      const out: string[] = [];
      for (const a of args) {
        try {
          const s = f(...(a as never[]));
          if (typeof s === 'string') out.push(s);
        } catch {
          // wrong shape of arguments for this template
        }
      }
      return out;
    };
    for (const [key, value] of trip) {
      for (const s of samples(value)) {
        expect(bannedHits(s), `${key}: ${s}`).toEqual([]);
        expect(/\b(ready|safe|complete|completed|done|finished)\b/i.test(s.replace(/Prepare this route/gi, '')), `${key}: ${s}`).toBe(false);
        expect(/\bprepared\b/i.test(s), `${key}: ${s}`).toBe(false);
      }
    }
    // And on the screen, in each state it can be in.
    await show();
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-getready]') !== null, 'Prepare this route');
    expect(text().replace(/Prepare this route/gi, '')).not.toMatch(/\b(ready|safe|complete)\b/i);
  });

  test('[TRIP-IPHONE] on an iPhone in a browser tab, before the first download, Trip asks to add the app to the home screen; in the installed app, or where the page can\'t tell, it does not', async () => {
    const tab = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', maxTouchPoints: 5, platform: 'iPhone', standalone: false };
    expect(askForHomeScreen(tab)).toBe(true);
    expect(askForHomeScreen({ ...tab, standalone: true })).toBe(false);
    expect(askForHomeScreen({ ...tab, standalone: null })).toBe(false);
    expect(askForHomeScreen({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5, platform: 'MacIntel', standalone: false })).toBe(true);
    expect(askForHomeScreen({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5, platform: 'Linux armv8l', standalone: false })).toBe(false);

    const base = services();
    const iphone = services({ env: { ...base.env, ...tab } });
    await show(iphone);
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-getready]') !== null, 'Prepare this route');
    expect(text()).toContain(TR.appTripIphoneAsk);
    expect(button(W.appTripGetReadyButton).disabled).toBe(false);
    // Once something is saved the ask is not repeated.
    render(null, host);
    await show(services({ env: { ...base.env, ...tab }, ...preparing(allOk, { places: 3 }) }));
    await click(button(W.appTripGetReadyButton));
    await until(() => text().includes('3 places'), 'the result');
    expect(text()).not.toContain(TR.appTripIphoneAsk);
    render(null, host);
    await show(services({ env: { ...base.env, ...tab, standalone: true } }));
    expect(text()).not.toContain(TR.appTripIphoneAsk);
  });

  test('[TRIP-INSTALL] Android\'s install offer gives an Install button that asks the browser; without an offer there is none', async () => {
    await show();
    expect(text()).not.toContain(W.appTripInstall);
    let asked = 0;
    const offer = Object.assign(new Event('beforeinstallprompt'), { prompt: () => { asked += 1; return Promise.resolve({ outcome: 'accepted' }); } });
    await act(async () => { installOffer.value = offer; });
    expect(button(W.appTripInstall)).toBeDefined();
    await click(button(W.appTripInstall));
    expect(asked).toBe(1);
    expect(text()).not.toContain(W.appTripInstall);
  });

  test('[TRIP-ATTRIBUTION] the credit is a link to the OpenStreetMap copyright page with the pack date; with no source date it says the build date honestly; Licences is one tap away', async () => {
    await show(services(preparing(allOk, { places: 2, sourceDate: '2026-10-25' })));
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-getready]') !== null, 'Prepare this route');
    await click(button(W.appTripGetReadyButton));
    await until(() => text().includes('map data of 25 Oct'), 'the credit');
    const credit = [...host.querySelectorAll('[data-summary] a')].find((a) => a.textContent === '© OpenStreetMap contributors')!;
    expect(credit.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright');
    expect(host.querySelector('[data-summary]')!.textContent).toContain('map data of 25 Oct');
    const licences = [...host.querySelectorAll('a')].find((a) => a.textContent === W.appTripLicences)!;
    // The licences page itself, a page of the site the worker precaches (owner's device check, 5 Nov: #/you/legal showed only "You").
    expect(licences.getAttribute('href')).toBe('/legal/licences/');
    render(null, host);
    await show(services(preparing(allOk, { places: 2 })));
    await openStep('getready');
    await click(button(/^(Update|Prepare this route)$/));
    await until(() => text().includes('map data from 28 Oct'), 'the build date');
    expect(text()).not.toContain('map data of');
  });
});

describe('The bike on Trip (spec section 3.7)', () => {
  test('[BK-WHERE-TRIP] the bike is the first thing on Trip, drawn with its bags and its caption', async () => {
    // A new rider gets the first-run card in its place (wish 17, owner's answers of 9 Nov 2026: HINT-NEW); this is today's line.
    localStorage.setItem('copilot:bikeHint:v1', 's');
    await show();
    const first = host.querySelector('[data-trip-loaded]')!.firstElementChild!;
    expect(first.querySelector('svg.bk')).not.toBeNull();
    expect(first.querySelector('figcaption')).not.toBeNull();
    expect(first.querySelector('a[href^="/tools/bags/#bike-details="][href*="back=trip"]')).not.toBeNull();
  });
});

describe('Plan from A to B on Trip (spec section 7.1)', () => {
  const COORDS: Record<string, [number, number]> = { Heidelberg: [49.4, 8.69], Strasbourg: [48.58, 7.75] };
  const LINE: [number, number][] = Array.from({ length: 400 }, (_, i) => {
    const t = i / 399;
    return [8.69 + (7.75 - 8.69) * t + Math.sin(i / 7) * 0.01 * (i === 0 || i === 399 ? 0 : 1), 49.4 + (48.58 - 49.4) * t + Math.cos(i / 9) * 0.01 * (i === 0 || i === 399 ? 0 : 1)];
  });

  /** Place search and routers as recorded; `routers` false makes every router refuse. */
  function network(routers: boolean): { fetch: typeof fetch; urls: string[] } {
    const urls: string[] = [];
    const fetchStub = ((input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      if (url.startsWith('https://geocoding-api.open-meteo.com/')) {
        const name = new URL(url).searchParams.get('name') ?? '';
        const at = COORDS[name];
        return json({ results: at ? [{ id: 1, name, country: 'Europe', latitude: at[0], longitude: at[1] }] : [] });
      }
      if (routers && url.startsWith('https://routing.openstreetmap.de/')) return json({ code: 'Ok', routes: [{ geometry: { coordinates: LINE } }] });
      return Promise.resolve(new Response('no', { status: 503 }));
    }) as typeof fetch;
    return { fetch: fetchStub, urls };
  }

  async function type(id: string, value: string): Promise<void> {
    const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
    await act(async () => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  }
  async function choose(id: string, value: string): Promise<void> {
    await type(id, value);
    await until(() => [...host.querySelectorAll('button.hit')].some((b) => b.textContent?.startsWith(value)), `a hit for ${value}`);
    await click([...host.querySelectorAll('button.hit')].find((b) => b.textContent?.startsWith(value))!);
  }

  test('[AB-SEARCH] two searches find the places, only the typed words leave, and Plan the route makes a planned route with the whole line', async () => {
    const net = network(true);
    await show(services({ fetch: net.fetch }));
    await choose('ab-from', 'Heidelberg');
    await choose('ab-to', 'Strasbourg');
    expect(net.urls.every((u) => new URL(u).origin === 'https://geocoding-api.open-meteo.com')).toBe(true);
    expect(net.urls.map((u) => new URL(u).searchParams.get('name'))).toEqual(['Heidelberg', 'Strasbourg']);
    expect(net.urls.join(' ')).not.toMatch(/49\.4|8\.69/);
    await click(button(W.appAbPlan));
    await until(() => host.querySelector('[data-summary]') !== null, 'the summary');
    const trip = (await readTrip())!;
    expect(trip.route.name).toBe(W.appAbName('Heidelberg', 'Strasbourg'));
    expect(trip.route.source).toBe('planned');
    expect(trip.route.points).toHaveLength(400);
    expect(text()).toContain(TR.appTripHeightsPending);
  });

  test('[AB-FULL-GEOMETRY] with a route already stored, a planned one asks before it replaces it', async () => {
    const net = network(true);
    await show(services({ fetch: net.fetch }));
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-summary]') !== null, 'the first route');
    const before = (await readTrip())!.route.id;
    await openStep('route');
    await until(() => host.querySelector('#ab-from') !== null, 'Plan from A to B in the Route step');
    await choose('ab-from', 'Heidelberg');
    await choose('ab-to', 'Strasbourg');
    await click(button(W.appAbPlan));
    await until(() => host.querySelector('[data-replace]') !== null, 'the question');
    expect((await readTrip())!.route.id).toBe(before);
    await click(button(W.appTripReplaceCancel));
    expect((await readTrip())!.route.id).toBe(before);
  });

  test('[AB-NONE] when no bike router answers, Trip says so and asks for a GPX; nothing is stored and the file picker stays', async () => {
    const net = network(false);
    await show(services({ fetch: net.fetch }));
    await choose('ab-from', 'Heidelberg');
    await choose('ab-to', 'Strasbourg');
    await click(button(W.appAbPlan));
    await until(() => text().includes(TR.appAbNone), 'the sentence');
    expect(await readTrip()).toBeNull();
    expect(host.querySelector('[data-add-route] input[type=file]')).not.toBeNull();
    expect(net.urls.some((u) => /routed-(foot|car)|project-osrm|profile=(car|foot)/.test(u))).toBe(false);
  });

  test('[AB-SEARCH] an address search shows each hit with street, kind, postcode and town as a labelled list of buttons, with the OpenStreetMap credit', async () => {
    const feature = (city: string, postcode: string) => ({ type: 'Feature', properties: { housenumber: '12', street: 'Hauptstraße', postcode, city, country: 'Germany', osm_key: 'building', osm_value: 'yes' }, geometry: { type: 'Point', coordinates: [8.69, 49.4] } });
    const fetchStub = ((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://photon.komoot.io/')) return Promise.resolve(new Response(JSON.stringify({ features: [feature('Heidelberg', '69117'), feature('Wiesloch', '69168')] }), { status: 200 }));
      return Promise.resolve(new Response('no', { status: 503 }));
    }) as typeof fetch;
    await show(services({ fetch: fetchStub }));
    await type('ab-from', 'Hauptstraße 12');
    await until(() => host.querySelectorAll('button.hit').length === 2, 'two hits');
    const list = host.querySelector('ul.hits')!;
    expect(list.getAttribute('aria-label')).toBe(`${TR.appAbList}: ${TR.appAbFrom}`);
    const hits = [...host.querySelectorAll('button.hit')].map((b) => b.textContent);
    expect(hits[0]).toContain('Hauptstraße 12');
    expect(hits[0]).toContain('69117 Heidelberg');
    expect(hits[1]).toContain('69168 Wiesloch');
    expect(host.querySelector('[role=status]')?.textContent).toContain(TR.appAbPick);
    expect(host.querySelector('a[href="https://www.openstreetmap.org/copyright"]')).not.toBeNull();
    await click(host.querySelector('button.hit')!);
    expect(text()).toContain('69117 Heidelberg');
  });

  test('[AB-SEARCH] nothing found and a failing search each say so in words, and a failed search is not "nothing found"', async () => {
    const net = network(true);
    await show(services({ fetch: net.fetch }));
    await type('ab-from', 'Nowhereville');
    await until(() => text().includes(TR.appAbNoResults), 'no results');
    const down = ((): Promise<Response> => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    await show(services({ fetch: down }));
    await type('ab-from', 'Heidelberg');
    await until(() => text().includes(TR.appAbSearchFailed), 'the failure');
    expect(text()).not.toContain(TR.appAbNoResults);
  });
});

describe('What the review of group 5 found', () => {
  test('[TRIP-GETREADY] a replaced route shows none of the old route results: no steps list, no retry, the first-time button', async () => {
    const fake = preparing(() => allOk().map((r) => (r.step === 'weather' ? { ...r, ok: false, note: W.appPrepNoConnection } : r)), { places: 5 });
    await show(services(fake));
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-getready]') !== null, 'Prepare this route');
    await click(button(W.appTripGetReadyButton));
    await until(() => text().includes(W.appTripMissingHeading), 'the first run');
    await pick(await fixtureGpx('alpine-pass'));
    await until(() => host.querySelector('[data-replace]') !== null, 'the question');
    await click(button(W.appTripReplaceYes));
    await until(() => text().includes('Altdorf'), 'the new route');
    await settle(30);
    expect(text()).not.toContain(W.appTripStepsOk);
    expect(text()).not.toContain(W.appTripMissingHeading);
    expect(text()).toContain(W.appTripNothingSaved);
    expect(button(W.appTripGetReadyButton)).toBeDefined();
  });

  test('[TRIP-SUMMARY] a setting changed during Get ready is not overwritten by a heights step that planned with the old pace', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => { release = r; });
    const svc = services({
      prepare: async () => {
        const trip = (await readTrip())!;
        const old = planned(trip.route, { flatKph: trip.flatKph, pace: trip.pace ?? 'sporting', nights: null });
        await held;
        // What heightsStep does at its end, through the store Trip hands to Get ready.
        await svc.prepareStore!(preparedStore).saveTrip({ ...(await readTrip())!, route: old });
        return [];
      },
    });
    await show(svc);
    await pick(await fixtureGpx('multi-day-800'));
    await until(() => host.querySelector('[data-summary]') !== null, 'the summary');
    await openDetails();
    const run = svc.prepare(() => undefined, () => undefined);
    await act(async () => { host.querySelector<HTMLInputElement>('input[name=pace][value=steady]')!.click(); });
    await settle(150);
    release();
    await run;
    await settle(50);
    const trip = (await readTrip())!;
    const expected = planStages(trip.route, { flatKph: trip.flatKph, pace: 'steady', nights: planStages(trip.route, { flatKph: trip.flatKph, pace: 'steady', nights: 0 }).suggestedNights });
    expect(trip.pace).toBe('steady');
    expect(trip.route.stages.map((s) => Math.round(s.endKm))).toEqual([...expected].map((s) => Math.round(s.endKm)));
    expect(host.querySelectorAll('[data-summary] ol li')).toHaveLength(expected.length);
  });

  test('[TRIP-GETREADY] a forecast that has ended is said to have ended, with its own fetch time', async () => {
    const stale = preparing(allOk, { places: 12, weatherTo: new Date('2026-10-04T12:00:00Z'), fetchedAt: new Date('2026-09-28T08:00:00Z'), at: NOW });
    await show(services(stale));
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-getready]') !== null, 'Prepare this route');
    await click(button(W.appTripGetReadyButton));
    await until(() => text().includes('12 places'), 'the line');
    expect(text()).toContain('forecast ended Sunday');
    expect(text()).toContain('fetched 12 days ago');
    expect(text()).not.toContain('weather to Sunday');
    expect(text()).not.toMatch(/updated just now/);
  });

  test('[TRIP-ATTRIBUTION] the search results carry the linked credit before anything is saved; a route that came from a file does not', async () => {
    const f = ((input: string | URL | Request) => {
      if (String(input).startsWith('https://geocoding-api.open-meteo.com/')) return Promise.resolve(new Response(JSON.stringify({ results: [{ id: 1, name: 'Heidelberg', latitude: 49.4, longitude: 8.69 }] }), { status: 200 }));
      return Promise.resolve(new Response('no', { status: 503 }));
    }) as typeof fetch;
    await show(services({ fetch: f }));
    const input = host.querySelector<HTMLInputElement>('#ab-from')!;
    await act(async () => { input.value = 'Heidelberg'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await until(() => host.querySelector('button.hit') !== null, 'a hit');
    // Open-Meteo's geocoding answers from GeoNames (CC BY 4.0): that is the credit, not OpenStreetMap's
    const link = host.querySelector<HTMLAnchorElement>('[data-plan-ab] a[href="https://www.geonames.org/"]');
    expect(link?.textContent).toBe('GeoNames');
    expect(link!.parentElement!.textContent).toBe('Place names: GeoNames, CC BY 4.0.');
    expect(host.querySelector('[data-plan-ab] a[href="https://www.openstreetmap.org/copyright"]')).toBeNull();
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-summary]') !== null, 'the route');
    expect(host.querySelector('[data-summary] a[href="https://www.openstreetmap.org/copyright"]')).toBeNull();
  });

  test('[TRIP-ATTRIBUTION] a route planned from A to B carries the linked credit on its summary', async () => {
    const trip = await (async () => {
      await show();
      await pick(await fixtureGpx('loop'));
      await until(() => host.querySelector('[data-summary]') !== null, 'the route');
      return (await readTrip())!;
    })();
    const { saveTrip } = await import('../../../src/store/trip.ts');
    await saveTrip({ ...trip, route: { ...trip.route, source: 'planned' } });
    await show(services());
    expect(host.querySelector('[data-summary] a[href="https://www.openstreetmap.org/copyright"]')?.textContent).toBe('© OpenStreetMap contributors');
  });

  test('[TRIP-REPLACE-ASKS] the same line again, once its heights were looked up, is the route you already have: nothing asks, nothing is wiped', async () => {
    await show();
    await pick(await fixtureGpx('loop', { heights: false }));
    await until(() => host.querySelector('[data-summary]') !== null, 'the route');
    const trip = (await readTrip())!;
    const { saveTrip } = await import('../../../src/store/trip.ts');
    await saveTrip({ ...trip, route: { ...trip.route, hash: 'with-heights', id: 'route-with-heights', ascentM: 10, points: trip.route.points.map((p) => ({ ...p, ele: 100 })) } });
    await pick(await fixtureGpx('loop', { heights: false }));
    await until(() => text().includes(W.appTripSameRoute), 'the note');
    expect(host.querySelector('[data-replace]')).toBeNull();
  });

  test('[TRIP-REPLACE-ASKS] the question says exactly what is removed and what stays, and a bad file does not drop it', async () => {
    await withRoute('loop');
    await pick(await fixtureGpx('alpine-pass'));
    await until(() => host.querySelector('[data-replace]') !== null, 'the question');
    const body = host.querySelector('[data-replace]')!.textContent!;
    expect(body).toContain('departure date');
    expect(body).toContain('nights');
    expect(body).toContain('pace, speed, start time, stay and camp water stay');
    await pick('not a gpx');
    await until(() => text().includes(W.routeGpxUnreadable), 'the refusal');
    expect(host.querySelector('[data-replace]')).not.toBeNull();
  });

  test('[TRIP-REPLACE-ASKS] a replace is refused if the route stored is not the one the question named', async () => {
    const svc = await withRoute('loop');
    const found = await routeFromGpx(await fixtureGpx('alpine-pass'), 'a.gpx', svc.parseXml);
    const other = await routeFromGpx(await fixtureGpx('loop'), 'b.gpx', svc.parseXml);
    await expect(svc.addRoute(found, { ...other.route, points: other.route.points.slice(1) })).rejects.toThrow(W.appStoreChangedElsewhere);
    expect((await readTrip())!.route.name).toContain('Heilbronn');
    await expect(svc.addRoute(found, null)).rejects.toThrow(W.appStoreChangedElsewhere);
  });

  test('[TRIP-REPLACE-ASKS] the heights step giving the stored route a new id is not "changed in another window": the line is the same', async () => {
    const svc = await withRoute('loop');
    const asked = (await readTrip())!.route;
    const { saveTrip } = await import('../../../src/store/trip.ts');
    // what Get ready's heights step does in this window: the same line, with heights, under a new id
    await saveTrip({ ...(await readTrip())!, route: { ...asked, id: 'route-with-heights', points: asked.points.map((p) => ({ ...p, ele: 100 })) } });
    const found = await routeFromGpx(await fixtureGpx('alpine-pass'), 'a.gpx', svc.parseXml);
    await expect(svc.addRoute(found, asked)).resolves.toMatchObject({ kind: 'replaced' });
  });

  test('[AB-NONE] a planned line the route building will not take says why, not that no router answered', async () => {
    const far: [number, number][] = [[8.69, 49.4]];
    for (let i = 0; i < 6; i += 1) far.push([-100, -40], [8.7, 49.41]);
    far.push([7.75, 48.58]);
    const f = ((input: string | URL | Request) => {
      const url = String(input);
      const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200 }));
      if (url.startsWith('https://geocoding-api.open-meteo.com/')) {
        const name = new URL(url).searchParams.get('name')!;
        return json({ results: [{ id: 1, name, latitude: name === 'Heidelberg' ? 49.4 : 48.58, longitude: name === 'Heidelberg' ? 8.69 : 7.75 }] });
      }
      return json({ code: 'Ok', routes: [{ geometry: { coordinates: far } }] });
    }) as typeof fetch;
    await show(services({ fetch: f }));
    for (const [id, name] of [['ab-from', 'Heidelberg'], ['ab-to', 'Strasbourg']] as const) {
      const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
      await act(async () => { input.value = name; input.dispatchEvent(new Event('input', { bubbles: true })); });
      await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      await until(() => host.querySelector('button.hit') !== null, 'a hit');
      await click(host.querySelector('button.hit')!);
    }
    await click(button(W.appAbPlan));
    await until(() => text().includes(W.routeTrackTooLong), 'the reason');
    expect(text()).not.toContain(TR.appAbNone);
  });
});

describe('Trip and the database', () => {
  test('[ST-DELETE] opening Trip with no data stored creates no database: a window that is open while the rider deletes its data does not bring it back', async () => {
    await show();
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain('copilot');
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-summary]') !== null, 'the route');
    expect((await indexedDB.databases()).map((d) => d.name)).toContain('copilot');
  });
});

describe('Messages that must not be lost', () => {
  test('[TRIP-SETTINGS] a setting that was kept but whose days could not be updated shows that sentence, though the write was accepted', async () => {
    await withRoute();
    const real = services();
    const svc = { ...real, writeSettings: () => Promise.resolve({ ok: true, reasons: {}, note: W.appTripReplanFailed }) };
    await show(svc);
    await openDetails();
    await click(host.querySelector<HTMLInputElement>('input[name=pace][value=hard]')!);
    await until(() => text().includes(W.appTripReplanFailed), 'the sentence');
  });

  test('[TRIP-REPLACE-ASKS] a route that was replaced whose date was not saved says so, and does not say the route is unchanged', async () => {
    const real = await withRoute('loop');
    const svc = { ...real, addRoute: (found: Parameters<TripServices['addRoute']>[0], old: Parameters<TripServices['addRoute']>[1]) => real.addRoute(found, old).then((o) => ({ ...o, dateNotSaved: true as const })) };
    await show(svc);
    await pick(await fixtureGpx('alpine-pass'));
    await until(() => host.querySelector('[data-replace]') !== null, 'the question');
    await click(button(W.appTripReplaceYes));
    await until(() => text().includes(W.appTripReplacedNoDate('Fixture: Altdorf over the Gotthard to Bellinzona')), 'the sentence');
    expect(text()).not.toContain(W.appTripUnchanged);
  });
});

describe('Plan bags for this trip (Contract 2)', () => {
  test('[C-HANDOFF] with a route, Trip offers to plan bags for it; a tap hands the trip over, and a refusal is said in words', async () => {
    let calls = 0;
    let answer: { ok: true; id: string } | { ok: false; reason: string } = { ok: false, reason: W.appHandoffStorageFull };
    await show(services({ handOff: async () => { calls += 1; return answer; } }));
    expect(host.querySelector('[data-handoff]')).toBeNull(); // no route, nothing to hand over
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-summary]') !== null, 'the route');
    await openStep('bags');
    await until(() => host.querySelector('[data-handoff]') !== null, 'the button');
    expect(text()).toContain(W.appHandoffNote);
    await click(button(W.appHandoffButton));
    await until(() => text().includes(W.appHandoffStorageFull), 'the reason');
    expect(calls).toBe(1);
    answer = { ok: true, id: 'a'.repeat(32) };
    await click(button(W.appHandoffButton));
    await until(() => !text().includes(W.appHandoffStorageFull), 'the reason gone');
    expect(calls).toBe(2);
    expect(bannedHits(`${W.appHandoffButton} ${W.appHandoffNote} ${W.appHandoffNoRoute} ${W.appHandoffTooManyPoints} ${W.appHandoffTooLarge} ${W.appHandoffStorageFull} ${W.appHandoffNotKept}`)).toEqual([]);
  });
});
