// @vitest-environment jsdom
// The guided Trip (design of 8 Nov 2026, part 1): four steps, the trip line, the folded trip details and the message after a route
// is added. On the real store (fake IndexedDB), with a fixed clock and a stand-in for Get ready offline's network work.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { RouteStop } from '../../../src/core/screen/route-stops.ts';
import { W } from '../../../src/core/wording/en.ts';
import type { StepName, StepReport } from '../../../src/data/prepare.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb, openDb } from '../../../src/store/db.ts';
import { savePrepared } from '../../../src/store/prepared.ts';
import { readTrip } from '../../../src/store/trip.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { installOffer } from '../../../src/ui/install.ts';
import { routeDoneLine } from '../../../src/ui/trip/model.ts';
import { browserTripServices } from '../../../src/ui/trip/services.ts';
import type { TripServices } from '../../../src/ui/trip/services.ts';
import { TripScreen } from '../../../src/ui/trip/trip.tsx';
import { fixtureGpx } from '../../fixtures/gpx.ts';

const host = document.createElement('div');
document.body.append(host);
const NOW = new Date('2026-10-10T09:00:00Z');

beforeEach(() => {
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
const step = (name: string) => host.querySelector<HTMLElement>(`[data-step="${name}"]`)!;
const openSteps = () => [...host.querySelectorAll<HTMLElement>('[data-step][data-open]')].map((e) => e.dataset.step);
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const buttonIn = (root: ParentNode, name: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  if (!found) throw new Error(`no button ${name}`);
  return found;
};

const stepNames: StepName[] = ['heights', 'places', 'hours', 'weather', 'baseline', 'save'];
const allOk = (): StepReport[] => stepNames.map((s) => ({ step: s, ok: true, note: null }));

/** A Get ready offline that ends well and leaves what the real one would: places, a forecast and the steps' record. */
function preparing(seen: string[] = []): Partial<TripServices> {
  return {
    prepare: async (onProgress) => {
      const trip = (await readTrip())!;
      for (const s of stepNames) { onProgress(s, 1, 2); await settle(20); seen.push(text()); }
      const db = await openDb();
      for (let i = 0; i < 12; i++) await db.put('places', { id: `node/${i}`, kind: 'water' });
      await db.put('forecast', { fetchedAt: NOW, runs: [], grid: [{ km: 0, lat: 49, lon: 8, hours: [{ at: new Date('2026-10-16T12:00:00Z') }] }], has15: false }, 'current');
      await savePrepared(trip.route.id, { at: NOW, steps: allOk(), build: { id: 'b', builtAt: '2026-10-28', countries: {} }, forecastFetchedAt: null, baselineYears: null });
      return allOk();
    },
  };
}

const services = (over: Partial<TripServices> = {}): TripServices => ({ ...browserTripServices(() => NOW), ...over });

async function show(svc: TripServices = services()): Promise<TripServices> {
  act(() => render(null, host));
  await act(async () => { render(<TripScreen services={svc} />, host); });
  await until(() => host.querySelector('[data-trip-loaded]') !== null, 'Trip to load');
  // Add a route is a chunk of its own, in the open Route step.
  await until(() => host.querySelector('[data-step="route"][data-open]') === null || host.querySelector('[data-add-route]') !== null, 'Add a route');
  return svc;
}

async function pick(content: string): Promise<void> {
  await until(() => host.querySelector('[data-add-route] input[type=file]') !== null, 'the file picker');
  const input = host.querySelector<HTMLInputElement>('[data-add-route] input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [new File([content], 'ride.gpx', { type: 'application/gpx+xml' })], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

async function withRoute(svc?: TripServices): Promise<TripServices> {
  const s = await show(svc);
  await pick(await fixtureGpx('heidelberg-strasbourg'));
  await until(() => host.querySelector('[data-summary]') !== null, 'the summary');
  // Get ready offline's body is a chunk of its own: it opens with its step.
  await until(() => host.querySelector('[data-getready]') !== null, 'Get ready offline');
  return s;
}

describe('Trip as four steps (guided Trip design §2.2)', () => {
  test('[TRIP-STEPS] with no route: Route, Get ready offline, Bags, Go in this order; only Route is open, the others are one grey line each', async () => {
    await show();
    const names = [...host.querySelectorAll<HTMLElement>('[data-step]')].map((e) => e.dataset.step);
    expect(names).toEqual(['route', 'getready', 'bags', 'go']);
    expect(openSteps()).toEqual(['route']);
    expect(step('route').querySelector('[data-add-route] input[type=file]')).not.toBeNull();
    expect(step('getready').dataset.state).toBe('later');
    expect(step('getready').textContent).toContain(W.appTripGetReadyLater);
    expect(step('bags').textContent).toContain(W.appTripBagsLater);
    expect(step('go').textContent).toContain(W.appTripGoLater);
    // Only Get ready and Bags need a route: without one they offer no button.
    expect(step('getready').querySelector('button')).toBeNull();
    expect(step('bags').querySelector('button')).toBeNull();
    expect(host.querySelector('ol[aria-label]')!.getAttribute('aria-label')).toBe(W.appTripStepsLabel);
  });

  test('[TRIP-STEPS] with a route the Route step folds to its line and Change, and the next step opens; tapping a folded step opens it and folds the others', async () => {
    await withRoute();
    const trip = (await readTrip())!;
    expect(step('route').dataset.state).toBe('done');
    expect(step('route').textContent).toContain(routeDoneLine(trip));
    expect(openSteps()).toEqual(['getready']);
    // The order is a suggestion: Bags opens before Get ready offline.
    await click(buttonIn(step('bags'), W.appTripStepBags));
    expect(openSteps()).toEqual(['bags']);
    expect(step('bags').textContent).toContain(W.appHandoffButton);
    const full = [...step('bags').querySelectorAll('a')].find((a) => a.textContent === W.appTripOpenBagPlanner)!;
    expect(full.getAttribute('href')).toBe('/tools/bags/');
    expect(step('getready').querySelector('[data-getready]')).toBeNull();
    // Change on Route opens it again, with the departure date and the nights.
    await click(buttonIn(step('route'), W.appTripStepChange));
    expect(openSteps()).toEqual(['route']);
    await until(() => step('route').querySelector('#trip-date') !== null, 'the date in the Route step');
    expect(step('route').querySelector('#trip-nights')).not.toBeNull();
    await until(() => step('route').querySelector('[data-add-route] input[type=file]') !== null, 'the file picker in the Route step');
    // Go is one tap away too, with the flight-mode line and Open Ahead.
    await click(buttonIn(step('go'), W.appTripStepGo));
    expect(openSteps()).toEqual(['go']);
    expect(step('go').textContent).toContain(W.appTripFlightMode);
    expect([...step('go').querySelectorAll('a')].find((a) => a.textContent === W.appTripOpenAhead)!.getAttribute('href')).toBe('#/ahead');
  });

  test('[TRIP-STEPS] once Get ready offline has run, it folds to what was saved with Update, and Bags is the step that opens', async () => {
    const svc = await withRoute(services(preparing()));
    await click(buttonIn(step('getready'), W.appTripGetReadyButton));
    await until(() => text().includes('12 places'), 'the result');
    // Right after the run the result stays in sight: the step the rider is in does not fold under them.
    expect(openSteps()).toEqual(['getready']);
    // A trip leaving today would be running, and open on Go: this one leaves in ten days.
    await svc.setDeparture('2026-10-20');
    await show(svc);
    expect(step('getready').dataset.state).toBe('done');
    expect(step('getready').textContent).toContain('12 places');
    expect(openSteps()).toEqual(['bags']);
    await click(buttonIn(step('getready'), W.appTripUpdateButton));
    expect(openSteps()).toEqual(['getready']);
    expect(step('getready').querySelector('[data-getready]')).not.toBeNull();
  });

  test('[TRIP-STEPS] during the trip every step is folded and Go is open', async () => {
    const real = services(preparing());
    await withRoute(real);
    await show({ ...real, load: async () => ({ ...(await real.load()), running: true }) });
    expect(openSteps()).toEqual(['go']);
    expect(step('route').dataset.state).toBe('done');
  });
});

describe('The trip line and the trip details (guided Trip design §2.1, §2.2)', () => {
  test('[TRIP-LINE] Trip starts with the trip itself: "No trip yet", then the route and "Starts today"', async () => {
    await show();
    expect(host.querySelector('[data-trip-line]')!.textContent).toContain(W.appTripNoTrip);
    await pick(await fixtureGpx('heidelberg-strasbourg'));
    await until(() => host.querySelector('[data-summary]') !== null, 'the summary');
    const line = host.querySelector('[data-trip-line]')!.textContent!;
    expect(line).toContain((await readTrip())!.route.name);
    expect(line).toContain('Starts today');
    // The bike stays the first thing on Trip; the line comes after it.
    expect(host.querySelector('.trip-main')!.firstElementChild!.classList.contains('trip-bike')).toBe(true);
  });

  test('[TRIP-DETAILS] the trip details are one folded line under the Route step until Trip details opens them; date and nights are not among them', async () => {
    await withRoute();
    const details = host.querySelector<HTMLElement>('[data-trip-details]')!;
    expect(step('route').contains(details)).toBe(true);
    expect(details.textContent).toContain(W.appTripDetailsLine(W.appTripPaceSporting, '25', W.appTripStayCamping, '08:30'));
    expect(host.querySelector('#trip-start')).toBeNull();
    const toggle = buttonIn(details, W.appTripDetails);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await click(toggle);
    await until(() => host.querySelector('#trip-start') !== null, 'the details');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    for (const id of ['#trip-start', '#trip-kph', '#trip-camp', 'input[name=pace]', 'input[name=stay]']) expect(details.querySelector(id), id).not.toBeNull();
    expect(details.querySelector('#trip-date')).toBeNull();
    expect(details.querySelector('#trip-nights')).toBeNull();
    // A change saves as before, and the folded line follows it.
    await click(details.querySelector<HTMLInputElement>('input[name=pace][value=steady]')!);
    await until(() => details.textContent!.includes(W.appTripDetailsLine(W.appTripPaceSteady, '25', W.appTripStayCamping, '08:30')), 'the line to follow');
    expect((await readTrip())!.pace).toBe('steady');
  });
});

describe('The message after a route is added (owner\'s item 2)', () => {
  test('[TRIP-ADDED-NEXT] the message names Get ready offline, says Ahead needs it, and its button runs Get ready offline with its progress', async () => {
    const seen: string[] = [];
    await withRoute(services(preparing(seen)));
    const name = (await readTrip())!.route.name;
    const said = host.querySelector<HTMLElement>('[data-added]')!;
    expect(said.textContent).toContain(W.appTripAdded(name));
    expect(said.textContent).toContain(W.appTripNextGetReady);
    expect(step('getready').contains(said)).toBe(true);
    // The message's button is the step's one Get ready offline button, not a second one.
    expect([...step('getready').querySelectorAll('button')].filter((b) => b.textContent === W.appTripGetReadyButton)).toHaveLength(1);
    await click(buttonIn(said, W.appTripGetReadyButton));
    await until(() => text().includes('12 places'), 'the result');
    expect(seen.some((t) => t.includes(W.appTripProgress(2, 6, W.appTripStepPlaces)))).toBe(true);
  });

  test('[TRIP-ADDED-NEXT] a replaced route says so with the same next step', async () => {
    await withRoute();
    await click(buttonIn(step('route'), W.appTripStepChange));
    await pick(await fixtureGpx('loop'));
    await until(() => host.querySelector('[data-replace]') !== null, 'the question');
    await click(buttonIn(host.querySelector('[data-replace]')!, W.appTripReplaceYes));
    await until(() => host.querySelector('[data-added]') !== null, 'the message');
    const name = (await readTrip())!.route.name;
    expect(host.querySelector('[data-added]')!.textContent).toContain(`${W.appTripReplaced(name)} ${W.appTripNextGetReady}`);
    expect(openSteps()).toEqual(['getready']);
  });
});

describe('The stops on the height profile (guided Trip design §6)', () => {
  const STOPS: RouteStop[] = [
    { kind: 'water', km: 20, opens: 'water', label: 'Brunnen Wiesloch' },
    { kind: 'food', km: 20.5, opens: 'food', label: 'Café Sonne' },
    { kind: 'sleep', km: 80, opens: 'sleep', label: null },
  ];

  test('[TRIP-STOPS] before Get ready offline the profile has no icons and says when they come', async () => {
    let asked = 0;
    await withRoute(services({ stops: async () => { asked += 1; return STOPS; } }));
    const summary = host.querySelector('[data-summary]')!;
    expect(summary.querySelectorAll('[data-profile-stops] button')).toHaveLength(0);
    expect(summary.textContent).toContain(W.appAheadStopsAfter);
    expect(asked).toBe(0);
  });

  test('[TRIP-STOPS] after it, each stop sits on the profile at its km; close ones share a "+N" button; a tap lists them under the profile and opens no card', async () => {
    const svc = await withRoute(services({ ...preparing(), stops: async () => STOPS }));
    await click(buttonIn(step('getready'), W.appTripGetReadyButton));
    await until(() => text().includes('12 places'), 'the result');
    await until(() => host.querySelectorAll('[data-profile-stops] button').length > 0, 'the icons');
    const length = (await readTrip())!.route.lengthKm;
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[data-profile-stops] button')];
    expect(buttons).toHaveLength(2);
    const [pair, sleep] = buttons as [HTMLButtonElement, HTMLButtonElement];
    expect(pair.textContent).toContain(W.appAheadIconMore(1));
    expect(pair.className).toContain('ah-icon-water');
    expect(sleep.className).toContain('ah-icon-sleep');
    expect(parseFloat(sleep.style.left)).toBeCloseTo((80 / length) * 100, 1);
    expect(host.querySelector('[data-stop-list]')).toBeNull();
    const hash = location.hash;
    await click(pair);
    const list = host.querySelector('[data-stop-list]')!;
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      `${W.appAheadIconWater('20')} · Brunnen Wiesloch`, `${W.appAheadIconFood('20.5')} · Café Sonne`,
    ]);
    expect(location.hash).toBe(hash);
    // For screen readers, one list of every stop after the profile, in the strip's own words.
    const all = host.querySelector('[data-stops-all]')!;
    expect([...all.querySelectorAll('li')].map((li) => li.textContent)).toEqual([W.appAheadIconWater('20'), W.appAheadIconFood('20.5'), W.appAheadIconSleep('80')].map((w, n) => (STOPS[n]!.label ? `${w} · ${STOPS[n]!.label}` : w)));
    void svc;
  });

  test('[TRIP-STOPS] the real services read the stops from the store: none for a route with nothing saved, and nothing throws', async () => {
    const svc = await withRoute();
    await expect(svc.stops()).resolves.toEqual([]);
  });
});

describe('What the review of PR 73 found', () => {
  /** A Get ready offline held at its places step until `release`, counting its calls. */
  function gated(): { svc: Partial<TripServices>; calls: () => number; release: () => void } {
    let n = 0;
    let open: () => void = () => undefined;
    const held = new Promise<void>((r) => { open = r; });
    const done = preparing();
    return {
      calls: () => n,
      release: () => open(),
      svc: {
        prepare: async (onProgress, onNotice) => {
          n += 1;
          onProgress('places', 3, 14);
          await held;
          return done.prepare!(onProgress, onNotice);
        },
      },
    };
  }

  test('[TRIP-GETREADY] one run at a time: folding the step mid-run, reopening it and tapping again shows the running progress and starts nothing new', async () => {
    const g = gated();
    await withRoute(services(g.svc));
    await click(buttonIn(step('getready'), W.appTripGetReadyButton));
    await until(() => text().includes(W.appTripProgress(2, 6, W.appTripStepPlaces)), 'the progress');
    await click(buttonIn(step('bags'), W.appTripStepBags));
    expect(openSteps()).toEqual(['bags']);
    // Folded, the step says it is working, not what it will do.
    expect(step('getready').textContent).toContain(W.appTripWorking);
    await click(buttonIn(step('getready'), W.appTripGetReadyTitle));
    await until(() => step('getready').querySelector('[data-getready]') !== null, 'the step again');
    expect(step('getready').textContent).toContain(W.appTripProgress(2, 6, W.appTripStepPlaces));
    for (const b of [...step('getready').querySelectorAll('button')].filter((x) => x.getAttribute('aria-busy') === 'true')) await click(b);
    g.release();
    await until(() => text().includes('12 places'), 'the result');
    expect(g.calls()).toBe(1);
  });

  test('[AH-BEFORE-READY] Trip and Ahead share the one run: started on Trip, Ahead\'s card shows its progress and its button starts nothing new', async () => {
    const g = gated();
    const svc = await withRoute(services(g.svc));
    await click(buttonIn(step('getready'), W.appTripGetReadyButton));
    await until(() => text().includes(W.appTripProgress(2, 6, W.appTripStepPlaces)), 'the progress');
    const { NeedReady } = await import('../../../src/ui/ahead/need-ready.tsx');
    const other = document.createElement('div');
    document.body.append(other);
    let retried = 0;
    const actions = { getReady: svc.prepare, retry: async () => { retried += 1; } } as unknown as Parameters<typeof NeedReady>[0]['actions'];
    await act(async () => { render(<NeedReady actions={actions} failed={[]} />, other); });
    expect(other.textContent).toContain(W.appTripProgress(2, 6, W.appTripStepPlaces));
    await click(other.querySelector('button')!);
    g.release();
    await until(() => text().includes('12 places'), 'the result');
    expect(g.calls()).toBe(1);
    await until(() => retried > 0, 'Ahead reads again');
    act(() => render(null, other));
    other.remove();
  });

  test('[WIDE-DROP] a GPX dropped on Trip goes to the Route step whatever step is open, and asks before it replaces the route', async () => {
    await withRoute();
    expect(openSteps()).toEqual(['getready']);
    const before = (await readTrip())!.route.id;
    // What src/ui/wide/drop.ts does with a file dropped on Trip.
    const zone = host.querySelector<HTMLElement>('[data-trip-drop]')!;
    const file = new File([await fixtureGpx('loop')], 'loop.gpx');
    await act(async () => { zone.dispatchEvent(new CustomEvent('filedrop', { detail: file })); });
    await until(() => host.querySelector('[data-replace]') !== null, 'the question');
    expect(openSteps()).toEqual(['route']);
    expect(step('route').contains(host.querySelector('[data-replace]'))).toBe(true);
    expect((await readTrip())!.route.id).toBe(before);
  });

  test('[WIDE-DROP] a dropped GPX whose replace was cancelled is let go: Change on Route later does not ask again', async () => {
    await withRoute();
    const zone = host.querySelector<HTMLElement>('[data-trip-drop]')!;
    const file = new File([await fixtureGpx('loop')], 'loop.gpx');
    await act(async () => { zone.dispatchEvent(new CustomEvent('filedrop', { detail: file })); });
    await until(() => host.querySelector('[data-replace]') !== null, 'the question');
    await click(buttonIn(host.querySelector('[data-replace]')!, W.appTripReplaceCancel));
    await click(buttonIn(step('bags'), W.appTripStepBags));
    await click(buttonIn(step('route'), W.appTripStepChange));
    await until(() => step('route').querySelector('[data-add-route]') !== null, 'Add a route');
    await settle(100);
    expect(host.querySelector('[data-replace]')).toBeNull();
  });

  test('[TRIP-STEPS] a step opened from the keyboard takes the focus to its heading, for Bags\' title and for Change on Route', async () => {
    await withRoute();
    const bags = buttonIn(step('bags'), W.appTripStepBags);
    bags.focus();
    await click(bags);
    await settle(10);
    expect(step('bags').contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.tagName).toBe('H2');
    const change = buttonIn(step('route'), W.appTripStepChange);
    change.focus();
    await click(change);
    await settle(10);
    expect(step('route').contains(document.activeElement)).toBe(true);
  });

  test('[TRIP-STOPS] the stops are read again after Update weather: a newer forecast can move the cover icons', async () => {
    const svc = await withRoute(services(preparing()));
    await click(buttonIn(step('getready'), W.appTripGetReadyButton));
    await until(() => text().includes('12 places'), 'the result');
    const { RouteSummary } = await import('../../../src/ui/trip/summary.tsx');
    const snap = await svc.load();
    let asked = 0;
    const stops = async (): Promise<RouteStop[]> => { asked += 1; return []; };
    const other = document.createElement('div');
    document.body.append(other);
    await act(async () => { render(<RouteSummary snap={snap} stops={stops} />, other); });
    await settle(10);
    expect(asked).toBe(1);
    await act(async () => { render(<RouteSummary snap={{ ...snap, forecastFetchedAt: new Date(NOW.getTime() + 3_600_000) }} stops={stops} />, other); });
    await settle(10);
    expect(asked).toBe(2);
    act(() => render(null, other));
    other.remove();
  });
});

describe('After the launch, part 4 (the owner\'s preview check of 8 Nov 2026)', () => {
  const goLink = () => [...step('go').querySelectorAll('a')].find((a) => a.textContent === W.appTripOpenAhead) ?? null;

  test('[TRIP-NEED-STEP] the Get ready offline step says En route needs it for as long as it is not done: open, folded, after a reload; then it goes', async () => {
    expect(W.appAheadNeedTitle).toBe('En route needs Get ready offline');
    const svc = await withRoute(services(preparing()));
    expect(step('getready').textContent).toContain(W.appAheadNeedTitle);
    // Not only in the message after the route was added: Trip shown again, without it, still says so.
    await show(svc);
    await until(() => host.querySelector('[data-getready]') !== null, 'Get ready offline');
    expect(host.querySelector('[data-added]')).toBeNull();
    expect(step('getready').textContent).toContain(W.appAheadNeedTitle);
    // Folded under another open step too.
    await click(buttonIn(step('bags'), W.appTripStepBags));
    expect(openSteps()).toEqual(['bags']);
    expect(step('getready').textContent).toContain(W.appAheadNeedTitle);
    await click(buttonIn(step('getready'), W.appTripGetReadyTitle));
    await until(() => step('getready').querySelector('[data-getready]') !== null, 'the step again');
    await click(buttonIn(step('getready'), W.appTripGetReadyButton));
    await until(() => text().includes('12 places'), 'the result');
    await until(() => !step('getready').textContent!.includes(W.appAheadNeedTitle), 'the note to go');
    await show(svc);
    expect(step('getready').textContent).not.toContain(W.appAheadNeedTitle);
  });

  test('[TRIP-NEED-STEP] with no route the step stays one grey line of what it will do', async () => {
    await show();
    expect(step('getready').textContent).toContain(W.appTripGetReadyLater);
    expect(step('getready').textContent).not.toContain(W.appAheadNeedTitle);
  });

  test('[TRIP-GO-LINK] Open En route shows on Go as soon as Get ready offline is done, in the same visit, with Get ready\'s result still open', async () => {
    expect(W.appTripOpenAhead).toBe('Open En route');
    await withRoute(services(preparing()));
    expect(goLink()).toBeNull();
    await click(buttonIn(step('getready'), W.appTripGetReadyButton));
    await until(() => text().includes('12 places'), 'the result');
    expect(openSteps()).toEqual(['getready']);
    await until(() => goLink() !== null, 'Open En route');
    expect(goLink()!.getAttribute('href')).toBe('#/ahead');
    expect(goLink()!.classList.contains('btn')).toBe(true);
    // Only one, also once Go is opened.
    await click(buttonIn(step('go'), W.appTripStepGo));
    expect([...step('go').querySelectorAll('a')].filter((a) => a.textContent === W.appTripOpenAhead)).toHaveLength(1);
  });
});
