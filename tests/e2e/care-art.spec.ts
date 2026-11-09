// The construction kit's drawings drawn in a real browser (care pictures redo, proposal of 9 November 2026, section 8): every label lies
// inside its picture, touches no other label, and crosses no drawn line or shape but its own leader. The font is the device's (the app
// ships none, and Linux's system font runs wider than Windows'), so each label's box is taken 20% wider and 2 units taller than this browser
// draws it.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { DRAWINGS } from '../../tools/care-art/drawings.ts';

const CSS = readFileSync(new URL('../../src/tools/care/pictures.css', import.meta.url), 'utf8');
const TOKENS = '--panel:#FBFAF3;--ink:#22271D;--muted:#57604A;--blaze:#B43A08;--line:#C7C4B1;--font-body:system-ui,sans-serif';

test('[CARE-ART-LABELS] every label of every kit drawing is inside its picture, apart from the other labels, and crosses no line but its own leader', async ({ page }) => {
  const problems: string[] = [];
  for (const d of DRAWINGS) {
    const svg = d.make().svg().replace(/viewBox="0 0 ([\d.]+) ([\d.]+)"/, (m, w: string, h: string) => `${m} width="${Number(w) * 2}" height="${Number(h) * 2}"`);
    await page.setContent(`<html><head><style>:root{${TOKENS}}body{margin:0}${CSS}</style></head><body>${svg}</body></html>`);
    const found = await page.evaluate(() => {
      const out: string[] = [];
      const root = document.querySelector('svg')!;
      const [, , vw, vh] = root.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
      type Box = { x0: number; y0: number; x1: number; y1: number; s: string };
      const boxes: Box[] = [...root.querySelectorAll('text')].filter((t) => !t.classList.contains('cp-badget')).map((t) => {
        // a wider font grows a label away from its anchor: to the right from its start, to the left from its end, both ways from its middle
        const b = (t as SVGTextElement).getBBox(), grow = b.width * 0.2, anchor = t.getAttribute('text-anchor') ?? 'start';
        const left = anchor === 'end' ? grow : anchor === 'middle' ? grow / 2 : 0, right = anchor === 'start' ? grow : anchor === 'middle' ? grow / 2 : 0;
        return { x0: b.x - left, y0: b.y - 1, x1: b.x + b.width + right, y1: b.y + b.height + 1, s: t.textContent ?? '' };
      });
      const inBox = (x: number, y: number, b: Box, pad: number) => x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad;
      for (const b of boxes) {
        if (b.x0 < 0 || b.y0 < 0 || b.x1 > vw || b.y1 > vh) out.push(`"${b.s}" runs out of the picture`);
        for (const o of boxes) if (o !== b && o.s < b.s && b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1) out.push(`"${b.s}" touches "${o.s}"`);
      }
      const shapes = [...root.querySelectorAll('path, circle, line, rect, ellipse, polyline, polygon')] as SVGGeometryElement[];
      for (const el of shapes) {
        const cls = el.getAttribute('class') ?? '';
        if (/\bcp-(halo|halostroke|badge)\b/.test(cls)) continue;
        const card = /\bcp-frame\b/.test(cls); // a panel's or an inset's card: a label may sit on it, never cross its edge
        const len = el.getTotalLength();
        const pts: [number, number][] = [];
        for (let i = 0; i <= 200; i++) { const p = el.getPointAtLength((len * i) / 200); pts.push([p.x, p.y]); }
        const style = getComputedStyle(el), half = style.stroke !== 'none' ? Number.parseFloat(style.strokeWidth) / 2 : 0;
        const filled = style.fill !== 'none' && !/\bcp-(objline|hiline|thin|ctx|fine|arrow|ghost|armfill)\b/.test(cls);
        for (const b of boxes) {
          // a thin line that starts or ends near this label is its leader: it may start beside the label, never run into its words
          const ends = [pts[0]!, pts[pts.length - 1]!];
          if (/\bcp-thin\b/.test(cls) && ends.some(([x, y]) => inBox(x, y, b, 6))) {
            if (pts.some(([x, y]) => inBox(x, y, b, -1))) out.push(`"${b.s}": its leader runs into its words`);
            continue;
          }
          if (pts.some(([x, y]) => inBox(x, y, b, half))) { out.push(`"${b.s}" crosses a ${cls || el.tagName}`); continue; }
          if (filled && !card) {
            const probe = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1], [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]];
            if (probe.some(([x, y]) => el.isPointInFill(new DOMPoint(x, y)))) out.push(`"${b.s}" sits on a ${cls}`);
          }
        }
      }
      return out;
    });
    for (const f of found) problems.push(`${d.id}: ${f}`);
  }
  expect(problems).toEqual([]);
});
