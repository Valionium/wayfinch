// @vitest-environment jsdom
// Emergency never waits on Ahead's which-pass question, not even on its words (review of PR 65, I1): here the which-pass words fail to load, as on a page
// no service worker controls (a first visit, a private window) with no signal or a bad one.
import 'fake-indexeddb/auto';
import { beforeEach, expect, test, vi } from 'vitest';
import { browserAhead } from '../../../src/ui/shell-actions.ts';
import { pointAtKm } from '../../fixtures/build.ts';
import { deps, fakeGeo, freshStore, seedOutAndBack, until } from './ahead-ask-world.ts';

vi.mock('../../../src/core/wording/en-ask.ts', () => { throw new Error('the chunk could not be loaded'); });

beforeEach(freshStore);

test('[AH-EMERGENCY-POSITION] when the which-pass words fail to load, a fix on both passes still shows its coordinates in Emergency at once, and Update position can be tapped again', async () => {
  const i = await seedOutAndBack();
  const geo = fakeGeo();
  const shell = browserAhead(deps({ now: () => i.now, geolocation: () => geo }));
  const stop = shell.start();
  await until(() => shell.view.value.kind === 'trip', 'the screen');
  void shell.actions.updatePosition();
  geo.emit(32);
  const { lat, lon } = pointAtKm(32);
  const coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  await until(() => { const v = shell.view.value; return v.kind === 'trip' && v.screen.chips.emergency.coords === coords; }, 'the fix in Emergency', 2000);
  await until(() => { const v = shell.view.value; return v.kind === 'trip' && v.position.kind !== 'watching'; }, 'the tap free again', 2000);
  // The coordinates stay, and the tap is not held.
  const v = shell.view.value;
  expect(v.kind === 'trip' && v.screen.chips.emergency.coords).toBe(coords);
  expect(v.kind === 'trip' && v.position.kind).not.toBe('watching');
  stop();
});
