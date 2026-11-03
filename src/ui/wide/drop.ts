// Files dropped on the window (spec section 3.8). A GPX file anywhere on Trip is handed to the same file input the picker uses; an
// export file anywhere on You likewise. Every other drop is cancelled at window level, so the browser never opens or downloads a
// file that missed a zone. The file pickers stay: this only adds a second way in.
import type { ScreenName } from '../nav.ts';

/** Where a file dropped on a screen goes: that screen's own file input, which does the reading and the saying. */
const ZONES: Partial<Record<ScreenName, string>> = {
  trip: '[data-add-route] input[type="file"]',
  you: 'main[data-screen="you"] input[type="file"]',
};

const carriesFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** Puts `file` into `input` as if it had been picked, and lets the input's own handler run. */
export function pickInto(input: HTMLInputElement, file: File): void {
  const list = new DataTransfer();
  list.items.add(file);
  input.files = list.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The file input a drop on this screen goes to, or null where the screen takes no drops. */
export function zoneInput(root: ParentNode, screen: ScreenName): HTMLInputElement | null {
  const selector = ZONES[screen];
  return selector ? root.querySelector<HTMLInputElement>(selector) : null;
}

/** Window-level listeners. `screen` says which screen shows now. Returns the way to take them off again. */
export function installDrop(target: Window, root: ParentNode, screen: () => ScreenName): () => void {
  const hint = (on: boolean): void => {
    const main = root.querySelector('main');
    if (!main) return;
    if (on) main.setAttribute('data-drop-ready', '');
    else main.removeAttribute('data-drop-ready');
  };
  const over = (e: DragEvent): void => {
    if (!carriesFiles(e)) return;
    // Without this the browser would open the file in the window.
    e.preventDefault();
    const zone = zoneInput(root, screen()) !== null;
    if (e.dataTransfer) e.dataTransfer.dropEffect = zone ? 'copy' : 'none';
    hint(zone);
  };
  const drop = (e: DragEvent): void => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    hint(false);
    const input = zoneInput(root, screen());
    const file = e.dataTransfer?.files?.[0];
    if (input && file) pickInto(input, file);
  };
  const leave = (e: DragEvent): void => { if (e.relatedTarget === null) hint(false); };
  target.addEventListener('dragenter', over);
  target.addEventListener('dragover', over);
  target.addEventListener('dragleave', leave);
  target.addEventListener('drop', drop);
  return () => {
    target.removeEventListener('dragenter', over);
    target.removeEventListener('dragover', over);
    target.removeEventListener('dragleave', leave);
    target.removeEventListener('drop', drop);
  };
}
