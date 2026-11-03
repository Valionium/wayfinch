// The Emergency card (spec section 6.9), in large text, in every state: 112 and the fallback line always, the numbers as call
// buttons, the position with its coordinates when there is one. Opening it sends nothing, and nothing is ever sent by itself:
// Share my location is the rider's own, through the share step. It works offline from what is stored.
import { useState } from 'preact/hooks';
import type { EmergencyCard } from '../../core/engines/emergency.ts';
import { W } from '../../core/wording/en.ts';
import { ListMore } from '../card.tsx';
import type { AheadActions } from './actions.ts';
import { Basis, Item } from './answer-parts.tsx';
import { ShareSheet } from './share-sheet.tsx';

/** Only digits and a leading +: what a dialler takes. The numbers come from the app's own dated table. */
const telOf = (n: string): string => `tel:${n.replace(/[^\d+]/g, '')}`;

export function EmergencyPanel({ card, canShare, actions }: { card: EmergencyCard; canShare: boolean; actions: AheadActions }) {
  const [sharing, setSharing] = useState(false);
  const numbers = card.items.filter((x) => card.numbers.includes(x.label));
  const rest = card.items.filter((x) => !card.numbers.includes(x.label));
  return (
    <div class="ah-emergency" data-emergency>
      <h2 class="ah-emergency-title"><a class="btn btn-primary ah-call" href={telOf('112')}>{card.title}</a></h2>
      <p class="ah-emergency-fallback">{card.detail}</p>
      <ul class="ah-numbers">
        {numbers.map((x, i) => (
          <li key={i}>
            <a class="btn ah-call" href={telOf(x.label)}>{x.label}</a> <span>{x.detail}</span>
          </li>
        ))}
      </ul>
      {card.notes.length > 0 ? <ul class="ah-notes">{card.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
      {card.updatePosition ? <p><button type="button" class="btn" onClick={() => void actions.updatePosition()}>{W.emergencyUpdatePosition}</button></p> : null}
      {rest.length > 0 ? <ListMore items={rest} render={(x) => <Item item={x} />} /> : <p class="muted">{W.appAheadEmergencyNoPosition}</p>}
      {card.share ? (
        sharing
          ? <ShareSheet id="location" title={W.appAheadEmergencyShare} text={card.share} canShare={canShare} actions={actions} onClose={() => setSharing(false)} />
          : <p><button type="button" class="btn" onClick={() => setSharing(true)}>{W.appAheadEmergencyShare}</button></p>
      ) : null}
      <Basis lines={card.basis} />
    </div>
  );
}
