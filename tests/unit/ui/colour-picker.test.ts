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
