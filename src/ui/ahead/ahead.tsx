// Ahead, the stop screen (spec section 3.2), top to bottom: the position line, the notes, the route strip, the six cards and the
// chips. It reads only the screen and the plain facts beside it, and calls one actions object: it computes no answer and sends
// nothing. Before a position exists, and with no day-1 plan, it shows only Update position and the manual picker (section 3.2,
// First use); the Emergency chip stays in every state.
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

function focusLater(id: string): void {
  // After the render that opens it, so the element exists.
  setTimeout(() => {
    const el = document.getElementById(id);
    el?.scrollIntoView?.({ block: 'start' });
    (el?.querySelector('button, a, h2, h3') as HTMLElement | null)?.focus?.();
  }, 0);
}

function TripAhead({ v, actions }: { v: AheadTrip; actions: AheadActions }) {
  const s = v.screen;
  const [open, setOpen] = useState<ReadonlySet<CardName>>(new Set());
  const [chip, setChip] = useState<ChipKey | null>(null);
  const [sharing, setSharing] = useState(false);
  // On a computer (the rail layout) the picker is open from the start, with no position asked for (spec 9.2).
  const rail = railSignal.value;
  const [pickerOpen, setPickerOpen] = useState(!v.answers || rail);
  // Set once the rider starts on the open picker (a key, a slider move, a pick; a focus alone is not); only the rider closes it then.
  const pickerUse = useRef(false);
  const setPicker = (open: boolean): void => { pickerUse.current = false; setPickerOpen(open); };
  // First use opens the picker; on a phone, answers showing for the first time close it again, unless the rider has started on it.
  // Otherwise only the rider closes it, or their own Update position while it is unused (below): not the clock, a fix from elsewhere
  // or a re-read (each makes a new position line, which the effect watched before, so the picker shut each minute with the typing
  // in it), and not the effect's own run after the first paint, which closed it again under an early tap.
  const hadAnswers = useRef(v.answers);
  useEffect(() => {
    if (hadAnswers.current === v.answers) return;
    hadAnswers.current = v.answers;
    if (v.answers && !railSignal.peek() && !pickerUse.current) setPickerOpen(false);
  }, [v.answers]);
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
  const openChip = (c: ChipKey | null): void => {
    // Emergency's "Last position at … (… ago)" is read at the time it is opened.
    if (c !== null) actions.freshen();
    setChip(c);
    if (c) focusLater(`chip-${c}`);
  };
  // The Emergency link at the top (owner's preview check, 8 Nov 2026, item B) jumps to the Emergency chip at the bottom and opens
  // it; a second tap keeps it open: it is a way there, not a switch.
  const jump = <EmergencyJump onJump={() => openChip('emergency')} />;

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
    <div class="ahead" data-ahead={v.answers ? 'answers' : 'first-use'} onKeyDown={onKeyDown}>
      <div class="ah-main">
        {jump}
        {v.beforeReady ? need : null}
        {v.notice ? <p class="notice" role="status">{v.notice}</p> : null}
        {v.answers ? <PositionLine v={v} onShare={() => { actions.freshen(); setSharing(true); }} /> : <p>{W.appAheadFirstUse}</p>}
        {sharing && s.shareText !== null ? (
          <ShareSheet
            id="progress" title={W.appAheadShare} text={s.shareText} mapText={s.shareMapText} mapLink={v.mapLink} old={v.shareOld}
            canShare={v.canShare} actions={actions} onClose={() => setSharing(false)}
          />
        ) : null}
        <PositionControls v={v} actions={actions} pickerOpen={pickerOpen} onPicker={setPicker} pickerUse={pickerUse} onPickerUsed={pickerUsed} onFixKept={fixKept} rail={rail} />
        {v.answers ? (
          <>
            {s.notes.length > 0 ? <ul class="ah-notes notice">{s.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
            {v.badSpeed ? <p class="notice"><a href="#/trip">{W.appAheadSpeedLink}</a></p> : null}
            <RouteStrip
              strip={s.strip} bike={v.bike} onOpen={openCard} onSetPosition={rail ? (km) => void actions.setManual(km) : undefined} stopsLater={v.beforeReady}
              unconfirmed={s.positionLine === null}
            />
          </>
        ) : null}
        {v.beforeReady ? null : need}
      </div>
      {v.answers ? <TopicCards screen={s} open={open} onToggle={toggle} v={v} actions={actions} onShelter={() => openChip('shelter')} later={v.beforeReady ? AFTER_READY : NONE} /> : null}
      <div class="ah-below">
        {/* Before Get ready offline only Emergency: the other chips answer from saved places too (AH-BEFORE-READY). */}
        <ChipRow shown={v.answers && !v.beforeReady ? CHIP_ORDER : ['emergency']} open={chip} onOpen={openChip} />
        {chip ? <ChipPanel chip={chip} screen={s} canShare={v.canShare} actions={actions} onClose={() => setChip(null)} position={v.position} /> : null}
      </div>
    </div>
  );
}

/** The link at the top of En route that opens Emergency at the bottom (item B). Not an address: the tabs own the hash. */
function EmergencyJump({ onJump }: { onJump: () => void }) {
  return (
    <p class="ah-emergency-jump">
      <button type="button" class="ah-emergency-top" data-emergency-top aria-controls="chip-emergency" onClick={onJump}>
        {W.appAheadEmergencyTop}<span aria-hidden="true"> ↓</span>
      </button>
    </p>
  );
}

/** The cards that need what Get ready offline saves; Daylight and Climbing are worked out from the route alone. */
const AFTER_READY: ReadonlySet<CardName> = new Set(['water', 'food', 'weather', 'sleep']);
const NONE: ReadonlySet<CardName> = new Set();

export function AheadScreen({ view, actions }: { view: AheadView; actions: AheadActions }) {
  if (view.kind === 'loading') return <div class="ahead" aria-busy="true" />;
  // With no route the shell's notice says "Add a route to see what's ahead", and the empty state what En route will show; there is
  // no demo in the first version.
  if (view.kind === 'no-route' || view.kind === 'unreadable') return <NoRoute view={view} actions={actions} />;
  return <TripAhead v={view} actions={actions} />;
}

function NoRoute({ view, actions }: { view: Extract<AheadView, { kind: 'no-route' | 'unreadable' }>; actions: AheadActions }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="ahead" data-ahead={view.kind}>
      {view.kind === 'unreadable' ? (
        <>
          <p class="notice" role="alert">{W.appAheadUnreadable}</p>
          <p><button type="button" class="btn btn-primary" onClick={() => void actions.retry()}>{W.appAheadRetry}</button></p>
        </>
      ) : (
        // With no route the tab says what it will show, and where a route comes from (owner, 8 Nov 2026, item M).
        <div class="ah-empty" data-ahead-empty>
          <p>{W.appAheadEmptyBody}</p>
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
