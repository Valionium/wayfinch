// @vitest-environment jsdom
// A trip abroad shows the route's own time zone as soon as the route is there, not the phone's until Prepare this route has run (the
// owner's ruling of 15 Nov 2026, reversing sweep #1's "the phone's zone until Prepare"). Prepare's own zone lookup, over the precached
// boundary file, runs from Trip's route summary (a lazy chunk) when a route is added and when Trip opens with a route but no zones
// stored, and stores them as Prepare does. A file that cannot load keeps the phone's zone and says nothing new; a route another window
// has put in meanwhile gets none of the old route's zones, and the trip itself is never written. The phone is in New York, the route
// runs from Heidelberg to Strasbourg (Europe/Berlin, then Europe/Paris). On the real store (fake IndexedDB).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { routeZones } from '../../../src/core/route/zones.ts';
import type { BoundaryFile } from '../../../src/core/route/zones.ts';
import { shortIsoDay, W } from '../../../src/core/wording/en.ts';
import { BOUNDARY_PATH } from '../../../src/data/boundaries.ts';
import { clearCopies } from '../../../src/store/changed.ts';
import { closeDb } from '../../../src/store/db.ts';
import { readInputs } from '../../../src/store/inputs.ts';
import { readStoredZones } from '../../../src/store/prepared.ts';
import { readTrip } from '../../../src/store/trip.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { installOffer } from '../../../src/ui/install.ts';
import { routeFromGpx } from '../../../src/ui/trip/read-gpx.ts';
import { browserTripServices } from '../../../src/ui/trip/services.ts';
import type { TripServices } from '../../../src/ui/trip/services.ts';
import { TripScreen } from '../../../src/ui/trip/trip.tsx';
import { flatRoute } from '../../fixtures/build.ts';
import { fixtureGpx } from '../../fixtures/gpx.ts';

// By its path on disk: Vite would read a URL into the public folder as the site's own address.
const boundaryText = readFileSync(resolve(fileURLToPath(import.meta.url), '../../../../public/data/boundaries.v1.json'), 'utf8');
vi.setConfig({ testTimeout: 20_000 });
const host = document.createElement('div');
document.body.append(host);
const TZ_BEFORE = process.env.TZ;
// 23:30 on 14 July in New York, the phone's zone; already 05:30 on 15 July in Heidelberg.
const NOW = new Date('2026-07-15T03:30:00Z');
const DEPARTS = '2026-07-16';

/** The boundary file as the site serves it, or as `answer` says: held until released, a failure, a refusal. */
let answer: () => Promise<Response> = async () => new Response(boundaryText);
const asked: string[] = [];

beforeEach(() => {
  render(null, host);
  closeDb();
  clearCopies();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  refreshBikeSource();
  installOffer.value = null;
  process.env.TZ = 'America/New_York';
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
  asked.length = 0;
  answer = async () => new Response(boundaryText);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    if (url !== BOUNDARY_PATH) throw new Error(`nothing else may be asked: ${url}`);
    return answer();
  });
});
afterEach(() => { act(() => render(null, host)); vi.unstubAllGlobals(); });
afterAll(() => { if (TZ_BEFORE === undefined) delete process.env.TZ; else process.env.TZ = TZ_BEFORE; });

const settle = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
async function until(check: () => boolean | Promise<boolean>, what: string, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`waited for ${what}`);
    await settle(10);
  }
}
const services = (): TripServices => browserTripServices(() => NOW);
/** Another window on the same store: its own copies of the store's modules, so its reads and writes are its own (as tests/unit/store/helpers.ts). */
async function anotherWindow(): Promise<typeof import('../../../src/store/trip.ts')> {
  vi.resetModules();
  const w = await import('../../../src/store/trip.ts');
  vi.resetModules();
  return w;
}
const tripLine = (): string => host.querySelector('[data-trip-line] span')?.textContent ?? '';
/** What Prepare this route stores for the route: its own lookup over the same file (zonesOfRoute). */
const prepareFinds = async () => routeZones((await readTrip())!.route, JSON.parse(boundaryText) as BoundaryFile);
const zonesStored = async (): Promise<boolean> => (await readStoredZones()).length > 0;

async function show(svc: TripServices = services()): Promise<TripServices> {
  act(() => render(null, host));
  await act(async () => { render(<TripScreen services={svc} />, host); });
  await until(() => host.querySelector('[data-trip-loaded]') !== null, 'Trip to load');
  return svc;
}

