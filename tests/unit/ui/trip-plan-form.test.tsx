// @vitest-environment jsdom
// Plan from A to B's form (sweep of 14 Nov 2026, #8 and #9; NEXT task 6's accessibility fixes): the hint said once and tied to both
// fields, the privacy note behind "What is sent?", the focus kept after a pick, a pick prompt screen readers hear, hit names with
// separators, and a busy Search that stays in the tab order without searching twice. Every answer is recorded; no live call.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { TR } from '../../../src/core/wording/en-trip.ts';
import { AB } from '../../../src/core/wording/en-plan.ts';
import type { TripServices } from '../../../src/ui/trip/services.ts';
import { PlanAB } from '../../../src/ui/trip/plan.tsx';
import { bannedHits } from '../../fixtures/banned.ts';

const host = document.createElement('div');
document.body.append(host);
beforeEach(() => { render(null, host); });
afterEach(() => { act(() => render(null, host)); });

const settle = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
async function until(check: () => boolean, what: string, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`waited for ${what}`);
    await settle(5);
  }
}
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const field = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)!;

/** Towns from Open-Meteo, an address from Photon; `hold` keeps every answer back until it is let go. */
function network(o: { hold?: boolean } = {}) {
  const urls: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => { release = r; });
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (o.hold) await gate;
    if (url.startsWith('https://photon.komoot.io/')) {
      return new Response(JSON.stringify({ features: [{ type: 'Feature', properties: { housenumber: '12', street: 'Hauptstraße', postcode: '69117', city: 'Heidelberg', country: 'Germany', osm_key: 'building', osm_value: 'yes' }, geometry: { type: 'Point', coordinates: [8.69, 49.4] } }] }), { status: 200 });
    }
    const name = new URL(url).searchParams.get('name') ?? '';
    return new Response(JSON.stringify({ results: [{ id: 1, name, country: 'Germany', latitude: 49.4, longitude: 8.69 }] }), { status: 200 });
  }) as typeof fetch;
  return { fetch: f, urls, release: () => release() };
}

async function show(net = network()): Promise<void> {
  await act(async () => { render(<PlanAB services={{ fetch: net.fetch } as unknown as TripServices} onRoute={async () => undefined} />, host); });
}
async function search(id: string, value: string): Promise<void> {
  const input = field(id);
  await act(async () => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}
const hits = () => [...host.querySelectorAll<HTMLButtonElement>('button.hit')];

describe('The form says its hint once and keeps the privacy note one tap away (sweep #8)', () => {
  test('[AB-FORM] one hint under Start and End, tied to both fields; the note behind "What is sent?", closed, word for word', async () => {
    await show();
    const hints = [...host.querySelectorAll('p')].filter((p) => p.textContent === TR.appAbHint);
    expect(hints).toHaveLength(1);
    const hint = hints[0]!;
    expect(hint.id).not.toBe('');
    for (const id of ['ab-from', 'ab-to']) expect(field(id).getAttribute('aria-describedby')).toBe(hint.id);
    // Under the pair: after both fields.
    expect(field('ab-to').compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const more = host.querySelector('details')!;
    expect(more.open).toBe(false);
    expect(more.querySelector('summary')!.textContent).toBe(AB.appAbWhatIsSent);
    expect(more.textContent).toContain(TR.appAbNote);
    expect(bannedHits(AB.appAbWhatIsSent, false)).toEqual([]);
  });
});

describe('The focus after a pick (sweep #9)', () => {
  test('[AB-FORM] picking Start moves the focus to End, picking End to Plan the route, Change start back to the Start field', async () => {
    await show();
    await search('ab-from', 'Heidelberg');
    await until(() => hits().length > 0, 'a Start hit');
    await click(hits()[0]!);
    expect(document.activeElement).toBe(field('ab-to'));
    await search('ab-to', 'Speyer');
    await until(() => hits().length > 0, 'an End hit');
    await click(hits()[0]!);
    const plan = [...host.querySelectorAll('button')].find((b) => b.textContent === W.appAbPlan)!;
    expect(document.activeElement).toBe(plan);
    const change = [...host.querySelectorAll("button")].find((b) => b.textContent === `Change ${TR.appAbFrom.toLowerCase()}`)!;
    await click(change);
    expect(document.activeElement).toBe(field('ab-from'));
  });
});

describe('Accessibility of the search (NEXT task 6)', () => {
  test('[AB-FORM] the pick prompt\'s status is in the page before any search and is filled when the hits come', async () => {
    await show();
    const status = host.querySelector<HTMLElement>('[data-pick-status]')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('');
    await search('ab-from', 'Heidelberg');
    await until(() => hits().length > 0, 'a hit');
    expect(host.querySelector('[data-pick-status]')).toBe(status);
    expect(status.textContent).toBe(TR.appAbPick);
  });

  test('[AB-FORM] a hit\'s name keeps its parts apart: "Hauptstraße 12, 69117 Heidelberg, Germany", not "Hauptstraße 1269117 …"', async () => {
    await show();
    await search('ab-from', 'Hauptstraße 12');
    await until(() => hits().length > 0, 'the address hit');
    expect(hits()[0]!.textContent).toMatch(/^Hauptstraße 12, (.+, )?69117 Heidelberg, Germany$/);
  });

  test('[AB-FORM] while searching, Search is aria-disabled, stays focusable, and a second press sends nothing more', async () => {
    const net = network({ hold: true });
    await show(net);
    await search('ab-from', 'Heidelberg');
    const button = host.querySelector<HTMLButtonElement>('form button[type=submit]')!;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { field('ab-from').form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(net.urls).toHaveLength(1);
    net.release();
    await until(() => hits().length > 0, 'the hit');
    expect(button.getAttribute('aria-disabled')).not.toBe('true');
  });
});
