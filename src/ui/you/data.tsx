// Your data (spec sections 3.5 and 4.4): export, import and delete. Each says what it does before it does it; a file that cannot be
// read writes nothing; delete names what goes and asks first.
import { useRef, useState } from 'preact/hooks';
import { Y } from '../../core/wording/en-you.ts';
import { Card } from '../card.tsx';
import { bagDeleteHref } from './services.ts';
import type { ImportPreview, YouServices } from './services.ts';

type Done = { text: string; newRoute: boolean };

function ExportImport({ services, reload }: { services: YouServices; reload: () => Promise<void> }) {
  const [said, setSaid] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const doExport = async (): Promise<void> => {
    setDone(null);
    try {
      const file = await services.exportFile();
      services.save(file.name, file.text);
      setSaid(Y.youExported(file.name));
    } catch {
      setSaid(null);
      setProblem(Y.youDeleteFailed);
    }
  };
  const pick = async (file: File | undefined): Promise<void> => {
    setDone(null);
    setProblem(null);
    if (!file) return;
    const content = await file.text().catch(() => '');
    setText(content);
    setPreview(services.preview(content));
  };
  const cancel = (): void => {
    setText(null);
    setPreview(null);
    setProblem(null);
    if (picker.current) picker.current.value = '';
  };
  const apply = async (): Promise<void> => {
    if (text === null) return;
    const result = await services.applyImport(text);
    if (!result.ok) {
      setProblem(result.reason);
      return;
    }
    cancel();
    setSaid(null);
    setDone({ text: Y.youImportDone, newRoute: result.routeChanged });
    await reload();
    if (result.ridesLeftOut > 0) setProblem(Y.youImportLeftOut(result.ridesLeftOut));
  };

  return (
    <div data-export-import>
      <div class="row">
        <button type="button" class="btn" onClick={() => void doExport()}>{Y.youExport}</button>
      </div>
      <p class="muted">{Y.youExportNote}</p>
      {said ? <p role="status" data-exported>{said}</p> : null}
      <div class="field">
        <label for="you-import">{Y.youImportFileLabel}</label>
        <input id="you-import" ref={picker} type="file" accept="application/json,.json" onChange={(e) => void pick(e.currentTarget.files?.[0])} />
      </div>
      {preview ? (
        <div data-import-preview>
          {preview.ok ? (
            <>
              <p>{Y.youImportArrives}</p>
              <ul>{preview.lines.length ? preview.lines.map((line) => <li key={line}>{line}</li>) : <li>{Y.youImportNothing}</li>}</ul>
              <p class="muted">{Y.youImportReplaces}</p>
              <div class="row">
                <button type="button" class="btn btn-primary" onClick={() => void apply()}>{Y.youImportGo}</button>
                <button type="button" class="btn" onClick={cancel}>{Y.youImportCancel}</button>
              </div>
            </>
          ) : (
            <>
              <p class="field-problem" role="alert">{preview.reason}</p>
              <button type="button" class="btn" onClick={cancel}>{Y.youImportCancel}</button>
            </>
          )}
        </div>
      ) : null}
      {problem ? <p class="field-problem" role="alert">{problem}</p> : null}
      {done ? (
        <div role="status" data-imported>
          <p>{done.text}</p>
          {done.newRoute ? <p>{Y.youImportNewRoute} <a href="#/trip">{Y.youImportOpenTrip}</a></p> : null}
        </div>
      ) : null}
    </div>
  );
}

function DeleteAll({ services, reload }: { services: YouServices; reload: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [alsoBags, setAlsoBags] = useState(false);
  const [state, setState] = useState<'idle' | 'deleted' | 'failed'>('idle');
  const confirm = async (): Promise<void> => {
    const result = await services.deleteAll(alsoBags);
    setAsking(false);
    setAlsoBags(false);
    setState(result.ok ? 'deleted' : 'failed');
    await reload();
  };
  return (
    <div data-delete>
      {!asking ? <button type="button" class="btn" onClick={() => { setAsking(true); setState('idle'); }}>{Y.youDelete}</button> : (
        <div class="notice" role="alertdialog" aria-labelledby="del-ask" data-delete-ask>
          <p id="del-ask"><strong>{Y.youDeleteAsk}</strong></p>
          <p>{Y.youDeleteGoes}</p>
          <label class="choice-option">
            <input type="checkbox" name="also-bags" checked={alsoBags} onChange={(e) => setAlsoBags(e.currentTarget.checked)} />
            <span>{Y.youDeleteBags}</span>
          </label>
          {alsoBags ? <p>{Y.youDeleteBagsGoes}</p> : null}
          <div class="row">
            <button type="button" class="btn btn-primary" onClick={() => void confirm()}>{Y.youDeleteConfirm}</button>
            <button type="button" class="btn" onClick={() => { setAsking(false); setAlsoBags(false); }}>{Y.youDeleteCancel}</button>
          </div>
        </div>
      )}
      {state === 'deleted' ? <p role="status">{Y.youDeleted}</p> : null}
      {state === 'failed' ? <p class="field-problem" role="alert">{Y.youDeleteFailed}</p> : null}
    </div>
  );
}

export function DataCard({ services, reload }: { services: YouServices; reload: () => Promise<void> }) {
  const pending = services.pendingBagDelete();
  return (
    <Card title={Y.youDataTitle}>
      <ExportImport services={services} reload={reload} />
      <DeleteAll services={services} reload={reload} />
      {pending ? (
        <div class="notice" data-bags-pending>
          <p>{Y.youBagsPending}</p>
          <a class="btn" href={bagDeleteHref(pending.id)}>{Y.youOpenBags}</a>
        </div>
      ) : null}
    </Card>
  );
}
