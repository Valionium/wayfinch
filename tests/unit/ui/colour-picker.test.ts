// @vitest-environment jsdom
// More colours' grid (wish 4, design of 14 Nov 2026), the DOM part of colours.js: native radios named by their colour, one group,
// the keyboard model, and the colour in use marked.
import { afterEach, expect, test, vi } from 'vitest';
import { MORE_COLOURS } from '../../../src/core/bike/more-colours.ts';
import { openColours } from '../../../src/ui/colour-picker/picker.ts';

const words = { title: 'More colours', done: 'Done', own: (name: string) => `Your own colour, close to ${name}` };
afterEach(() => { document.body.innerHTML = ''; });

function open(current: string | null) {
  const box = document.createElement('div');
  document.body.appendChild(box);
  const onPick = vi.fn<(hex: string, settle: boolean) => void>();
  const onClose = vi.fn<() => void>();
  const picker = openColours(box, { words, current, onPick, onClose });
  const radios = [...box.querySelectorAll<HTMLInputElement>('input[type=radio]')];
  const nameOf = (r: HTMLInputElement) => (r.labels?.[0]?.textContent ?? '').trim();
  const byName = (name: string) => radios.find((r) => nameOf(r) === name)!;
  return { box, picker, radios, nameOf, byName, onPick, onClose };
}
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

test('[LC-COLOURS-A11Y] one radio group named More colours; 65 radios, each named by its colour, in the grid\'s order; the colour in use checked and named', () => {
  const { box, radios, nameOf, byName } = open('#2563b8');
  const group = box.querySelector('[role=radiogroup]')!;
  expect(group.getAttribute('aria-label')).toBe('More colours');
  expect(radios).toHaveLength(65);
  expect(radios.map(nameOf)).toEqual(MORE_COLOURS.map((c) => c.name));
  expect(radios.map((r) => r.value)).toEqual(MORE_COLOURS.map((c) => c.hex));
  expect(new Set(radios.map((r) => r.name)).size).toBe(1);
  expect(radios.filter((r) => r.checked).map(nameOf)).toEqual(['Blue']);
  expect(box.querySelector('.wf-colours-name')!.textContent).toBe('Blue');
  expect(byName('Blue').closest('label')!.classList.contains('on')).toBe(true);
  expect(box.querySelector('button')!.textContent).toBe('Done');
});

test('[LC-COLOURS-PICK] a colour outside the grid: nothing checked, named by the nearest swatch; no colour: nothing checked, no name', () => {
  const own = open('#a1b2c3');
  expect(own.radios.some((r) => r.checked)).toBe(false);
  expect(own.box.querySelector('.wf-colours-name')!.textContent).toBe('Your own colour, close to Silver');
  document.body.innerHTML = '';
  const none = open(null);
  expect(none.radios.some((r) => r.checked)).toBe(false);
  expect(none.box.querySelector('.wf-colours-name')!.textContent).toBe('');
  // show() follows the page: a new colour is checked and named, without moving the focus
  none.picker.show('#6b1d2a');
  expect(none.radios.filter((r) => r.checked).map(none.nameOf)).toEqual(['Burgundy']);
  expect(none.box.querySelector('.wf-colours-name')!.textContent).toBe('Burgundy');
  expect(document.activeElement).toBe(document.body);
});

test('[LC-COLOURS-KEYS] an arrow checks and focuses the next colour and shows it (settle false); a tap picks for good (settle true)', () => {
  const { radios, byName, nameOf, onPick } = open('#2563b8');
  const blue = byName('Blue');
  blue.focus();
  expect(key(blue, 'ArrowDown')).toBe(false);   // the browser's own linear move is stopped
  expect(nameOf(document.activeElement as HTMLInputElement)).toBe('Purple');
  expect(byName('Purple').checked).toBe(true);
  expect(onPick).toHaveBeenLastCalledWith('#6b3fa0', false);
  key(document.activeElement!, 'End');
  expect(nameOf(document.activeElement as HTMLInputElement)).toBe('Aubergine');
  // a key that moves nothing is left to the browser (Tab, Space), and picks nothing
  onPick.mockClear();
  expect(key(document.activeElement!, 'Tab')).toBe(true);
  expect(onPick).not.toHaveBeenCalled();
  // a tap (a click on the label checks the radio and fires change)
  byName('Mint').closest('label')!.click();
  expect(onPick).toHaveBeenLastCalledWith(radios.find((r) => nameOf(r) === 'Mint')!.value, true);
});

