// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import full from '../../../contracts/load-summary/full.json';
import sample from '../../../contracts/bike-library/sample.json';
import { bagViewOf } from '../../../src/core/bike/index.ts';
import { normaliseBike } from '../../../src/core/bike/normalise.ts';
import type { LoadSummary } from '../../../src/core/types.ts';
import { App } from '../../../src/ui/app.tsx';
import { BikeDrawing } from '../../../src/ui/bike/drawing.tsx';
import { bikeDetailsHref, openBikeDetails } from '../../../src/ui/bike/link.ts';
import type { BackScreen } from '../../../src/ui/bike/link.ts';
import { refreshBikeSource } from '../../../src/ui/bike/live.ts';
import { BikeMarker } from '../../../src/ui/bike/marker.tsx';
import { go } from '../../../src/ui/nav.ts';
import { ToolsScreen } from '../../../src/ui/tools/tools.tsx';
import { browserServices } from '../../../src/tools/tyre/ui.tsx';

const host = document.createElement('div');
document.body.append(host);
afterEach(() => { act(() => render(null, host)); localStorage.clear(); refreshBikeSource(); });
beforeEach(() => { localStorage.clear(); refreshBikeSource(); });

const bike = normaliseBike(sample[0])!;
const summary = { ...full, bikeId: bike.id } as LoadSummary;
const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };
const show = (node: preact.ComponentChild) => act(() => render(node, host));
const svg = () => host.querySelector('svg.bk');

describe('into Bike details (spec sections 3.7 and 7.1)', () => {
  test('[BK-DEEPLINK] Make it yours and Edit build the exact fragments; back is trip, tools, you or tyre', () => {
    expect(bikeDetailsHref('bike_m2k9x1_4f7a2c9d', 'tools', 'look')).toBe('/tools/bags/#bike-details=bike_m2k9x1_4f7a2c9d&back=tools&section=look');
    expect(bikeDetailsHref('new', 'trip', 'look')).toBe('/tools/bags/#bike-details=new&back=trip&section=look');
    expect(bikeDetailsHref('bike_a', 'you')).toBe('/tools/bags/#bike-details=bike_a&back=you');
    expect(bikeDetailsHref('bike_a', 'tyre')).toBe('/tools/bags/#bike-details=bike_a&back=tyre');
    expect(bikeDetailsHref('bike_a', 'ahead' as BackScreen)).toBe('/tools/bags/#bike-details=bike_a&back=you');
    const went: string[] = [];
    openBikeDetails('bike_a', 'you', undefined, (h) => went.push(h));
    openBikeDetails('new', 'tools', 'look', (h) => went.push(h));
    expect(went).toEqual(['/tools/bags/#bike-details=bike_a&back=you', '/tools/bags/#bike-details=new&back=tools&section=look']);
  });

  test('[BK-DEEPLINK] the drawing and its Make it yours go to the same place: the bike at Look, or a new bike', () => {
    show(<BikeDrawing bike={bike} summary={summary} back="trip" />);
    const links = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/tools/bags/#bike-details=bike_m2k9x1_4f7a2c9d&back=trip&section=look', '/tools/bags/#bike-details=bike_m2k9x1_4f7a2c9d&back=trip&section=look']);
    expect(host.querySelector('figcaption a')!.textContent).toBe('Make it yours');
    show(<BikeDrawing bike={null} summary={null} back="you" />);
    expect(host.querySelector('a')!.getAttribute('href')).toBe('/tools/bags/#bike-details=new&back=you&section=look');
    expect(host.querySelector('figcaption a')!.textContent).toBe('Add your bike');
  });
});

describe('bags on the right bike (spec section 7.4)', () => {
  test('[BK-MATCH-BAGS] bags are drawn only when the summary names this bike; both none counts as a match', () => {
    expect(bagViewOf(summary, bike)).not.toBeNull();
    expect(bagViewOf({ ...full, bikeId: 'another' } as LoadSummary, bike, [bike.id, 'another'])).toBeNull();
    expect(bagViewOf({ ...full, bikeId: null } as LoadSummary, null)).not.toBeNull();
    expect(bagViewOf({ ...full, bikeId: null } as LoadSummary, bike)).toBeNull();
    expect(bagViewOf({ ...full, bikeId: bike.id } as LoadSummary, null, [bike.id])).toBeNull();
    // A summary naming a bike nobody has names none.
    expect(bagViewOf({ ...full, bikeId: 'deleted' } as LoadSummary, null, [])).not.toBeNull();
    expect(bagViewOf({ app: 'load-check', kind: 'load-summary', v: 1, at: '2026-10-28T18:02:00Z', empty: true }, null)).toBeNull();
    expect(bagViewOf(null, bike)).toBeNull();
  });

  test('[BK-MATCH-BAGS] the drawing follows: bags with the matching bike, none with another', () => {
    show(<BikeDrawing bike={bike} summary={summary} back="tools" />);
    expect(host.querySelectorAll('.bk-bag').length).toBeGreaterThan(0);
    show(<BikeDrawing bike={bike} summary={{ ...full, bikeId: 'another' } as LoadSummary} known={[bike.id, 'another']} back="tools" />);
    expect(host.querySelectorAll('.bk-bag').length).toBe(0);
    expect(svg()).not.toBeNull();
    show(<BikeDrawing bike={bike} summary={summary} size="small" back="you" />);
    expect(host.querySelectorAll('.bk-bag, .bk-bottle, .bk-deck').length).toBe(0);
  });
});

