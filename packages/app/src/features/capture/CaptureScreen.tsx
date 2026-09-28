import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Campaign, Plot, TwinSnapshot } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { es } from '../../i18n/es';
import { Banner } from '../../ui/Card';
import { Field } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { Screen } from '../../ui/Screen';

/**
 * Takes the photograph and turns it into a snapshot.
 *
 * Capture goes through `<input capture="environment">` rather than
 * `getUserMedia`: it hands the job to the system camera, which the farmer
 * already knows, and avoids permission and MediaStream lifecycle handling on a
 * low-end phone.
 *
 * The file input is styled as the screen's one big button — its label is the
 * tap target — so the native "Choose file" control never shows.
 */
export function CaptureScreen({
  plot,
  campaign,
  onRecorded,
  onBack,
}: {
  plot: Plot;
  campaign: Campaign;
  onRecorded: (snapshot: TwinSnapshot) => void;
  onBack: () => void;
}) {
  const { recordObservation } = useContainer();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(undefined);
    try {
      const { snapshot } = await recordObservation({
        campaignId: campaign.id,
        image: await file.arrayBuffer(),
        contentType: file.type || 'image/jpeg',
        ...(note.trim() === '' ? {} : { note }),
      });
      onRecorded(snapshot);
    } catch {
      setError(es.capture.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={es.capture.title(plot.name)}
      back={{ label: es.common.back, onClick: onBack }}
      testId="capture-screen"
    >
      <p className="text-lg">{es.capture.help}</p>

      <Field
        id="observation-note"
        data-testid="observation-note"
        label={es.capture.noteLabel}
        type="text"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        autoComplete="off"
      />

      <label
        htmlFor="photo"
        className={[
          'flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-xl border-2 px-5 text-xl font-bold',
          busy ? 'border-line bg-canvas text-muted' : 'border-brand bg-brand text-paper',
        ].join(' ')}
      >
        <Icon name="camera" className="h-8 w-8" />
        <span>{es.capture.photoLabel}</span>
      </label>
      <input
        id="photo"
        data-testid="photo-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void onPick(event)}
        disabled={busy}
        className="sr-only"
      />

      {busy ? (
        <p data-testid="analysing" role="status" className="text-lg font-semibold">
          {es.capture.analysing}
        </p>
      ) : null}
      {error ? (
        <Banner tone="now" alert testId="capture-error">
          {error}
        </Banner>
      ) : null}
    </Screen>
  );
}
