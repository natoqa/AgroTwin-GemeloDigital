import { SOURCE_BASE_CONFIDENCE, celsius, millimeters } from '@agrotwin/domain';
import type {
  Coefficients,
  DailyWeather,
  LocalDate,
  PlotId,
  PlotLocation,
  WeatherObservation,
  WeatherObservationRepositoryPort,
  WeatherPort,
} from '@agrotwin/domain';

/**
 * The farmer correcting the normals for their own plot.
 *
 * This is the layer CLAUDE.md §9 is really about. It does not replace the
 * normals — a qualitative answer cannot produce a temperature — it *adjusts*
 * them with what only the person standing in the field knows.
 *
 * Three translations, and they are not equally solid:
 *
 * - "It did not rain" sets rainfall to **zero**. That needs no coefficient:
 *   it is a fact the farmer knows with certainty, and it is the single most
 *   valuable thing this adapter contributes.
 * - "A little" and "a lot" scale the normals by provisional factors.
 * - "It was a cold night" subtracts a provisional number of degrees.
 *
 * The last two rest on coefficients with no published backing, so they carry
 * `TODO` sources and drag confidence down wherever they are used.
 */
export class ManualWeatherAdapter implements WeatherPort {
  constructor(
    private readonly base: WeatherPort,
    private readonly observations: WeatherObservationRepositoryPort,
    private readonly coefficients: Coefficients,
    private readonly plotId: PlotId,
  ) {}

  async weatherFor(date: LocalDate, location: PlotLocation): Promise<DailyWeather | undefined> {
    const baseline = await this.base.weatherFor(date, location);
    if (!baseline) return undefined;

    const answer = await this.observations.findByDate(this.plotId, date);
    return answer ? this.apply(baseline, answer) : baseline;
  }

  async weatherBetween(
    from: LocalDate,
    to: LocalDate,
    location: PlotLocation,
  ): Promise<readonly DailyWeather[]> {
    const baseline = await this.base.weatherBetween(from, to, location);
    const answers = await this.observations.listBetween(this.plotId, from, to);
    const byDate = new Map(answers.map((answer) => [answer.date.toString(), answer]));

    return baseline.map((day) => {
      const answer = byDate.get(day.date.toString());
      return answer ? this.apply(day, answer) : day;
    });
  }

  private apply(baseline: DailyWeather, answer: WeatherObservation): DailyWeather {
    const minTemperature = answer.coldNight
      ? baseline.minTemperature - this.coefficients.require('coldNightTemperatureDrop')
      : baseline.minTemperature;

    return {
      ...baseline,
      rainfall: this.rainfallFor(baseline, answer),
      // Clamped so a reported cold night can never push the minimum above the
      // maximum, which would make Hargreaves take the root of a negative.
      minTemperature: celsius(Math.min(minTemperature, baseline.maxTemperature)),
      source: 'manual_weather',
      confidence:
        SOURCE_BASE_CONFIDENCE.manual_weather *
        this.coefficients.confidenceFor(this.keysUsedBy(answer)),
    };
  }

  private rainfallFor(baseline: DailyWeather, answer: WeatherObservation) {
    if (answer.rainfall === 'none') return millimeters(0);
    const key = answer.rainfall === 'a_little' ? 'rainfallFactorLittle' : 'rainfallFactorHeavy';
    return millimeters(baseline.rainfall * this.coefficients.require(key));
  }

  /** Which provisional coefficients this particular answer leaned on. */
  private keysUsedBy(answer: WeatherObservation): readonly string[] {
    const keys: string[] = [];
    if (answer.rainfall === 'a_little') keys.push('rainfallFactorLittle');
    if (answer.rainfall === 'a_lot') keys.push('rainfallFactorHeavy');
    if (answer.coldNight) keys.push('coldNightTemperatureDrop');
    return keys;
  }
}
