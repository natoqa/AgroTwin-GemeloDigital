import type { CampaignState } from '@agrotwin/domain';
import { es } from '../../i18n/es';
import { Banner, Card } from '../../ui/Card';

/**
 * What the twin believes about the crop, one tile per question.
 *
 * Every branch here is a different *kind* of not-knowing, and they are kept
 * apart on purpose. "I have no location for this plot" is fixable by the
 * farmer in a minute; "nobody has told me when this variety starts making
 * tubers" is not, and is not their problem. Collapsing both into a blank
 * screen would waste the first and hide the second.
 *
 * Nothing here invents a number. A field the engine could not compute is a
 * sentence saying so.
 */
export function AgronomicState({ state }: { state: CampaignState }) {
  if (state.unavailable === 'no_location') {
    return (
      <Banner tone="soon" icon="pin" testId="agronomy-no-location">
        {es.agronomy.noLocation}
      </Banner>
    );
  }

  if (state.unavailable === 'no_weather') {
    return (
      <Banner tone="info" icon="rain" testId="agronomy-no-weather">
        {es.agronomy.noWeather}
      </Banner>
    );
  }

  if (state.unavailable === 'missing_coefficients' || !state.latest) {
    return (
      <Banner tone="info" icon="info" testId="agronomy-unavailable">
        {es.agronomy.unavailable}
      </Banner>
    );
  }

  const latest = state.latest;
  const depletion = Math.round(latest.waterBalance.depletion);

  return (
    <div data-testid="agronomic-state" className="flex flex-col gap-3">
      <Card
        tone={latest.waterBalance.underStress ? 'now' : 'good'}
        icon="drop"
        title={es.agronomy.waterTitle}
      >
        <p data-testid="water" className="text-lg">
          {latest.waterBalance.underStress
            ? es.agronomy.waterThirsty(depletion)
            : es.agronomy.waterOk(depletion)}
        </p>
      </Card>

      <Card icon="thermometer" title={es.agronomy.heatTitle}>
        <p data-testid="gdd" className="text-lg">
          {es.agronomy.heat(Math.round(latest.accumulatedGdd))}
        </p>
      </Card>

      <Card icon="sprout" title={es.agronomy.stageTitle}>
        {latest.phenologicalStage ? (
          <p data-testid="stage" className="text-lg">
            {es.agronomy.stage(
              es.agronomy.stageLabel[latest.phenologicalStage] ?? latest.phenologicalStage,
            )}
          </p>
        ) : (
          <p data-testid="stage-unknown" className="text-lg">
            {es.agronomy.stageUnknown}
          </p>
        )}
      </Card>

      <Card
        tone={latest.lateBlightRisk?.sprayAdvised ? 'now' : 'neutral'}
        icon="leaf"
        title={es.agronomy.blightTitle}
      >
        {latest.lateBlightRisk ? (
          <p data-testid="blight" className="text-lg">
            {latest.lateBlightRisk.sprayAdvised ? es.agronomy.blightFavourable : es.agronomy.blightCalm}
          </p>
        ) : (
          <p data-testid="blight-unknown" className="text-lg">
            {es.agronomy.blightUnknown}
          </p>
        )}
      </Card>

      <p data-testid="agronomy-confidence" className="text-lg font-semibold">
        {es.common.certainty(latest.confidence)}
      </p>
    </div>
  );
}
