import { describe, expect, it } from 'vitest';
import { Coefficients } from '../agronomy/Coefficients.js';
import { POTATO_COEFFICIENTS } from '../agronomy/potato.js';
import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { epochMillis } from '../model/EpochMillis.js';
import { campaignId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import { celsius, millimeters } from '../model/Units.js';
import type { DailyWeather } from '../model/Weather.js';
import type { WeatherPort } from '../ports/WeatherPort.js';
import { computeCampaignStateUseCase } from './ComputeCampaignState.js';
import { InMemoryCampaigns, InMemoryPlots, countingIds, fixedClock } from '../testing/doubles.js';
import { createPlotUseCase } from './CreatePlot.js';
import { startCampaignUseCase } from './StartCampaign.js';

const NOW = epochMillis(LocalDate.of(2026, 9, 20).toEpochDay() * 86_400_000 + 12 * 3_600_000);
const PLANTING = LocalDate.of(2026, 9, 1);

const normalsPort: WeatherPort = {
  weatherFor: async (date) => day(date),
  weatherBetween: async (from, to) => {
    const days: DailyWeather[] = [];
    for (let cursor = from; cursor.daysUntil(to) >= 0; cursor = cursor.plusDays(1)) {
      days.push(day(cursor));
    }
    return days;
  },
};

const emptyPort: WeatherPort = {
  weatherFor: async () => undefined,
  weatherBetween: async () => [],
};

function day(date: LocalDate): DailyWeather {
  return {
    date,
    maxTemperature: celsius(18),
    minTemperature: celsius(4),
    rainfall: millimeters(2),
    source: 'synthetic_normals',
    confidence: 0.1,
  };
}

async function subject(options: { located: boolean; weather?: WeatherPort; coefficients?: Coefficients }) {
  const plots = new InMemoryPlots();
  const campaigns = new InMemoryCampaigns();
  const clock = fixedClock(NOW);
  const ids = countingIds();

  const plot = await createPlotUseCase({ plots, clock, ids })({
    name: 'Chacra de arriba',
    ...(options.located ? { location: { latitude: -8.11, longitude: -78.01, altitude: 3100 } } : {}),
  });
  const campaign = await startCampaignUseCase({ plots, campaigns, clock, ids })({
    plotId: plot.id,
    plantingDate: PLANTING,
  });

  const execute = computeCampaignStateUseCase({
    plots,
    campaigns,
    weather: options.weather ?? normalsPort,
    coefficients: options.coefficients ?? POTATO_COEFFICIENTS,
    clock,
  });

  return { execute, campaign, plot, plots, campaigns };
}

describe('computeCampaignStateUseCase', () => {
  it('runs the twin from planting to today', async () => {
    const { execute, campaign } = await subject({ located: true });

    const state = await execute(campaign.id);

    // 1 to 20 September inclusive.
    expect(state.days).toHaveLength(20);
    expect(state.latest?.dayOfCampaign).toBe(19);
    expect(state.unavailable).toBeUndefined();
  });

  it('stops at the harvest date once the campaign is closed', async () => {
    const { execute, campaign, campaigns } = await subject({ located: true });
    await campaigns.save({
      ...campaign,
      status: 'closed',
      closedOn: LocalDate.of(2026, 9, 10),
      closedAt: NOW,
    });

    const state = await execute(campaign.id);

    // 1 to 10 September, not up to today: a harvested campaign stops moving.
    expect(state.days).toHaveLength(10);
  });

  it('says it has no location rather than guessing a latitude', async () => {
    const { execute, campaign } = await subject({ located: false });

    const state = await execute(campaign.id);

    // No latitude, no extraterrestrial radiation, no evapotranspiration.
    expect(state.unavailable).toBe('no_location');
    expect(state.days).toEqual([]);
  });

  it('says it has no weather rather than inventing a typical day', async () => {
    const { execute, campaign } = await subject({ located: true, weather: emptyPort });

    expect((await execute(campaign.id)).unavailable).toBe('no_weather');
  });

  it('names the coefficients it is missing', async () => {
    const incomplete = Coefficients.fromDocument({
      crop: 'potato',
      version: 'test.v1',
      region: 'Test',
      entries: {
        gddBaseTemperature: { value: null, unit: 'degreeCelsius', source: 'TODO' },
      },
    });
    const { execute, campaign } = await subject({ located: true, coefficients: incomplete });

    const state = await execute(campaign.id);

    expect(state.unavailable).toBe('missing_coefficients');
    expect(state.missingCoefficients).toContain('gddBaseTemperature');
  });

  it('refuses a campaign that does not exist', async () => {
    const { execute } = await subject({ located: true });

    await expect(execute(campaignId('missing'))).rejects.toThrow(CampaignNotFoundError);
  });

  it('carries the synthetic provenance all the way to the day state', async () => {
    const { execute, campaign } = await subject({ located: true });

    const state = await execute(campaign.id);

    // Everything here rests on invented normals, and it shows.
    expect(state.latest?.provenance[0]?.source).toBe('synthetic_normals');
    expect(state.latest?.confidence).toBeLessThan(0.1);
  });
});
