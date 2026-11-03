// The chips for less frequent questions (spec section 3.2): Bike shop, Pharmacy, Bail out by train, Toilets, Shelter, Emergency.
// One opens at a time, below the row. Long lists fold after five, and nothing is removed (Decision 6).
import type { ChipName, Screen } from '../../core/screen/screen.ts';
import { W } from '../../core/wording/en.ts';
import { ListMore } from '../card.tsx';
import { StatusBadge } from '../status.tsx';
import type { AheadActions } from './actions.ts';
import { Basis, Detail, Item } from './answer-parts.tsx';
import { EmergencyPanel } from './emergency.tsx';

export type ChipKey = ChipName | 'emergency';
export const CHIP_ORDER: ChipKey[] = ['bike', 'pharmacy', 'train', 'toilets', 'shelter', 'emergency'];
const CHIP_LABEL: Record<ChipKey, string> = {
  bike: W.appAheadChipBike, pharmacy: W.appAheadChipPharmacy, train: W.appAheadChipTrain, toilets: W.appAheadChipToilets,
  shelter: W.appAheadChipShelter, emergency: W.appAheadChipEmergency,
};

export function ChipRow({ shown, open, onOpen }: { shown: ChipKey[]; open: ChipKey | null; onOpen: (c: ChipKey | null) => void }) {
  return (
    <div class="ah-chips" role="group" aria-label={W.appAheadChipsLabel}>
      {shown.map((c) => (
        <button
          key={c} type="button" class={`btn ah-chip${c === 'emergency' ? ' ah-chip-emergency' : ''}`} aria-expanded={open === c} aria-controls={`chip-${c}`}
          onClick={() => onOpen(open === c ? null : c)}
        >{CHIP_LABEL[c]}</button>
      ))}
    </div>
  );
}

export function ChipPanel({ chip, screen, canShare, actions, onClose }: { chip: ChipKey; screen: Screen; canShare: boolean; actions: AheadActions; onClose: () => void }) {
  if (chip === 'emergency') {
    return (
      <section class="card ah-chip-panel ah-large" id="chip-emergency" aria-label={CHIP_LABEL.emergency}>
        <EmergencyPanel card={screen.chips.emergency} canShare={canShare} actions={actions} />
        <button type="button" class="btn" onClick={onClose}>{W.appAheadClose}</button>
      </section>
    );
  }
  const a = screen.chips[chip];
  return (
    <section class={`card ah-chip-panel ah-status-${a.status}`} id={`chip-${chip}`} aria-label={CHIP_LABEL[chip]} data-chip={chip}>
      <p class="ah-topic">{CHIP_LABEL[chip]}</p>
      <h2 class="ah-card-title">{a.title}</h2>
      <p class="ah-meta">
        <StatusBadge status={a.status} />
        {screen.stamps[chip] ? <span class="ah-stamp">{screen.stamps[chip]}</span> : null}
      </p>
      {a.freshness.stale ? <p class="ah-stale" data-stale>{W.weatherStale}</p> : null}
      {a.detail ? <p class="ah-card-detail"><Detail text={a.detail} /></p> : null}
      {a.items.length > 0 ? <ListMore items={a.items} render={(x) => <Item item={x} />} /> : null}
      <Basis lines={a.basis} />
      <button type="button" class="btn" onClick={onClose}>{W.appAheadClose}</button>
    </section>
  );
}
