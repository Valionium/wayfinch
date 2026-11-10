// Bike care's drawings (care pictures design of 7 November 2026, section 5): SVG files in ./pictures and ./parts (made by tools/care-art),
// each a file of its own in the build, fetched when a step view or the parts guide shows it, never with the first screen or Bike care's
// own chunk (BC-PIC-LAZY). tools/build.mjs writes them under /assets/care/ with their index at /care-pictures.json (id to address), so no
// script lists them and about 150 drawings never weigh on the lazy JavaScript budget (PERF-JS-LAZY); the offline worker precaches them
// like every file of a build. They are inlined, not <img>, so they follow the theme's tokens through ./pictures.css; ids inside a drawing
// get a prefix of their view.
import { pictureWordsFrom, stepTitlesFrom, type PictureWords } from '../../core/wording/en-care-pictures.ts';
import './pictures.css';

// The drawings' index: each id to its address in the build; fetched once, before the first drawing.
let index: Promise<Record<string, string>> | null = null;
const loadIndex = (): Promise<Record<string, string>> => (index ??= fetch('/care-pictures.json').then(async (res) => {
  const json: unknown = res.ok ? JSON.parse(await res.text()) : null;
  if (typeof json === 'object' && json !== null) return json as Record<string, string>;
  index = null;
  return {};
}, () => { index = null; return {}; }));
const loaded = new Map<string, string>();
// The step pictures' words: a data file of its own, fetched with the first picture (precached like every build file).
const WORDS_URL = Object.values(import.meta.glob('../../core/wording/en-care-pictures.json', { query: '?url', import: 'default', eager: true }))[0] as string;
let pictureWords: Record<string, PictureWords> | null = null;
let titles: Record<string, (string | null)[]> | null = null;
async function loadWords(): Promise<void> {
  if (pictureWords) return;
  try {
    const res = await fetch(WORDS_URL);
    const json: unknown = res.ok ? JSON.parse(await res.text()) : null;
    pictureWords = pictureWordsFrom(json);
    titles = stepTitlesFrom(json);
  } catch { pictureWords = null; }
}
/** A step's title when it is for some bikes only ("Rim brakes only: ..."), once the words file is here; else null. */
export const stepTitle = (id: string, step: number): string | null => titles?.[id]?.[step] ?? null;

/**
 * Loads the pictures not yet here, and their words; a picture that fails to load, or is not one of ours, is left out, and without its
 * words a step picture is too, so its step shows its text alone.
 */
export async function loadPictures(ids: readonly string[]): Promise<void> {
  const files = ids.length ? await loadIndex() : {};
  await Promise.all([loadWords(), ...[...new Set(ids)].filter((id) => !loaded.has(id)).map(async (id) => {
    const url = files[id];
    if (typeof url !== 'string') return;
    try {
      const res = await fetch(url);
      const svg = res.ok ? await res.text() : '';
      if (svg.startsWith('<svg class="cp" ')) loaded.set(id, svg);
    } catch { /* offline before it was cached: text alone */ }
  })]);
}

export const pictureReady = (id: string | null): id is string => id !== null && loaded.has(id) && pictureWords?.[id] !== undefined;
/** Loaded, for a caller that brings its own words (the parts guide). */
export const pictureLoaded = (id: string): boolean => loaded.has(id);

const prefixed = (svg: string, prefix: string): string =>
  svg
    .replace(/<svg\b/, '<svg aria-hidden="true" focusable="false"')
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${prefix}${id})`);

/** One picture as one image: its name, and its description in a hidden paragraph; a caption under it where it has one. */
export function Picture({ id, view, words: own }: { id: string; view: string; words?: PictureWords }) {
  const words = own ?? pictureWords![id]!;
  const prefix = `cs-${view}-`;
  return (
    <figure class="care-pic">
      <div class="care-pic-art" role="img" aria-label={words.name} aria-describedby={`${prefix}desc`}
        dangerouslySetInnerHTML={{ __html: prefixed(loaded.get(id)!, prefix) }} />
      <p id={`${prefix}desc`} hidden>{words.description}</p>
      {words.caption ? <figcaption>{words.caption}</figcaption> : null}
    </figure>
  );
}
