// @vitest-environment jsdom
// The You screen on the real store (fake IndexedDB), with a fixed clock (spec sections 3.5, 6.3 and 7.1).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import full from '../../../contracts/load-summary/full.json';
import sample from '../../../contracts/bike-library/sample.json';
import { W } from '../../../src/core/wording/en.ts';
import { Y } from '../../../src/core/wording/en-you.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb, openDb } from '../../../src/store/db.ts';
import { readProfile } from '../../../src/store/profile.ts';
import { readSettings } from '../../../src/store/settings.ts';
import { readTrip, saveTrip } from '../../../src/store/trip.ts';
import { readRides } from '../../../src/store/you.ts';
import { markPrepared } from '../../../src/store/weather.ts';
import { browserServices } from '../../../src/tools/tyre/services.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { loadRiderKg, riderKg } from '../../../src/ui/rider-kg.ts';
import { browserTripServices } from '../../../src/ui/trip/services.ts';
import { TripScreen } from '../../../src/ui/trip/trip.tsx';
import { browserYouServices } from '../../../src/ui/you/services.ts';
import type { YouServices } from '../../../src/ui/you/services.ts';
import { YouScreen } from '../../../src/ui/you/you.tsx';
import { testTrip } from '../../fixtures/build.ts';

vi.setConfig({ testTimeout: 30_000 });
const host = document.createElement('div');
document.body.append(host);
const NOW = new Date('2026-10-10T09:00:00Z');
const bikes = sample.slice(0, 2);

beforeEach(async () => {
  render(null, host);
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  refreshBikeSource();
  await loadRiderKg();
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
const went: string[] = [];
const saved: { name: string; text: string }[] = [];

function services(over: Partial<YouServices> = {}): YouServices {
  return { ...browserYouServices(() => NOW, (href) => { went.push(href); }), save: (name, content) => { saved.push({ name, text: content }); }, ...over };
}

async function show(svc: YouServices = services()): Promise<YouServices> {
  act(() => render(null, host));
  await act(async () => { render(<YouScreen services={svc} />, host); });
  await until(() => host.querySelector('[data-you-loaded]') !== null, 'You to load');
  return svc;
}

const field = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)!;
async function type(el: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle(30);
}
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await settle(10); };
const button = (name: string | RegExp): HTMLButtonElement => {
  const found = [...host.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? '')));
  if (!found) throw new Error(`no button ${String(name)}`);
  return found;
};
const radio = (name: string, value: string) => host.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!;

function putBikes(planId: string | null): void {
  localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify(bikes));
  if (planId) localStorage.setItem('loadcheck:bikeProfile', JSON.stringify(bikes.find((b) => b.id === planId) ?? { ...bikes[0], id: planId, name: 'Unsaved tourer' }));
  localStorage.setItem('loadcheck:summary:v1', JSON.stringify({ ...full, bikeId: planId }));
  refreshBikeSource();
}

