import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { DomainError, LocalDate } from '@agrotwin/domain';
import type { Campaign, Plot } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { es } from '../../i18n/es';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Card';
import { Field } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { Screen, Section } from '../../ui/Screen';

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
      setError(
        (cause instanceof DomainError ? es.campaigns.errors[cause.code] : undefined) ??
          es.campaigns.startFailed,
      );
    }
  };

  const open = stored.some((campaign) => campaign.status === 'active');

  return (
    <Screen
      title={es.campaigns.title(plot.name)}
      back={{ label: es.campaigns.back, onClick: onBack }}
      testId="campaigns-screen"
    >
      <Section title={es.campaigns.listTitle} icon="sprout">
        {stored.length === 0 ? (
          <p data-testid="no-campaigns" className="text-lg">
            {es.campaigns.empty}
          </p>
        ) : null}
        <ul data-testid="campaign-list" className="flex flex-col gap-3">
          {stored.map((campaign) => (
            <li key={campaign.id}>
              <button
                type="button"
                onClick={() => onOpenCampaign(campaign)}
                data-testid="open-campaign"
                className={[
                  'flex min-h-16 w-full items-center gap-3 rounded-xl border-2 px-4 text-left text-lg font-bold',
                  campaign.status === 'active' ? 'border-brand bg-brand-soft' : 'border-line bg-paper',
                ].join(' ')}
              >
                <Icon name={campaign.status === 'active' ? 'sprout' : 'basket'} className="h-7 w-7" />
                <span className="flex-1">
                  {es.campaigns.item(campaign.plantingDate, campaign.status === 'closed')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {/*
        A plot holds one open campaign at a time. While one is open, starting
        another is not the main thing to do here, so the button steps back to
        the secondary style; the domain still refuses it with a clear message.
      */}
      <Section title={es.campaigns.startTitle} icon="plus">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field
            id="planting-date"
            data-testid="planting-date"
            label={es.campaigns.plantingLabel}
            type="date"
            value={plantingDate}
            onChange={(event) => setPlantingDate(event.target.value)}
          />
          <Button
            type="submit"
            variant={open ? 'secondary' : 'primary'}
            icon="plus"
            wide
            data-testid="start-campaign"
          >
            {es.campaigns.start}
          </Button>
        </form>
      </Section>

      {error ? (
        <Banner tone="now" alert testId="campaign-error">
          {error}
        </Banner>
      ) : null}
    </Screen>
  );
}
