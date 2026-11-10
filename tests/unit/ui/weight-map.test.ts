// @vitest-environment jsdom
// The weight map's view (served as /tools/bags/weightmap.js): the owner's finding G, 8 Nov 2026. The page never jumps: the switch
// sits above the maps and is never rebuilt, and the difference comes and goes at the end. The ideal is the rider's own setup; since the
// owner's decision of 9 Nov 2026 there is one ideal, the rider's own bags, and no switch with and without panniers.
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
  return { items: YOURS, scale: 0.11, bike: '<g class="bk"></g>', ideal: { items: IDEAL }, diff: false, onDiff: vi.fn(), ...over };
}
const q = <T extends Element>(s: string) => host.querySelector<T>(s)!;
const cards = () => [...host.querySelectorAll('.wm-maps > .wm-card')];

describe('the weight map never moves the page (the owner\'s finding G)', () => {
  test('[WM-STILL] the switch comes before the maps and stays the same element through every change; the difference comes and goes at the end', () => {
    render(host, input());
    const [diffB, maps] = [q<HTMLButtonElement>('.wm-diff'), q('.wm-maps')];
    expect(diffB.compareDocumentPosition(maps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    render(host, input({ diff: true, items: IDEAL }));
    expect([q('.wm-diff'), cards()[1]]).toEqual([diffB, idealCard]);
    render(host, input({ diff: false }));
    expect(cards()).toHaveLength(2);
    expect(q('.wm-diff')).toBe(diffB);
    expect(document.activeElement).toBe(diffB);
    expect(diffB.textContent).toBe(WM.diffShow);
  });
});

describe('one ideal, the rider\'s own bags (the owner\'s decision of 9 Nov 2026)', () => {
  test('[WM-IDEAL] no switch with and without panniers: the ideal is the rider\'s own bags, its title and subtitle say so, and its sentence is read as its picture\'s name', () => {
    const onDiff = vi.fn();
    render(host, input({ onDiff }));
    expect(host.querySelector('.wm-ideal, .wm-with, .wm-without')).toBeNull();
    expect([...host.querySelectorAll('button')].map((b) => b.className)).toEqual(['wm-diff']);
    expect(cards()[1]!.querySelector('figcaption')!.textContent).toBe(`${WM.ideal} ${WM.idealSub}`);
    expect(cards()[1]!.querySelector('svg')!.getAttribute('aria-label')).toMatch(new RegExp(`^${WM.ideal}\\. Of the weighted load: `));
    expect(cards()[1]!.querySelector('.wm-sum')!.getAttribute('aria-hidden')).toBe('true');
    q<HTMLButtonElement>('.wm-diff').click();
    expect(onDiff).toHaveBeenCalledWith(true);
    // the words: what the planner found, never a claim of the best, never advice; the two ideals' words are gone
    expect(WM.idealSub).toMatch(/the best balance the planner found$/);
    for (const gone of ['idealWith', 'idealWithout', 'switchLabel', 'switchWith', 'switchWithout', 'idealSame', 'why']) expect(WM).not.toHaveProperty(gone);
    expect(JSON.stringify(WM)).not.toMatch(/panniers|you should/i);
  });
});

// "Handling first" (design of 10 Nov 2026, §3): after a press, Before over After on the same fixed scale, with one sentence of what
// moved instead of the difference's switch; before any press (or once the plan changed) the map is as before, its switch the same element.
describe("Handling first's Before and After", () => {
  test('[HF-MAP] with the packing before the press: Before and After, their sentences, one line of what moved, no difference; without it, yours and the ideal again', () => {
    render(host, input());
    const diffB = q<HTMLButtonElement>('.wm-diff');
    render(host, input({ before: { items: YOURS }, items: IDEAL, diff: true }));
    expect(cards()).toHaveLength(2);
    expect(cards().map((c) => c.querySelector('figcaption b')!.textContent)).toEqual([WM.before, WM.after]);
    expect(cards()[0]!.querySelector('figcaption span')!.textContent).toBe(WM.beforeSub('5.0'));
    expect(cards()[1]!.querySelector('figcaption span')!.textContent).toBe(WM.afterSub);
    expect(cards()[1]!.querySelector('svg')!.getAttribute('aria-label')).toMatch(new RegExp(`^${WM.after}\\. Of the weighted load: `));
    expect(q('.wm-moved').textContent).toBe('3.0 kg moved from the rear to the middle.');
    expect(q<HTMLElement>('.wm-moved').hidden).toBe(false);
    expect(q<HTMLButtonElement>('.wm-diff').hidden).toBe(true);
    expect(q('.wm-diff')).toBe(diffB);
    // a press that only evened a pair: the page's own sentence (re-check of PR 117, N3)
    render(host, input({ before: { items: YOURS, note: 'The same kilos, spread more evenly between the two fork cages.' }, items: YOURS }));
    expect(q('.wm-moved').textContent).toBe('The same kilos, spread more evenly between the two fork cages.');
    render(host, input());
    expect(cards().map((c) => c.querySelector('figcaption b')!.textContent)).toEqual([WM.yours, WM.ideal]);
    expect(q<HTMLButtonElement>('.wm-diff').hidden).toBe(false);
    expect(q<HTMLElement>('.wm-moved').hidden).toBe(true);
    expect(q('.wm-diff')).toBe(diffB);
  });
});

