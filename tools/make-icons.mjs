// Draws the app icons into public/icons/: a typical bike on the dark ground, no bird and no mark of anyone else (spec section 14).
// node tools/make-icons.mjs   (needs Chromium, which `npx playwright install chromium` provides)
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));
const GROUND = '#1B2018';
const LINE = '#EFEDE0';
const BLAZE = '#FF7950';

/** A typical bike, side on, in a 100 x 100 box with its content inside the middle 80 %. */
const bike = `
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="27" cy="62" r="15" stroke="${LINE}" stroke-width="3.5"/>
    <circle cx="73" cy="62" r="15" stroke="${LINE}" stroke-width="3.5"/>
    <path d="M27 62 L41 62 L49 40 L65 40 L73 62 M41 62 L56 44 M49 40 L47 34 M65 40 L67 33 L74 33" stroke="${BLAZE}" stroke-width="4"/>
    <path d="M42 33 L52 33" stroke="${LINE}" stroke-width="4"/>
  </g>`;

function svg(size, maskable) {
  // A maskable icon fills the whole square; the bike stays in the middle 80 %.
  const scale = maskable ? 0.62 : 0.8;
  const shift = (100 - 100 * scale) / 2;
  const radius = maskable ? 0 : 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${radius}" fill="${GROUND}"/>
  <g transform="translate(${shift} ${shift + 2}) scale(${scale})">${bike}</g>
</svg>`;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:transparent">${svg(size, maskable)}</body>`);
    writeFileSync(`${OUT}${file}`, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  }
} finally {
  await browser.close();
}
console.log('Icons written to public/icons/.');
