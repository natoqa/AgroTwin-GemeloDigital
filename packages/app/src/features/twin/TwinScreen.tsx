import { useEffect, useState } from 'react';
import type { Campaign, CampaignTimeline } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { DIAGNOSIS_HELP, DIAGNOSIS_LABEL, confidenceLabel } from './diagnosisText';

/**
 * The twin's board: the state of the plot over one crop cycle.
 *
 * The diagnosis is never shown on its own. It appears as one field of a
 * snapshot, next to the day of the campaign it belongs to and the confidence
 * it carries, because a bare diagnosis is what CLAUDE.md §18 forbids.
 */
export function TwinScreen({
  campaign,
  onCapture,
  onClosed,
  onBack,
}: {
  campaign: Campaign;
  onCapture: () => void;
  onClosed: (campaign: Campaign) => void;
  onBack: () => void;
}) {
  const { getCampaignTimeline, closeCampaign } = useContainer();
  const [timeline, setTimeline] = useState<CampaignTimeline | undefined>(undefined);

  useEffect(() => {
    void getCampaignTimeline(campaign.id).then(setTimeline);
  }, [getCampaignTimeline, campaign.id]);

  if (!timeline) {
    return <p data-testid="twin-loading">Cargando…</p>;
  }

  // Oldest first is how the twin's history is stored; the board leads with the
  // most recent state, which is what the farmer came to see.
  const history = [...timeline.entries].reverse();
  const latest = history[0];
  const open = timeline.campaign.status === 'active';

  return (
    <section data-testid="twin-screen">
      <h1>{timeline.plot.name}</h1>
      <p data-testid="campaign-heading">
        Siembra del {timeline.campaign.plantingDate.toString()}
        {open ? '' : ` — cosechada el ${timeline.campaign.closedOn?.toString() ?? ''}`}
      </p>

      {latest ? (
        <article data-testid="latest-snapshot">
          <h2>Estado del {latest.snapshot.date.toString()}</h2>
          <p data-testid="campaign-day">Día {latest.dayOfCampaign} de la campaña</p>
          <p data-testid="diagnosis-label">{DIAGNOSIS_LABEL[latest.snapshot.diagnosis.class]}</p>
          <p>{DIAGNOSIS_HELP[latest.snapshot.diagnosis.class]}</p>
          <p data-testid="confidence">
            {confidenceLabel(latest.snapshot.confidence)} (
            {Math.round(latest.snapshot.confidence * 100)}%)
          </p>
          {/*
            Provenance is shown as what the farmer recognises — "the photo you
            took" — not as the field name behind it. The full breakdown, once
            weather and crop stage feed in too, is a Phase 4 screen.
          */}
          <p data-testid="provenance">Basado en la foto que tomaste.</p>
          {latest.observation?.note ? <p>Tu nota: {latest.observation.note}</p> : null}
          <p data-testid="pending-agronomy">
            Todavía sin clima ni etapa del cultivo: eso llega más adelante.
          </p>
        </article>
      ) : (
        <p data-testid="no-snapshots">Aún no hay observaciones de esta campaña.</p>
      )}

      <h2>Historial</h2>
      <ol data-testid="snapshot-history">
        {history.map((entry) => (
          <li key={entry.snapshot.id}>
            Día {entry.dayOfCampaign} — {entry.snapshot.date.toString()} —{' '}
            {DIAGNOSIS_LABEL[entry.snapshot.diagnosis.class]} (
            {confidenceLabel(entry.snapshot.confidence)})
            {entry.hasOriginalImage ? '' : ' — foto ya no guardada'}
          </li>
        ))}
      </ol>

      {open ? (
        <button type="button" onClick={onCapture} data-testid="go-capture">
          Tomar foto
        </button>
      ) : null}

      {open ? (
        <button
          type="button"
          data-testid="close-campaign"
          onClick={() => {
            void closeCampaign({ campaignId: campaign.id }).then(onClosed);
          }}
        >
          Ya coseché
        </button>
      ) : null}

      <button type="button" onClick={onBack}>
        Volver a las campañas
      </button>
    </section>
  );
}