describe('Rider and water you can carry (spec section 3.5)', () => {
  test('[YOU-RIDER] weight, flat speed, thirst, e-bike and units are saved as they change', async () => {
    await show();
    await type(field('you-weight'), '82');
    await type(field('you-kph'), '28');
    await click(radio('thirst', 'more'));
    await click(host.querySelector<HTMLInputElement>('input[name="ebike"]')!);
    await click(radio('units', 'imperial'));
    const profile = await readProfile();
    expect(profile.weightKg).toBe(82);
    expect(profile.thirst).toBe('more');
    expect(profile.k).toBeCloseTo(1.2, 5); // the prior moves with the answer (6.3)
    expect(profile.ebike).toBe(true);
    const settings = await readSettings();
    expect(settings.flatKph).toBe(28);
    expect(settings.units).toBe('imperial');
    // The screen shows what is kept, also from a fresh start.
    await show();
    expect(field('you-weight').value).toBe('82');
    expect(field('you-kph').value).toBe('28');
    expect(radio('thirst', 'more').checked).toBe(true);
    expect(radio('units', 'imperial').checked).toBe(true);
  });

  test('[YOU-RIDER] empty is allowed everywhere: a cleared weight is none, a cleared speed is the default, and nothing is required', async () => {
    await show();
    expect(field('you-weight').value).toBe('');
    await type(field('you-weight'), '82');
    await type(field('you-weight'), '');
    expect((await readProfile()).weightKg).toBeNull();
    await type(field('you-kph'), '31');
    await type(field('you-kph'), '');
    expect((await readSettings()).flatKph).toBe(25);
    await type(field('you-capacity'), '2');
    await type(field('you-capacity'), '');
    expect((await readProfile()).capacityL).toBeNull();
    expect(host.querySelector('[role=alert]')).toBeNull();
  });

  test('[YOU-RIDER] a value out of range is refused with the range named, and the last good value stays', async () => {
    await show();
    await type(field('you-weight'), '82');
    await type(field('you-weight'), '900');
    await until(() => text().includes(W.appStoreWeightRange), 'the refusal');
    expect((await readProfile()).weightKg).toBe(82);
    expect(field('you-weight').value).toBe('82');
    await type(field('you-kph'), '90');
    await until(() => text().includes(W.appStoreFlatKphRange), 'the speed refusal');
    expect((await readSettings()).flatKph).toBe(25);
  });

  test('[YOU-CAPACITY] with a bag plan, its bottle capacity is shown beside the field; without one, it is not', async () => {
    await show();
    expect(host.querySelector('[data-plan-bottles]')).toBeNull();
    await type(field('you-capacity'), '3');
    expect((await readProfile()).capacityL).toBe(3);
    putBikes(bikes[0]!.id);
    await show();
    const note = host.querySelector('[data-plan-bottles]')!;
    expect(note.textContent).toBe(Y.youCapacityPlan('1.25'));
    expect(note.closest('[data-capacity]')!.contains(field('you-capacity'))).toBe(true);
    expect(field('you-capacity').value).toBe('3'); // the rider's own value stays; the engine takes the plan's when it has one
  });

  test('[TY-UI-FROM-YOU] the weight entered in You is what the tyre tool starts from, and a cleared weight goes back to none', async () => {
    const tyre = browserServices(riderKg);
    expect(tyre.host().riderKg).toBeNull();
    await show();
    await type(field('you-weight'), '82');
    expect(tyre.host().riderKg).toBe(82);
    await type(field('you-weight'), '');
    expect(tyre.host().riderKg).toBeNull();
  });
});

describe('Water learning (spec sections 3.5 and 6.3)', () => {
  const report = async (hours: string, drank: string): Promise<void> => {
    if (!host.querySelector('[data-ride-form]')) await click(button(Y.youRideOpen));
    await type(field('ride-hours'), hours);
    await type(field('ride-drank'), drank);
  };

  test('[YOU-WATER-LEARN] the status starts "not calibrated" and rises as rides are logged; the report keeps nothing it cannot read', async () => {
    await show();
    expect(host.querySelector('[data-calibration]')!.textContent).toBe(W.waterNotCalibrated);
    expect(text()).toContain(Y.youLearnNoRides);
    await report('5', '2.5');
    await click(radio('ride-feel', 'B'));
    await click(button(Y.youRideAdd));
    await until(() => host.querySelector('[data-ride-result]') !== null, 'the result');
    expect((await readRides())).toHaveLength(1);
    expect(text()).toContain(Y.youLearnRides(1));
    expect((await readProfile()).sumW).toBeGreaterThan(0);
    // A ride under one hour, or a drink beyond 20 L, is not taken in.
    await report('0.5', '1');
    await click(button(Y.youRideAdd));
    await until(() => text().includes(W.appStoreRideShort), 'the refusal');
    expect(await readRides()).toHaveLength(1);
    await report('4', '30');
    await click(button(Y.youRideAdd));
    await until(() => text().includes(W.appStoreRideIntake), 'the intake refusal');
    expect(await readRides()).toHaveLength(1);
  });

  test('[YOU-WATER-LEARN] the drinking advice reaches the screen: drink to thirst, and a schedule only in heat on a long ride', async () => {
    await show();
    await report('5', '2');
    await click(radio('ride-temp', 'mild'));
    await click(button(Y.youRideAdd));
    await until(() => host.querySelector('[data-ride-result]') !== null, 'the mild result');
    expect(host.querySelector('[data-ride-result]')!.textContent).toContain(W.waterDrinkToThirst);
    expect(host.querySelector('[data-ride-result]')!.textContent).not.toContain('schedule');
    await report('5', '2');
    await click(radio('ride-temp', 'hot'));
    await click(button(Y.youRideAdd));
    await until(() => host.querySelector('[data-ride-result]')?.textContent?.includes(W.waterSaltyFood) === true, 'the hot result');
    expect(host.querySelector('[data-ride-result]')!.textContent).toContain(W.waterGentleSchedule(1).replace('1', '').trim().slice(0, 8));
  });

  test('[YOU-WATER-LEARN] over-drinking is checked in the report: a lot more than the likely loss over a long ride shows the fixed caution; a gain on the scale does too', async () => {
    await show();
    await report('6', '9');
    await click(radio('ride-temp', 'cool'));
    await click(button(Y.youRideAdd));
    await until(() => host.querySelector('[data-ride-result]') !== null, 'the result');
    expect(host.querySelector('[data-over-drinking]')!.textContent).toBe(W.waterOverDrinkCaution);
    await report('6', '1.5');
    await type(field('ride-loss'), '-0.8');
    await click(button(Y.youRideAdd));
    await until(() => host.querySelector('[data-over-drinking]') !== null && text().includes(Y.youLearnRides(2)), 'the gain result');
    expect(host.querySelector('[data-over-drinking]')!.textContent).toBe(W.waterOverDrinkCaution);
    // A modest report shows no caution.
    await report('6', '1.5');
    await click(button(Y.youRideAdd));
    await until(() => text().includes(Y.youLearnRides(3)), 'the third ride');
    expect(host.querySelector('[data-over-drinking]')).toBeNull();
  });
});

