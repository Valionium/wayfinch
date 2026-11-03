// You, the first two cards (spec section 3.5): the rider, and the water the rider can carry. Every field is kept as it is
// changed; an empty field is allowed everywhere, and means "use the stand-in".
import { useState } from 'preact/hooks';
import { Y } from '../../core/wording/en-you.ts';
import { DEFAULT_SETTINGS } from '../../store/rules.ts';
import { Card } from '../card.tsx';
import { Choice, NumberField } from '../trip/settings.tsx';
import type { YouServices, YouSnapshot } from './services.ts';

type Problems = Partial<Record<string, string>>;

export function RiderCards({ services, snap, reload }: { services: YouServices; snap: YouSnapshot; reload: () => Promise<void> }) {
  const [problems, setProblems] = useState<Problems>({});
  const { profile, settings } = snap;
  const say = (field: string, text: string | null | undefined): void => setProblems((p) => ({ ...p, [field]: text ?? '' }));
  const problem = (f: string): string | null => problems[f] || null;

  const saveProfile = async (field: 'weightKg' | 'thirst' | 'ebike' | 'capacityL', value: unknown): Promise<boolean> => {
    const result = await services.writeProfile({ [field]: value });
    say(field, result.reasons[field] ?? result.newerReason);
    await reload();
    return result.ok;
  };
  const saveSetting = async (field: 'flatKph' | 'units', value: unknown): Promise<boolean> => {
    const result = await services.writeSettings({ [field]: value });
    say(field, result.reasons[field] ?? result.note);
    await reload();
    return result.ok;
  };

  return (
    <>
      <Card title={Y.youRiderTitle}>
        <div data-rider>
          <NumberField id="you-weight" label={Y.youWeight} value={profile.weightKg} step="0.5" min={20} max={350} placeholder="75" onCommit={(v) => saveProfile('weightKg', v)} problem={problem('weightKg')} />
          <p class="muted">{Y.youWeightHint}</p>
          <NumberField
            id="you-kph" label={Y.youFlatKph} value={settings.flatKph === DEFAULT_SETTINGS.flatKph ? null : settings.flatKph} step="0.5" min={15} max={40} placeholder={String(DEFAULT_SETTINGS.flatKph)}
            onCommit={(v) => saveSetting('flatKph', v ?? DEFAULT_SETTINGS.flatKph)} problem={problem('flatKph')}
          />
          <p class="muted">{Y.youFlatKphHint}</p>
          <Choice
            name="thirst" legend={Y.youThirstLegend} value={profile.thirst} onPick={(v) => saveProfile('thirst', v)}
            options={[['less', Y.youThirstLess], ['average', Y.youThirstAverage], ['more', Y.youThirstMore]]}
          />
          <p class="muted">{Y.youThirstNote}</p>
          {problem('thirst') ? <p class="field-problem" role="alert">{problem('thirst')}</p> : null}
          <div class="field">
            <label class="choice-option">
              <input type="checkbox" name="ebike" checked={profile.ebike} onChange={(e) => void saveProfile('ebike', e.currentTarget.checked)} />
              <span>{Y.youEbike}</span>
            </label>
            {profile.ebike ? <p class="muted">{Y.youEbikeNote}</p> : null}
            {problem('ebike') ? <p class="field-problem" role="alert">{problem('ebike')}</p> : null}
          </div>
          <Choice
            name="units" legend={Y.youUnitsLegend} value={settings.units} onPick={(v) => saveSetting('units', v)}
            options={[['metric', Y.youUnitsMetric], ['imperial', Y.youUnitsImperial]]}
          />
          {problem('units') ? <p class="field-problem" role="alert">{problem('units')}</p> : null}
          <p class="muted">{Y.youSavesAtOnce}</p>
        </div>
      </Card>
      <Card title={Y.youCapacityTitle}>
        <div data-capacity>
          <NumberField id="you-capacity" label={Y.youCapacity} value={profile.capacityL} step="0.25" min={0} max={20} onCommit={(v) => saveProfile('capacityL', v)} problem={problem('capacityL')} />
          {snap.planBottleL !== null ? <p data-plan-bottles>{Y.youCapacityPlan(String(Math.round(snap.planBottleL * 100) / 100))}</p> : null}
          <p class="muted">{Y.youCapacityHint}</p>
        </div>
      </Card>
    </>
  );
}

