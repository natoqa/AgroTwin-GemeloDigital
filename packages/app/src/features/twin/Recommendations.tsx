import { LOW_CONFIDENCE_THRESHOLD } from '@agrotwin/domain';
import type { Recommendation, RecommendationKind, Urgency } from '@agrotwin/domain';
import { URGENCY_LABEL, es, recommendationText, weakInputsSentence } from '../../i18n/es';
import { Card } from '../../ui/Card';
import type { Tone } from '../../ui/Card';
import type { IconName } from '../../ui/Icon';

const TONE: Record<Urgency, Tone> = { now: 'now', soon: 'soon', info: 'info' };

const ICON: Record<RecommendationKind, IconName> = {
  irrigate_now: 'drop',
  irrigate_soon: 'drop',
  water_ok: 'drop',
  consider_fungicide: 'spray',
  check_leaves: 'leaf',
  retake_photo: 'camera',
  take_photo: 'camera',
  report_weather: 'rain',
  harvest_near: 'basket',
  add_location: 'pin',
  crop_data_missing: 'info',
};

/**
 * The Advisor's list, as the farmer reads it.
 *
 * Each card leads with the urgency in words, then the action, then the
 * reason. When the Advisor moved a card down for low confidence, the card
 * says so and names why; when the confidence is low but there was nowhere
 * lower to go, it still names why. The order is the Advisor's: the screen
 * does not re-rank anything (CLAUDE.md §7: no agronomy in React).
 */
export function Recommendations({ recommendations }: { recommendations: readonly Recommendation[] }) {
  if (recommendations.length === 0) {
    return (
      <p data-testid="no-recommendations" className="text-lg">
        {es.twin.nothingToDo}
      </p>
    );
  }

  return (
    <ol data-testid="recommendations" className="flex flex-col gap-3">
      {recommendations.map((recommendation) => {
        const text = recommendationText(recommendation);
        const weak = recommendation.confidence < LOW_CONFIDENCE_THRESHOLD;
        return (
          <Card
            as="li"
            key={recommendation.kind}
            tone={TONE[recommendation.urgency]}
            icon={ICON[recommendation.kind]}
            testId={`recommendation-${recommendation.kind}`}
            title={
              <>
                <span className="block text-base font-extrabold uppercase tracking-wide">
                  {URGENCY_LABEL[recommendation.urgency]}
                </span>
                {text.title}
              </>
            }
          >
            <p className="text-lg">{text.why}</p>
            <p className="text-base font-semibold">{es.common.certainty(recommendation.confidence)}</p>
            {recommendation.demoted ? (
              <p className="text-base" data-testid="recommendation-demoted">
                {es.twin.demoted}
              </p>
            ) : null}
            {weak && recommendation.weakInputs.length > 0 ? (
              <p className="text-base text-muted">{weakInputsSentence(recommendation.weakInputs)}</p>
            ) : null}
          </Card>
        );
      })}
    </ol>
  );
}
