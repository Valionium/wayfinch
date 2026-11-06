// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { screenFromHash, toolHref, toolLinkBike } from '../../../src/ui/nav.ts';

const bike = (id: string) => ({ id, name: id, look: { colour: null, bars: 'drop', ebike: null }, tyres: 'tubeless', frontTyre: '30-622', rearTyre: '30-622', pressure: { wheel: '700c' } });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([bike('b1'), bike('b2')]));
  history.replaceState(null, '', '/');
});
afterEach(() => { localStorage.clear(); history.replaceState(null, '', '/'); vi.resetModules(); });

test('[TB-LINK] a tool address with ?bike=<id> names the bike, and is still that tool', () => {
  expect(toolLinkBike('#/tools/tyre?bike=b2')).toBe('b2');
  expect(screenFromHash('#/tools/tyre?bike=b2', 'trip')).toBe('tools/tyre');
  expect(toolLinkBike('#/tools/tyre')).toBeNull();
  expect(toolLinkBike('#/tools/tyre?bike=a%20b')).toBeNull();
  expect(toolLinkBike('#/tools/tyre?bike=')).toBeNull();
  expect(toolHref('tools/tyre', 'b2')).toBe('#/tools/tyre?bike=b2');
  expect(toolHref('tools/care', 'b 2')).toBe('#/tools/care?bike=b%202');
});

test('[TB-LINK] #/tools/tyre?bike=b2 chooses b2 and leaves #/tools/tyre; an unknown id chooses nothing and falls back', async () => {
  history.replaceState(null, '', '/#/tools/tyre?bike=b2');
  vi.resetModules();
  await import('../../../src/ui/app.tsx');
  await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('copilot:bikeChoice:v1')!)).toMatchObject({ app: 'copilot', kind: 'bike-choice', bikeId: 'b2' }));
  expect(location.hash).toBe('#/tools/tyre');
  expect(location.pathname).toBe('/');

  // An unknown id: the address is cleaned, nothing is written.
  localStorage.removeItem('copilot:bikeChoice:v1');
  history.replaceState(null, '', '/#/tools/tyre?bike=nobody');
  vi.resetModules();
  await import('../../../src/ui/app.tsx');
  await new Promise((r) => setTimeout(r, 50));
  expect(location.hash).toBe('#/tools/tyre');
  expect(localStorage.getItem('copilot:bikeChoice:v1')).toBeNull();
});

test('[TB-LINK] a bike link opened while the app runs (a hash change) is taken the same way', async () => {
  vi.resetModules();
  await import('../../../src/ui/app.tsx');
  history.replaceState(null, '', '/#/tools/tyre?bike=b1');
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await vi.waitFor(() => expect(JSON.parse(localStorage.getItem('copilot:bikeChoice:v1')!)).toMatchObject({ bikeId: 'b1' }));
  expect(location.hash).toBe('#/tools/tyre');
});

test('[TB-LINK] the way back from Bike details can be Bike care or the Gear advisor; anything else still means You', async () => {
  const { bikeDetailsHref } = await import('../../../src/ui/bike/link.ts');
  expect(bikeDetailsHref('b1', 'care')).toBe('/tools/bags/#bike-details=b1&back=care');
  expect(bikeDetailsHref('b1', 'advisor')).toBe('/tools/bags/#bike-details=b1&back=advisor');
  expect(bikeDetailsHref('b1', 'elsewhere' as never)).toBe('/tools/bags/#bike-details=b1&back=you');
});
