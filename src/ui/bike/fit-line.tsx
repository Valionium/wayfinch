// A "fits better" line (wish 17, design section 5): one quiet line, shown by a tool only while no bike is saved, saying what its result is
// worked out on and what saving a bike would change, with a link into Bike details that comes back to the tool. It is a fact about the
// result in front of the rider, not a request: it counts, shrinks and remembers nothing.
import { HN } from '../../core/wording/en-hint.ts';
import { bikeDetailsHref } from './link.ts';
import type { BackScreen } from './link.ts';

export function FitLine({ before, after, back }: { before: string; after: string; back: BackScreen }) {
  return <p class="muted fit-line" data-fit-line>{before} <a href={bikeDetailsHref('new', back)}>{HN.hintAdd}</a> {after}</p>;
}
