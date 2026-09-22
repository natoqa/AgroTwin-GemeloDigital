import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Plot, TwinSnapshot } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';

/**
 * Takes the photograph and turns it into a snapshot.
 *
 * Capture goes through `<input capture="environment">` rather than
 * `getUserMedia`: it hands the job to the system camera, which the farmer
 * already knows, and avoids permission and MediaStream lifecycle handling on a
 * low-end phone. A live preview is a Phase 4 question, not a Phase 1 one.
 */
export function CaptureScreen({
  plot,
  onRecorded,
  onBack,
}: {
  plot: Plot;
  onRecorded: (snapshot: TwinSnapshot) => void;
  onBack: () => void;
}) {
  const { recordObservation } = useContainer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(undefined);
    try {
      const snapshot = await recordObservation({
        plotId: plot.id,
        image: await file.arrayBuffer(),
        contentType: file.type || 'image/jpeg',
      });
      onRecorded(snapshot);
    } catch {
      setError('No se pudo guardar la foto. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="capture-screen">
      <h1>Foto de {plot.name}</h1>
      <p>Toma una foto de una hoja.</p>

      <input
        id="photo"
        data-testid="photo-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void onPick(event)}
        disabled={busy}
      />

      {busy ? <p data-testid="analysing">Analizando…</p> : null}
      {error ? (
        <p role="alert" data-testid="capture-error">
          {error}
        </p>
      ) : null}

      <button type="button" onClick={onBack}>
        Volver
      </button>
    </section>
  );
}
