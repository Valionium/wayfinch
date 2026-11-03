// Ahead, the stop screen (spec section 3.2), top to bottom: the position line, the notes, the route strip, the six cards and the
// chips. It reads only the screen and the plain facts beside it, and calls one actions object: it computes no answer and sends
// nothing. Before a position exists, and with no day-1 plan, it shows only Update position and the manual picker (section 3.2,
// First use); the Emergency chip stays in every state.
import { useEffect, useState } from 'preact/hooks';
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
import './ahead.css';

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
  const [pickerOpen, setPicker] = useState(!v.answers);
  // First use opens the picker; a position closes it again once answers show.
  useEffect(() => { if (v.answers) setPicker(false); }, [v.answers, s.positionLine]);

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
    setChip(c);
    if (c) focusLater(`chip-${c}`);
  };

  return (
    <div class="ahead" data-ahead={v.answers ? 'answers' : 'first-use'}>
      {v.answers ? <PositionLine v={v} onShare={() => setSharing(true)} /> : <p>{W.appAheadFirstUse}</p>}
      {sharing && s.shareText !== null ? (
        <ShareSheet
          id="progress" title={W.appAheadShare} text={s.shareText} mapText={s.shareMapText} mapLink={v.mapLink} old={v.shareOld}
          canShare={v.canShare} actions={actions} onClose={() => setSharing(false)}
        />
      ) : null}
      <PositionControls v={v} actions={actions} pickerOpen={pickerOpen} onPicker={setPicker} />
      {v.answers ? (
        <>
          {s.notes.length > 0 ? <ul class="ah-notes notice">{s.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
          {v.badSpeed ? <p class="notice"><a href="#/trip">{W.appAheadSpeedLink}</a></p> : null}
          <RouteStrip strip={s.strip} bike={v.bike} onOpen={openCard} />
          <TopicCards screen={s} open={open} onToggle={toggle} v={v} actions={actions} onShelter={() => openChip('shelter')} />
        </>
      ) : null}
      <ChipRow shown={v.answers ? CHIP_ORDER : ['emergency']} open={chip} onOpen={openChip} />
      {chip ? <ChipPanel chip={chip} screen={s} canShare={v.canShare} actions={actions} onClose={() => setChip(null)} /> : null}
    </div>
  );
}

export function AheadScreen({ view, actions }: { view: AheadView; actions: AheadActions }) {
  if (view.kind === 'loading') return <div class="ahead" aria-busy="true" />;
  // With no route the shell's notice says "Add a route to see what's ahead"; there is no demo in the first version.
  if (view.kind === 'no-route') return <NoRoute view={view} actions={actions} />;
  return <TripAhead v={view} actions={actions} />;
}

function NoRoute({ view, actions }: { view: Extract<AheadView, { kind: 'no-route' }>; actions: AheadActions }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="ahead" data-ahead="no-route">
      <p><a class="btn btn-primary" href="#/trip">{W.appAheadToTrip}</a></p>
      <ChipRow shown={['emergency']} open={open ? 'emergency' : null} onOpen={(c) => setOpen(c !== null)} />
      {open ? (
        <section class="card ah-chip-panel ah-large" id="chip-emergency" aria-label={W.appAheadChipEmergency}>
          <EmergencyPanel card={view.emergency} canShare={view.canShare} actions={actions} />
        </section>
      ) : null}
    </div>
  );
}