describe('Bikes (spec sections 3.5 and 3.7)', () => {
  test('[BK-WHERE-SCREENS] each bike has a small drawing without bags, the plan\'s bike first and marked, Edit and Add go to Bike details with back=you', async () => {
    putBikes(bikes[1]!.id);
    await show();
    const rows = [...host.querySelectorAll('.you-bike')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain(Y.youBikeInPlan);
    expect(rows[0]!.textContent).toContain(bikes[1]!.name);
    expect(rows[1]!.textContent).not.toContain(Y.youBikeInPlan);
    for (const row of rows) {
      expect(row.querySelector('svg.bk')).not.toBeNull();
      expect(row.querySelectorAll('.bk-bag')).toHaveLength(0);
      expect(row.querySelector('.bike-small')).not.toBeNull();
    }
    const edit = rows[0]!.querySelector<HTMLAnchorElement>('a.btn')!;
    expect(edit.getAttribute('href')).toBe(`/tools/bags/#bike-details=${bikes[1]!.id}&back=you`);
    const add = [...host.querySelectorAll('a')].find((a) => a.textContent === Y.youBikeAdd)!;
    expect(add.getAttribute('href')).toBe('/tools/bags/#bike-details=new&back=you');
  });

  test('[BK-WHERE-SCREENS] a plan bike the library does not hold reads "in your plan, not saved"; with no bike at all the list says so and still offers Add', async () => {
    putBikes('bike_unsaved');
    await show();
    expect(host.querySelector('.you-bike')!.textContent).toContain(Y.youBikeInPlanNotSaved);
    localStorage.clear();
    refreshBikeSource();
    await show();
    expect(host.querySelector('[data-bikes]')!.textContent).toContain(Y.youBikesNone);
    expect([...host.querySelectorAll('a')].some((a) => a.textContent === Y.youBikeAdd)).toBe(true);
  });
});

describe('Settings (spec sections 3.5 and 6.6)', () => {
  test('[WXR-TAP-HIDDEN] the shipped (automatic) build shows "Keep trip data fresh when online" on You and it saves; the tap-only build still hides it', async () => {
    const auto = services();
    expect(auto.weatherMode).toBe('auto');
    await show(auto);
    expect(text()).toContain(W.weatherKeepFresh);
    const box = host.querySelector<HTMLInputElement>('input[name="keep-fresh"]')!;
    expect(box.checked).toBe(true);
    await click(box);
    await settle(30);
    expect((await readSettings()).keepFresh).toBe(false);
    await show(services({ weatherMode: 'tap' }));
    expect(text()).not.toContain(W.weatherKeepFresh);
  });

  test('[YOU-RIDER] the theme is kept and put on the page at once', async () => {
    await show();
    await click(radio('theme', 'light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect((await readSettings()).theme).toBe('light');
    await click(radio('theme', 'auto'));
    await until(() => document.documentElement.getAttribute('data-theme') === null, 'the page to follow the phone again');
  });
});

describe('Export and import (spec sections 3.5 and 4.4)', () => {
  async function fullPhone(): Promise<void> {
    await saveTrip(testTrip());
    await markPrepared(testTrip().route.id);
    await show();
    await type(field('you-weight'), '82');
    await click(radio('thirst', 'more'));
  }

  test('[YOU-EXPORT-UI] export hands a file to the browser, with the rider\'s own data and none of the bag planner\'s', async () => {
    saved.length = 0;
    putBikes(bikes[0]!.id);
    await fullPhone();
    await click(button(Y.youExport));
    await until(() => host.querySelector('[data-exported]') !== null, 'the export');
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toBe('wayfinch-data-2026-10-10.json');
    const file = JSON.parse(saved[0]!.text) as { app: string; kind: string; profile: { weightKg: number }; trip: { route: { name: string } } };
    expect(file).toMatchObject({ app: 'copilot', kind: 'export', profile: { weightKg: 82 } });
    expect(saved[0]!.text).not.toContain('loadcheck');
    expect(saved[0]!.text).not.toContain(bikes[0]!.name);
  });

  test('[YOU-EXPORT-UI] import shows what arrives first; Import brings it in, and a route new to this phone asks Trip for Get ready', async () => {
    saved.length = 0;
    await fullPhone();
    await click(button(Y.youExport));
    await until(() => saved.length === 1, 'the file');
    const file = saved[0]!.text;
    // A clean phone.
    closeDb();
    clearCopies();
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    await loadRiderKg();
    await show();
    expect(field('you-weight').value).toBe('');
    const input = field('you-import');
    Object.defineProperty(input, 'files', { value: [new File([file], 'wayfinch.json', { type: 'application/json' })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await until(() => host.querySelector('[data-import-preview]') !== null, 'the preview');
    const preview = host.querySelector('[data-import-preview]')!.textContent!;
    expect(preview).toContain(Y.youImportArrives);
    expect(preview).toContain(Y.youImportRider);
    expect(preview).toContain('km');
    expect(await readTrip()).toBeNull(); // nothing written yet
    expect((await readProfile()).weightKg).toBeNull();
    await click(button(Y.youImportGo));
    await until(() => host.querySelector('[data-imported]') !== null, 'the import');
    expect(host.querySelector('[data-imported]')!.textContent).toContain(Y.youImportNewRoute);
    expect((await readProfile()).weightKg).toBe(82);
    expect((await readTrip())!.route.id).toBe(testTrip().route.id);
    await until(() => field('you-weight').value === '82', 'the screen to show the imported weight');
    // Trip then asks for Get ready on the new route: nothing is marked ready.
    act(() => render(null, host));
    await act(async () => { render(<TripScreen services={browserTripServices(() => NOW)} />, host); });
    await until(() => host.querySelector('[data-getready]') !== null, 'Get ready on Trip');
    expect((await (await openDb()).get('meta', 'route:prepared'))).toBeUndefined();
  });

  test('[YOU-EXPORT-UI] a bad file writes nothing and says why: not JSON, not ours, newer, or damaged inside', async () => {
    await fullPhone();
    const before = JSON.stringify([await readProfile(), await readSettings(), await readTrip()]);
    const attempt = async (content: string, expected: string): Promise<string> => {
      if (host.querySelector('[data-import-preview]')) {
        await click(button(Y.youImportCancel));
        await until(() => host.querySelector('[data-import-preview]') === null, 'the old preview to go');
      }
      const input = field('you-import');
      Object.defineProperty(input, 'files', { value: [new File([content], 'x.json')], configurable: true });
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
      await until(() => host.querySelector('[data-import-preview]') !== null, 'the preview');
      if (host.querySelector('[data-import-preview] .btn-primary')) await click(button(Y.youImportGo));
      await until(() => text().includes(expected), `"${expected}"`);
      return text();
    };
    await attempt('this is not json', Y.youImportUnreadable);
    await attempt(JSON.stringify({ hello: 'world' }), W.appStoreImportNotOurs);
    await attempt(JSON.stringify({ app: 'copilot', kind: 'export', v: 2 }), W.appStoreImportNewer);
    // Right shape, damaged inside: the preview offers it, the store refuses it whole.
    const good = JSON.parse((await (async () => { saved.length = 0; await click(button(Y.youExport)); await until(() => saved.length === 1, 'the file'); return saved[0]!.text; })())) as { profile: Record<string, unknown> };
    good.profile.weightKg = 'heavy';
    await attempt(JSON.stringify(good), W.appStoreImportProfile);
    expect(JSON.stringify([await readProfile(), await readSettings(), await readTrip()])).toBe(before);
  });
});

describe('Delete (spec section 3.5, Contract 3)', () => {
  test('[YOU-DELETE-UI] it asks first and names what goes; Keep my data changes nothing', async () => {
    await saveTrip(testTrip());
    await show();
    await type(field('you-weight'), '82');
    await click(button(Y.youDelete));
    const ask = host.querySelector('[data-delete-ask]')!;
    expect(ask.textContent).toContain(Y.youDeleteGoes);
    expect(ask.textContent).not.toContain(Y.youDeleteBagsGoes); // named only once ticked
    await click(button(Y.youDeleteCancel));
    expect(host.querySelector('[data-delete-ask]')).toBeNull();
    expect((await readProfile()).weightKg).toBe(82);
    expect(await readTrip()).not.toBeNull();
  });

  test('[YOU-DELETE-UI] Delete now removes the co-pilot\'s data and leaves the bag planner\'s, and sends no request', async () => {
    went.length = 0;
    putBikes(bikes[0]!.id);
    await saveTrip(testTrip());
    await show();
    await type(field('you-weight'), '82');
    await click(button(Y.youDelete));
    await click(button(Y.youDeleteConfirm));
    await until(() => text().includes(Y.youDeleted), 'the deletion');
    expect(localStorage.getItem('copilot:delete-request:v1')).toBeNull();
    expect(went).toEqual([]);
    expect(localStorage.getItem('loadcheck:bikeProfiles')).not.toBeNull();
    expect(await readTrip()).toBeNull();
    expect((await readProfile()).weightKg).toBeNull();
    await until(() => field('you-weight').value === '', 'the screen to show the deleted weight');
  });

  test('[YOU-DELETE-UI] "Also delete bag planner data" stores copilot:delete-request:v1, opens the bag planner with its id, and shows the pending line until it is applied', async () => {
    went.length = 0;
    putBikes(bikes[0]!.id);
    await show();
    await click(button(Y.youDelete));
    await click(host.querySelector('input[name="also-bags"]')!);
    expect(host.querySelector('[data-delete-ask]')!.textContent).toContain(Y.youDeleteBagsGoes);
    await click(button(Y.youDeleteConfirm));
    await until(() => host.querySelector('[data-bags-pending]') !== null, 'the pending line');
    const request = JSON.parse(localStorage.getItem('copilot:delete-request:v1')!) as { app: string; kind: string; v: number; id: string; createdAt: string };
    expect(request).toMatchObject({ app: 'copilot', kind: 'delete-request', v: 1 });
    expect(request.id).toMatch(/^[0-9a-f]{32}$/);
    expect(Number.isFinite(Date.parse(request.createdAt))).toBe(true);
    expect(went).toEqual([`/tools/bags/#copilot-delete=${request.id}`]);
    expect(host.querySelector('[data-bags-pending]')!.textContent).toContain(Y.youBagsPending);
    expect(host.querySelector<HTMLAnchorElement>('[data-bags-pending] a')!.getAttribute('href')).toBe(`/tools/bags/#copilot-delete=${request.id}`);
    // The bag planner has not applied it yet, so its data is still here (this app never writes a loadcheck key).
    expect(localStorage.getItem('loadcheck:bikeProfiles')).not.toBeNull();
    // Once the bag planner has written the id, the request goes and the line with it.
    localStorage.setItem('loadcheck:delete-applied', JSON.stringify({ app: 'load-check', kind: 'delete-applied', v: 1, id: request.id, at: NOW.toISOString() }));
    await show();
    expect(host.querySelector('[data-bags-pending]')).toBeNull();
    expect(localStorage.getItem('copilot:delete-request:v1')).toBeNull();
  });
});
