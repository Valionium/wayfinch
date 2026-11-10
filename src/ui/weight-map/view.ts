// The bag planner's weight map (weight map and bag shapes design, 1.4 to 1.7): served as /tools/bags/weightmap.js, loaded on the first
// press of "Show the map" at the packing check (the owner's decision of 9 Nov 2026). Your weight and the ideal share one fixed scale;
// the difference is opt-in. The ideal is the rider's own setup packed for the best balance the planner found (the owner's finding G,
// 8 Nov 2026; one ideal, the rider's own bags, since 9 Nov): the page works it out and hands it over. Each map's canvas is decoration
// (aria-hidden): its picture's name is the sentence under it, which carries the whole message without colour. The page never jumps
// (finding G): the switch sits above the maps and is built once, every later change is made in place, and the difference is added and
// taken away at the end.
import type { P } from '../../core/bike/art.ts';
import { blur, diffLine, FULL, GRID, movedLine, shareLine, splat, zoneShares } from '../../core/bike/weightmap.ts';
import type { MapItem } from '../../core/bike/weightmap.ts';
import { WM } from '../../core/wording/en-weightmap.ts';

/** The ideal the page worked out: the rider's own bags and things, packed for the best balance the planner found. */
export type Ideal = { items: MapItem[] };

export type MapInput = {
  /** Each packed bag (and bottle, and the rack deck's load) with its kilos and its outline as the rig draws it. */
  items: MapItem[];
  /** The drawing's units per millimetre (the anchors' scale). */
  scale: number;
  /** The rig's bike without its colour, its SVG markup without the bags. */
  bike: string;
  ideal: Ideal;
  /** Show where yours differs (opt-in). */
  diff: boolean;
  /**
   * After Handling first (design of 10 Nov 2026, §3): the packing before the press. The maps are then Before (this) and After (`items`)
   * on the same fixed scale, with one sentence of what moved in place of the difference's switch.
   */
  before?: { items: MapItem[] };
  onDiff: (on: boolean) => void;
};

const PX = 2;
const VB = `${GRID.x} ${GRID.y} ${GRID.w * GRID.cell} ${GRID.h * GRID.cell}`;
const r1 = (n: number) => Math.round(n * 10) / 10;
const pts = (o: P[]) => o.map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** For each pixel along one axis: the cell before it and how far towards the next (the field is read between the four cells around). */
function axis(px: number, cells: number): [Int32Array, Float32Array] {
  const i = new Int32Array(px);
  const f = new Float32Array(px);
  for (let p = 0; p < px; p++) {
    const g = Math.max(0, Math.min(cells - 1.001, (p + 0.5) / PX / GRID.cell - 0.5));
    i[p] = g | 0;
    f[p] = g - (g | 0);
  }
  return [i, f];
}

/** Paints one map: the theme's three-step ramp (lightness always one way), or the difference's teal, grey and orange; contour lines. */
export function paint(canvas: HTMLCanvasElement, F: Float32Array | null, diff: boolean, colours: number[][]): void {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  const [W, H] = [GRID.w * GRID.cell * PX, GRID.h * GRID.cell * PX];
  canvas.width = W;
  canvas.height = H;
  if (!F) return; // no ideal: the bike alone
  const [c0, c1, c2, cn, cp, cz, ink] = colours;
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);
  // the colours, worked out once: 256 steps from the low end to full (and from -full to +full on the difference)
  const lut = new Uint8ClampedArray(256 * 3);
  for (let n = 0; n < 256; n++) {
    const t = n / 255;
    const u = Math.min(1, Math.abs(2 * t - 1) / 0.6);
    lut.set(diff ? mix(cz!, t < 0.5 ? cn! : cp!, u) : t < 0.5 ? mix(c0!, c1!, t * 2) : mix(c1!, c2!, (t - 0.5) * 2), n * 3);
  }
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const band = new Int8Array(W * H);
  const [cx, fx] = axis(W, GRID.w);
  const [cy, fy] = axis(H, GRID.h);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, a, b] = [cy[y]! * GRID.w + cx[x]!, fx[x]!, fy[y]!];
    const v = ((F[r]! * (1 - a) + F[r + 1]! * a) * (1 - b) + (F[r + GRID.w]! * (1 - a) + F[r + GRID.w + 1]! * a) * b) / FULL;
    const i = y * W + x;
    band[i] = diff ? (v < -0.2 ? -2 : v < -0.04 ? -1 : v > 0.2 ? 2 : v > 0.04 ? 1 : 0) : Math.floor(Math.max(0, Math.min(0.999, v)) * 4);
    const n = 3 * Math.round(255 * Math.max(0, Math.min(1, diff ? (v + 1) / 2 : v)));
    data[i * 4] = lut[n]!;
    data[i * 4 + 1] = lut[n + 1]!;
    data[i * 4 + 2] = lut[n + 2]!;
    data[i * 4 + 3] = 255;
  }
  // the contour lines: where the band changes, half towards the text colour
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const i = y * W + x;
    if (band[i] !== band[i + 1] || band[i] !== band[i + W]) for (let j = 0; j < 3; j++) img.data[i * 4 + j] = (img.data[i * 4 + j]! + ink![j]!) / 2;
  }
  ctx.putImageData(img, 0, 0);
}

const card = (id: string) => `<figure class="wm-card" data-card="${id}"><figcaption></figcaption><div class="wm-wrap"><canvas aria-hidden="true"></canvas>`
  + `<svg viewBox="${VB}" role="img"></svg></div><p class="wm-sum"></p></figure>`;

