// <BackBar>: the one top bar of Wayfinch's tools (back-bar.ts), here for the tyre tool and, when it merges, Bike care. In the tool's own
// chunk with its words (en-tools.ts): the first screen carries none of it.
import { useEffect, useRef } from 'preact/hooks';
import { TL } from '../../core/wording/en-tools.ts';
import { watchBar } from './back-bar.ts';
// The style comes with this chunk, never in the first screen's stylesheet (the app's CSS is one file: review of PR 70, M2).
import css from './back-bar.css?inline';

export function BackBar({ href }: { href: string }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => (bar.current ? watchBar(bar.current) : undefined), []);
  return (
    <div class="wf-bar wf-bar-app" ref={bar}>
      <style>{css}</style>
      <a href={href}>{TL.toolsBack}</a>
    </div>
  );
}
