// How it works (design of 14 November 2026, "How a bike works"): the learn page's third way in, a chunk of its own loaded on the first
// press of its switch (ui.tsx). The Topic drop-down, and under the drawing the step: "Step n of N: <topic>", its words, a line when the
// bike shown lacks the step's own part, its parts as buttons, Back and Next. ui.tsx keeps the topic and the step, and marks the parts.
import type { Ref } from 'preact';
import { missingOf, stepMarked, TOPICS, WORK_STEPS } from '../../core/parts/works.ts';
import type { WorkTopic } from '../../core/parts/works.ts';
import type { LearnBike, LearnId } from '../../core/parts/learn.ts';
import { LN, nameOf } from '../../core/wording/en-learn.ts';
import { LW, TOPIC_NAMES, TOPIC_STEPS, worksHeading, worksSaid } from '../../core/wording/en-works.ts';

export { stepMarked, worksHeading, worksSaid };
export const stepCount = (topic: WorkTopic): number => WORK_STEPS[topic].length;

export function TopicPick({ topic, onTopic }: { topic: WorkTopic; onTopic: (t: WorkTopic) => void }) {
  return (
    <label class="bl-kind bw-topic">
      <span>{LW.topic}</span>
      <select value={topic} onChange={(e) => onTopic((e.currentTarget as HTMLSelectElement).value as WorkTopic)}>
        {TOPICS.map((t) => <option key={t} value={t}>{TOPIC_NAMES[t]}</option>)}
      </select>
    </label>
  );
}

export type StepsProps = {
  bike: LearnBike; topic: WorkTopic; at: number; picked: LearnId | null;
  onPick: (id: LearnId) => void; onTurn: (to: number) => void;
  backRef: Ref<HTMLButtonElement>; nextRef: Ref<HTMLButtonElement>;
};

export function WorksSteps({ bike, topic, at, picked, onPick, onTurn, backRef, nextRef }: StepsProps) {
  const last = at === stepCount(topic) - 1;
  const miss = missingOf(bike, topic, at);
  const parts = stepMarked(bike, topic, at);
  return (
    <section class="bl-build bw-works" aria-labelledby="bw-step">
      <h3 id="bw-step" class="bl-step bw-step">{worksHeading(topic, at)}</h3>
      <p class="bl-line bw-text">{TOPIC_STEPS[topic][at]}</p>
      {miss ? <p class="muted bw-none">{LW.none(miss.part, miss.kind)}</p> : null}
      {topic === 'pressure' && last ? <p class="bw-tyre"><a href={LW.tyreHref}>{LW.tyreLink}</a></p> : null}
      {parts.length ? (
        <ul class="bl-parts" aria-label={LN.stepParts}>
          {parts.map((p) => (
            <li key={p}><button type="button" class="btn bl-part" data-part={p} aria-pressed={p === picked} onClick={() => onPick(p)}>{nameOf(p)}</button></li>
          ))}
        </ul>
      ) : null}
      <div class="bl-steps">
        <button type="button" ref={backRef} class="btn bl-back" disabled={at === 0} onClick={() => onTurn(at - 1)}>{LN.back}</button>
        <button type="button" ref={nextRef} class="btn btn-primary bl-next" onClick={() => onTurn(last ? 0 : at + 1)}>{last ? LN.again : LN.next}</button>
      </div>
    </section>
  );
}
