// Colour from a photo (spec section 7.4, "Colour from a photo", and section 10): the DOM part of the bag planner's photo colour picker,
// served as /tools/bags/bike-photo.js and loaded only when a rider taps From a photo.
// The photo stays on the phone: it is decoded into a canvas of at most 640 px on its long side, in memory only, and released when
// the picker closes. No request is made, nothing is stored, and the file's bytes are never read here (so neither is EXIF, which
// can hold GPS positions): the browser decodes the image and applies its orientation itself.
import { oklabMedian } from '../../core/bike/colour.ts';

export const MAX_SIDE = 640;
export const PATCH = 15;

/** The words the picker shows; the page passes its own, from its bike wording table. */
export type PickerWords = { choose: string; tap: string; use: string; again: string; close: string; loupe: string; failed: string };
export type PickerOptions = {
  words: PickerWords;
  /** A colour was tapped: show it on the drawing, without keeping it. */
  onPreview: (hex: string | null) => void;
  /** Use this colour. */
  onUse: (hex: string) => void;
  /** The picker closed; the page restores whatever it showed before. */
  onClose: () => void;
};
export type Picker = { close: () => void; root: HTMLElement };

/** The 15 x 15 pixels around (x, y), clamped to the image; the photo's colour elsewhere never counts. */
/** The top left corner of the 15 x 15 square read around (x, y), kept inside the image. */
export function patchOrigin(width: number, height: number, x: number, y: number): [number, number] {
  const half = (PATCH - 1) / 2;
  return [Math.max(0, Math.min(width - PATCH, Math.round(x) - half)), Math.max(0, Math.min(height - PATCH, Math.round(y) - half))];
}

export function patchAt(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): Uint8ClampedArray {
  const [x0, y0] = patchOrigin(width, height, x, y);
  const w = Math.min(PATCH, width);
  const h = Math.min(PATCH, height);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j += 1) {
    const from = ((y0 + j) * width + x0) * 4;
    out.set(data.subarray(from, from + w * 4), j * w * 4);
  }
  return out;
}

/** The frame's colour at a tap: the lightest and darkest fifth dropped (gloss, shadow, cables), the median of the rest. */
export function colourAt(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): string | null {
  return oklabMedian(patchAt(data, width, height, x, y));
}

/** The magnifier: exactly the 15 x 15 pixels the colour is read from, drawn `size` px wide without smoothing and outlined whole. */
export function drawLoupe(ctx: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, x: number, y: number, size: number): void {
  const [x0, y0] = patchOrigin(width, height, x, y);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(source, x0, y0, PATCH, PATCH, 0, 0, size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
}

/** The size the photo is drawn at: its long side at most 640 px, never enlarged. */
export function fitSize(w: number, h: number): { w: number; h: number } {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}): HTMLElementTagNameMap[K] =>
  Object.assign(document.createElement(tag), props);

/** Builds the picker inside `host`. Every way out (Use this colour, Close, the page closing it) clears what it held. */
export function openPicker(host: HTMLElement, options: PickerOptions): Picker {
  const { words } = options;
  const root = el('div', { className: 'photo-pick' });
  const file = el('input', { type: 'file', accept: 'image/*', className: 'photo-file' });
  file.setAttribute('aria-label', words.choose);
  const chooseLabel = el('label', { className: 'look-chip photo-choose' });
  chooseLabel.append(file, el('span', { textContent: words.choose }));
  const hint = el('p', { className: 'photo-hint' });
  hint.setAttribute('role', 'status');
  const stage = el('div', { className: 'photo-stage hidden' });
  const canvas = el('canvas', { className: 'photo-canvas' });
  canvas.setAttribute('aria-label', words.tap);
  const loupe = el('canvas', { className: 'photo-loupe hidden', width: 90, height: 90 });
  loupe.setAttribute('role', 'img');
  loupe.setAttribute('aria-label', words.loupe);
  stage.append(canvas, loupe);
  const actions = el('div', { className: 'photo-actions' });
  const use = el('button', { type: 'button', className: 'go small hidden', textContent: words.use });
  const again = el('button', { type: 'button', className: 'linky hidden', textContent: words.again });
  const close = el('button', { type: 'button', className: 'linky', textContent: words.close });
  actions.append(use, again, close);
  root.append(chooseLabel, hint, stage, actions);
  host.append(root);

  let url: string | null = null;
  let image: HTMLImageElement | null = null;
  let picked: string | null = null;
  let pixels: ImageData | null = null;
  let closed = false;

  const release = () => {
    if (image) { image.onload = null; image.onerror = null; image.removeAttribute('src'); image = null; }
    if (url) { URL.revokeObjectURL(url); url = null; }
  };
  const clearCanvas = () => {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
    loupe.getContext('2d')?.clearRect(0, 0, loupe.width, loupe.height);
    pixels = null;
  };
  const showPicked = (hex: string | null) => {
    picked = hex;
    use.classList.toggle('hidden', !hex);
    again.classList.toggle('hidden', !hex);
    loupe.classList.toggle('hidden', !hex);
    options.onPreview(hex);
  };
  const finish = () => {
    if (closed) return;
    closed = true;
    release();
    clearCanvas();
    file.value = '';
    root.remove();
  };

  file.addEventListener('change', () => {
    const f = file.files?.[0];
    release();
    clearCanvas();
    showPicked(null);
    if (!f) return;
    url = URL.createObjectURL(f);
    image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const img = image!;
      const { w, h } = fitSize(img.naturalWidth, img.naturalHeight);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, w, h);   // the browser has applied the photo's orientation
      pixels = ctx.getImageData(0, 0, w, h);
      release();                          // the canvas holds the pixels now; the file and its image go
      file.value = '';
      stage.classList.remove('hidden');
      hint.textContent = words.tap;
      // the photo in full view, below the drawing that stays at the top
      stage.scrollIntoView?.({ block: 'end' });
    };
    image.onerror = () => { release(); file.value = ''; hint.textContent = words.failed; };
    image.src = url;
  });

  const tapAt = (clientX: number, clientY: number) => {
    if (!pixels) return;
    const r = canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / (r.width || 1)) * canvas.width;
    const y = ((clientY - r.top) / (r.height || 1)) * canvas.height;
    const hex = colourAt(pixels.data, pixels.width, pixels.height, x, y);
    // the magnifier shows the very square the colour comes from
    const lctx = loupe.getContext('2d');
    if (lctx) drawLoupe(lctx, canvas, canvas.width, canvas.height, x, y, loupe.width);
    loupe.style.left = `${Math.max(0, Math.min(r.width - 90, clientX - r.left - 45))}px`;
    loupe.style.top = `${Math.max(0, clientY - r.top - 110)}px`;
    showPicked(hex);
  };
  canvas.addEventListener('click', (e) => tapAt(e.clientX, e.clientY));

  use.addEventListener('click', () => { const hex = picked; finish(); if (hex) options.onUse(hex); });
  again.addEventListener('click', () => { showPicked(null); hint.textContent = words.tap; });
  close.addEventListener('click', () => { finish(); options.onClose(); });

  hint.textContent = '';
  queueMicrotask(() => file.focus());
  return { root, close: () => { if (!closed) { finish(); options.onClose(); } } };
}
