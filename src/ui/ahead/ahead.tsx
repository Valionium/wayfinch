// Ahead, the stop screen (spec section 3.2), top to bottom: the position line, the notes, the route strip, the six cards and the
// chips. It reads only the screen and the plain facts beside it, and calls one actions object: it computes no answer and sends
// nothing. With no position it shows its answers all the same, from the start of today's stage, and says so (AH-FROM-START, the
// owner's finding K); the Emergency chip stays in every state.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CardName } from '../../core/screen/screen.ts';
import { W } from '../../core/wording/en.ts';
import type { AheadActions, AheadTrip, AheadView } from './actions.ts';
import { TopicCards } from './cards.tsx';
import { ChipPanel, ChipRow, CHIP_ORDER } from './chips.tsx';
import { EmergencyPanel } from './emergency.tsx';
import type { ChipKey } from './chips.tsx';
import { PositionControls, PositionLine } from './position-line.tsx';
import { ShareSheet } from './share-sheet.tsx';
import { RouteStrip } from './strip.tsx';
import { lazy } from '../lazy.tsx';
import { railSignal } from '../wide/wide.ts';
import './ahead.css';

// The top card's button and progress before Get ready offline: a chunk only a rider without it loads (AH-BEFORE-READY).
const NeedReady = lazy(() => import('./need-ready.tsx').then((m) => m.NeedReady));

// What En route will show, with no route: two lines of a chunk of their own (AH-EMPTY); the button under them is here.
const EmptyLines = lazy(() => import('./empty.tsx').then((m) => m.EmptyLines), () => null);

function focusLater(id: string): void {
  // After the render that opens it, so the element exists.
  setTimeout(() => {
    const el = document.getElementById(id);
    el?.scrollIntoView?.({ block: 'start' });
    // A card's title is a heading holding its button: the button takes the focus (a heading without a tabindex takes none, which
    // left the focus on the page's body; review of #142, I4).
    (el?.querySelector<HTMLElement>('.ah-toggle') ?? el?.querySelector<HTMLElement>('button, a, h2, h3'))?.focus?.();
  }, 0);
}

/**
 * The Emergency link at the very top (owner's finding B, 8 Nov 2026): it jumps to the Emergency chip and opens it, and changes no
 * address (the tabs live in it). The chip's 112 and its call's confirmation are the chip's own, unchanged.
 */
function EmergencyLink({ onOpen }: { onOpen: () => void }) {
  // Scrolled to once the open panel is drawn, its first button (112, which asks first) taking the focus; again on every tap.
  const [jumps, setJumps] = useState(0);
  useEffect(() => {
    if (jumps === 0) return;
    const el = document.getElementById('chip-emergency');
    el?.scrollIntoView?.({ block: 'start' });
    el?.querySelector<HTMLElement>('button')?.focus?.();
  }, [jumps]);
  return (
    <p class="ah-emergency-top">
      <a href="#chip-emergency" class="ah-emergency-link" data-emergency-link onClick={(e) => { e.preventDefault(); onOpen(); setJumps((n) => n + 1); }}>{W.appAheadChipEmergency}</a>
    </p>
  );
}

