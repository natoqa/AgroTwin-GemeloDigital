import type {
  LocalDate,
  PlotId,
  WeatherObservation,
  WeatherObservationRepositoryPort,
} from '@agrotwin/domain';
import type { AgroTwinDb } from './AgroTwinDb.js';
import {
  toWeatherObservation,
  toWeatherObservationRecord,
  weatherObservationKey,
} from './records.js';

export class DexieWeatherObservationRepository implements WeatherObservationRepositoryPort {
  constructor(private readonly db: AgroTwinDb) {}

  /** The key is plot and day, so a second answer about a day replaces the first. */
  async save(observation: WeatherObservation): Promise<void> {
    await this.db.weatherObservations.put(toWeatherObservationRecord(observation));
  }

  async findByDate(plotId: PlotId, date: LocalDate): Promise<WeatherObservation | undefined> {
    const record = await this.db.weatherObservations.get(
      weatherObservationKey(plotId, date.toString()),
    );
    return record ? toWeatherObservation(record) : undefined;
  }

  async listBetween(
    plotId: PlotId,
    from: LocalDate,
    to: LocalDate,
  ): Promise<readonly WeatherObservation[]> {
    const records = await this.db.weatherObservations
      .where('[plotId+date]')
      .between([plotId, from.toString()], [plotId, to.toString()], true, true)
      .toArray();
    return records.map(toWeatherObservation);
  }

  async listAll(): Promise<readonly WeatherObservation[]> {
    return (await this.db.weatherObservations.toArray()).map(toWeatherObservation);
  }

  async deleteAll(): Promise<void> {
    await this.db.weatherObservations.clear();
  }
}
