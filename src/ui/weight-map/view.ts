// The bag planner's weight map (weight map and bag shapes design, 1.4 to 1.7): served as /tools/bags/weightmap.js, loaded on the first
// press of "Show weight map". Your weight and the ideal for the same kilos share one fixed scale; the difference is opt-in. Each map's
// canvas is decoration (aria-hidden): its picture's name is the sentence under it, which carries the whole message without colour.
import type { Anchors, P } from '../../core/bike/art.ts';
import { blur, diffLine, FULL, GRID, idealItems, shareLine, splat, zoneShares } from '../../core/bike/weightmap.ts';
import type { MapItem } from '../../core/bike/weightmap.ts';
import { WM } from '../../core/wording/en-weightmap.ts';

export type MapInput = {
  /** Each packed bag (and bottle, and the rack deck's load) with its kilos and its outline as the rig draws it. */
  items: MapItem[];
  anchors: Anchors;
  ideal: { rack: boolean; frame: boolean; top: boolean };
  /** The rig's bike, its SVG markup without the bags. */
  bike: string;
  shape: Parameters<typeof idealItems>[3];
  pairOffset?: Record<string, P>;
  /** Show where yours differs (opt-in). */
  diff: boolean;
  onDiff: (on: boolean) => void;
};

const PX = 3;
const VB = `${GRID.x} ${GRID.y} ${GRID.w * GRID.cell} ${GRID.h * GRID.cell}`;
const r1 = (n: number) => Math.round(n * 10) / 10;
const pts = (o: P[]) => o.map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The value at (x, y) in drawing units, read between the four cells around it. */
function sample(F: Float32Array, x: number, y: number): number {
  const gx = Math.max(0, Math.min(GRID.w - 1.001, (x - GRID.x) / GRID.cell - 0.5));
  const gy = Math.max(0, Math.min(GRID.h - 1.001, (y - GRID.y) / GRID.cell - 0.5));
  const [x0, y0] = [gx | 0, gy | 0];
  const [fx, fy] = [gx - x0, gy - y0];
  const g = (i: number, j: number) => F[j * GRID.w + i]!;
  return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
}

/** Paints one map: the theme's three-step ramp (lightness always one way), or the difference's teal, grey and orange; contour lines. */
export function paint(canvas: HTMLCanvasElement, F: Float32Array, diff: boolean): void {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  const [W, H] = [GRID.w * GRID.cell * PX, GRID.h * GRID.cell * PX];
  canvas.width = W;
  canvas.height = H;
  const style = getComputedStyle(canvas);
  const css = (n: string) => { const s = style.getPropertyValue(n).trim(); return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) || 0); };
  const [c0, c1, c2, cn, cp, cz, ink] = ['--wm0', '--wm1', '--wm2', '--wmneg', '--wmpos', '--wmzero', '--ink'].map(css) as number[][];
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);
  const img = ctx.createImageData(W, H);
  const band = new Int8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = sample(F, GRID.x + (x + 0.5) / PX, GRID.y + (y + 0.5) / PX) / FULL;
    const t = Math.max(0, Math.min(1, diff ? Math.abs(v) / 0.6 : v));
    band[y * W + x] = diff ? (v < -0.2 ? -2 : v < -0.04 ? -1 : v > 0.2 ? 2 : v > 0.04 ? 1 : 0) : Math.floor(Math.min(0.999, t) * 4);
    const c = diff ? mix(cz!, v < 0 ? cn! : cp!, t) : t < 0.5 ? mix(c0!, c1!, t * 2) : mix(c1!, c2!, (t - 0.5) * 2);
    img.data.set([c[0]!, c[1]!, c[2]!, 255], (y * W + x) * 4);
  }
  // the contour lines: where the band changes, half towards the text colour
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const i = y * W + x;
    if (band[i] !== band[i + 1] || band[i] !== band[i + W]) for (let j = 0; j < 3; j++) img.data[i * 4 + j] = (img.data[i * 4 + j]! + ink![j]!) / 2;
  }
  ctx.putImageData(img, 0, 0);
}

/** Draws the weight map into `host`. */
export function render(host: HTMLElement, input: MapInput): void {
  const { items, anchors: a } = input;
  const total = items.reduce((t, i) => t + i.kg, 0);
  if (!(total > 0)) { host.innerHTML = `<p class="wm-note">${esc(WM.nothing)}</p>`; return; }
  const ideal = idealItems(total, a, input.ideal, input.shape, input.pairOffset);
  const Fy = blur(splat(items, a.scale));
  const Fi = blur(splat(ideal, a.scale));
  const [zy, zi] = [zoneShares(items), zoneShares(ideal)];
  const outline = (list: MapItem[]) => list.map((i) => `<polygon class="wm-bag${i.pos === 'pack' ? ' wm-back' : ''}" points="${pts(i.outline)}"/>`).join('');
  const backs = items.filter((i) => i.pos === 'pack').map((i) => {
    const xs = i.outline.map((p) => p[0]);
    return `<text class="wm-label" x="${r1((Math.min(...xs) + Math.max(...xs)) / 2)}" y="${r1(Math.min(...i.outline.map((p) => p[1])) - 2.5)}" text-anchor="middle">${esc(WM.back)}</text>`;
  }).join('');
  const panel = (id: string, title: string, sub: string, line: string, art: string) =>
    `<figure class="wm-card"><figcaption><b>${esc(title)}</b> <span>${esc(sub)}</span></figcaption><div class="wm-wrap"><canvas data-wm="${id}" aria-hidden="true"></canvas>`
    + `<svg viewBox="${VB}" role="img" aria-label="${esc(`${title}. ${line}`)}">${input.bike}${art}</svg></div><p class="wm-sum">${esc(line)}</p></figure>`;
  host.innerHTML = `<p class="wm-cap">${esc(WM.caption)}</p><div class="wm-maps">`
    + panel('y', WM.yours, WM.yoursSub(total.toFixed(1)), shareLine(zy), outline(items) + backs)
    + panel('i', WM.ideal, WM.idealSub, shareLine(zi), outline(ideal))
    + (input.diff ? panel('d', WM.diff, WM.diffSub, diffLine(zy, zi), '') : '')
    + `</div><button type="button" class="wm-diff" aria-pressed="${input.diff}">${esc(input.diff ? WM.diffHide : WM.diffShow)}</button>`
    + `<div class="wm-key"><div class="wm-bar" aria-hidden="true"></div><p>${esc(WM.key)}</p><p>${esc(WM.keyNote)}</p>`
    + (input.diff ? `<div class="wm-bar wm-bar-diff" aria-hidden="true"></div><p>${esc(WM.diffKey)}</p>` : '') + '</div>';
  const fields: Record<string, [Float32Array, boolean]> = { y: [Fy, false], i: [Fi, false], d: [Fy.map((v, n) => v - Fi[n]!), true] };
  host.querySelectorAll<HTMLCanvasElement>('canvas[data-wm]').forEach((c) => { const f = fields[c.dataset.wm!]!; paint(c, f[0], f[1]); });
  const button = host.querySelector<HTMLButtonElement>('.wm-diff');
  if (button) button.onclick = () => input.onDiff(!input.diff);
}
