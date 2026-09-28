import type { TimelineEntry } from '@agrotwin/domain';
import { DIAGNOSIS_HELP, DIAGNOSIS_LABEL, es } from '../../i18n/es';
import { Card } from '../../ui/Card';
import type { Tone } from '../../ui/Card';
import { ConfirmDiagnosis } from '../federation/ConfirmDiagnosis';

const TONE = {
  healthy: 'good',
  early_blight: 'soon',
  late_blight: 'now',
  rejected: 'neutral',
} as const satisfies Record<string, Tone>;

/**
 * The latest photograph's diagnosis, as one tile of the crop's state.
 *
 * It sits among the water and blight tiles, dated and placed on the campaign's
 * day count, with its confidence and where it came from — never on a screen of
 * its own (CLAUDE.md §18). What to *do* about it is the Advisor's card above,
 * which puts it next to the weather.
 */
export function LatestPhoto({ entry }: { entry: TimelineEntry | undefined }) {
  if (!entry) {
    return (
      <p data-testid="no-snapshots" className="text-lg">
        {es.twin.noSnapshots}
      </p>
    );
  }

  const { snapshot } = entry;
  return (
    <Card
      testId="latest-snapshot"
      tone={TONE[snapshot.diagnosis.class]}
      icon="camera"
      title={es.twin.latestPhotoTitle(snapshot.date)}
    >
      <p data-testid="campaign-day" className="text-base text-muted">
        {es.twin.dayOfCampaign(entry.dayOfCampaign)}
      </p>
      <p data-testid="diagnosis-label" className="text-xl font-bold">
        {DIAGNOSIS_LABEL[snapshot.diagnosis.class]}
      </p>
      <p className="text-lg">{DIAGNOSIS_HELP[snapshot.diagnosis.class]}</p>
      <p data-testid="confidence" className="text-base font-semibold">
        {es.common.certainty(snapshot.confidence)} ({Math.round(snapshot.confidence * 100)}%)
      </p>
      <p data-testid="provenance" className="text-base text-muted">
        {es.twin.photoProvenance}
      </p>
      {entry.observation?.note ? <p className="text-base">{es.twin.yourNote(entry.observation.note)}</p> : null}
      {/* Only while the original photo is kept: the embedding comes from it. */}
      {entry.observation && entry.hasOriginalImage ? (
        <ConfirmDiagnosis
          key={entry.observation.id}
          observationId={entry.observation.id}
          predicted={snapshot.diagnosis.class}
        />
      ) : null}
    </Card>
  );
}
