// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { W } from '../../../../src/core/wording/en.ts';
import { readHost } from '../../../../src/tools/tyre/host.ts';
import { TYRE_KEY, exportTyres, importTyres, readStore } from '../../../../src/tools/tyre/storage.ts';
import type { KeyValueStore } from '../../../../src/tools/tyre/storage.ts';
import { TyreScreen } from '../../../../src/tools/tyre/ui.tsx';
import type { TyreServices } from '../../../../src/tools/tyre/ui.tsx';
import { App } from '../../../../src/ui/app.tsx';
import { go } from '../../../../src/ui/nav.ts';
import { ToolsScreen } from '../../../../src/ui/tools/tools.tsx';

const NOW = new Date('2026-11-03T10:00:00Z');
const host = document.createElement('div');
document.body.append(host);
afterEach(() => { render(null, host); });

/** One in-memory browser storage that remembers every write, shared by Load Check's records (read) and the tool's own key (read and write). */
function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  const kv: KeyValueStore & { dump: () => Record<string, string> } = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { writes.push(k); data.set(k, v); },
    dump: () => Object.fromEntries(data),
  };
  return { kv, writes, data };
}

const summary = {
  app: 'load-check', kind: 'load-summary', v: 1, at: '2026-10-28T18:02:00Z', planUpdatedAt: '2026-10-28T18:02:00Z', nights: 2, month: 6,
  departureDate: null, mode: 'comfort', foodDays: 2, bikeId: 'bike_m2k9x1_4f7a2c9d',
  bags: { count: 3, positions: ['frame', 'rack', 'rack'], items: [] },
  decks: { bar: null, rack: null }, water: { bottles: [], cageL: 1.25, extraL: 0, totalL: 1.25 },
  weight: { kitKg: 8.95, cageWaterKg: 1.25, carriedKg: 10.2, bikeKg: 14, emptyLuggageKg: 2.4, byPositionKg: { fork: 0, bar: 0, top: 0, frame: 1.6, bottle: 1.25, seat: 0, rack: 7.35, pack: 0 }, unplacedKg: 0 },
  kit: { waterFilter: false },
};
const bike = {
  id: 'bike_m2k9x1_4f7a2c9d', name: 'Trail Bike', look: { colour: null, bars: 'flat', ebike: null }, tyres: 'tubeless',
  frontTyre: '40-584', rearTyre: '', pressure: { wheel: '650b', rim: 'hookless', rimMm: 25, frontMm: 42, rearMm: 42, frontCasing: 'thin', bikeKg: 13 },
};
const LOADCHECK = {
  'loadcheck:summary:v1': JSON.stringify(summary),
  'loadcheck:bikeProfiles': JSON.stringify([bike]),
  'loadcheck:bikeProfile': JSON.stringify(bike),
  'loadcheck:draft': '{"keep":"me"}',
};

