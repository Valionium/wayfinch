// More colours (wish 4, design of 14 Nov 2026): the DOM part of our own colour picker, served as /tools/bags/colours.js and loaded on
// the first tap of Look's More colours, in place of the browser's colour input (Android's dialog broke its words over two lines).
// A grid of 65 named colours: one radio group, one Tab stop, native radios named by their colour; the arrows move in two directions
// (moveInGrid). It stores nothing: the page is told of each pick and keeps the colour as before, "#rrggbb" in lower case.
import { contrastRatio, nearestSwatchName } from '../../core/bike/colour.ts';
import { findMoreColour, MORE_COLOURS, MORE_COLUMNS, moveInGrid } from '../../core/bike/more-colours.ts';

/** The words the grid shows; the page passes its own, from its bike wording table. */
export type ColoursWords = { title: string; done: string; own: (name: string) => string };
export type ColoursOptions = {
  words: ColoursWords;
  /** The bike's colour now, or null. */
  current: string | null;
  /** A colour picked: settle true for a tap (keep it now), false for an arrow move (show it now, keep it once the rider pauses). */
  onPick: (hex: string, settle: boolean) => void;
  /** Escape or Done: the page closes the grid and takes the focus back to its chip. */
  onClose: () => void;
};
export type Colours = { root: HTMLElement; show: (current: string | null) => void; focus: () => void; close: () => void };

const STYLE_ID = 'wf-colours-style';
// The page's own tokens (--line, --blaze, --ink, --muted) follow its theme. The cells keep the theme's line, so White and Black show on
// both panels; the colour in use has the accent's outline and a tick, so it never depends on seeing the colour itself.
const CSS = `.wf-colours{margin-top:8px}
.wf-colours-now{display:flex;align-items:center;gap:8px;min-height:32px;margin:0 0 4px;font-weight:600}
.wf-colours-dot{flex:none;width:22px;height:22px;border-radius:50%;border:1px solid var(--muted);box-sizing:border-box}
.wf-colours-dot[hidden]{display:none}
.wf-colours-grid{display:grid;grid-template-columns:repeat(${MORE_COLUMNS},minmax(44px,56px));gap:6px;padding:5px}
.wf-colour{position:relative;display:block;min-width:44px;min-height:44px;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;background:var(--c);cursor:pointer}
.wf-colour input{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}
.wf-colour.on{outline:3px solid var(--blaze);outline-offset:2px}
.wf-colour.on::after{content:'';position:absolute;left:50%;top:50%;width:9px;height:17px;margin:-12px 0 0 -5px;border:solid var(--tick);border-width:0 3px 3px 0;transform:rotate(45deg);box-sizing:border-box}
.wf-colour:has(input:focus-visible){outline:3px solid var(--ink);outline-offset:2px}
.wf-colours-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wf-colours-done{min-height:44px;min-width:44px;margin-top:6px;padding:0 16px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:14px;cursor:pointer}
.wf-colours-done:focus-visible{outline:2px solid var(--ink);outline-offset:2px}`;

/** Black or white, whichever stands out more on the cell: the tick that marks the colour in use. */
export function tickFor(hex: string): string {
  return contrastRatio(hex, '#000000') >= contrastRatio(hex, '#ffffff') ? '#000000' : '#ffffff';
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = cls;
  return node;
};

export function openColours(box: HTMLElement, options: ColoursOptions): Colours {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const root = el('div', 'wf-colours');
  const now = el('p', 'wf-colours-now');
  const dot = el('span', 'wf-colours-dot');
  dot.setAttribute('aria-hidden', 'true');
  const name = el('span', 'wf-colours-name');
  now.append(dot, name);
  const grid = el('div', 'wf-colours-grid');
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', options.words.title);
  const radios: HTMLInputElement[] = [];
  const labels: HTMLLabelElement[] = [];
  for (const colour of MORE_COLOURS) {
    const label = el('label', 'wf-colour');
    label.style.setProperty('--c', colour.hex);
    label.style.setProperty('--tick', tickFor(colour.hex));
    const radio = el('input', '');
    radio.type = 'radio';
    radio.name = 'wfMoreColour';
    radio.value = colour.hex;
    const text = el('span', 'wf-colours-sr');
    text.textContent = colour.name;
    label.append(radio, text);
    grid.appendChild(label);
    radios.push(radio);
    labels.push(label);
  }
  const done = el('button', 'wf-colours-done');
  done.type = 'button';
  done.textContent = options.words.done;
  root.append(now, grid, done);
  box.appendChild(root);

  const show = (current: string | null): void => {
    const at = findMoreColour(current);
    radios.forEach((r, i) => { r.checked = i === at; labels[i]!.classList.toggle('on', i === at); });
    const hex = typeof current === 'string' && /^#[0-9a-fA-F]{6}$/.test(current) ? current.toLowerCase() : null;
    dot.hidden = hex === null;
    dot.style.background = hex ?? '';
    name.textContent = at >= 0 ? MORE_COLOURS[at]!.name : hex ? options.words.own(nearestSwatchName(hex) ?? '') : '';
  };
  show(options.current);

  grid.addEventListener('change', (e) => {
    const radio = e.target as HTMLInputElement;
    if (radio.name !== 'wfMoreColour') return;
    show(radio.value);
    options.onPick(radio.value, true);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      options.onClose();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const from = radios.indexOf(e.target as HTMLInputElement);
    if (from < 0) return;
    const to = moveInGrid(from, e.key);
    if (to === null) return;
    e.preventDefault();
    const radio = radios[to]!;
    radio.focus();
    if (to === from && radio.checked) return;
    show(radio.value);
    options.onPick(radio.value, false);
  });
  done.addEventListener('click', () => options.onClose());

  return {
    root,
    show,
    focus: () => (radios.find((r) => r.checked) ?? radios[0]!).focus(),
    close: () => root.remove(),
  };
}
