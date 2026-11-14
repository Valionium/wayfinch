// Plan from A to B (spec section 7.1): two place searches, then a bike router. Only the words typed go to a place search and only
// the two chosen points go to a router (the note below says so). If no bike router answers, it asks for a GPX file instead.
import { useEffect, useRef, useState } from 'preact/hooks';
import { GpxError } from '../../core/route/gpx.ts';
import type { Route } from '../../core/types.ts';
import { W } from '../../core/wording/en.ts';
import { TR } from '../../core/wording/en-trip.ts';
import { AB } from '../../core/wording/en-plan.ts';
import { planRoute, searchPlace } from '../../data/routing.ts';
import type { FoundPlace } from '../../data/routing.ts';
import { GeoNamesCredit, OsmCredit } from './credit.tsx';
import { routeFromPoints } from './read-gpx.ts';
import type { TripServices } from './services.ts';

type Slot = 'from' | 'to';

/** The one hint under Start and End, which both fields name as their description (sweep of 14 Nov 2026, #8). */
const HINT_ID = 'ab-hint';

function PlaceChoice({ id, label, services, chosen, onChoose }: {
  id: string; label: string; services: TripServices; chosen: FoundPlace | null; onChoose: (place: FoundPlace | null) => void;
}) {
  const [text, setText] = useState('');
  const [hits, setHits] = useState<FoundPlace[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (): Promise<void> => {
    // Search stays in the tab order while it runs (aria-disabled, not disabled); a press meanwhile sends nothing more.
    if (busy) return;
    setProblem(null);
    setHits(null);
    setBusy(true);
    try {
      const found = await searchPlace(text, services.fetch);
      setHits(found);
      if (found.length === 0) setProblem(TR.appAbNoResults);
    } catch {
      setProblem(TR.appAbSearchFailed);
    } finally {
      setBusy(false);
    }
  };

  if (chosen) {
    return (
      <div class="field">
        <span class="field-label">{label}</span>
        <p class="tool-line">{chosen.name}<span class="muted">{[chosen.street, chosen.where].filter(Boolean).map((x) => ` · ${x}`).join('')}</span></p>
        <button type="button" class="btn" onClick={() => { onChoose(null); setHits(null); }}>{W.appAbChange(label)}</button>
      </div>
    );
  }
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <form class="row" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input
          id={id} type="search" value={text} autoComplete="off" maxLength={200} aria-describedby={HINT_ID} onInput={(e) => setText(e.currentTarget.value)}
        />
        <button type="submit" class="btn" aria-disabled={busy ? 'true' : undefined}>{TR.appAbSearch}</button>
      </form>
      {busy ? <p role="status">{TR.appAbSearching}</p> : null}
      {problem ? <p class="notice" role="alert">{problem}</p> : null}
      {/* In the page from the start and filled when the hits come, so a screen reader hears the prompt. */}
      <p class="muted ab-picking" role="status" data-pick-status>{hits && hits.length > 0 ? TR.appAbPick : ''}</p>
      {hits && hits.length > 0 ? (
        <>
          {hits.some((h) => h.source === 'osm') ? <OsmCredit lead={W.appTripOsmSearch} /> : null}
          {hits.some((h) => h.source === 'geonames') ? <GeoNamesCredit /> : null}
          <ul class="hits" aria-label={`${TR.appAbList}: ${label}`}>
            {hits.map((h, i) => (
              <li key={i}>
                <button type="button" class="btn hit" onClick={() => onChoose(h)}>
                  <span class="hit-name">{h.name}</span>
                  {/* Unseen commas keep the parts of the button's name apart for a screen reader. */}
                  {[h.street, h.kind, h.where].map((x, i) => (x ? <span key={i} class="hit-line"><span class="visually-hidden">, </span>{x}</span> : null))}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function PlanAB({ services, onRoute }: { services: TripServices; onRoute: (found: { route: Route; hadHeights: boolean }) => Promise<void> }) {
  const [picked, setPicked] = useState<Record<Slot, FoundPlace | null>>({ from: null, to: null });
  const [busy, setBusy] = useState(false);
  const [none, setNone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // After a pick (or Change) the focus goes on to the next thing to do, never to the page (sweep of 14 Nov 2026, #9).
  const picking = useRef(false);
  const planButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!picking.current) return;
    picking.current = false;
    const next = !picked.from ? 'ab-from' : !picked.to ? 'ab-to' : null;
    (next ? document.getElementById(next) : planButton.current)?.focus();
  }, [picked]);
  const choose = (slot: Slot) => (p: FoundPlace | null): void => { picking.current = true; setPicked((s) => ({ ...s, [slot]: p })); };

  const plan = async (): Promise<void> => {
    const { from, to } = picked;
    if (!from || !to) return;
    setNone(false);
    setProblem(null);
    setBusy(true);
    try {
      const line = await planRoute(from, to, services.fetch);
      if ('none' in line) {
        setNone(true);
        return;
      }
      const route = await routeFromPoints(line, W.appAbName(from.name, to.name));
      await onRoute({ route, hadHeights: route.points.every((p) => p.ele !== null) });
    } catch (e) {
      // A line the route building will not take is said in its own words; anything else is no answer from a router.
      if (e instanceof GpxError) setProblem(e.message);
      else setNone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-plan-ab>
      <h3>{TR.appAbTitle}</h3>
      <details class="ab-sent"><summary>{AB.appAbWhatIsSent}</summary><p class="muted">{TR.appAbNote}</p></details>
      <PlaceChoice id="ab-from" label={TR.appAbFrom} services={services} chosen={picked.from} onChoose={choose('from')} />
      <PlaceChoice id="ab-to" label={TR.appAbTo} services={services} chosen={picked.to} onChoose={choose('to')} />
      <p class="muted" id={HINT_ID}>{TR.appAbHint}</p>
      {picked.from && picked.to ? <button type="button" class="btn btn-primary" ref={planButton} onClick={() => void plan()}>{W.appAbPlan}</button> : null}
      {busy ? <p role="status">{TR.appAbPlanning}</p> : null}
      {none ? <p class="notice" role="alert">{TR.appAbNone}</p> : null}
      {problem ? <p class="notice" role="alert">{problem}</p> : null}
    </div>
  );
}
