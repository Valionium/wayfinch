// The parts every answer on Ahead shows the same way: an item with its status word where it isn't fine, and its detail with the
// Call and Website buttons in the very place their words stand; and the basis lines. Text is the screen's, unchanged.
import type { ComponentChildren } from 'preact';
import type { AnswerItem, ItemLink } from '../../core/types.ts';
import { StatusBadge } from '../status.tsx';

const SEPARATOR = ' · ';

function LinkButton({ link }: { link: ItemLink }) {
  // A tel: link hands the number to the dialler; a website opens in the browser with no referrer. Nothing is sent before the tap.
  return link.kind === 'tel'
    ? <a class={`btn ah-link${link.secondary ? ' ah-link-secondary' : ''}`} href={link.href} aria-label={link.label}>{link.shown}</a>
    : <a class="btn ah-link" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label}>{link.shown}</a>;
}

/** The detail as the engine wrote it; a part that is a button's own words becomes that button. */
export function Detail({ text, links }: { text: string; links?: ItemLink[] | undefined }) {
  if (!links || links.length === 0) return <span class="ah-detail">{text}</span>;
  const parts = text.split(SEPARATOR);
  const out: ComponentChildren[] = [];
  parts.forEach((part, i) => {
    if (i > 0) out.push(SEPARATOR);
    const link = links.find((l) => l.shown === part);
    out.push(link ? <LinkButton key={i} link={link} /> : part);
  });
  return <span class="ah-detail">{out}</span>;
}

export function Item({ item, children }: { item: AnswerItem; children?: ComponentChildren }) {
  return (
    <>
      <span class="ah-item-label">{item.label}</span>
      {item.status !== 'fine' ? <> <StatusBadge status={item.status} /></> : null}
      {item.detail ? <> <Detail text={item.detail} links={item.links} /></> : null}
      {children}
    </>
  );
}

export function Basis({ lines }: { lines: string[] }) {
  const shown = lines.filter((b) => b.trim() !== '');
  return shown.length > 0 ? <ul class="ah-basis muted">{shown.map((b, i) => <li key={i}>{b}</li>)}</ul> : null;
}
