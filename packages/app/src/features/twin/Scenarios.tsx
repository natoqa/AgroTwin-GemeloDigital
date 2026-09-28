import { useEffect, useState } from 'react';
import type { Campaign, Scenario, ScenarioAnswer } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { es } from '../../i18n/es';
import { Card } from '../../ui/Card';
import { Choice, ChoiceGroup } from '../../ui/Field';

type Question = Scenario['kind'];

/** The dry spells the farmer can ask about: a few days, a week, two weeks. */
const DRY_SPELLS = [3, 7, 14] as const;

const QUESTIONS: readonly { kind: Question; label: string }[] = [
  { kind: 'no_irrigation', label: es.scenarios.noIrrigation },
  { kind: 'fungicide_today', label: es.scenarios.fungicide },
  { kind: 'harvest_date', label: es.scenarios.harvest },
];

interface Described {
  readonly lines: readonly string[];
  readonly confidence?: number;
  /** True for answers about days that have not happened yet. */
  readonly projected: boolean;
}

/** Turns the Simulator's answer into sentences. No arithmetic happens here. */
function describe(answer: ScenarioAnswer, days: number): Described {
  const outcome = answer.outcome;
  if (!('kind' in outcome)) {
    return { lines: [es.scenarios.unavailable[outcome.reason]], projected: false };
  }

  const result = outcome.result;
  if (!result.available) {
    const fungicideUnknown =
      result.reason === 'missing_coefficients' && result.missing.includes('fungicideProtectionDays');
    return {
      lines: [
        fungicideUnknown
          ? es.scenarios.unavailable.fungicide_protection
          : es.scenarios.unavailable[result.reason],
      ],
      projected: false,
    };
  }

  switch (outcome.kind) {
    case 'no_irrigation': {
      const water = outcome.result;
      if (!water.available) return { lines: [], projected: false };
      const endMm = Math.round(water.end.waterBalance.depletion);
      const lines: string[] = [];
      if (water.stressedToday) {
        lines.push(es.scenarios.water.stressedToday(days, endMm));
      } else if (water.stressStartsOn && water.daysUntilStress !== undefined) {
        lines.push(es.scenarios.water.stressComing(water.daysUntilStress, water.stressStartsOn));
        lines.push(
          water.ifWateredToday.stressStartsOn
            ? es.scenarios.water.wateredDelays(water.ifWateredToday.stressStartsOn)
            : es.scenarios.water.wateredAvoids(days),
        );
      } else {
        lines.push(es.scenarios.water.noStress(days, endMm));
      }
      return { lines, confidence: water.confidence, projected: true };
    }
    case 'fungicide_today': {
      const spray = outcome.result;
      if (!spray.available) return { lines: [], projected: false };
      return {
        lines: [
          es.scenarios.fungicideResult.protectedThrough(spray.protectedThrough),
          es.scenarios.fungicideResult.without(spray.withoutSpray.daysFromToday),
          es.scenarios.fungicideResult.with(spray.withSpray.daysFromToday),
        ],
        confidence: spray.confidence,
        projected: true,
      };
    }
    case 'harvest_date': {
      const harvest = outcome.result;
      if (!harvest.available) return { lines: [], projected: false };
      if (!('date' in harvest)) {
        return {
          lines: [es.scenarios.harvestResult.notReached],
          confidence: harvest.confidence,
          projected: true,
        };
      }
      return {
        lines: [
          es.scenarios.harvestResult.date(harvest.date, harvest.daysFromToday),
          harvest.method === 'thermal_time'
            ? es.scenarios.harvestResult.thermal
            : es.scenarios.harvestResult.stageLengths,
        ],
        confidence: harvest.confidence,
        projected: true,
      };
    }
  }
}

/**
 * The what-if questions of CLAUDE.md §8.3.
 *
 * Tapping a question asks it; there is no separate "calculate" step. The
 * answer is a card that says it is a calculation, not a change to the plot,
 * and how sure the twin is — which for every projection built on normals is
 * "poca certeza", and says so.
 */
export function Scenarios({ campaign }: { campaign: Campaign }) {
  const { simulateScenario } = useContainer();
  const [question, setQuestion] = useState<Question | undefined>(undefined);
  const [days, setDays] = useState<number>(7);
  const [answer, setAnswer] = useState<ScenarioAnswer | undefined>(undefined);

  useEffect(() => {
    if (!question) return;
    let current = true;
    const scenario: Scenario =
      question === 'no_irrigation' ? { kind: question, days } : { kind: question };
    void simulateScenario(campaign.id, scenario).then((result) => {
      // A slower earlier answer must not overwrite the one now being asked.
      if (current) setAnswer(result);
    });
    return () => {
      current = false;
    };
  }, [simulateScenario, campaign.id, question, days]);

  const described = question && answer ? describe(answer, days) : undefined;

  return (
    <div className="flex flex-col gap-3" data-testid="scenarios">
      <p className="text-lg text-muted">{es.scenarios.help}</p>

      <ChoiceGroup legend={es.scenarios.pick}>
        {QUESTIONS.map((entry) => (
          <Choice
            key={entry.kind}
            pressed={question === entry.kind}
            testId={`scenario-${entry.kind}`}
            onClick={() => {
              setAnswer(undefined);
              setQuestion(entry.kind);
            }}
          >
            {entry.label}
          </Choice>
        ))}
      </ChoiceGroup>

      {question === 'no_irrigation' ? (
        <ChoiceGroup legend={es.scenarios.daysLegend}>
          <div className="grid grid-cols-3 gap-2">
            {DRY_SPELLS.map((spell) => (
              <Choice
                key={spell}
                pressed={days === spell}
                compact
                testId={`scenario-days-${spell}`}
                onClick={() => {
                  setAnswer(undefined);
                  setDays(spell);
                }}
              >
                {es.scenarios.daysChoice(spell)}
              </Choice>
            ))}
          </div>
        </ChoiceGroup>
      ) : null}

      {/* Always mounted, so a screen reader announces each new answer. */}
      <div aria-live="polite">
        {described ? (
          <Card tone="info" icon="question" testId="scenario-result">
            {described.lines.map((line) => (
              <p key={line} className="text-lg">
                {line}
              </p>
            ))}
            {described.confidence === undefined ? null : (
              <p className="text-base font-semibold">{es.common.certainty(described.confidence)}</p>
            )}
            {described.projected ? (
              <p className="text-base text-muted">{es.scenarios.projectionNote}</p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
