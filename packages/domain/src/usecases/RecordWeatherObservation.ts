import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import type { PlotId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import type { RainfallAnswer, WeatherObservation } from '../model/WeatherObservation.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { WeatherObservationRepositoryPort } from '../ports/WeatherObservationRepositoryPort.js';

export interface RecordWeatherObservationDependencies {
  readonly plots: PlotRepositoryPort;
  readonly weatherObservations: WeatherObservationRepositoryPort;
  readonly clock: ClockPort;
}

export interface RecordWeatherObservationInput {
  readonly plotId: PlotId;
  readonly rainfall: RainfallAnswer;
  readonly coldNight: boolean;
  /** The day being described. Defaults to yesterday, which is what is asked. */
  readonly date?: LocalDate;
}

/**
 * Stores the farmer's answers about a day's weather.
 *
 * The default day is *yesterday*: the question is "did it rain yesterday?",
 * because a day that has already finished is one a person can report on, and
 * today is not over yet.
 */
export function recordWeatherObservationUseCase(deps: RecordWeatherObservationDependencies) {
  return async function execute(
    input: RecordWeatherObservationInput,
  ): Promise<WeatherObservation> {
    const plot = await deps.plots.findById(input.plotId);
    if (!plot) {
      throw new PlotNotFoundError(input.plotId);
    }

    const recordedAt = deps.clock.now();
    const observation: WeatherObservation = {
      plotId: plot.id,
      date: input.date ?? LocalDate.fromEpochMillis(recordedAt).plusDays(-1),
      rainfall: input.rainfall,
      coldNight: input.coldNight,
      recordedAt,
    };

    await deps.weatherObservations.save(observation);
    return observation;
  };
}