describe('nothing is required (the owner\'s rules)', () => {
  test('[BK-NOTHING-REQUIRED] with no bike and no plan: a typical bike and a friendly caption, no error', () => {
    show(<BikeDrawing bike={null} summary={null} back="trip" />);
    expect(svg()!.getAttribute('aria-label')).toBe('Your bike: gravel bike, 700 × 40 mm tyres, drop bars.');
    expect(host.querySelector('figcaption')!.textContent).toBe('A typical gravel bike · Add your bike');
  });

  test('[BK-NOTHING-REQUIRED] every screen renders with broken bike data, no plan or a broken plan', async () => {
    const errors = vi.spyOn(console, 'error');
    for (const [bikes, current, plan] of [
      ['{broken', '{"id": 5}', 'not json'], ['[3, null, {"id": "x", "fit": "tall", "look": {"colour": "red"}}]', '{"id": "x", "frontTyre": 7}', '{"app":"load-check","kind":"load-summary","v":1}'],
      [null, null, null],
    ] as const) {
      localStorage.clear();
      if (bikes) localStorage.setItem('loadcheck:bikeProfiles', bikes);
      if (current) localStorage.setItem('loadcheck:bikeProfile', current);
      if (plan) localStorage.setItem('loadcheck:summary:v1', plan);
      refreshBikeSource();
      for (const screen of ['trip', 'ahead', 'tools', 'tools/tyre', 'you'] as const) {
        act(() => go(screen));
        show(<App />);
        await flush();
        expect(host.querySelector('main')!.dataset.screen).toBe(screen);
      }
      act(() => go('tools'));
      show(<App />);
      expect(svg()!.getAttribute('aria-label')).toMatch(/^Your bike: gravel bike, 700 × 40 mm tyres, drop bars\.$/);
    }
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('the marker on the strip (spec section 7.4)', () => {
  test("[BK-MARKER] in the rider's colour, decorative, and it opens nothing", () => {
    show(<BikeMarker bike={normaliseBike({ id: 'm', look: { colour: '#c62f2a' } })} />);
    const span = host.querySelector('.bike-marker')!;
    expect(span.getAttribute('aria-hidden')).toBe('true');
    expect(span.querySelector('svg')!.getAttribute('height')).toBe('24');
    expect(span.innerHTML).toContain('stroke="#c62f2a"');
    expect(host.querySelectorAll('a, button, [tabindex], [role]').length).toBe(0);
    show(<BikeMarker bike={null} />);
    expect(host.querySelector('.bike-marker svg')).not.toBeNull();
  });
});

describe('every tap shows a change at once (the owner\'s rules)', () => {
  test('[BK-TAP-INSTANT] a change to the bike in another window redraws before the next frame; a colour change repaints in place', async () => {
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify({ ...sample[0], look: { colour: '#2f7d4f', bars: 'drop', ebike: false } }));
    refreshBikeSource();
    act(() => go('tools'));
    show(<ToolsScreen services={browserServices()} />);
    const before = host.querySelector('.bk-paint')!;
    expect(before.getAttribute('stroke')).toBe('#2f7d4f');
    // The bag planner, in another tab, saves a new colour.
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify({ ...sample[0], look: { colour: '#c62f2a', bars: 'drop', ebike: false } }));
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: 'loadcheck:bikeProfile' })); await flush(); });
    const after = host.querySelector('.bk-paint')!;
    expect(after.getAttribute('stroke')).toBe('#c62f2a');
    expect(after).toBe(before); // the same element: the colour can ease where motion is allowed
    expect(svg()!.getAttribute('aria-label')).toContain('red frame');
    // A new handlebar is a new drawing, at once too.
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify({ ...sample[0], look: { colour: '#c62f2a', bars: 'flat', ebike: false } }));
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: 'loadcheck:bikeProfile' })); await flush(); });
    expect(svg()!.getAttribute('aria-label')).toContain('flat bars');
    // Keys that are not the bag planner's change nothing.
    const now = svg();
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: 'copilot:settings' })); await flush(); });
    expect(svg()).toBe(now);
  });
});

describe('where the bike appears (spec section 3.7)', () => {
  test('[BK-WHERE] the Tools card draws the bike with its bags, under "3 bags · 10.2 kg", and a tap goes to its Look', () => {
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify(sample[0]));
    localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify(sample));
    localStorage.setItem('loadcheck:summary:v1', JSON.stringify(summary));
    refreshBikeSource();
    show(<ToolsScreen services={browserServices()} />);
    const card = host.querySelector('.card')!;
    expect(card.querySelector('h2')!.textContent).toBe('Bag planner');
    expect(card.querySelectorAll('.bk-bag').length).toBeGreaterThan(0);
    expect(card.textContent).toContain('3 bags · 10.2 kg');
    expect(card.querySelector('a.bike-tap')!.getAttribute('href')).toBe('/tools/bags/#bike-details=bike_m2k9x1_4f7a2c9d&back=tools&section=look');
    expect(card.querySelector('a.bike-tap')!.getAttribute('aria-label')).toBe('Your bike: touring bike, 700 × 40 mm front and 42 mm rear tyres, drop bars, blue frame, rear rack. Make it yours');
  });

  test('[TY-UI-LAST-DRAWING] the bag card draws the rider\'s bike, in its colour; with no bike, the typical one', () => {
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify(sample[0]));
    refreshBikeSource();
    show(<ToolsScreen services={browserServices()} />);
    expect(host.querySelector('.card .bk-paint')!.getAttribute('stroke')).toBe('#2563b8');
    localStorage.clear();
    refreshBikeSource();
    show(<ToolsScreen services={browserServices()} />);
    expect(host.querySelector('.card svg.bk')!.getAttribute('aria-label')).toBe('Your bike: gravel bike, 700 × 40 mm tyres, drop bars.');
    expect(host.querySelector('.card a.bike-tap')!.getAttribute('href')).toBe('/tools/bags/#bike-details=new&back=tools&section=look');
  });
});
