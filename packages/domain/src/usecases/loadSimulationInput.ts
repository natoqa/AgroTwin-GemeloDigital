import type { Coefficients } from '../agronomy/Coefficients.js';
import type { Campaign } from '../model/Campaign.js';
import type { LocalDate } from '../model/LocalDate.js';
import type { Plot } from '../model/Plot.js';
import type { IrrigationRepositoryPort } from '../ports/IrrigationRepositoryPort.js';
import type { WeatherPort } from '../ports/WeatherPort.js';
import type { SimulationInput } from '../twin/Simulator.js';

export interface SimulationSources {
  readonly weather: WeatherPort;
  readonly irrigations: IrrigationRepositoryPort;
  readonly coefficients: Coefficients;
}

/**
 * Gathers what a scenario runs on: the campaign's weather up to today, the
 * weather the port offers for the days after it, and the irrigations the
 * farmer recorded.
 *
 * Not a use case. The use cases that simulate share it so that they cannot
 * disagree about what "today" and "the past" are. Returns `undefined` for a
 * plot without a location: without a latitude there is no evapotranspiration,
 * and every scenario is a water balance at heart.
 */
export async function loadSimulationInput(
  sources: SimulationSources,
  campaign: Campaign,
  plot: Plot,
  today: LocalDate,
  projectUntil: LocalDate,
): Promise<SimulationInput | undefined> {
  if (!plot.location) return undefined;

  const tomorrow = today.plusDays(1);
  const [history, projection, irrigations] = await Promise.all([
    sources.weather.weatherBetween(campaign.plantingDate, today, plot),
    tomorrow.daysUntil(projectUntil) >= 0
      ? sources.weather.weatherBetween(tomorrow, projectUntil, plot)
      : Promise.resolve([]),
    sources.irrigations.listByCampaign(campaign.id),
  ]);

  return {
    campaign,
    location: plot.location,
    coefficients: sources.coefficients,
    history,
    projection,
    irrigatedDates: new Set(irrigations.map((irrigation) => irrigation.date.toString())),
  };
}
