import { useCallback, useEffect, useState } from 'react';
import type { Campaign, CampaignAdvice, CampaignState, CampaignTimeline } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { es } from '../../i18n/es';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Card';
import { Screen, Section } from '../../ui/Screen';
import { AgronomicState } from './AgronomicState';
import { LatestPhoto } from './LatestPhoto';
import { Recommendations } from './Recommendations';
import { Scenarios } from './Scenarios';
import { Timeline } from './Timeline';

/**
 * The TwinBoard: the plot's twin over one crop cycle.
 *
 * Read top to bottom, it is the loop of CLAUDE.md §2: what to do (the
 * Advisor), how to tell the twin what happened (photo, irrigation, weather),
 * what the twin believes about the crop, what would happen if (the
 * Simulator), and the history. Everything shown comes from use cases; the
 * screen holds only what is loaded and which question is open (§7).
 *
 * The synthetic-climate warning sits above everything else while the
 * SENAMHI normals are missing (risk R-01): no advice below it should be read
 * without it.
 */
export function TwinScreen({
  campaign,
  onCapture,
  onWeather,
  onClosed,
  onBack,
}: {
  campaign: Campaign;
  onCapture: () => void;
  onWeather: () => void;
  onClosed: (campaign: Campaign) => void;
  onBack: () => void;
}) {
  const { getCampaignTimeline, computeCampaignState, adviseCampaign, recordIrrigation, closeCampaign } =
    useContainer();
  const [timeline, setTimeline] = useState<CampaignTimeline | undefined>(undefined);
  const [state, setState] = useState<CampaignState | undefined>(undefined);
  const [advice, setAdvice] = useState<CampaignAdvice | undefined>(undefined);
  const [irrigation, setIrrigation] = useState<'saved' | 'failed' | undefined>(undefined);

  const load = useCallback(() => {
    void getCampaignTimeline(campaign.id).then(setTimeline);
    void computeCampaignState(campaign.id).then(setState);
    void adviseCampaign(campaign.id).then(setAdvice);
  }, [getCampaignTimeline, computeCampaignState, adviseCampaign, campaign.id]);

  useEffect(load, [load]);

  if (!timeline) {
    return (
      <p data-testid="twin-loading" className="p-4 text-lg">
        {es.app.loading}
      </p>
    );
  }

  const open = timeline.campaign.status === 'active';
  const latest = timeline.entries[timeline.entries.length - 1];
  const synthetic =
    state?.latest?.provenance.some((entry) => entry.source === 'synthetic_normals') ?? false;

  const irrigate = async () => {
    try {
      await recordIrrigation({ campaignId: campaign.id });
      setIrrigation('saved');
      load();
    } catch {
      setIrrigation('failed');
    }
  };

  return (
    <Screen
      title={timeline.plot.name}
      subtitle={
        <p data-testid="campaign-heading">
          {es.twin.heading(timeline.campaign.plantingDate, timeline.campaign.closedOn)}
        </p>
      }
      back={{ label: es.twin.back, onClick: onBack }}
      testId="twin-screen"
    >
      {synthetic ? (
        <Banner tone="soon" testId="synthetic-warning">
          <strong>{es.twin.syntheticLead}</strong> {es.twin.synthetic}
        </Banner>
      ) : null}

      <Section title={es.twin.todoTitle} icon="check">
        {open ? (
          advice ? (
            <Recommendations recommendations={advice.recommendations} />
          ) : (
            <p className="text-lg">{es.app.loading}</p>
          )
        ) : (
          <p className="text-lg">{es.twin.harvestedNothing}</p>
        )}
      </Section>

      {open ? (
        <Section title={es.twin.actionsTitle} icon="field">
          <Button variant="primary" icon="camera" wide onClick={onCapture} data-testid="go-capture">
            {es.twin.takePhoto}
          </Button>
          <Button variant="primary" icon="drop" wide onClick={() => void irrigate()} data-testid="irrigate">
            {es.twin.irrigated}
          </Button>
          {irrigation === 'saved' ? (
            <Banner tone="good" icon="check" testId="irrigation-saved">
              {es.twin.irrigatedSaved}
            </Banner>
          ) : null}
          {irrigation === 'failed' ? (
            <Banner tone="now" alert testId="irrigation-error">
              {es.twin.irrigatedFailed}
            </Banner>
          ) : null}
          <Button icon="rain" wide onClick={onWeather} data-testid="go-weather">
            {es.twin.weather}
          </Button>
        </Section>
      ) : null}

      <Section title={es.twin.stateTitle} icon="sprout">
        {state ? <AgronomicState state={state} /> : null}
        <LatestPhoto entry={latest} />
      </Section>

      {open ? (
        <Section title={es.scenarios.title} icon="question">
          <Scenarios campaign={timeline.campaign} />
        </Section>
      ) : null}

      <Section title={es.twin.historyTitle} icon="history">
        <Timeline events={timeline.events} />
      </Section>

      {open ? (
        <Button
          icon="basket"
          wide
          data-testid="close-campaign"
          onClick={() => {
            void closeCampaign({ campaignId: campaign.id }).then(onClosed);
          }}
        >
          {es.twin.close}
        </Button>
      ) : null}
    </Screen>
  );
}
