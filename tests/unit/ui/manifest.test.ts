import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url));
const manifest = JSON.parse(read('public/manifest.webmanifest').toString('utf8')) as {
  name: string; short_name: string; id: string; start_url: string; scope: string; display: string; lang: string;
  description: string; background_color: string; theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
  shortcuts: { name: string; url: string }[];
};

/** Width and height from a PNG's header. */
const pngSize = (bytes: Buffer) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), signature: bytes.subarray(1, 4).toString('latin1') });

test('[APP-MANIFEST] identity: name and short name Wayfinch, id and start_url /, scope /, standalone, English', () => {
  expect(manifest.name).toBe('Wayfinch');
  expect(manifest.short_name).toBe('Wayfinch');
  expect(manifest.id).toBe('/');
  expect(manifest.start_url).toBe('/');
  expect(manifest.scope).toBe('/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.lang).toBe('en');
  // colours are section 3.6's ground token
  expect(manifest.theme_color).toBe('#1B2018');
  expect(manifest.background_color).toBe('#1B2018');
});

test('[APP-MANIFEST] icons 192 and 512 and a maskable one are there, at their sizes', () => {
  const find = (sizes: string, purpose: string) => manifest.icons.find((i) => i.sizes === sizes && i.purpose === purpose);
  for (const [sizes, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']] as const) {
    const icon = find(sizes, purpose);
    expect(icon, `${sizes} ${purpose}`).toBeDefined();
    expect(icon!.type).toBe('image/png');
    const size = pngSize(read(`public${icon!.src}`));
    expect(size.signature).toBe('PNG');
    expect(`${size.width}x${size.height}`).toBe(sizes);
  }
});

test('[APP-MANIFEST] shortcuts open the bag planner and Tyre pressure, and the description says trip planning, not health advice', () => {
  expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/tools/bags/', '/#/tools/tyre']);
  expect(manifest.description).toContain('trip planning, not health advice');
});
