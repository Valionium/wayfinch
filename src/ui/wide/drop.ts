// Files dropped on the window (spec section 3.8). A GPX file anywhere on Trip is handed to the same file input the picker uses; an
// export file anywhere on You likewise. Every other drop is cancelled at window level, so the browser never opens or downloads a
// file that missed a zone. The file pickers stay: this only adds a second way in.
import { tabOf } from '../nav.ts';
import type { ScreenName } from '../nav.ts';

/** Where a file dropped on a screen goes: that screen's own file input, which does the reading and the saying. */
const ZONES: Partial<Record<string, string>> = {
  // Trip itself, whatever step is open: it opens the Route step with the file, which asks before it replaces a route (review of
  // PR 73, I3). It takes the file as a `filedrop` event, not into an input of its own.
  trip: '[data-trip-drop]',
  // also on #/you/legal, which is You at its legal links (review M4 of PR 45): the screen's tab decides
  you: 'main[data-screen^="you"] input[type="file"]',
};

const carriesFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** Puts `file` into `input` as if it had been picked, and lets the input's own handler run. */
export function pickInto(input: HTMLInputElement, file: File): void {
  const list = new DataTransfer();
  list.items.add(file);
  input.files = list.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The file input (or Trip's zone) a drop on this screen goes to, or null where the screen takes no drops. */
export function zoneInput(root: ParentNode, screen: ScreenName): HTMLElement | null {
  const selector = ZONES[tabOf(screen)];
  return selector ? root.querySelector<HTMLElement>(selector) : null;
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
    if (!input || !file) return;
    if (input instanceof HTMLInputElement) pickInto(input, file);
    else input.dispatchEvent(new CustomEvent('filedrop', { detail: file }));
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