function TripAhead({ v, actions }: { v: AheadTrip; actions: AheadActions }) {
  const s = v.screen;
  const [open, setOpen] = useState<ReadonlySet<CardName>>(new Set());
  const [chip, setChip] = useState<ChipKey | null>(null);
  const [sharing, setSharing] = useState(false);
  // On a computer (the rail layout) the picker is open from the start, with no position asked for (spec 9.2).
  const rail = railSignal.value;
  const [pickerOpen, setPickerOpen] = useState(rail);
  // Set once the rider starts on the open picker (a key, a slider move, a pick; a focus alone is not); only the rider closes it then.
  const pickerUse = useRef(false);
  const setPicker = (open: boolean): void => { pickerUse.current = false; setPickerOpen(open); };
  // The answers show with no position too (AH-FROM-START), so on a phone the picker starts closed. Only the rider closes it, or their
  // own Update position while it is unused (below): not the clock, a fix from elsewhere or a re-read (each makes a new position line,
  // and a picker that followed it shut each minute with the typing in it).
  // A position set with the picker closes it on a phone; on a computer it stays open, ready for the next (spec 9.2).
  const pickerUsed = (): void => { if (!railSignal.peek()) setPicker(false); };
  // On a phone, a position kept from Update position closes a picker the rider opened but has not used, so the notes, the strip and
  // the cards under it are in view at 360 px again; a used one stays open with the newer position beside it (coordinator's ruling).
  const fixKept = (): void => { if (!railSignal.peek() && !pickerUse.current) setPicker(false); };

  const toggle = (name: CardName): void => setOpen((was) => {
    const next = new Set(was);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
  const openCard = (name: CardName): void => {
    setOpen((was) => new Set([...was, name]));
    focusLater(`card-${name}`);
  };
  // Close hands the focus back to the chip that opened the panel, so a keyboard or screen reader is not left on the page's body.
  const closeChip = (): void => {
    const was = chip;
    setChip(null);
    if (was) setTimeout(() => document.querySelector<HTMLElement>(`.ah-chip[aria-controls="chip-${was}"]`)?.focus?.(), 0);
  };
  // Plan tomorrow redraws the day: the focus goes to the Back to today at the top, and from there back to the Daylight card.
  const dayActions: AheadActions = {
    ...actions,
    planTomorrow: async (date) => { await actions.planTomorrow(date); focusLater('ah-back-today'); },
    backToToday: async () => { await actions.backToToday(); focusLater('card-daylight'); },
  };
  // With tomorrow planned (after the day's ride), the way back stands at the top, not only in the Daylight card's items.
  const backOffered = s.cards.daylight.items.some((x) => x.label === W.daylightBackToToday);
  const openChip = (c: ChipKey | null): void => {
    // Emergency's "Last position at … (… ago)" is read at the time it is opened.
    if (c !== null) actions.freshen();
    setChip(c);
    if (c) focusLater(`chip-${c}`);
  };

  // Esc collapses the card the focus is in, and puts the focus on its title (spec 3.8).
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const card = (e.target as HTMLElement | null)?.closest?.('[data-card]');
    const name = card?.getAttribute('data-card') as CardName | null | undefined;
    if (!card || !name || !open.has(name)) return;
    e.preventDefault();
    toggle(name);
    (card.querySelector('.ah-toggle') as HTMLElement | null)?.focus();
  };

  // Before Get ready offline the card is at the top; after one with a step missing it names those steps with Try again (review
  // of PR 73, I2) under the strip, so the position line, the strip and the first card stay in view (WIDE-FOLD).
  const need = v.beforeReady || v.failedSteps.length > 0 ? (
    <section class="card ah-need" data-need-ready aria-label={v.beforeReady ? W.appAheadNeedTitle : W.appTripMissingHeading}>
      {v.beforeReady ? <><h2 class="ah-need-title">{W.appAheadNeedTitle}</h2><p>{W.appAheadNeedBody}</p></> : <h2 class="ah-need-title">{W.appTripMissingHeading}</h2>}
      <NeedReady actions={actions} failed={v.failedSteps} before={v.beforeReady} />
    </section>
  ) : null;
  return (
    <div class="ahead" data-ahead="answers" onKeyDown={onKeyDown}>
      <EmergencyLink onOpen={() => { actions.freshen(); setChip('emergency'); }} />
      <div class="ah-main">
        {v.beforeReady ? need : null}
        {v.notice ? <p class="notice" role="status">{v.notice}</p> : null}
        <PositionLine v={v} onShare={() => { actions.freshen(); setSharing(true); }} />
        {sharing && s.shareText !== null ? (
          <ShareSheet
            id="progress" title={W.appAheadShare} text={s.shareText} mapText={s.shareMapText} mapLink={v.mapLink} old={v.shareOld}
            canShare={v.canShare} actions={actions} onClose={() => setSharing(false)}
          />
        ) : null}
        <PositionControls v={v} actions={actions} pickerOpen={pickerOpen} onPicker={setPicker} pickerUse={pickerUse} onPickerUsed={pickerUsed} onFixKept={fixKept} rail={rail} />
        {s.notes.length > 0 ? <ul class="ah-notes notice">{s.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
        {backOffered ? <p id="ah-back-today" data-back-today><button type="button" class="btn" onClick={() => void dayActions.backToToday()}>{W.daylightBackToToday}</button></p> : null}
        {v.badSpeed ? <p class="notice"><a href="#/trip">{W.appAheadSpeedLink}</a></p> : null}
        <RouteStrip strip={s.strip} bike={v.bike} onOpen={openCard} onSetPosition={rail ? (km) => void actions.setManual(km) : undefined} stopsLater={v.beforeReady} unconfirmed={!v.confirmed} />
        {v.beforeReady ? null : need}
      </div>
      <TopicCards screen={s} open={open} onToggle={toggle} v={v} actions={dayActions} onShelter={() => openChip('shelter')} later={v.beforeReady ? AFTER_READY : NONE} />
      <div class="ah-below">
        {/* Before Get ready offline only Emergency: the other chips answer from saved places too (AH-BEFORE-READY). */}
        <ChipRow shown={v.beforeReady ? ['emergency'] : CHIP_ORDER} open={chip} onOpen={openChip} />
        {chip ? <ChipPanel chip={chip} screen={s} canShare={v.canShare} actions={actions} onClose={closeChip} position={v.position} /> : null}
      </div>
    </div>
  );
}

/** The cards that need what Get ready offline saves; Daylight and Climbing are worked out from the route alone. */
const AFTER_READY: ReadonlySet<CardName> = new Set(['water', 'food', 'weather', 'sleep']);
const NONE: ReadonlySet<CardName> = new Set();

export function AheadScreen({ view, actions }: { view: AheadView; actions: AheadActions }) {
  if (view.kind === 'loading') return <div class="ahead" aria-busy="true" />;
  // With no route the shell's notice says "Add a route to see what's ahead", and the page what it will show; there is no demo.
  if (view.kind === 'no-route' || view.kind === 'unreadable') return <NoRoute view={view} actions={actions} />;
  return <TripAhead v={view} actions={actions} />;
}

function NoRoute({ view, actions }: { view: Extract<AheadView, { kind: 'no-route' | 'unreadable' }>; actions: AheadActions }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="ahead" data-ahead={view.kind}>
      <EmergencyLink onOpen={() => setOpen(true)} />
      {view.kind === 'unreadable' ? (
        <>
          <p class="notice" role="alert">{W.appAheadUnreadable}</p>
          <p><button type="button" class="btn btn-primary" onClick={() => void actions.retry()}>{W.appAheadRetry}</button></p>
        </>
      ) : (
        // What En route is for, before there is a route (owner's finding M, 8 Nov 2026).
        <div class="ah-empty" data-empty>
          <EmptyLines />
          <p><a class="btn btn-primary" href="#/trip">{W.appAheadToTrip}</a></p>
        </div>
      )}
      <ChipRow shown={['emergency']} open={open ? 'emergency' : null} onOpen={(c) => setOpen(c !== null)} />
      {open ? (
        <section class="card ah-chip-panel ah-large" id="chip-emergency" aria-label={W.appAheadChipEmergency}>
          <EmergencyPanel card={view.emergency} canShare={view.canShare} actions={actions} position={view.position} />
        </section>
      ) : null}
    </div>
  );
}
