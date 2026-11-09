// @vitest-environment jsdom
// The weight map's view (served as /tools/bags/weightmap.js): the owner's finding G, 8 Nov 2026. The page never jumps: the switches
// sit above the maps and are never rebuilt, and the difference comes and goes at the end. The ideal is the rider's own setup, with
// panniers and without, switched by one button; one that cannot be had says why in its place.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { P } from '../../../src/core/bike/art.ts';
import type { MapItem } from '../../../src/core/bike/weightmap.ts';
import { WM } from '../../../src/core/wording/en-weightmap.ts';
import { render } from '../../../src/ui/weight-map/view.ts';
import type { MapInput } from '../../../src/ui/weight-map/view.ts';

const square = (x: number, y: number, s: number): P[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const YOURS: MapItem[] = [{ pos: 'seat', kg: 3, outline: square(80, 40, 20) }, { pos: 'pack', kg: 2, outline: square(4, 20, 20) }];
const IDEAL: MapItem[] = [{ pos: 'frame', kg: 3, outline: square(140, 60, 20) }, { pos: 'pack', kg: 2, outline: square(4, 20, 20) }];

let host: HTMLElement;
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => { host.remove(); vi.restoreAllMocks(); });

function input(over: Partial<MapInput> = {}): MapInput {
  return { items: YOURS, scale: 0.11, bike: '<g class="bk"></g>', which: 'without', ideal: { kind: 'own', items: IDEAL, same: false },
    diff: false, onDiff: vi.fn(), onIdeal: vi.fn(), ...over };
}
const q = <T extends Element>(s: string) => host.querySelector<T>(s)!;
const cards = () => [...host.querySelectorAll('.wm-maps > .wm-card')];

describe('the weight map never moves the page (the owner\'s finding G)', () => {
  test('[WM-STILL] the switches come before the maps and stay the same elements through every change; the difference comes and goes at the end', () => {
    render(host, input());
    const [withB, withoutB, diffB, maps] = [q('.wm-with'), q('.wm-without'), q<HTMLButtonElement>('.wm-diff'), q('.wm-maps')];
    for (const b of [withB, withoutB, diffB]) expect(b.compareDocumentPosition(maps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cards()).toHaveLength(2);
    const [yoursCard, idealCard] = cards();
    diffB.focus();
    render(host, input({ diff: true }));
    expect(cards()).toHaveLength(3);
    expect(cards()[0]).toBe(yoursCard);
    expect(cards()[1]).toBe(idealCard);
    expect(q('.wm-diff')).toBe(diffB);
    expect(document.activeElement).toBe(diffB);
    expect(diffB.textContent).toBe(WM.diffHide);
    render(host, input({ diff: true, which: 'with', ideal: { kind: 'added', items: IDEAL, same: false } }));
    expect([q('.wm-with'), q('.wm-without'), q('.wm-diff'), cards()[1]]).toEqual([withB, withoutB, diffB, idealCard]);
    render(host, input({ diff: false }));
    expect(cards()).toHaveLength(2);
    expect(q('.wm-diff')).toBe(diffB);
    expect(document.activeElement).toBe(diffB);
    expect(diffB.textContent).toBe(WM.diffShow);
  });
});

describe('the ideal from the rider\'s own setup, with and without panniers (the owner\'s finding G)', () => {
  test('[WM-IDEAL] one switch, With panniers and Without panniers, pressed as the page chose; a press asks the page for the other', () => {
    const onIdeal = vi.fn();
    render(host, input({ onIdeal }));
    const group = q('.wm-ideal');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe(WM.switchLabel);
    expect([q('.wm-with').textContent, q('.wm-without').textContent]).toEqual([WM.switchWith, WM.switchWithout]);
    expect([q('.wm-with').getAttribute('aria-pressed'), q('.wm-without').getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    expect(cards()[1]!.querySelector('figcaption')!.textContent).toBe(`${WM.idealWithout} ${WM.idealSub.own}`);
    q<HTMLButtonElement>('.wm-with').click();
    expect(onIdeal).toHaveBeenCalledWith('with');
    q<HTMLButtonElement>('.wm-without').click();
    expect(onIdeal).toHaveBeenCalledTimes(1); // already shown: nothing to ask
    render(host, input({ onIdeal, which: 'with', ideal: { kind: 'added', items: IDEAL, same: false } }));
    expect([q('.wm-with').getAttribute('aria-pressed'), q('.wm-without').getAttribute('aria-pressed')]).toEqual(['true', 'false']);
    expect(cards()[1]!.querySelector('figcaption')!.textContent).toBe(`${WM.idealWith} ${WM.idealSub.added}`);
    // its sentence: the same things and kilos, spread as the ideal has them
    expect(cards()[1]!.querySelector('svg')!.getAttribute('aria-label')).toMatch(/^Ideal with panniers\. Of the weighted load: /);
  });

  test('[WM-IDEAL] an ideal that cannot be had says why in its place, in the same frame; already balanced says so', () => {
    render(host, input({ which: 'with', ideal: { why: 'mounts' }, diff: true }));
    const ideal = cards()[1]!;
    expect(ideal.querySelector('.wm-wrap')).not.toBeNull(); // the same frame, so nothing below moves
    expect(ideal.querySelector('.wm-sum')!.textContent).toBe(WM.why.mounts);
    expect(ideal.querySelector('.wm-sum')!.getAttribute('aria-hidden')).toBeNull();
    expect(ideal.querySelector('svg')!.getAttribute('aria-label')).toBe(`${WM.idealWith}. ${WM.why.mounts}`);
    expect(cards()[2]!.querySelector('.wm-sum')!.textContent).toBe(WM.why.mounts);
    render(host, input({ which: 'without', ideal: { why: 'room' } }));
    expect(cards()[1]!.querySelector('.wm-sum')!.textContent).toBe(WM.why.room);
    render(host, input({ ideal: { kind: 'own', items: YOURS, same: true } }));
    expect(host.querySelector('.wm-same')!.textContent).toBe(WM.idealSame);
    render(host, input());
    expect(host.querySelector('.wm-same')).toBeNull();
  });

  // Review of PR 78: I2 (an ideal that would put more on the back says why), m1 (more kilos than yours is said), I1 (no claim of the best).
  test('[WM-IDEAL] an ideal that would put more on the back says why; one carrying the things left over says so; no claim of "the best"', () => {
    render(host, input({ which: 'without', ideal: { why: 'back' } }));
    expect(cards()[1]!.querySelector('.wm-sum')!.textContent).toBe(WM.why.back);
    render(host, input({ which: 'with', ideal: { why: 'backWith' } }));
    expect(cards()[1]!.querySelector('.wm-sum')!.textContent).toBe(WM.why.backWith);
    render(host, input({ which: 'with', ideal: { kind: 'added', items: IDEAL, same: false, more: true } }));
    expect(cards()[1]!.querySelector('figcaption')!.textContent).toBe(`${WM.idealWith} ${WM.idealSub.addedMore}`);
    render(host, input({ which: 'with', ideal: { kind: 'added', items: IDEAL, same: false, more: false } }));
    expect(cards()[1]!.querySelector('figcaption')!.textContent).toBe(`${WM.idealWith} ${WM.idealSub.added}`);
    // the search is a careful one, not a proof: the words say what it found
    for (const s of [...Object.values(WM.idealSub), WM.idealSame]) expect(s).not.toMatch(/the best balance(?! the planner found)/);
    expect(WM.idealSame).not.toMatch(/already has the best/);
  });
});