function services(mem: ReturnType<typeof memory>, riderKg: number | null = null): TyreServices {
  return { host: () => readHost(mem.kv, () => riderKg), storage: mem.kv, now: () => NOW };
}
const mount = async (s: TyreServices) => { await act(() => { render(<TyreScreen services={s} />, host); }); };
const labelled = (text: string): HTMLInputElement => {
  const label = [...host.querySelectorAll('label')].find((l) => l.textContent?.includes(text));
  if (!label) throw new Error(`no label ${text}`);
  return (label.querySelector('input,select') ?? host.querySelector(`#${label.getAttribute('for')}`)) as HTMLInputElement;
};
const type = async (el: HTMLInputElement, value: string) => {
  await act(() => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const click = async (el: Element) => { await act(() => { (el as HTMLElement).click(); }); };
const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const figures = () => [...host.querySelectorAll('.tyre-big')].map((e) => e.textContent);

beforeEach(() => { go('tools/tyre'); });

describe('the tyre screen', () => {
  test('[TY-UI-REQUIRED] the sidewall maximum is the only required field; without it the screen says so and shows no figure', async () => {
    await mount(services(memory()));
    expect(host.textContent).toContain(W.tyreNeedMax);
    expect(figures()).toEqual([]);
    await type(labelled(W.tyreLimitMaxLabel), '5');
    expect(figures().length).toBe(2);
    expect(host.textContent).not.toContain(W.tyreNeedMax);
    // The rest was assumed, and the screen says what.
    expect(host.querySelector('.tyre-assumed')?.textContent).toContain('rider weight 75 kg');
    await type(labelled(W.tyreLimitMaxLabel), '');
    expect(figures()).toEqual([]);
    expect(host.textContent).toContain(W.tyreNeedMax);
  });

  test('[TY-UI-REQUIRED] a limit typed in the wrong unit is asked about, and nothing shows while the question stands', async () => {
    await mount(services(memory()));
    await type(labelled(W.tyreLimitMaxLabel), '65');
    expect(host.textContent).toContain('Did you mean 65 psi?');
    expect(figures()).toEqual([]);
    await click(button('Yes, 65 psi'));
    expect(figures().length).toBe(2);
    const text = host.textContent ?? '';
    expect(text).toMatch(/psi/);
    // Declining keeps bar, and 65 bar is then refused.
    await click(host.querySelector('input[name="tyre-max-unit"]')!); // back to bar: 65 bar is asked about again
    expect(host.textContent).toContain('Did you mean 65 psi?');
    await click(button('No, bar'));
    expect(figures()).toEqual([]);
    expect(host.textContent).toContain('is not a tyre pressure');
  });

  test('[TY-UI-FROM-BIKE] handlebar, wheel and widths start from the bike, weights from the plan, rider weight from You; the plan bike is preselected; changes stay here', async () => {
    const mem = memory(LOADCHECK);
    await mount(services(mem, 82));
    expect((host.querySelector('#tyre-bike') as HTMLSelectElement).value).toBe(bike.id);
    const from = [...host.querySelectorAll('.tyre-from')].map((e) => e.textContent ?? '');
    expect(from.some((t) => t.includes(W.tyreBarsLabel) && t.includes('Flat') && t.includes('from your bike') && t.includes(W.tyreChange))).toBe(true);
    expect(from.some((t) => t.includes(W.tyreWheelLabel) && t.includes('650B') && t.includes('from your bike'))).toBe(true);
    expect(from.some((t) => t.includes(W.tyreFrontWidthLabel) && t.includes('42 mm') && t.includes('from your bike'))).toBe(true);
    expect(from.some((t) => t.includes(W.tyreRiderLabel) && t.includes('82 kg') && t.includes('from You'))).toBe(true);
    expect(from.some((t) => t.includes(W.tyreBikeKgLabel) && t.includes('14 kg') && t.includes('from your bag plan, saved 28 Oct'))).toBe(true);
    expect(from.some((t) => t.includes(W.tyreLoadLabel) && t.includes('10.2 kg') && t.includes('saved 28 Oct'))).toBe(true);
    const before = JSON.stringify(Object.fromEntries(Object.entries(mem.kv.dump()).filter(([k]) => k.startsWith('loadcheck:'))));
    // Change the handlebar: it is now the tool's own value, and Load Check's records are the same.
    const change = [...host.querySelectorAll('.tyre-from')].find((e) => e.textContent?.includes(W.tyreBarsLabel))!.querySelector('button')!;
    await click(change);
    await click(host.querySelector('input[name="tyre-bars"][value="drop"]')!);
    const stored = readStore(mem.kv);
    expect(stored.ok && stored.store.entries[bike.id]?.details.bars).toBe('drop');
    expect(JSON.stringify(Object.fromEntries(Object.entries(mem.kv.dump()).filter(([k]) => k.startsWith('loadcheck:'))))).toBe(before);
  });

  test('[TY-UI-FROM-BIKE] a plan whose bike nobody has is treated as no bike, and another bike does not take the plan\'s load', async () => {
    const orphan = { ...summary, bikeId: 'bike_gone' };
    const mem = memory({ ...LOADCHECK, 'loadcheck:summary:v1': JSON.stringify(orphan), 'loadcheck:bikeProfiles': '[]', 'loadcheck:bikeProfile': 'null' });
    await mount(services(mem));
    expect((host.querySelector('#tyre-bike') as HTMLSelectElement).value).toBe('default');
    expect(host.textContent).not.toContain('from your bag plan');
  });

  test('[TY-UI-STORE] details are kept per bike id, or under a default key, and travel in the export', async () => {
    const mem = memory(LOADCHECK);
    await mount(services(mem));
    await type(labelled(W.tyreLimitMaxLabel), '6');
    const sel = host.querySelector('#tyre-bike') as HTMLSelectElement;
    await act(() => { sel.value = 'default'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(figures()).toEqual([]);
    await type(labelled(W.tyreLimitMaxLabel), '4.5');
    const read = readStore(mem.kv);
    expect(read.ok && read.store.entries[bike.id]?.details.tyreMax).toEqual({ value: 6, unit: 'bar' });
    expect(read.ok && read.store.entries.default?.details.tyreMax).toEqual({ value: 4.5, unit: 'bar' });
    // The export carries it, and an import on an empty browser brings it back.
    const section = exportTyres(mem.kv);
    expect(section?.entries[bike.id]).toBeDefined();
    const other = memory();
    expect(importTyres(other.kv, JSON.parse(JSON.stringify(section)), NOW)).toEqual({ ok: true });
    const again = readStore(other.kv);
    expect(again.ok && again.store.entries[bike.id]?.details.tyreMax?.value).toBe(6);
    // A newer format is not read or overwritten; a bad section writes nothing.
    expect(importTyres(other.kv, { v: 2, entries: {} }, NOW).ok).toBe(false);
    expect(other.data.get(TYRE_KEY)).toBeDefined();
  });

  test('[TY-UI-STORE] #/tools/tyre opens the tool inside Tools', async () => {
    await act(() => { go('tools/tyre'); render(<App />, host); });
    expect(host.textContent).toContain(W.tyreTitle);
    expect(host.querySelector('.tabs [aria-current="page"]')?.textContent).toBe('Tools');
  });

  test('[TY-UI-NOWRITE] no loadcheck key changes, byte for byte, after use', async () => {
    const mem = memory(LOADCHECK);
    const before = JSON.stringify(Object.entries(mem.kv.dump()).sort());
    await mount(services(mem, 80));
    await type(labelled(W.tyreLimitMaxLabel), '5');
    await type(labelled(W.tyreLimitMinLabel), '3');
    await click(host.querySelector('input[name="tyre-setup"][value="tubeless"]')!);
    await click(host.querySelector('input[name="tyre-surface"][value="unpaved"]')!);
    expect(figures().length).toBe(2);
    expect(mem.writes.length).toBeGreaterThan(0);
    expect(mem.writes.every((k) => k === TYRE_KEY)).toBe(true);
    expect(JSON.stringify(Object.entries(mem.kv.dump()).filter(([k]) => k !== TYRE_KEY).sort())).toBe(before);
  });

  test('[TY-UI-LAST] the Tools tab shows the last tyre result and the bag plan line', async () => {
    const mem = memory(LOADCHECK);
    await mount(services(mem));
    await type(labelled(W.tyreLimitMaxLabel), '3.2');
    render(null, host);
    await act(() => { render(<ToolsScreen services={services(mem)} />, host); });
    const text = host.textContent ?? '';
    const read = readStore(mem.kv);
    const last = read.ok ? read.store.entries[bike.id]!.last! : null;
    expect(last).not.toBeNull();
    expect(text).toContain(`front ${Number(last!.frontBar.toFixed(2))} · rear ${Number(last!.rearBar.toFixed(2))} bar`);
    expect(text).toContain('3 bags · 10.2 kg');
    expect(host.querySelector('a[href="/tools/bags/"]')).not.toBeNull();
    // With nothing yet: plain words, not a blank.
    render(null, host);
    await act(() => { render(<ToolsScreen services={services(memory())} />, host); });
    expect(host.textContent).toContain(W.tyreCardNone);
    expect(host.textContent).toContain(W.tyreBagCardNone);
  });

  test('[TY-UI-WARNINGS] every warning, and what decided the number, are in words; the split is always shown', async () => {
    const mem = memory(LOADCHECK);
    await mount(services(mem, 110));
    await type(labelled(W.tyreLimitMaxLabel), '2.5');
    const text = host.textContent ?? '';
    expect(text).toContain(W.tyreWarnCapBinds);
    expect(text).toContain('held down by your tyre');
    expect(text).toContain(W.tyreHeadingWhy);
    expect(text).toMatch(/Weight split: \d+% front, \d+% rear\./);
    expect(text).toContain(W.tyreWhyLever);
    // A hookless rim from the bike says what it needs.
    expect(text).toContain(W.tyreWarnHooklessTss);
    // The split is shown also with nothing set but the maximum.
    render(null, host);
    await mount(services(memory()));
    await type(labelled(W.tyreLimitMaxLabel), '5');
    expect(host.textContent).toMatch(/Weight split: 45% front, 55% rear\./);
    expect(host.textContent).toContain(W.tyreWhyDefaultNoPlan);
  });

  test('[TY-UI-WARNINGS] a refused width is said in words and no figure is shown', async () => {
    await mount(services(memory()));
    await type(labelled(W.tyreLimitMaxLabel), '5');
    await type(labelled(W.tyreFrontWidthLabel), '100');
    expect(figures()).toEqual([]);
    expect(host.textContent).toContain('outside the 18 to 83 mm this tool covers');
  });
});