/** The frame, built once per host: caption, the switch, then the maps and the key. */
function frame(host: HTMLElement): HTMLElement {
  const maps = host.querySelector<HTMLElement>(':scope > .wm-maps');
  if (maps) return maps;
  host.innerHTML = `<p class="wm-cap">${esc(WM.caption)}</p><div class="wm-ctrl"><button type="button" class="wm-diff"></button><p class="wm-moved" hidden></p></div>`
    + `<div class="wm-maps">${card('y')}${card('i')}</div>`
    + `<div class="wm-key"><div class="wm-bar" aria-hidden="true"></div><p>${esc(WM.key)}</p><p>${esc(WM.keyNote)}</p></div>`;
  return host.querySelector<HTMLElement>(':scope > .wm-maps')!;
}

type Card = { title: string; sub: string; line: string; art: string; field: Float32Array; diff: boolean };

/** One map's card, filled in place: its title, the bike and the bags' outlines over the painted field, and its sentence. */
function fill(el: Element, c: Card, colours: number[][], bike: string): void {
  el.querySelector('figcaption')!.innerHTML = `<b>${esc(c.title)}</b> <span>${esc(c.sub)}</span>`;
  const svg = el.querySelector('svg')!;
  svg.setAttribute('aria-label', `${c.title}. ${c.line}`);
  svg.innerHTML = bike + c.art;
  const sum = el.querySelector('.wm-sum')!;
  sum.textContent = c.line;
  // the sentence is the picture's name, so read once
  sum.setAttribute('aria-hidden', 'true');
  paint(el.querySelector('canvas')!, c.field, c.diff, colours);
}

/** Draws the weight map into `host`, changing in place whatever is already there. */
export function render(host: HTMLElement, input: MapInput): void {
  const { items, ideal } = input;
  const total = items.reduce((t, i) => t + i.kg, 0);
  if (!(total > 0)) { host.innerHTML = `<p class="wm-note">${esc(WM.nothing)}</p>`; return; }
  // the theme's colours, read once (before the markup changes, so the page's style is worked out at most once)
  const style = getComputedStyle(host);
  const colours = ['--wm0', '--wm1', '--wm2', '--wmneg', '--wmpos', '--wmzero', '--ink'].map((n) => {
    const v = style.getPropertyValue(n).trim();
    return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16) || 0);
  });
  const maps = frame(host);
  const art = (list: MapItem[]) => list.map((i) => `<polygon class="wm-bag${i.pos === 'pack' ? ' wm-back' : ''}" points="${pts(i.outline)}"/>`).join('')
    + list.filter((i) => i.pos === 'pack').map((i) => {
      const xs = i.outline.map((p) => p[0]);
      return `<text class="wm-label" x="${r1((Math.min(...xs) + Math.max(...xs)) / 2)}" y="${r1(Math.min(...i.outline.map((p) => p[1])) - 2.5)}" text-anchor="middle">${esc(WM.back)}</text>`;
    }).join('');
  // after Handling first: Before and After in the two cards, no difference (the switch hidden, the same element)
  const ba = input.before;
  const first = ba ? ba.items : items, second = ba ? items : ideal.items;
  const Fy = blur(splat(first, input.scale));
  const zy = zoneShares(first);
  const Fi = blur(splat(second, input.scale));
  const zi = zoneShares(second);
  const [yc, ic] = [maps.querySelector('[data-card="y"]')!, maps.querySelector('[data-card="i"]')!];
  const firstKg = first.reduce((t, i) => t + i.kg, 0).toFixed(1);
  fill(yc, { title: ba ? WM.before : WM.yours, sub: ba ? WM.beforeSub(firstKg) : WM.yoursSub(total.toFixed(1)), line: shareLine(zy), art: art(first), field: Fy, diff: false }, colours, input.bike);
  fill(ic, { title: ba ? WM.after : WM.ideal, sub: ba ? WM.afterSub : WM.idealSub, line: shareLine(zi), art: art(second), field: Fi, diff: false }, colours, input.bike);
  const diff = input.diff && !ba;
  // the difference: added at the end and taken away again, so nothing above it moves
  let dc = maps.querySelector('[data-card="d"]');
  if (diff && !dc) { maps.insertAdjacentHTML('beforeend', card('d')); dc = maps.querySelector('[data-card="d"]'); }
  if (!diff && dc) { dc.remove(); dc = null; }
  if (dc) fill(dc, { title: WM.diff, sub: WM.diffSub, line: diffLine(zy, zi), art: '', field: Fy.map((v, n) => v - Fi[n]!), diff: true }, colours, input.bike);
  const key = host.querySelector('.wm-key')!;
  key.querySelectorAll('.wm-bar-diff, .wm-key-diff').forEach((e) => e.remove());
  if (diff) key.insertAdjacentHTML('beforeend', `<div class="wm-bar wm-bar-diff" aria-hidden="true"></div><p class="wm-key-diff">${esc(WM.diffKey)}</p>`);
  const moved = host.querySelector<HTMLElement>('.wm-moved')!;
  moved.hidden = !ba;
  moved.textContent = ba ? movedLine(first, second) : '';
  // the switch: the same element every time, so the focus stays where the rider left it
  const diffB = host.querySelector<HTMLButtonElement>('.wm-diff')!;
  diffB.hidden = !!ba;
  diffB.textContent = input.diff ? WM.diffHide : WM.diffShow;
  diffB.onclick = () => input.onDiff(!input.diff);
}
