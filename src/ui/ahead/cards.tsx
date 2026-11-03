// The six topic cards (spec section 3.2), always in this order: Water, Food, Daylight, Weather, Climbing, Sleep. Each shows its
// one-line answer, its status in words and its stamp; a tap expands its items. The words are the screen's; the only things added
// are the controls the items name: Plan tomorrow and Back to today, "Raining anyway? Shelter", Update weather, the water question.
import type { CardName, Screen } from '../../core/screen/screen.ts';
import type { Answer } from '../../core/types.ts';
import { W } from '../../core/wording/en.ts';
import { ListMore } from '../card.tsx';
import { StatusBadge } from '../status.tsx';
import type { AheadActions, AheadTrip } from './actions.ts';
import { Basis, Detail, Item } from './answer-parts.tsx';
import { WaterQuestion } from './water-question.tsx';

export const CARD_ORDER: CardName[] = ['water', 'food', 'daylight', 'weather', 'climbing', 'sleep'];
const TOPIC: Record<CardName, string> = {
  water: W.appAheadTopicWater, food: W.appAheadTopicFood, daylight: W.appAheadTopicDaylight,
  weather: W.appAheadTopicWeather, climbing: W.appAheadTopicClimbing, sleep: W.appAheadTopicSleep,
};

type CardProps = {
  name: CardName; answer: Answer; stamp: string | null; open: boolean; onToggle: () => void;
  v: AheadTrip; actions: AheadActions; onShelter: () => void;
};

const FOLD_AFTER = 5;

const hasControl = (name: CardName, label: string): boolean =>
  (name === 'daylight' && (label === W.daylightPlanTomorrow || label === W.daylightBackToToday)) || (name === 'weather' && label === W.weatherRainingAnyway);

function ItemControl({ name, label, v, actions, onShelter }: { name: CardName; label: string; v: AheadTrip; actions: AheadActions; onShelter: () => void }) {
  if (name === 'daylight' && label === W.daylightPlanTomorrow) {
    return <button type="button" class="btn" onClick={() => void actions.planTomorrow(v.screen.ride.date)}>{label}</button>;
  }
  if (name === 'daylight' && label === W.daylightBackToToday) {
    return <button type="button" class="btn" onClick={() => void actions.backToToday()}>{label}</button>;
  }
  if (name === 'weather' && label === W.weatherRainingAnyway) {
    return <button type="button" class="btn" onClick={onShelter}>{label}</button>;
  }
  return null;
}

function TopicCard({ name, answer, stamp, open, onToggle, v, actions, onShelter }: CardProps) {
  const body = `card-${name}-body`;
  const asksWater = name === 'water' && answer.title === W.waterConfirm;
  return (
    <section class={`card ah-card ah-status-${answer.status}`} id={`card-${name}`} data-card={name}>
      <p class="ah-topic">{TOPIC[name]}</p>
      <h2 class="ah-card-title">
        <button type="button" class="ah-toggle" aria-expanded={open} aria-controls={body} onClick={onToggle}>{answer.title}</button>
      </h2>
      <p class="ah-meta">
        <StatusBadge status={answer.status} />
        {stamp ? <span class="ah-stamp">{stamp}</span> : null}
      </p>
      {answer.detail ? <p class="ah-card-detail"><Detail text={answer.detail} /></p> : null}
      {asksWater && !open ? <WaterQuestion stillAboutL={v.stillAboutL} actions={actions} /> : null}
      <div id={body} hidden={!open}>
        {open ? (
          <>
            {answer.items.length > 0 ? (
              // Long lists fold after five, and nothing is removed (Decision 6). Weather and Daylight keep their order whole: their
              // last items are controls.
              <div class="ah-items">
                <ListMore
                  items={answer.items} limit={name === 'weather' || name === 'daylight' ? answer.items.length : FOLD_AFTER}
                  render={(item) => hasControl(name, item.label)
                    ? <ItemControl name={name} label={item.label} v={v} actions={actions} onShelter={onShelter} />
                    : <Item item={item} />}
                />
              </div>
            ) : null}
            {name === 'water' ? <WaterQuestion stillAboutL={v.stillAboutL} actions={actions} /> : null}
            {name === 'weather' ? (
              <div class="ah-weather-update">
                <button type="button" class="btn" onClick={() => void actions.updateWeather()} aria-busy={v.weatherBusy ? 'true' : undefined}>{W.appAheadUpdateWeather}</button>
                <p role="status">{v.weatherBusy ? W.appAheadUpdatingWeather : v.weatherSay ?? ''}</p>
              </div>
            ) : null}
            <Basis lines={answer.basis} />
          </>
        ) : null}
      </div>
    </section>
  );
}

export function TopicCards({ screen, open, onToggle, v, actions, onShelter }: {
  screen: Screen; open: ReadonlySet<CardName>; onToggle: (name: CardName) => void; v: AheadTrip; actions: AheadActions; onShelter: () => void;
}) {
  return (
    <div class="ah-cards" aria-label={W.appAheadCardsLabel} role="group">
      {CARD_ORDER.map((name) => (
        <TopicCard
          key={name} name={name} answer={screen.cards[name]} stamp={screen.stamps[name]} open={open.has(name)} onToggle={() => onToggle(name)}
          v={v} actions={actions} onShelter={onShelter}
        />
      ))}
    </div>
  );
}
