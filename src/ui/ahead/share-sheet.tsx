// The share step (spec sections 6.14 and 6.9): the message in an editable box, then the system share sheet where the browser has
// one, SMS and Copy. The app sends nothing: the rider sends it in the app they choose. Nothing of it is stored but the map-link
// choice, and only for Share progress.
import { useEffect, useRef, useState } from 'preact/hooks';
import { W } from '../../core/wording/en.ts';
import type { AheadActions } from './actions.ts';

export type ShareSheetProps = {
  id: string;
  title: string;
  text: string;
  /** Share progress only: the same message with the map link, and the remembered choice. */
  mapText?: string | null;
  mapLink?: boolean;
  /** "Your position is from 14:20 (40 min ago)", with Update position. */
  old?: string | null;
  canShare: boolean;
  actions: AheadActions;
  onClose: () => void;
};

export function ShareSheet(p: ShareSheetProps) {
  const withMap = p.mapText !== undefined && p.mapText !== null;
  const start = withMap && p.mapLink ? p.mapText! : p.text;
  const [text, setText] = useState(start);
  const [linked, setLinked] = useState(withMap && p.mapLink === true);
  const [said, setSaid] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  // The choice adds or takes out the map line only: what the rider typed stays. The line is the part the map form adds.
  const mapLine = withMap && p.mapText!.startsWith(p.text) ? p.mapText!.slice(p.text.length) : null;
  const choose = (on: boolean): void => {
    setLinked(on);
    p.actions.setMapLink(on);
    setText((was) => {
      if (mapLine === null || mapLine.trim() === '') return on && withMap ? p.mapText! : p.text;
      if (on) return was.includes(mapLine.trim()) ? was : `${was.replace(/\s+$/, '')}${mapLine}`;
      const at = was.indexOf(mapLine);
      if (at >= 0) return was.slice(0, at) + was.slice(at + mapLine.length);
      return was.split('\n').filter((l) => l.trim() !== mapLine.trim()).join('\n');
    });
  };
  const copy = async (): Promise<void> => setSaid((await p.actions.copy(text)) ? W.appAheadShareCopied : W.appAheadShareCopyFailed);
  return (
    <div class="ah-sheet card" role="dialog" aria-labelledby={`${p.id}-title`} data-share={p.id}>
      <h2 id={`${p.id}-title`} tabIndex={-1} ref={heading}>{p.title}</h2>
      {p.old ? (
        <p class="notice">
          {p.old}{' '}
          <button type="button" class="btn" onClick={() => void p.actions.updatePosition()}>{W.appAheadUpdatePosition}</button>
        </p>
      ) : null}
      <label class="ah-field">
        <span>{W.appAheadShareText}</span>
        <textarea rows={5} value={text} onInput={(e) => setText(e.currentTarget.value)} />
      </label>
      {withMap ? (
        <label class="choice-option">
          <input type="checkbox" checked={linked} onChange={(e) => choose(e.currentTarget.checked)} />
          <span>{W.appAheadShareMapLink} <span class="muted">{W.appAheadShareMapNote}</span></span>
        </label>
      ) : null}
      <div class="row">
        {p.canShare ? <button type="button" class="btn btn-primary" onClick={() => void p.actions.share(text)}>{W.appAheadShareSystem}</button> : null}
        <a class="btn" href={p.actions.smsHref(text)}>{W.appAheadShareSms}</a>
        <button type="button" class="btn" onClick={() => void copy()}>{W.appAheadShareCopy}</button>
        <button type="button" class="btn" onClick={p.onClose}>{W.appAheadClose}</button>
      </div>
      {said ? <p role="status">{said}</p> : null}
      <p class="muted">{W.appAheadShareNothingSent}</p>
    </div>
  );
}
