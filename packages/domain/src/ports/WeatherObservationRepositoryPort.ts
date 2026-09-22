import type { PlotId } from '../model/Ids.js';
import type { LocalDate } from '../model/LocalDate.js';
import type { WeatherObservation } from '../model/WeatherObservation.js';

export interface WeatherObservationRepositoryPort {
  /** Stores one day's answers, replacing any earlier answer for that day. */
  save(observation: WeatherObservation): Promise<void>;
  findByDate(plotId: PlotId, date: LocalDate): Promise<WeatherObservation | undefined>;
  /** Oldest first, inclusive of both ends. */
  listBetween(
    plotId: PlotId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<readonly WeatherObservation[]>;
  listAll(): Promise<readonly WeatherObservation[]>;
  deleteAll(): Promise<void>;
}
