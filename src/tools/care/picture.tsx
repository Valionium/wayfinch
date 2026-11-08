// Bike care's drawings (care pictures design of 7 November 2026, section 5): hand-made SVG files in ./pictures, each a file of its own in
// the build, fetched when a step view that shows it opens, never with the first screen or Bike care's own chunk (BC-PIC-LAZY). They are
// built as files, not as JavaScript strings, so about 150 drawings never weigh on the lazy JavaScript budget (PERF-JS-LAZY); the offline
// worker precaches them like every file of a build. They are inlined, not <img>, so they follow the theme's tokens through ./pictures.css;
// ids inside a drawing get a prefix of their view.
import { PICTURE_WORDS } from '../../core/wording/en-care-pictures.ts';
import './pictures.css';

const FILES = import.meta.glob('./pictures/*.svg', { query: '?url', import: 'default', eager: true });
const loaded = new Map<string, string>();

/** Loads the pictures not yet here; a picture that fails to load, or is not one of ours, is left out, so its step shows its text alone. */
export async function loadPictures(ids: readonly string[]): Promise<void> {
  await Promise.all([...new Set(ids)].filter((id) => !loaded.has(id)).map(async (id) => {
    const url = FILES[`./pictures/${id}.svg`];
    if (!url) return;
    try {
      const res = await fetch(url);
      const svg = res.ok ? await res.text() : '';
      if (svg.startsWith('<svg class="cp" ')) loaded.set(id, svg);
    } catch { /* offline before it was cached: text alone */ }
  }));
}

export const pictureReady = (id: string | null): id is string => id !== null && loaded.has(id) && PICTURE_WORDS[id] !== undefined;

const prefixed = (svg: string, prefix: string): string =>
  svg
    .replace(/<svg\b/, '<svg aria-hidden="true" focusable="false"')
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${prefix}${id})`);

/** One picture as one image: its name, and its description in a hidden paragraph; a caption under it where it has one. */
export function Picture({ id, view }: { id: string; view: string }) {
  const words = PICTURE_WORDS[id]!;
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
