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
const hooked = async () => { await click(host.querySelector('input[name="tyre-rimtype"][value="hooked"]')!); };
const figures = () => [...host.querySelectorAll('.tyre-big')].map((e) => e.textContent);

beforeEach(() => { go('tools/tyre'); });

describe('the tyre screen', () => {
  test('[TY-UI-REQUIRED] the sidewall maximum is the only required field; without it the screen says so and shows no figure', async () => {
    await mount(services(memory()));
    expect(host.textContent).toContain(W.tyreNeedMax);
    expect(figures()).toEqual([]);
    await type(labelled(W.tyreLimitMaxLabel), '5');
    // With only the maximum, the rim type and width are unknown: friendly words, not an error.
    expect(figures()).toEqual([]);
    expect(host.textContent).toContain(W.tyreNeedTwo);
    expect(host.textContent).not.toContain('do not fit together');
    await hooked();
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
    await hooked();
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

  test('[TY-UI-FROM-YOU] rider weight from You, read through the function the app connects to its store', async () => {
    await mount(services(memory(LOADCHECK), 82));
    const from = [...host.querySelectorAll('.tyre-from')].map((e) => e.textContent ?? '');
    expect(from.some((t) => t.includes(W.tyreRiderLabel) && t.includes('82 kg') && t.includes('from You'))).toBe(true);
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
    // The tool's screen is a lazy chunk: it comes in a moment later.
    for (let n = 0; n < 200 && !host.textContent?.includes(W.tyreTitle); n++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
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
    await hooked();
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

describe('the extras', () => {
  test('[TY-HEAT] with the temperatures and the highest point the screen says how high to pump; without them it says the check was skipped', async () => {
    await mount(services(memory()));
    await hooked();
    await type(labelled(W.tyreLimitMaxLabel), '3');
    expect(host.textContent).toContain(W.tyreHeatSkipped);
    await type(labelled(W.tyreHeatPumpLabel), '15');
    await type(labelled(W.tyreHeatMaxLabel), '35');
    await type(labelled(W.tyreHighestLabel), '2000');
    expect(host.textContent).not.toContain(W.tyreHeatSkipped);
    expect(host.textContent).toMatch(/Pump to at most \d\.\d\d bar/);
  });

  test('[TY-MEASURED] weighed wheel loads and calipered widths are taken, and the screen says so', async () => {
    await mount(services(memory()));
    await hooked();
    await type(labelled(W.tyreLimitMaxLabel), '6');
    await type(labelled(W.tyreMeasuredFrontLabel), '40');
    expect(host.textContent).not.toContain(W.tyreWhyMeasured);
    await type(labelled(W.tyreMeasuredRearLabel), '60');
    expect(host.textContent).toContain(W.tyreWhyMeasured);
    expect(host.textContent).toMatch(/Weight split: 40% front, 60% rear\./);
    await type(labelled(W.tyreCaliperFrontLabel), '35.5');
    expect(host.textContent).toContain('effective width 35.5 mm');
  });

  test('[TY-SRAM] a link and the list of what to type there; nothing prefilled or sent; the calculators differ', async () => {
    await mount(services(memory()));
    await type(labelled(W.tyreLimitMaxLabel), '6');
    const a = host.querySelector('a[href^="https://axs.sram.com/"]') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://axs.sram.com/guides/tire/pressure');
    expect(a.getAttribute('rel')).toContain('noopener');
    const items = [...host.querySelectorAll('.tyre-sram li')].map((e) => e.textContent ?? '');
    expect(items.length).toBe(9);
    expect(items[0]).toContain('Rider weight');
    expect(host.textContent).toContain('Calculators differ by 10–30%');
    expect(host.textContent).toContain(W.tyreSramNothingSent);
  });
});

describe('review findings, on the screen', () => {
  const bikeB = { id: 'bike_b', name: 'Gravel hookless', look: { colour: null, bars: 'drop', ebike: null }, tyres: 'tubeless', frontTyre: '30-622', rearTyre: '30-622', pressure: { wheel: '700c', rim: 'hookless', rimMm: 21 } };
  const TWO = { ...LOADCHECK, 'loadcheck:bikeProfiles': JSON.stringify([bike, bikeB]) };
  const select = async (key: string) => {
    const sel = host.querySelector('#tyre-bike') as HTMLSelectElement;
    await act(() => { sel.value = key; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  };
  const resultText = () => host.querySelector('.tyre-result')?.textContent ?? '';
  const stored = (mem: ReturnType<typeof memory>) => mem.data.get(TYRE_KEY);

  test('[TY-UI-STORE] C1: switching bike never writes one bike\'s details over another\'s, and the fields reload whole', async () => {
    const mem = memory(TWO);
    await mount(services(mem));
    await select('default');
    await type(labelled(W.tyreLimitMaxLabel), '8');
    await click(host.querySelector('input[name="tyre-rimtype"][value="hooked"]')!);
    await type(labelled(W.tyreRiderLabel), '110');
    const before = stored(mem);
    await select('bike_b');
    expect((labelled(W.tyreLimitMaxLabel)).value).toBe('');
    expect(host.textContent).toContain(W.tyreNeedMax);
    expect(stored(mem)).toBe(before);
    const read = readStore(mem.kv);
    expect(read.ok && read.store.entries.bike_b).toBeUndefined();
    await select('default');
    expect((labelled(W.tyreLimitMaxLabel)).value).toBe('8');
    expect(stored(mem)).toBe(before);
    // Weighed loads and a stored limit of the other bike do not leak either.
    await type(labelled(W.tyreMeasuredFrontLabel), '40');
    await type(labelled(W.tyreMeasuredRearLabel), '60');
    await select('bike_b');
    await type(labelled(W.tyreLimitMaxLabel), '65');
    await click(button('Yes, 65 psi'));
    expect((labelled(W.tyreMeasuredFrontLabel)).value).toBe('');
    const r2 = readStore(mem.kv);
    expect(r2.ok && r2.store.entries.bike_b?.details.measured).toBeUndefined();
    expect(r2.ok && r2.store.entries.default?.details.tyreMax).toEqual({ value: 8, unit: 'bar' });
    await select('default');
    expect((labelled(W.tyreLimitMaxLabel)).value).toBe('8');
  });

  test('[TY-UI-REQUIRED] I1: a rim maximum that is asked about or rejected shows no figure until it is answered', async () => {
    await mount(services(memory()));
    await hooked();
    await type(labelled(W.tyreLimitMaxLabel), '7');
    expect(figures().length).toBe(2);
    await type(labelled(W.tyreLimitRimLabel), '65');
    expect(host.textContent).toContain('Did you mean 65 psi?');
    expect(figures()).toEqual([]);
    expect(resultText()).toContain(W.tyrePendingLimit(W.tyreLimitRimLabel));
    await click(host.querySelectorAll('button')[[...host.querySelectorAll('button')].findIndex((b) => b.textContent === 'Yes, 65 psi')]!);
    expect(figures().length).toBe(2);
    await type(labelled(W.tyreLimitRimLabel), '170');
    await click(host.querySelector('input[name="tyre-rimmax-unit"][value="psi"]') ?? host.querySelectorAll('input[name="tyre-rimmax-unit"]')[1]!);
    expect(figures()).toEqual([]);
  });

  test('[TY-UI-LAST] I2: the Tools card is always current, or gone', async () => {
    const mem = memory(LOADCHECK);
    await mount(services(mem));
    await type(labelled(W.tyreLimitMaxLabel), '8');
    render(null, host);
    await mount(services(mem));
    await type(labelled(W.tyreLimitMaxLabel), '4');
    await type(labelled(W.tyreLimitMinLabel), '2');
    const read = readStore(mem.kv);
    const shownFront = Number((figures()[0] ?? '').replace(' bar', ''));
    expect(shownFront).toBeGreaterThan(0);
    expect(read.ok && read.store.entries[bike.id]?.last?.frontBar).toBe(shownFront);
    render(null, host);
    await act(() => { render(<ToolsScreen services={services(mem)} />, host); });
    expect(host.textContent).toMatch(/front \d(\.\d+)? · rear \d(\.\d+)? bar/);
    expect(host.textContent).toContain('Trail Bike');
    render(null, host);
    await mount(services(mem));
    await type(labelled(W.tyreLimitMaxLabel), '');
    const gone = readStore(mem.kv);
    expect(gone.ok && gone.store.entries[bike.id]?.last).toBeNull();
    render(null, host);
    await act(() => { render(<ToolsScreen services={services(mem)} />, host); });
    expect(host.textContent).toContain(W.tyreCardNone);
  });

  test('[TY-UI-WARNINGS] I3: the one maximum is said to apply to both wheels', async () => {
    await mount(services(memory()));
    expect(host.textContent).toContain(W.tyreLimitBothWheels);
  });

  test('[TY-UI-WARNINGS] I4: the screen with no figure prints no pressure number', async () => {
    await mount(services(memory()));
    await hooked();
    await type(labelled(W.tyreLimitMaxLabel), '1.2');
    expect(figures()).toEqual([]);
    expect(host.querySelector('.tyre-result h3')?.textContent).toBe(W.tyreIncompatibleTitle);
    expect(resultText()).not.toMatch(/\d\s*(bar|psi)/);
  });

  test('[TY-UI-WARNINGS] I5 and I7: what was assumed is listed, with no luggage and the weight to enter, rim type and width first', async () => {
    await mount(services(memory()));
    await type(labelled(W.tyreLimitMaxLabel), '5');
    const line = host.querySelector('.tyre-assumed')?.textContent ?? '';
    expect(line).toContain('no luggage');
    expect(line).toContain('rider weight 75 kg (enter yours)');
    expect(line.indexOf('rim type')).toBeGreaterThan(-1);
    expect(line.indexOf('rim type')).toBeLessThan(line.indexOf('rider weight'));
    expect(line.indexOf('tyre 32 mm')).toBeLessThan(line.indexOf('rider weight'));
  });

  test('[TY-UI-WARNINGS] C2: an unset rim type shows nothing selected, stays within hookless limits, says so beside the figure, and one tap clears it', async () => {
    const mem = memory();
    await mount(services(mem));
    await type(labelled(W.tyreLimitMaxLabel), '7');
    const rimRadios = [...host.querySelectorAll('input[name="tyre-rimtype"]')] as HTMLInputElement[];
    expect(rimRadios.length).toBe(3);
    expect(rimRadios.some((r) => r.checked)).toBe(false);
    expect(figures()).toEqual([]); // width not set either: asked for, with no figure
    expect(resultText()).toContain(W.tyreNeedTwo);
    expect(resultText()).not.toContain('do not fit together');
    expect(readStore(mem.kv).ok && Object.values((readStore(mem.kv) as { store: { entries: Record<string, { last: unknown }> } }).store.entries).every((e) => e.last === null)).toBe(true);
    await type(labelled(W.tyreFrontWidthLabel), '32');
    await type(labelled(W.tyreRearWidthLabel), '32');
    const big = figures().map((t) => Number((t ?? '').replace(' bar', '')));
    expect(big.length).toBe(2);
    expect(Math.max(...big)).toBeLessThanOrEqual(4.5); // the 32 mm hookless row
    expect(resultText()).toContain(W.tyreWarnRimUnset);
    expect(host.querySelector('.tyre-wheels')?.parentElement?.textContent).toContain(W.tyreWarnRimUnset);
    await click(button(W.tyreMyRimHooked));
    expect((host.querySelector('input[name="tyre-rimtype"][value="hooked"]') as HTMLInputElement).checked).toBe(true);
    expect(resultText()).not.toContain(W.tyreWarnRimUnset);
  });

  test('[TY-UI-FROM-BIKE] I6: an assumed choice can be confirmed by tapping it, and a bike\'s choice is labelled', async () => {
    const mem = memory();
    await mount(services(mem));
    await type(labelled(W.tyreLimitMaxLabel), '5');
    const casing = host.querySelectorAll('input[name="tyre-casing"]');
    expect([...casing].some((r) => (r as HTMLInputElement).checked)).toBe(false);
    expect(host.querySelector('.tyre-assumed')?.textContent).toContain('standard casing');
    await click(host.querySelector('input[name="tyre-casing"][value="standard"]')!);
    expect(host.querySelector('.tyre-assumed')?.textContent ?? '').not.toContain('standard casing');
    render(null, host);
    await mount(services(memory(TWO)));
    const legends = [...host.querySelectorAll('legend')].map((l) => l.textContent ?? '');
    expect(legends.some((t) => t.includes(W.tyreSetupLabel) && t.includes(W.tyreFromBike))).toBe(true);
  });

  test('[TY-UI-FROM-BIKE] M7: Clear, not "Back to your bike\'s value", when no bike supplies the field', async () => {
    await mount(services(memory()));
    await type(labelled(W.tyreRiderLabel), '80');
    expect(button(W.tyreClear)).toBeDefined();
    expect(host.textContent).not.toContain(W.tyreBackToBike);
  });

  test('[TY-UI-LAST] M8 and M9: heat advice sits under the figure and the card shows that figure', async () => {
    const mem = memory();
    await mount(services(mem));
    await hooked();
    await type(labelled(W.tyreLimitMaxLabel), '3');
    await type(labelled(W.tyreHeatPumpLabel), '15');
    await type(labelled(W.tyreHeatMaxLabel), '35');
    await type(labelled(W.tyreHighestLabel), '2000');
    expect(host.querySelector('.tyre-wheel')?.textContent).toMatch(/Pump to at most/);
    // The heat limit can leave one value: it reads as one value, not "2.50 to 2.50".
    expect(host.querySelector('.tyre-wheel')?.textContent).not.toMatch(/(\d\.\d\d) to /);
  });

  test('[TY-PSI-QUERY] M2 and M5 on the screen: a small psi number is asked about; a rim maximum under the minimum is refused', async () => {
    await mount(services(memory()));
    await hooked();
    await click(host.querySelectorAll('input[name="tyre-max-unit"]')[1]!);
    await type(labelled(W.tyreLimitMaxLabel), '5');
    expect(host.textContent).toContain('Did you mean 5 bar?');
    expect(figures()).toEqual([]);
    await click(button('Yes, 5 bar'));
    expect(figures().length).toBe(2);
    await type(labelled(W.tyreLimitMinLabel), '4');
    await type(labelled(W.tyreLimitRimLabel), '3');
    expect(host.textContent).toContain(W.tyreLimitBelowMin);
    expect(figures()).toEqual([]);
  });
});

describe('re-check findings, on the screen', () => {
  const resultText = () => host.querySelector('.tyre-result')?.textContent ?? '';

  test('[TY-UI-REQUIRED] R1 and R5: a hooked rim may keep an assumed width; a hookless one asks for it, in one or two things', async () => {
    await mount(services(memory()));
    await type(labelled(W.tyreLimitMaxLabel), '7');
    expect(resultText()).toContain(W.tyreNeedTwo);
    await click(host.querySelector('input[name="tyre-rimtype"][value="hookless"]')!);
    expect(resultText()).toContain(W.tyreNeedWidthOnly);
    expect(figures()).toEqual([]);
    await type(labelled(W.tyreFrontWidthLabel), '28');
    expect(figures().length).toBe(2);
    expect(Math.max(...figures().map((f) => Number((f ?? '').replace(' bar', ''))))).toBeLessThanOrEqual(5);
    await click(host.querySelector('input[name="tyre-rimtype"][value="hooked"]')!);
    await type(labelled(W.tyreFrontWidthLabel), '');
    expect(figures().length).toBe(2);
  });

  test('[TY-UI-WARNINGS] R9 and R7: the hooked button says what to do when unsure; a rear width that follows the front is said so on hookless rims', async () => {
    await mount(services(memory()));
    await type(labelled(W.tyreLimitMaxLabel), '7');
    await type(labelled(W.tyreFrontWidthLabel), '30');
    expect(resultText()).toContain(W.tyreWarnRimUnset);
    expect(resultText()).toContain(W.tyreRimUnsure);
    expect(host.textContent).toContain(W.tyreSameAsFront);
    await type(labelled(W.tyreRearWidthLabel), '45');
    expect(host.textContent).not.toContain(W.tyreSameAsFront);
  });

  test('[TY-UI-FROM-BIKE] R2: a bike tyre text that cannot be read is shown, not used', async () => {
    const odd = { ...bike, frontTyre: '28 x 1 1/2', pressure: { wheel: '700c', rim: 'hooked' } };
    await mount(services(memory({ ...LOADCHECK, 'loadcheck:bikeProfiles': JSON.stringify([odd]), 'loadcheck:bikeProfile': JSON.stringify(odd) })));
    expect(host.textContent).toContain(W.tyreCouldntRead('28 x 1 1/2'));
    expect([...host.querySelectorAll('.tyre-from')].some((e) => (e.textContent ?? '').includes(W.tyreFrontWidthLabel))).toBe(false);
  });

  test('[TY-UI-LAST] R6: with heat advice only the pump-to line is given, no range', async () => {
    await mount(services(memory()));
    await click(host.querySelector('input[name="tyre-rimtype"][value="hooked"]')!);
    await type(labelled(W.tyreLimitMaxLabel), '3');
    await type(labelled(W.tyreHeatPumpLabel), '15');
    await type(labelled(W.tyreHeatMaxLabel), '35');
    await type(labelled(W.tyreHighestLabel), '2000');
    const wheel = host.querySelector('.tyre-wheel')?.textContent ?? '';
    expect(wheel).toMatch(/Pump to at most/);
    expect(wheel).not.toContain('Aim for');
  });

  test('[TY-UI-REQUIRED] R8: when a question opens, the Limits field is brought back into view', async () => {
    const calls: Element[] = [];
    (Element.prototype as unknown as { scrollIntoView: (this: Element) => void }).scrollIntoView = function (this: Element) { calls.push(this); };
    await mount(services(memory()));
    await click(host.querySelector('input[name="tyre-rimtype"][value="hooked"]')!);
    await type(labelled(W.tyreLimitMaxLabel), '6');
    await type(labelled(W.tyreLimitMaxLabel), '65');
    expect(calls.at(-1)?.id).toBe('tyre-max-note');
    delete (Element.prototype as unknown as Record<string, unknown>).scrollIntoView;
  });
});
