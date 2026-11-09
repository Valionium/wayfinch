// What Ahead's tests share: a view built from a screen the way the shell builds it, a recording stand-in for the actions object,
// and a render into jsdom.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { browserAhead } from '../../../src/ui/shell-actions.ts';
import type { AheadDeps } from '../../../src/ui/shell-actions.ts';
import { AheadScreen } from '../../../src/ui/ahead/ahead.tsx';
import type { AheadActions, AheadView } from '../../../src/ui/ahead/actions.ts';
import type { ScreenInputs } from '../../../src/core/types.ts';

export type Call = [name: keyof AheadActions, ...args: unknown[]];

/** Records every call; `copy` and `share` answer as told, and a position is kept unless `kept` is false. */
export function fakeActions(o: { share?: boolean; copy?: boolean; kept?: boolean } = {}): { actions: AheadActions; calls: Call[] } {
  const calls: Call[] = [];
  const rec = (name: keyof AheadActions) => (...args: unknown[]) => { calls.push([name, ...args]); return Promise.resolve(); };
  const kept = (name: keyof AheadActions) => (...args: unknown[]) => { calls.push([name, ...args]); return Promise.resolve(o.kept ?? true); };
  const actions: AheadActions = {
    updatePosition: kept('updatePosition') as AheadActions['updatePosition'],
    setManual: kept('setManual') as AheadActions['setManual'],
    choosePass: kept('choosePass') as AheadActions['choosePass'],
    confirmWater: (l) => { calls.push(['confirmWater', l]); return Promise.resolve(null); },
    updateWeather: rec('updateWeather') as AheadActions['updateWeather'],
    planTomorrow: rec('planTomorrow') as AheadActions['planTomorrow'],
    backToToday: rec('backToToday') as AheadActions['backToToday'],
    retry: rec('retry') as AheadActions['retry'],
    setMapLink: (on) => { calls.push(['setMapLink', on]); },
    share: (t) => { calls.push(['share', t]); return Promise.resolve(o.share ?? true); },
    copy: (t) => { calls.push(['copy', t]); return Promise.resolve(o.copy ?? true); },
    smsHref: (t) => `sms:?&body=${encodeURIComponent(t)}`,
    freshen: () => undefined,
    getReady: () => { calls.push(['getReady']); return Promise.resolve([]); },
  };
  return { actions, calls };
}

/** The view the shell makes of these inputs, through its own code: no store is read. */
export function viewOf(i: ScreenInputs, deps: Partial<AheadDeps> = {}): AheadView {
  const shell = browserAhead({
    now: () => i.now, geolocation: () => undefined, online: () => false, fetch: () => Promise.reject(new Error('no network')),
    share: null, writeClipboard: null, ...deps,
  });
  shell.show(i);
  return shell.view.value;
}

export const host = (() => {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
})();

export async function show(view: AheadView, actions: AheadActions): Promise<void> {
  await act(async () => { render(null, host); });
  await act(async () => { render(<AheadScreen view={view} actions={actions} />, host); });
}

export const click = async (el: Element | null | undefined): Promise<void> => {
  if (!el) throw new Error('nothing to click');
  await act(async () => { (el as HTMLElement).click(); await new Promise((r) => setTimeout(r, 0)); });
};

/** Types into a field as a person does: the value, then the input event, inside one render step. */
export const typeInto = async (el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

export const buttonNamed =(name: string | RegExp, root: ParentNode = host): HTMLButtonElement => {
  const found = [...root.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? '')));
  if (!found) throw new Error(`no button ${String(name)}`);
  return found;
};

/** Opens every card, and each "Show N more". */
export async function expandAll(): Promise<void> {
  for (const b of [...host.querySelectorAll<HTMLButtonElement>('.ah-toggle')]) if (b.getAttribute('aria-expanded') !== 'true') await click(b);
  for (const b of [...host.querySelectorAll<HTMLButtonElement>('button')].filter((x) => /^Show \d+ more$/.test(x.textContent ?? ''))) await click(b);
}

/**
 * What a call button dials: it asks first (AH-CALL-CONFIRM), so this taps it, reads the one tel: link of the question, and cancels.
 * Null when the button is not there.
 */
export async function dialled(button: Element | null | undefined): Promise<string | null> {
  if (!button) return null;
  await click(button);
  const box = button.ownerDocument.querySelector('[data-call-ask]');
  const href = box?.querySelector('a')?.getAttribute('href') ?? null;
  if (box) await click(buttonNamed('Cancel', box));
  return href;
}
