// The shared pieces: a card, a list that folds after a limit, and the notice for a degraded situation (spec section 8).
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { W } from '../core/wording/en.ts';
import type { Status } from '../core/types.ts';
import { StatusBadge } from './status.tsx';

export function Card({ title, status, children }: { title: string; status?: Status; children?: ComponentChildren }) {
  return (
    <section class="card">
      <h2>{title}</h2>
      {status ? <StatusBadge status={status} /> : null}
      {children}
    </section>
  );
}

/** The first `limit` items, then "Show N more". Nothing is removed (Decision 6). */
export function ListMore<T>({ items, limit = 5, render }: { items: readonly T[]; limit?: number; render: (item: T, index: number) => ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const hidden = items.length - limit;
  const shown = open || hidden <= 0 ? items : items.slice(0, limit);
  return (
    <>
      <ul>{shown.map((item, index) => <li key={index}>{render(item, index)}</li>)}</ul>
      {hidden > 0 ? (
        <button type="button" class="btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? W.appListFewer : W.appListMore(hidden)}
        </button>
      ) : null}
    </>
  );
}

/** One of section 8's degraded situations that can happen with no trip. */
export function Notice({ children }: { children: ComponentChildren }) {
  return <p class="notice" role="status">{children}</p>;
}

export type DegradedKind = 'noRoute' | 'storageBlocked' | 'noSignalNoTrip';
const DEGRADED_TEXT: Record<DegradedKind, string> = {
  noRoute: W.appNoRoute,
  storageBlocked: W.appStorageBlocked,
  noSignalNoTrip: W.appNoSignalNoTrip,
};

export function Degraded({ kind }: { kind: DegradedKind }) {
  return <Notice>{DEGRADED_TEXT[kind]}</Notice>;
}
