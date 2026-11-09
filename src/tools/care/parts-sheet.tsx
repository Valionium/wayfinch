// The parts guide's sheet (care pictures design of 7 November 2026, section 4; the owner's answers 1, 7 and 8 of 8 November): a part's
// entry over the step view, a bottom sheet on a phone and a side panel when wide. Its own chunk, loaded with the first tap on a part name.
// The rider's own bike is drawn with the part marked (the app's default bike when none is chosen); its close-ups beside each other, the
// one matching the bike first; "Not to be mixed up with" swaps the entry, with a Back. Opening adds one history entry, so the phone's back
// gesture closes the sheet and leaves the step view open; Escape does the same. Its words come with loadWords, before it opens.
import { useEffect, useRef, useState } from 'preact/hooks';
import { bikeArt } from '../../core/bike/art.ts';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { drawnFor, PART_PLACES, partPoint } from '../../core/bike/part-points.ts';
import { resolveBikeSpec } from '../../core/bike/spec.ts';
import { pictureDetails } from '../../core/care/pictures.ts';
import { guidePictures, partById } from '../../core/parts/guide.ts';
import type { PartId } from '../../core/parts/guide.ts';
import { partsWordsFrom, PG, TAG_WORDS } from '../../core/wording/en-parts.ts';
import type { PartsWordsFile } from '../../core/wording/en-parts.ts';
import { loadPictures, Picture, pictureLoaded } from './picture.tsx';
import './parts.css';

// The parts' and close-ups' words: a data file of its own, fetched once (precached by the offline worker like every build file).
const WORDS_URL = Object.values(import.meta.glob('../../core/wording/en-parts.json', { query: '?url', import: 'default', eager: true }))[0]!;
let words: PartsWordsFile | null = null;

/** Loads the guide's words; false where they could not be read (offline before they were cached), and the step's text stays as it is. */
export async function loadWords(): Promise<boolean> {
  if (words) return true;
  try {
    const res = await fetch(WORDS_URL);
    words = res.ok ? partsWordsFrom(JSON.parse(await res.text()), PART_PLACES) : null;
  } catch { words = null; }
  return words !== null;
}

/** The theme the page shows now, as the bike drawing reads it (src/ui/bike/drawing.tsx); the sheet is drawn anew on each entry. */
function themeNow(): 'dark' | 'light' {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'light' || set === 'dark') return set;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** The whole bike with the part marked, or a line where the rider's bike, as told, has none. */
function Where({ part, bike }: { part: PartId; bike: BikeRecord | null }) {
  const theme = themeNow();
  const spec = resolveBikeSpec(bike, null);
  const shown = drawnFor(spec, part);
  if (!shown) return <p class="muted pg-none">{PG.notOnYours}</p>;
  const { svg, anchors } = bikeArt(shown, null, { theme, idPrefix: 'pg' });
  const p = partPoint(shown, anchors, part);
  if (!p) return <p class="muted pg-none">{PG.notOnYours}</p>;
  const name = words!.parts[part].name;
  const quiet = svg.replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true" focusable="false"');
  return (
    <figure class="pg-where">
      <figcaption class="muted">{bike === null ? PG.whereTypical : shown === spec ? PG.whereYours : PG.whereWould}</figcaption>
      <div class="pg-bike" role="img" aria-label={PG.marker(name)}>
        <div dangerouslySetInnerHTML={{ __html: quiet }} />
        <svg class="pg-marker" viewBox="0 0 320 150" aria-hidden="true" focusable="false">
          <circle class="pg-halo" cx={p[0]} cy={p[1]} r="10" />
          <circle class="pg-ring" cx={p[0]} cy={p[1]} r="6" />
        </svg>
      </div>
    </figure>
  );
}

export function PartSheet({ part, bike, onClose }: { part: PartId; bike: BikeRecord | null; onClose: () => void }) {
  const box = useRef<HTMLDialogElement>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const [trail, setTrail] = useState<PartId[]>([part]);
  const [, setReady] = useState(0);
  const id = trail[trail.length - 1]!;
  const entry = partById(id)!;
  const said = words!.parts[id];
  const pictures = guidePictures(entry, pictureDetails(bike));

  const close = (fromBack: boolean): void => {
    if (!fromBack) history.back();
    const d = box.current;
    if (d?.open && typeof d.close === 'function') d.close();
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const d = box.current!;
    if (typeof d.showModal === 'function') d.showModal();
    else d.open = true;
    history.pushState({ ...(history.state as object | null), carePart: part }, '');
    // The back gesture: the sheet's own entry left, the step view's still there.
    const onPop = (): void => { if (!(history.state as { carePart?: string } | null)?.carePart) closeRef.current(true); };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); };
  }, []);
  useEffect(() => {
    let alive = true;
    head.current?.focus();
    void loadPictures(pictures).then(() => { if (alive) setReady((n) => n + 1); });
    return () => { alive = false; };
  }, [id]);

  // Keys stay in the sheet: Escape closes it alone, and the arrows never turn the steps behind it.
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(false); }
  };
  const ready = pictures.filter(pictureLoaded);

  return (
    <dialog ref={box} class="part-sheet" aria-labelledby="pg-title" onKeyDown={(e) => onKey(e as unknown as KeyboardEvent)}
      onCancel={(e) => { e.preventDefault(); close(false); }}>
      <div class="pg-top">
        {trail.length > 1 ? <button type="button" class="btn pg-back" onClick={() => setTrail(trail.slice(0, -1))}>{PG.back}</button> : null}
        <h2 id="pg-title" ref={head} tabIndex={-1} class="pg-name">{said.name}</h2>
        <button type="button" class="care-steps-icon" aria-label={PG.close} onClick={() => close(false)}>✕</button>
      </div>
      <div class="pg-body" key={id}>
        {entry.tag ? <p class="muted pg-tag">{PG.onlyOn(TAG_WORDS[entry.tag])}</p> : null}
        <Where part={id} bike={bike} />
        {ready.length > 0 ? (
          <div class={`care-pics${ready.length > 1 ? ' care-pics-two' : ''}`}>
            {ready.map((pic, k) => <Picture key={pic} id={pic} view={`pg${k}`} words={words!.pictures[pic]} />)}
          </div>
        ) : null}
        <p class="pg-text">{said.text}</p>
        {entry.mixed.length > 0 ? (
          <section class="pg-mixed">
            <h3>{PG.mixed}</h3>
            <ul>
              {entry.mixed.map((m) => (
                <li key={m}><button type="button" class="btn pg-swap" onClick={() => setTrail([...trail, m])}>{words!.parts[m].name}</button></li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </dialog>
  );
}