test('[LC-COLOURS-KEYS] focus() lands on the colour in use, else the first; Escape and Done close; close() takes the grid away', () => {
  const a = open('#1f7f80');
  a.picker.focus();
  expect(a.nameOf(document.activeElement as HTMLInputElement)).toBe('Teal');
  const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  const outer = vi.fn();
  document.body.addEventListener('keydown', outer);
  document.activeElement!.dispatchEvent(esc);
  expect(a.onClose).toHaveBeenCalledTimes(1);
  expect(outer).not.toHaveBeenCalled();   // Escape closes the grid only, not the dialog around it
  document.body.removeEventListener('keydown', outer);
  a.box.querySelector('button')!.click();
  expect(a.onClose).toHaveBeenCalledTimes(2);
  a.picker.close();
  expect(a.box.children).toHaveLength(0);
  document.body.innerHTML = '';
  const b = open('#a1b2c3');
  b.picker.focus();
  expect(b.nameOf(document.activeElement as HTMLInputElement)).toBe('White');
});

// Keep my colour (the owner's ruling of 14 Nov 2026): a colour from before that is not one of the 65 (a photo's, an older save's) gets
// a cell of its own, first, checked while it is the colour in use, so a rider who tries a grid colour can choose it again. It is a radio
// of the same group (one Tab stop), reached by the arrows; a tap on it is a pick like any other; nothing is picked by opening or show().
const KEEP = { ...words, keep: 'Keep my colour' };
function openKeep(current: string | null) {
  const box = document.createElement('div');
  document.body.appendChild(box);
  const onPick = vi.fn<(hex: string, settle: boolean) => void>();
  const onClose = vi.fn<() => void>();
  const picker = openColours(box, { words: KEEP, current, onPick, onClose });
  const visible = () => [...box.querySelectorAll<HTMLInputElement>('input[type=radio]')].filter((r) => !r.closest('label')!.hidden);
  const nameOf = (r: Element | null) => ((r as HTMLInputElement | null)?.labels?.[0]?.textContent ?? '').trim();
  const byName = (name: string) => visible().find((r) => nameOf(r) === name)!;
  return { box, picker, visible, nameOf, byName, onPick, onClose };
}

test('[LC-COLOURS-KEEP] a colour outside the grid: "Keep my colour" first, in that colour, checked and marked, in the same group; the 65 after it; opening picks nothing', () => {
  const k = openKeep('#a1b2c3');
  const radios = k.visible();
  expect(radios).toHaveLength(66);
  expect(radios.map(k.nameOf)).toEqual(['Keep my colour', ...MORE_COLOURS.map((c) => c.name)]);
  const keep = radios[0]!;
  expect(keep.value).toBe('#a1b2c3');
  expect(keep.checked).toBe(true);
  expect(radios.filter((r) => r.checked)).toHaveLength(1);
  expect(new Set(radios.map((r) => r.name)).size).toBe(1);
  expect(keep.closest('[role=radiogroup]')).toBe(k.box.querySelector('[role=radiogroup]'));
  const cell = keep.closest('label')!.querySelector<HTMLElement>('.wf-colour')!;
  expect(cell.style.getPropertyValue('--c')).toBe('#a1b2c3');
  expect(cell.classList.contains('on')).toBe(true);
  // the line above the grid still says what it is
  expect(k.box.querySelector('.wf-colours-name')!.textContent).toBe('Your own colour, close to Silver');
  k.picker.focus();
  expect(document.activeElement).toBe(keep);
  expect(k.onPick).not.toHaveBeenCalled();
  // a grid colour or none: no such cell
  for (const current of ['#2563b8', null]) {
    document.body.innerHTML = '';
    const g = openKeep(current);
    expect(g.visible(), String(current)).toHaveLength(65);
    expect(g.visible().map(g.nameOf), String(current)).not.toContain('Keep my colour');
  }
});

test('[LC-COLOURS-KEEP] after a grid pick it stays, unchecked, and a tap on it picks the colour again (settle true); show() follows the page and picks nothing', () => {
  const k = openKeep('#a1b2c3');
  k.byName('Burgundy').closest('label')!.click();
  expect(k.onPick).toHaveBeenLastCalledWith('#6b1d2a', true);
  // the page saves and redraws: show() with the new colour
  k.picker.show('#6b1d2a');
  expect(k.byName('Keep my colour').checked).toBe(false);
  expect(k.byName('Burgundy').checked).toBe(true);
  expect(k.visible()).toHaveLength(66);
  k.byName('Keep my colour').closest('label')!.click();
  expect(k.onPick).toHaveBeenLastCalledWith('#a1b2c3', true);
  expect(k.byName('Keep my colour').checked).toBe(true);
  expect(k.box.querySelector('.wf-colours-name')!.textContent).toBe('Your own colour, close to Silver');
  // Undo in the page brings a grid colour, then the own colour back: show() checks each, calls nothing
  k.onPick.mockClear();
  k.picker.show('#2563b8');
  k.picker.show('#a1b2c3');
  expect(k.byName('Keep my colour').checked).toBe(true);
  expect(k.onPick).not.toHaveBeenCalled();
  // a grid opened on a grid colour gains the cell once the page shows a colour from outside it (a photo's)
  document.body.innerHTML = '';
  const g = openKeep('#2563b8');
  g.picker.show('#123456');
  expect(g.byName('Keep my colour').value).toBe('#123456');
  expect(g.byName('Keep my colour').checked).toBe(true);
  expect(g.onPick).not.toHaveBeenCalled();
});