/** A trip from before the ruling: the route is there, leaving on 16 July, and no zones are stored. */
async function oldTrip(): Promise<TripServices> {
  const svc = services();
  await svc.addRoute(await routeFromGpx(await fixtureGpx('heidelberg-strasbourg'), 'ride.gpx', svc.parseXml), null);
  expect(await svc.setDeparture(DEPARTS)).toBeNull();
  expect(await zonesStored()).toBe(false);
  return svc;
}

describe('The route\'s own zone before Prepare this route (the owner\'s ruling of 15 Nov 2026)', () => {
  test('[TRIP-LOCAL-ZONE] a route added in another country shows that country\'s zone before Prepare, stored as Prepare stores it', async () => {
    const svc = await show();
    await until(() => host.querySelector('[data-add-route] input[type=file]') !== null, 'the file picker');
    const input = host.querySelector<HTMLInputElement>('[data-add-route] input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [new File([await fixtureGpx('heidelberg-strasbourg')], 'ride.gpx', { type: 'application/gpx+xml' })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await until(zonesStored, 'the route\'s zones');
    // Prepare this route later finds the very same zones; Trip and En route read them at once, though the phone is in New York.
    expect(await readStoredZones()).toEqual(await prepareFinds());
    expect((await svc.load()).zone).toBe('Europe/Berlin');
    expect((await readInputs(NOW))!.routeZones).toEqual(await prepareFinds());
    expect(asked).toEqual([BOUNDARY_PATH]);
  });

  test('[TRIP-LOCAL-ZONE] an old trip with a route but no zones gets them when Trip opens, and the trip line counts the days in Heidelberg', async () => {
    const svc = await oldTrip();
    await show(svc);
    // In Heidelberg it is already 15 July: the trip starts tomorrow (in New York it is still 14 July, two days before).
    await until(() => tripLine() === W.appTripLineStarts(shortIsoDay(DEPARTS)!, 1), 'the trip line in the route\'s zone');
    expect(await readStoredZones()).toEqual(await prepareFinds());
    expect((await svc.load()).zone).toBe('Europe/Berlin');
    // The trip itself is as it was: only the zones were added.
    expect((await readTrip())!.departureDate).toBe(DEPARTS);
  });

  test('[TRIP-LOCAL-ZONE] a boundary file that cannot load (offline before it was precached, a refusal) keeps the phone\'s zone and says nothing new', async () => {
    for (const fail of [async () => { throw new TypeError('Failed to fetch'); }, async () => new Response('gone', { status: 503 })]) {
      act(() => render(null, host));
      closeDb();
      clearCopies();
      globalThis.indexedDB = new IDBFactory();
      asked.length = 0;
      let release: () => void = () => undefined;
      const held = new Promise<void>((r) => { release = r; });
      answer = async () => { await held; return fail(); };
      const svc = await show(await oldTrip());
      await until(() => asked.length > 0 && tripLine() !== '', 'the lookup to start');
      const before = host.textContent;
      expect(tripLine()).toBe(W.appTripLineStarts(shortIsoDay(DEPARTS)!, 2));
      release();
      await settle(50);
      expect(host.textContent).toBe(before);
      expect(await zonesStored()).toBe(false);
      expect((await svc.load()).zone).toBe('America/New_York');
    }
  });

  test('[TRIP-LOCAL-ZONE] a route another window put in while the zones were looked up gets none of the old route\'s, and the trip is never written', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => { release = r; });
    answer = async () => { await held; return new Response(boundaryText); };
    await show(await oldTrip());
    await until(() => asked.length > 0, 'the lookup to start');
    // Another window replaces the route and sets a date for it, while this window's lookup for the old route is still on its way.
    const w2 = await anotherWindow();
    const other = { ...flatRoute(120), id: 'route-other', hash: 'b'.repeat(64) };
    await w2.readTrip();
    await w2.replaceRoute(other);
    const theirs = (await w2.readTrip())!;
    await w2.saveTrip({ ...theirs, departureDate: '2026-08-01' });
    const stored = await w2.readTrip();
    release();
    await settle(50);
    expect(await readStoredZones()).toEqual([]);
    expect(await readTrip()).toEqual(stored);
  });

  test('[TRIP-LOCAL-ZONE] a date another window set while the zones were looked up stays: the lookup writes the zones only, never the trip', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => { release = r; });
    answer = async () => { await held; return new Response(boundaryText); };
    await show(await oldTrip());
    await until(() => asked.length > 0, 'the lookup to start');
    const w2 = await anotherWindow();
    const theirs = (await w2.readTrip())!;
    await w2.saveTrip({ ...theirs, departureDate: '2026-08-01' });
    const stored = await w2.readTrip();
    release();
    await until(zonesStored, 'the route\'s zones');
    expect(await readStoredZones()).toEqual(await prepareFinds());
    expect(await readTrip()).toEqual(stored);
  });
});
