import { useState } from 'react';
import type { Plot, RainfallAnswer } from '@agrotwin/domain';
import { useContainer } from '../../composition/ContainerContext';

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
const RAINFALL_OPTIONS: readonly { value: RainfallAnswer; label: string }[] = [
  { value: 'none', label: 'No llovió' },
  { value: 'a_little', label: 'Llovió poco' },
  { value: 'a_lot', label: 'Llovió mucho' },
];

export function WeatherScreen({ plot, onSaved, onBack }: {
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
      setError('No se pudo guardar. Intenta de nuevo.');
    }
  };

  return (
    <section data-testid="weather-screen">
      <h1>El clima de ayer en {plot.name}</h1>
      <p>Dos preguntas. Con esto el gemelo entiende mejor tu parcela.</p>

      <fieldset>
        <legend>¿Llovió ayer?</legend>
        {RAINFALL_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={rainfall === option.value}
            data-testid={`rainfall-${option.value}`}
            onClick={() => setRainfall(option.value)}
          >
            {option.label}
          </button>
        ))}
      </fieldset>

      <fieldset>
        <legend>¿Hizo frío en la noche?</legend>
        <button
          type="button"
          aria-pressed={coldNight === true}
          data-testid="cold-night-yes"
          onClick={() => setColdNight(true)}
        >
          Sí, hizo frío
        </button>
        <button
          type="button"
          aria-pressed={coldNight === false}
          data-testid="cold-night-no"
          onClick={() => setColdNight(false)}
        >
          No, normal
        </button>
      </fieldset>

      <button
        type="button"
        data-testid="save-weather"
        disabled={rainfall === undefined || coldNight === undefined}
        onClick={() => void save()}
      >
        Guardar
      </button>

      {saved ? <p data-testid="weather-saved">Gracias. Guardado.</p> : null}
      {error ? (
        <p role="alert" data-testid="weather-error">
          {error}
        </p>
      ) : null}

      <button type="button" onClick={onBack}>
        Volver
      </button>
    </section>
  );
}
