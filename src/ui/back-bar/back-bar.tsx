// <BackBar>: the one top bar of Wayfinch's tools (back-bar.ts), here for the tyre tool and, when it merges, Bike care. In the tool's own
// chunk with its words (en-tools.ts): the first screen carries none of it.
import { useEffect, useRef } from 'preact/hooks';
import { TL } from '../../core/wording/en-tools.ts';
import { watchBar } from './back-bar.ts';
import './back-bar.css';

export function BackBar({ href }: { href: string }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => (bar.current ? watchBar(bar.current) : undefined), []);
  return (
    <div class="wf-bar wf-bar-app" ref={bar}>
      <a href={href}>{TL.toolsBack}</a>
    </div>
  );
}
