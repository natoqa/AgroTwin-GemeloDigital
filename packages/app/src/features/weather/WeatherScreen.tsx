import { useState } from 'react';
import { RAINFALL_ANSWERS } from '@agrotwin/domain';
import type { Plot, RainfallAnswer } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';
import { RAINFALL_LABEL, es } from '../../i18n/es';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Card';
import { Choice, ChoiceGroup } from '../../ui/Field';
import { Screen } from '../../ui/Screen';

/**
 * The daily weather questions.
 *
 * Two questions, both about *yesterday*, because a day that has finished is
 * one a person can report on. Neither asks for a number: nobody in the sierra
 * has a rain gauge, and a millimetre figure would be either blank or invented
 * (CLAUDE.md §9).
 *
 * The most valuable answer is the simplest one. "It did not rain" is a fact
 * the farmer knows for certain, and it is the only one that needs no
 * coefficient to use.
 */
export function WeatherScreen({
  plot,
  onSaved,
  onBack,
}: {
  plot: Plot;
  onSaved: () => void;
  onBack: () => void;
}) {
  const { recordWeatherObservation } = useContainer();
  const [rainfall, setRainfall] = useState<RainfallAnswer | undefined>(undefined);
  const [coldNight, setColdNight] = useState<boolean | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const save = async () => {
    if (rainfall === undefined || coldNight === undefined) return;
    setError(undefined);
    try {
      await recordWeatherObservation({ plotId: plot.id, rainfall, coldNight });
      setSaved(true);
      onSaved();
    } catch {
      setError(es.common.saveFailed);
    }
  };

  return (
    <Screen
      title={es.weather.title(plot.name)}
      back={{ label: es.common.back, onClick: onBack }}
      testId="weather-screen"
    >
      <p className="text-lg">{es.weather.help}</p>

      <ChoiceGroup legend={es.weather.rainQuestion}>
        {RAINFALL_ANSWERS.map((answer) => (
          <Choice
            key={answer}
            pressed={rainfall === answer}
            testId={`rainfall-${answer}`}
            onClick={() => setRainfall(answer)}
          >
            {RAINFALL_LABEL[answer]}
          </Choice>
        ))}
      </ChoiceGroup>

      <ChoiceGroup legend={es.weather.coldQuestion}>
        <Choice pressed={coldNight === true} testId="cold-night-yes" onClick={() => setColdNight(true)}>
          {es.weather.coldYes}
        </Choice>
        <Choice pressed={coldNight === false} testId="cold-night-no" onClick={() => setColdNight(false)}>
          {es.weather.coldNo}
        </Choice>
      </ChoiceGroup>

      <Button
        variant="primary"
        icon="check"
        wide
        data-testid="save-weather"
        disabled={rainfall === undefined || coldNight === undefined}
        onClick={() => void save()}
      >
        {es.common.save}
      </Button>

      {saved ? (
        <Banner tone="good" icon="check" testId="weather-saved">
          {es.weather.saved}
        </Banner>
      ) : null}
      {error ? (
        <Banner tone="now" alert testId="weather-error">
          {error}
        </Banner>
      ) : null}
    </Screen>
  );
}
