// No phone number is dialled by the first tap (owner's iPhone check, 6 November 2026): the home-screen app on an iPhone opens a tel:
// link at once, with no "Call?" of its own, and the owner reached the police by accident. So every call button asks first, in its own
// place: the number as it will be dialled and who it is, then "Call <number> now", the one tel: link on the page, and Cancel. The
// question stands where the button was and the link comes below it, so a second hurried tap lands on words, not on the call. Nothing
// is loaded or sent: it works offline at once. Only Cancel or Escape closes it; a scroll or a tap beside it never does.
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { W } from '../core/wording/en.ts';

/** Only digits and a leading +: what a dialler takes. */
export const telOf = (n: string): string => `tel:${n.replace(/[^\d+]/g, '')}`;

export function CallButton({ href, who, shown, cls, describedBy }: { href: string; who: string; shown: string; cls: string; describedBy?: string | undefined }) {
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const question = useRef<HTMLSpanElement>(null);
  const asked = useRef(false);
  const id = useId();
  useEffect(() => {
    if (asking) question.current?.focus();
    else if (asked.current) opener.current?.focus();
    asked.current = asking;
  }, [asking]);
  if (!asking) {
    return <button type="button" ref={opener} class={cls} data-call aria-haspopup="dialog" aria-describedby={describedBy} onClick={() => setAsking(true)}>{shown}</button>;
  }
  const number = href.slice(4);
  return (
    <span class="call-ask" role="alertdialog" aria-labelledby={id} data-call-ask onKeyDown={(e) => { if (e.key === 'Escape') setAsking(false); }}>
      <span class="call-ask-q" id={id} tabIndex={-1} ref={question}><strong>{W.callAsk(number)}</strong> {who}</span>
      <a class="btn btn-primary call-now" href={href}>{W.callNow(number)}</a>
      <button type="button" class="btn" onClick={() => setAsking(false)}>{W.callCancel}</button>
    </span>
  );
}
