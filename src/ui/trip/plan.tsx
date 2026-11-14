// Plan from A to B (spec section 7.1): two place searches, then a bike router. Only the words typed go to a place search and only
// the two chosen points go to a router (the note below says so). If no bike router answers, it asks for a GPX file instead.
import { useState } from 'preact/hooks';
import { GpxError } from '../../core/route/gpx.ts';
import type { Route } from '../../core/types.ts';
import { W } from '../../core/wording/en.ts';
import { TR } from '../../core/wording/en-trip.ts';
import { planRoute, searchPlace } from '../../data/routing.ts';
import type { FoundPlace } from '../../data/routing.ts';
import { GeoNamesCredit, OsmCredit } from './credit.tsx';
import { routeFromPoints } from './read-gpx.ts';
import type { TripServices } from './services.ts';

type Slot = 'from' | 'to';

function PlaceChoice({ id, label, services, chosen, onChoose }: {
  id: string; label: string; services: TripServices; chosen: FoundPlace | null; onChoose: (place: FoundPlace | null) => void;
}) {
  const [text, setText] = useState('');
  const [hits, setHits] = useState<FoundPlace[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (): Promise<void> => {
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
        <button type="button" class="btn" onClick={() => { onChoose(null); setHits(null); }}>{`${TR.appAbChange} ${label.toLowerCase()}`}</button>
      </div>
    );
  }
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <form class="row" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input id={id} type="search" value={text} autoComplete="off" maxLength={200} onInput={(e) => setText(e.currentTarget.value)} />
        <button type="submit" class="btn" disabled={busy}>{TR.appAbSearch}</button>
      </form>
      <p class="muted">{TR.appAbHint}</p>
      {busy ? <p role="status">{TR.appAbSearching}</p> : null}
      {problem ? <p class="notice" role="alert">{problem}</p> : null}
      {hits && hits.length > 0 ? (
        <>
          <p class="muted" role="status">{TR.appAbPick}</p>
          {hits.some((h) => h.source === 'osm') ? <OsmCredit lead={TR.appTripOsmSearch} /> : null}
          {hits.some((h) => h.source === 'geonames') ? <GeoNamesCredit /> : null}
          <ul class="hits" aria-label={`${TR.appAbList}: ${label}`}>
            {hits.map((h, i) => (
              <li key={i}>
                <button type="button" class="btn hit" onClick={() => onChoose(h)}>
                  <span class="hit-name">{h.name}</span>
                  {h.street ? <span class="hit-line">{h.street}</span> : null}
                  {h.kind ? <span class="hit-line">{h.kind}</span> : null}
                  {h.where ? <span class="hit-line">{h.where}</span> : null}
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
      <p class="muted">{TR.appAbNote}</p>
      <PlaceChoice id="ab-from" label={TR.appAbFrom} services={services} chosen={picked.from} onChoose={(p) => setPicked((s) => ({ ...s, from: p }))} />
      <PlaceChoice id="ab-to" label={TR.appAbTo} services={services} chosen={picked.to} onChoose={(p) => setPicked((s) => ({ ...s, to: p }))} />
      {picked.from && picked.to ? <button type="button" class="btn btn-primary" onClick={() => void plan()}>{W.appAbPlan}</button> : null}
      {busy ? <p role="status">{TR.appAbPlanning}</p> : null}
      {none ? <p class="notice" role="alert">{TR.appAbNone}</p> : null}
      {problem ? <p class="notice" role="alert">{problem}</p> : null}
    </div>
  );
}
