import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { DomainError, LocalDate } from '@agrotwin/domain';
import type { Campaign, Plot } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';

/**
 * The crop cycles of one plot.
 *
 * A campaign has no name of its own: it is the planting, and the farmer
 * remembers plantings by date. One text field fewer on a phone.
 */
export function CampaignScreen({
  plot,
  onOpenCampaign,
  onChanged,
  onBack,
}: {
  plot: Plot;
  onOpenCampaign: (campaign: Campaign) => void;
  onChanged: () => void;
  onBack: () => void;
}) {
  const { campaigns, startCampaign } = useContainer();
  const [stored, setStored] = useState<readonly Campaign[]>([]);
  const [plantingDate, setPlantingDate] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void campaigns.listByPlot(plot.id).then(setStored);
  }, [campaigns, plot.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    try {
      const campaign = await startCampaign({
        plotId: plot.id,
        plantingDate: LocalDate.parse(plantingDate),
      });
      setPlantingDate('');
      setStored(await campaigns.listByPlot(plot.id));
      onChanged();
      onOpenCampaign(campaign);
    } catch (cause) {
      setError(cause instanceof DomainError ? messageFor(cause) : 'No se pudo empezar la campaña.');
    }
  };

  return (
    <section data-testid="campaigns-screen">
      <h1>Campañas de {plot.name}</h1>

      <h2>Empezar una campaña</h2>
      <form onSubmit={submit}>
        <label htmlFor="planting-date">¿Qué día sembraste?</label>
        <input
          id="planting-date"
          data-testid="planting-date"
          type="date"
          value={plantingDate}
          onChange={(event) => setPlantingDate(event.target.value)}
        />
        <button type="submit" data-testid="start-campaign">
          Empezar campaña
        </button>
      </form>

      {error ? (
        <p role="alert" data-testid="campaign-error">
          {error}
        </p>
      ) : null}

      <h2>Campañas</h2>
      <ul data-testid="campaign-list">
        {stored.map((campaign) => (
          <li key={campaign.id}>
            <button
              type="button"
              onClick={() => onOpenCampaign(campaign)}
              data-testid="open-campaign"
            >
              Siembra del {campaign.plantingDate.toString()}
              {campaign.status === 'closed' ? ' (cosechada)' : ' (en curso)'}
            </button>
          </li>
        ))}
      </ul>

      {stored.length === 0 ? (
        <p data-testid="no-campaigns">
          Esta parcela no tiene campañas. Empieza una con la fecha en que sembraste.
        </p>
      ) : null}

      <button type="button" onClick={onBack}>
        Volver a la parcela
      </button>
    </section>
  );
}

function messageFor(error: DomainError): string {
  switch (error.code) {
    case 'ACTIVE_CAMPAIGN_ALREADY_EXISTS':
      return 'Esta parcela ya tiene una campaña en curso. Ciérrala antes de empezar otra.';
    case 'INVALID_CAMPAIGN_DATES':
      return 'Revisa la fecha de siembra.';
    case 'INVALID_LOCAL_DATE':
      return 'Elige el día en que sembraste.';
    default:
      return 'No se pudo empezar la campaña.';
  }
}
