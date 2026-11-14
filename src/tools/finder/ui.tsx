// The Bike finder (design of 14 November 2026): Tools' page at #/tools?finder, its own chunk loaded from the Tools chunk. Five questions as
// radios (the tyre tool's look), then the bike types that fit, best first, each with its reasons, what to look for and a link to its
// drawing in How a bike is built. It keeps the answers in its one copilot:* key (answers.ts), and never changes a saved bike.
import { useEffect, useRef, useState } from 'preact/hooks';
import { complete, findTypes, lookFor, missing, ORDER, QUESTIONS } from '../../core/finder/rank.ts';
import type { Answers, FinderType, Look, Question } from '../../core/finder/rank.ts';
import { FN, FN_ANSWERS, FN_LOOK, FN_LOOK_LABEL, FN_MIND, FN_MOTOR_TOO, FN_QUESTIONS, FN_TYPES, FN_WHY } from '../../core/wording/en-finder.ts';
import { bikeDetailsHref } from '../../ui/bike/link.ts';
import { clearAnswers, FINDER_KEY, readAnswers, writeAnswers } from './answers.ts';
import './finder.css';

/** The type whose drawing the rider opened last: back from How a bike is built, the focus goes to its link. This visit only. */
let followed: FinderType | null = null;

/** One line of what to look for: its label and words. */
function lookLine(type: FinderType, k: Look): [string, string] {
  const w = FN_LOOK[type];
  switch (k) {
    case 'mounts-days': return [FN_LOOK_LABEL.mounts, w.mountsDays];
    case 'motor-too': return [FN_LOOK_LABEL.motor, FN_MOTOR_TOO];
    default: return [FN_LOOK_LABEL[k], w[k] ?? ''];
  }
}

const firstRadio = (root: HTMLElement | null, q: Question): HTMLInputElement | null | undefined => root?.querySelector<HTMLInputElement>(`input[name="bf-${q}"]`);

export function FinderScreen() {
  const [answers, setAnswers] = useState<Answers>(readAnswers);
  // A complete set kept from an earlier visit shows its list at once.
  const [shown, setShown] = useState(() => complete(answers));
  const [asked, setAsked] = useState(false);
  const [said, setSaid] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const toList = useRef(false);

  useEffect(() => {
    const back = followed;
    followed = null;
    const link = back ? root.current?.querySelector<HTMLAnchorElement>(`a[data-finder-learn="${back}"]`) : null;
    if (link) link.focus(); else title.current?.focus();
  }, []);
  // Another tab's change, or Delete co-pilot data here or there: read again, so a deleted answer never comes back with the next tap.
  useEffect(() => {
    const again = (): void => { const a = readAnswers(); setAnswers(a); if (!complete(a)) setShown(false); };
    const onStorage = (e: StorageEvent): void => { if (e.key === null || e.key === FINDER_KEY) again(); };
    const onShow = (e: PageTransitionEvent): void => { if (e.persisted) again(); };
    const w = window;
    w.addEventListener('storage', onStorage);
    w.addEventListener('pageshow', onShow);
    w.addEventListener('copilot:deleted', again);
    return () => { w.removeEventListener('storage', onStorage); w.removeEventListener('pageshow', onShow); w.removeEventListener('copilot:deleted', again); };
  }, []);
  useEffect(() => { if (toList.current) { toList.current = false; heading.current?.focus(); } });

  const pick = (q: Question, v: string): void => {
    const next = { ...answers, [q]: v } as Answers;
    setAnswers(next);
    writeAnswers(next);
    if (shown) setSaid(FN.updated);
  };
  const show = (): void => {
    const gaps = missing(answers);
    if (gaps.length > 0) {
      setAsked(true);
      setSaid(FN.left(gaps.length));
      firstRadio(root.current, gaps[0]!)?.focus();
      return;
    }
    setAsked(false);
    setSaid('');
    if (shown) heading.current?.focus();
    else { setShown(true); toList.current = true; }
  };
  const startAgain = (): void => {
    // the focus moves before the list goes, so it never falls to the page
    firstRadio(root.current, 'rides')?.focus();
    clearAnswers();
    setAnswers({});
    setShown(false);
    setAsked(false);
    setSaid('');
  };

  const left = missing(answers).length;
  const full = shown && complete(answers) ? answers : null;
  const fits = full ? findTypes(full) : null;
  return (
    <div class="bf" ref={root}>
      <h2 class="bf-title" tabIndex={-1} ref={title}>{FN.title}</h2>
      <p class="muted">{FN.intro}</p>
      {ORDER.map((q) => (
        <fieldset key={q} class="tyre-choice bf-q">
          <legend class="bf-legend">{FN_QUESTIONS[q]}</legend>
          <div class="tyre-options">
            {(QUESTIONS[q] as readonly string[]).map((v) => (
              <label key={v} class="tyre-option">
                <input type="radio" name={`bf-${q}`} value={v} checked={answers[q] === v} onChange={() => pick(q, v)} />
                {(FN_ANSWERS[q] as Readonly<Record<string, string>>)[v]}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {asked && left > 0 && !fits ? <p class="bf-left">{FN.left(left)}</p> : null}
      <button type="button" class="btn btn-primary bf-show" onClick={show}>{FN.show}</button>
      {full && fits ? (
        <section class="bf-results" aria-labelledby="bf-results-title">
          <h3 id="bf-results-title" tabIndex={-1} ref={heading}>{FN.results}</h3>
          <p class="muted">{FN.order}</p>
          <ol class="bf-list">
            {fits.map((f) => (
              <li key={f.type} class="bf-type" data-finder-type={f.type}>
                <h4>{FN_TYPES[f.type]}</h4>
                <p class="bf-sub">{FN.why}</p>
                <ul class="bf-why">{f.why.map((k) => <li key={k}>{FN_WHY[k]?.[f.type]}</li>)}</ul>
                {f.mind ? <p class="bf-mind"><strong>{FN.mind}</strong> {FN_MIND[f.mind]}</p> : null}
                <p class="bf-sub">{FN.look}</p>
                <ul class="bf-look">
                  {lookFor(f.type, full).map((k) => { const [label, words] = lookLine(f.type, k); return <li key={k}><strong>{label}:</strong> {words}</li>; })}
                </ul>
                <a class="bf-learn" href={`#/tools?learn=${f.type}`} data-finder-learn={f.type} onClick={() => { followed = f.type; }}>
                  {FN.learn}<span class="visually-hidden"> ({FN_TYPES[f.type]})</span>
                </a>
              </li>
            ))}
          </ol>
          <p class="muted bf-frame">{FN.frame}</p>
          <p class="muted bf-add"><a href={bikeDetailsHref('new', 'tools')}>{FN.add}</a> {FN.addAfter}</p>
          <button type="button" class="btn bf-again" onClick={startAgain}>{FN.again}</button>
        </section>
      ) : null}
      <p class="visually-hidden bf-said" aria-live="polite">{said}</p>
    </div>
  );
}
