// The parts every answer on Ahead shows the same way: an item with its status word where it isn't fine, and its detail with the
// Call and Website buttons in the very place their words stand; and the basis lines. Text is the screen's, unchanged.
import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import type { AnswerItem, ItemLink } from '../../core/types.ts';
import { CallButton } from '../call.tsx';
import { StatusBadge } from '../status.tsx';

const SEPARATOR = ' · ';

/**
 * A call asks first and then hands the number to the dialler (call.tsx); a website opens in the browser with no referrer. Nothing is
 * sent before the tap. The button's name is its own words ("Call +49 7221 123456"), and it is described by the item's label, which
 * names the place; the question names it too.
 */
function LinkButton({ link, describedBy }: { link: ItemLink; describedBy?: string | undefined }) {
  return link.kind === 'web'
    ? <a class="btn ah-link" href={link.href} target="_blank" rel="noopener noreferrer" aria-describedby={describedBy}>{link.shown}</a>
    : <CallButton cls={`btn ah-link${link.secondary ? ' ah-link-secondary' : ''}`} href={link.href} shown={link.shown} who={link.label} describedBy={describedBy} />;
}

/** The detail as the engine wrote it; a part that is a button's own words becomes that button. */
export function Detail({ text, links, describedBy }: { text: string; links?: ItemLink[] | undefined; describedBy?: string | undefined }) {
  if (!links || links.length === 0) return <span class="ah-detail">{text}</span>;
  const parts = text.split(SEPARATOR);
  const out: ComponentChildren[] = [];
  parts.forEach((part, i) => {
    if (i > 0) out.push(SEPARATOR);
    const link = links.find((l) => l.shown === part);
    out.push(link ? <LinkButton key={i} link={link} describedBy={describedBy} /> : part);
  });
  return <span class="ah-detail">{out}</span>;
}

/** `plain`: no status word, for the Emergency card, whose lines are facts, not judgements. */
export function Item({ item, children, plain = false }: { item: AnswerItem; children?: ComponentChildren; plain?: boolean }) {
  const id = useId();
  return (
    <>
      <span class="ah-item-label" id={id}>{item.label}</span>
      {item.status !== 'fine' && !plain ? <> <StatusBadge status={item.status} /></> : null}
      {item.detail ? <> <Detail text={item.detail} links={item.links} describedBy={id} /></> : null}
      {children}
    </>
  );
}

export function Basis({ lines }: { lines: string[] }) {
  const shown = lines.filter((b) => b.trim() !== '');
  return shown.length > 0 ? <ul class="ah-basis muted">{shown.map((b, i) => <li key={i}>{b}</li>)}</ul> : null;
}
