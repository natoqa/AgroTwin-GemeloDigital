import { useEffect, useState } from 'react';
import type { Plot, TwinSnapshot } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { DIAGNOSIS_HELP, DIAGNOSIS_LABEL, confidenceLabel } from './diagnosisText';

/**
 * The twin's board: the state of the plot over time.
 *
 * The diagnosis is never shown on its own. It appears as one field of a
 * snapshot, next to the date it belongs to and the confidence it carries,
 * because a bare diagnosis is what CLAUDE.md section 18 forbids.
 */
export function TwinScreen({
  plot,
  onCapture,
  onBack,
}: {
  plot: Plot;
  onCapture: () => void;
  onBack: () => void;
}) {
  const { snapshots } = useContainer();
  const [history, setHistory] = useState<readonly TwinSnapshot[]>([]);

  useEffect(() => {
    void snapshots.listByPlot(plot.id).then(setHistory);
  }, [snapshots, plot.id]);

  const latest = history[0];

  return (
    <section data-testid="twin-screen">
      <h1>{plot.name}</h1>

      {latest ? (
        <article data-testid="latest-snapshot">
          <h2>Estado del {latest.date.toString()}</h2>
          <p data-testid="diagnosis-label">{DIAGNOSIS_LABEL[latest.diagnosis.class]}</p>
          <p>{DIAGNOSIS_HELP[latest.diagnosis.class]}</p>
          <p data-testid="confidence">
            {confidenceLabel(latest.confidence)} ({Math.round(latest.confidence * 100)}%)
          </p>
          <p data-testid="provenance">
            Basado en: {latest.provenance.map((entry) => entry.field).join(', ')} — de la foto que
            tomaste.
          </p>
          <p data-testid="pending-agronomy">
            Todavía sin clima ni etapa del cultivo: eso llega más adelante.
          </p>
        </article>
      ) : (
        <p data-testid="no-snapshots">Aún no hay observaciones de esta parcela.</p>
      )}

      <h2>Historial</h2>
      <ol data-testid="snapshot-history">
        {history.map((snapshot) => (
          <li key={snapshot.id}>
            {snapshot.date.toString()} — {DIAGNOSIS_LABEL[snapshot.diagnosis.class]} (
            {confidenceLabel(snapshot.confidence)})
          </li>
        ))}
      </ol>

      <button type="button" onClick={onCapture} data-testid="go-capture">
        Tomar foto
      </button>
      <button type="button" onClick={onBack}>
        Mis parcelas
      </button>
    </section>
  );
}
