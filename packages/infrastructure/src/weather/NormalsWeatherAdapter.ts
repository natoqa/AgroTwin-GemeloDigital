import { SOURCE_BASE_CONFIDENCE } from '@agrotwin/domain';
import type { DailyWeather, LocalDate, WeatherPort } from '@agrotwin/domain';
import type { ClimateNormals } from './ClimateNormals.js';

/**
 * Weather from climatological normals: the source that is always there.
 *
 * It answers for every day of every campaign without a network, a sensor or a
 * farmer, which is what makes the twin work offline and indefinitely
 * (CLAUDE.md §3). It pays for that by describing a typical year rather than
 * this one, and the confidence it reports says so.
 */
export class NormalsWeatherAdapter implements WeatherPort {
  constructor(private readonly normals: ClimateNormals) {}

  // The location is part of the port and unused here: normals are already
  // the normals *of a place*, chosen when the document was loaded.
  async weatherFor(date: LocalDate): Promise<DailyWeather | undefined> {
    return this.dayFor(date);
  }

  async weatherBetween(from: LocalDate, to: LocalDate): Promise<readonly DailyWeather[]> {
    const days: DailyWeather[] = [];
    for (let cursor = from; cursor.daysUntil(to) >= 0; cursor = cursor.plusDays(1)) {
      days.push(this.dayFor(cursor));
    }
    return days;
  }

  private dayFor(date: LocalDate): DailyWeather {
    const normal = this.normals.forDate(date);
    // A synthetic document is never allowed to pass as measured data.
    const source = this.normals.synthetic ? 'synthetic_normals' : 'climate_normals';

    return {
      date,
      maxTemperature: normal.maxTemperature,
      minTemperature: normal.minTemperature,
      rainfall: normal.rainfall,
      source,
      confidence: SOURCE_BASE_CONFIDENCE[source],
    };
  }
}