test('[LC-COLOURS-KEEP] the arrows reach it: Right or Down from it to White; Left from White and Up from the first row back to it, each shown (settle false)', () => {
  const k = openKeep('#a1b2c3');
  const keep = k.byName('Keep my colour');
  keep.focus();
  expect(key(keep, 'ArrowRight')).toBe(false);
  expect(k.nameOf(document.activeElement)).toBe('White');
  expect(k.onPick).toHaveBeenLastCalledWith('#f4f4f2', false);
  expect(key(document.activeElement!, 'ArrowLeft')).toBe(false);
  expect(document.activeElement).toBe(keep);
  expect(keep.checked).toBe(true);
  expect(k.onPick).toHaveBeenLastCalledWith('#a1b2c3', false);
  key(keep, 'ArrowDown');
  expect(k.nameOf(document.activeElement)).toBe('White');
  key(document.activeElement!, 'End');
  expect(k.nameOf(document.activeElement)).toBe('Black');
  key(document.activeElement!, 'ArrowUp');
  expect(document.activeElement).toBe(keep);
  // on it, the other moves stay on it and pick nothing more
  k.onPick.mockClear();
  for (const move of ['ArrowLeft', 'ArrowUp', 'Home', 'PageUp']) {
    expect(key(keep, move), move).toBe(false);
    expect(document.activeElement, move).toBe(keep);
  }
  expect(k.onPick).not.toHaveBeenCalled();
  // a key that moves nothing is left to the browser
  expect(key(keep, 'Tab')).toBe(true);
  // without the cell (a grid colour), Up and Left at the first row stay put as before
  document.body.innerHTML = '';
  const g = openKeep('#f4f4f2');
  const white = g.byName('White');
  white.focus();
  key(white, 'ArrowUp');
  expect(document.activeElement).toBe(white);
  key(white, 'ArrowLeft');
  expect(document.activeElement).toBe(white);
});

test('[LC-COLOURS-KEEP] a page that passes no word for it (an older page) gets the grid as before: no such cell', () => {
  const box = document.createElement('div');
  document.body.appendChild(box);
  openColours(box, { words, current: '#a1b2c3', onPick: vi.fn(), onClose: vi.fn() });
  const shown = [...box.querySelectorAll<HTMLInputElement>('input[type=radio]')].filter((r) => !r.closest('label')!.hidden);
  expect(shown).toHaveLength(65);
  expect(shown.some((r) => r.checked)).toBe(false);
});

// Review of PR 162, m1 and m2: the page showing another bike starts the cell again from that bike's colour, so a tap never stores the old
// bike's colour on the new one; and the cell is described by the colour it keeps, as every other cell is named by its colour.
test('[LC-COLOURS-KEEP] another bike shown (show with fresh): the old colour\'s cell goes; a grid colour has none, an own colour its own; nothing is picked', () => {
  const k = openKeep('#a1b2c3');
  k.picker.show('#2563b8', true);
  expect(k.visible().map(k.nameOf)).not.toContain('Keep my colour');
  expect(k.visible()).toHaveLength(65);
  expect(k.box.querySelectorAll('.wf-colour-keep')).toHaveLength(0);
  expect(k.byName('Blue').checked).toBe(true);
  // the next bike's own colour gets a cell of its own, holding that colour only
  k.picker.show('#123456', true);
  expect(k.byName('Keep my colour').value).toBe('#123456');
  expect(k.byName('Keep my colour').checked).toBe(true);
  // a later grid colour on the same bike keeps it, as before
  k.picker.show('#6b1d2a');
  expect(k.byName('Keep my colour').value).toBe('#123456');
  expect(k.onPick).not.toHaveBeenCalled();
});

test('[LC-COLOURS-KEEP] the cell is described by the colour it keeps ("Your own colour, close to Silver"), and its description follows its colour', () => {
  const k = openKeep('#a1b2c3');
  const keep = k.byName('Keep my colour');
  const described = () => (keep.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
  expect(described()).toBe('Your own colour, close to Silver');
  // outside the label, so the name stays "Keep my colour"
  expect(k.nameOf(keep)).toBe('Keep my colour');
  // after a grid pick it still describes its own colour, not the one now checked
  k.byName('Burgundy').closest('label')!.click();
  k.picker.show('#6b1d2a');
  expect(described()).toBe('Your own colour, close to Silver');
  k.picker.show('#123456', true);
  expect(k.byName('Keep my colour').getAttribute('aria-describedby')).toBeTruthy();
  expect((document.getElementById(k.byName('Keep my colour').getAttribute('aria-describedby')!)?.textContent ?? '')).toMatch(/^Your own colour, close to /);
});
