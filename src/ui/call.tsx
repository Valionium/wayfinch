// No phone number is dialled by the first tap (owner's iPhone check, 6 November 2026): the home-screen app on an iPhone opens a tel:
// link at once, with no "Call?" of its own, and the owner reached the police by accident. So every call button asks first, in its own
// place: the number and who it is, then "Call <number> now", the one tel: link on the page, and Cancel. Nothing is loaded or sent: it
// works offline at once. Only Cancel or Escape closes it; a scroll or a tap beside it never does.
//
// A hurried second tap must never land on the call (review of PR 53, C1): the link is laid out below every part of the button the
// finger was on, at any width and text size (measured as it opens), and it ignores activation for 400 ms after the question opens.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { W } from '../core/wording/en.ts';

/** Only digits and a leading +: what a dialler takes. */
export const telOf = (n: string): string => `tel:${n.replace(/[^\d+]/g, '')}`;

const GUARD_MS = 400;
/** Clear space between the button the finger was on and the call link. */
const GAP_PX = 24;

/** For a screen reader, after the number as shown (its name still holds the words on the button): digit by digit in its own groups ("+ 4 9, 7 2 2 1, 1 2 3 4 5 6"), never one big number. */
const spoken = (n: string): string => n.trim().split(/\s+/).map((g) => [...g].join(' ')).join(', ');

export function CallButton({ href, who, shown, cls, describedBy }: { href: string; who: string; shown: string; cls: string; describedBy?: string | undefined }) {
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const question = useRef<HTMLSpanElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const asked = useRef(false);
  const openedAt = useRef(0);
  const below = useRef(0);   // the opener's bottom edge, in page coordinates
  const id = useId();
  useLayoutEffect(() => {
    const a = link.current;
    if (!asking || !a) return;
    const top = a.getBoundingClientRect().top + window.scrollY;
    if (top < below.current + GAP_PX) a.style.marginTop = `${below.current + GAP_PX - top}px`;
  }, [asking]);
  useEffect(() => {
    if (asking) question.current?.focus({ preventScroll: true });
    else if (asked.current) opener.current?.focus();
    asked.current = asking;
  }, [asking]);
  if (!asking) {
    const open = (): void => {
      below.current = (opener.current?.getBoundingClientRect().bottom ?? 0) + window.scrollY;
      openedAt.current = performance.now();
      setAsking(true);
    };
    return <button type="button" ref={opener} class={cls} data-call aria-haspopup="dialog" aria-describedby={describedBy} onClick={open}>{shown}</button>;
  }
  // The number as the button showed it, so it can be checked by eye; the link dials exactly the digits of href.
  const number = /[\d+][\d\s/().-]*$/.exec(shown)?.[0].trim() ?? href.slice(4);
  return (
    <span class="call-ask" role="alertdialog" aria-labelledby={id} data-call-ask onKeyDown={(e) => { if (e.key === 'Escape') setAsking(false); }}>
      <span class="call-ask-q" id={id} tabIndex={-1} ref={question}>
        <strong>{W.callAsk(number)}</strong><span class="visually-hidden">{W.callDigits(spoken(number))}</span> {who}
      </span>
      <a class="btn btn-primary call-now" ref={link} href={href} aria-label={W.callNow(number) + W.callDigits(spoken(number))}
        onClick={(e) => { if (performance.now() - openedAt.current < GUARD_MS) e.preventDefault(); }}>{W.callNow(number)}</a>
      <button type="button" class="btn" onClick={() => setAsking(false)}>{W.callCancel}</button>
    </span>
  );
}
