import { describe, expect, it } from 'vitest';
import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import { POTATO_COEFFICIENTS } from '../agronomy/potato.js';
import { epochMillis } from '../model/EpochMillis.js';
import { campaignId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import { celsius, millimeters } from '../model/Units.js';
import type { DailyWeather } from '../model/Weather.js';
import type { WeatherPort } from '../ports/WeatherPort.js';
import {
  InMemoryCampaigns,
  InMemoryIrrigations,
  InMemoryPlots,
  countingIds,
  fixedClock,
} from '../testing/doubles.js';
import { closeCampaignUseCase } from './CloseCampaign.js';
import { createPlotUseCase } from './CreatePlot.js';
import { recordIrrigationUseCase } from './RecordIrrigation.js';
import { MAX_DAYS_WITHOUT_WATER, simulateScenarioUseCase } from './SimulateScenario.js';
import { startCampaignUseCase } from './StartCampaign.js';

const TODAY = LocalDate.of(2026, 9, 20);
const NOW = epochMillis(TODAY.toEpochDay() * 86_400_000 + 12 * 3_600_000);
const PLANTING = LocalDate.of(2026, 9, 1);

/** Dry normals, with a record of every range the use case asked for. */
function dryNormals() {
  const requests: string[] = [];
  const day = (date: LocalDate): DailyWeather => ({
    date,
    maxTemperature: celsius(22),
    minTemperature: celsius(6),
    rainfall: millimeters(0),
    source: 'synthetic_normals',
    confidence: 0.1,
  });
  const port: WeatherPort = {
    weatherFor: async (date) => day(date),
    weatherBetween: async (from, to) => {
      requests.push(`${from.toString()}..${to.toString()}`);
      const days: DailyWeather[] = [];
      for (let cursor = from; cursor.daysUntil(to) >= 0; cursor = cursor.plusDays(1)) {
        days.push(day(cursor));
      }
      return days;
    },
  };
  return { port, requests };
}

async function subject(options: { located?: boolean } = {}) {
  const plots = new InMemoryPlots();
  const campaigns = new InMemoryCampaigns();
  const irrigations = new InMemoryIrrigations();
  const clock = fixedClock(NOW);
  const ids = countingIds();
  const weather = dryNormals();

  const plot = await createPlotUseCase({ plots, clock, ids })({
    name: 'Chacra de arriba',
    ...(options.located === false
      ? {}
      : { location: { latitude: -8.11, longitude: -78.01, altitude: 3100 } }),
  });
  const campaign = await startCampaignUseCase({ plots, campaigns, clock, ids })({
    plotId: plot.id,
    plantingDate: PLANTING,
  });

  return {
    execute: simulateScenarioUseCase({
      plots,
      campaigns,
      irrigations,
      weather: weather.port,
      coefficients: POTATO_COEFFICIENTS,
      clock,
    }),
    irrigate: recordIrrigationUseCase({ campaigns, irrigations, clock }),
    close: closeCampaignUseCase({ campaigns, clock }),
    campaign,
    plots,
    requests: weather.requests,
  };
}

describe('simulateScenarioUseCase', () => {
  it('projects exactly the dry spell asked about, from tomorrow', async () => {
    const { execute, campaign, requests } = await subject();

    const answer = await execute(campaign.id, { kind: 'no_irrigation', days: 7 });

    expect(requests).toEqual(['2026-09-01..2026-09-20', '2026-09-21..2026-09-27']);
    expect(answer.outcome).toMatchObject({ kind: 'no_irrigation' });
    if (!('kind' in answer.outcome) || answer.outcome.kind !== 'no_irrigation') return;
    const result = answer.outcome.result;
    if (!result.available) throw new Error('expected a projection');
    expect(result.today.date.equals(TODAY)).toBe(true);
    expect(result.projected).toHaveLength(7);
  });

  it('keeps the dry spell between one day and the maximum', async () => {
    const { execute, campaign, requests } = await subject();

    await execute(campaign.id, { kind: 'no_irrigation', days: 400 });
    await execute(campaign.id, { kind: 'no_irrigation', days: 0 });
    await execute(campaign.id, { kind: 'no_irrigation', days: Number.NaN });

    expect(requests[1]).toBe(`2026-09-21..${TODAY.plusDays(MAX_DAYS_WITHOUT_WATER).toString()}`);
    expect(requests[3]).toBe('2026-09-21..2026-09-21');
    expect(requests[5]).toBe('2026-09-21..2026-09-21');
  });

  it('counts the irrigations the farmer recorded', async () => {
    const { execute, irrigate, campaign } = await subject();
    const before = await execute(campaign.id, { kind: 'no_irrigation', days: 3 });
    await irrigate({ campaignId: campaign.id });
    const after = await execute(campaign.id, { kind: 'no_irrigation', days: 3 });

    const depletionOf = (answer: typeof before): number => {
      const outcome = answer.outcome;
      if (!('kind' in outcome) || outcome.kind !== 'no_irrigation' || !outcome.result.available) {
        throw new Error('expected a projection');
      }
      return outcome.result.today.waterBalance.depletion;
    };
    expect(depletionOf(after)).toBeLessThan(depletionOf(before));
  });

  it('answers the fungicide question honestly: nothing measures leaf wetness', async () => {
    const { execute, campaign } = await subject();

    const answer = await execute(campaign.id, { kind: 'fungicide_today' });

    expect(answer.outcome).toEqual({
      kind: 'fungicide_today',
      result: { available: false, reason: 'no_leaf_wetness' },
    });
  });

  it('estimates the harvest from the season length while the thermal thresholds are unknown', async () => {
    const { execute, campaign, requests } = await subject();

    const answer = await execute(campaign.id, { kind: 'harvest_date' });

    expect(requests[1]).toBe('2026-09-21..2027-09-01');
    expect(answer.outcome).toMatchObject({
      kind: 'harvest_date',
      result: { available: true, method: 'stage_lengths', daysFromToday: 111 },
    });
  });

  it('has no future to simulate once the crop is harvested', async () => {
    const { execute, close, campaign } = await subject();
    await close({ campaignId: campaign.id });

    const answer = await execute(campaign.id, { kind: 'harvest_date' });

    expect(answer.outcome).toEqual({ available: false, reason: 'campaign_closed' });
  });

  it('needs to know where the plot is', async () => {
    const { execute, campaign } = await subject({ located: false });

    const answer = await execute(campaign.id, { kind: 'no_irrigation', days: 7 });

    expect(answer.outcome).toEqual({ available: false, reason: 'no_location' });
  });

  it('refuses a campaign or plot that does not exist', async () => {
    const { execute, campaign, plots } = await subject();

    await expect(execute(campaignId('missing'), { kind: 'harvest_date' })).rejects.toThrow(
      CampaignNotFoundError,
    );

    await plots.deleteAll();
    await expect(execute(campaign.id, { kind: 'harvest_date' })).rejects.toThrow(
      PlotNotFoundError,
    );
  });
});
