import { describe, expect, it } from 'vitest';
import type { Coefficients } from '../agronomy/Coefficients.js';
import { POTATO_COEFFICIENTS } from '../agronomy/potato.js';
import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import { epochMillis } from '../model/EpochMillis.js';
import { campaignId, snapshotId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import { celsius, millimeters } from '../model/Units.js';
import type { DailyWeather } from '../model/Weather.js';
import type { WeatherPort } from '../ports/WeatherPort.js';
import { missing, potatoCoefficientsWith } from '../testing/coefficients.js';
import {
  InMemoryCampaigns,
  InMemoryIrrigations,
  InMemoryPlots,
  InMemorySnapshots,
  InMemoryWeatherObservations,
  countingIds,
  fixedClock,
} from '../testing/doubles.js';
import { adviseCampaignUseCase } from './AdviseCampaign.js';
import { closeCampaignUseCase } from './CloseCampaign.js';
import { createPlotUseCase } from './CreatePlot.js';
import { recordIrrigationUseCase } from './RecordIrrigation.js';
import { recordWeatherObservationUseCase } from './RecordWeatherObservation.js';
import { startCampaignUseCase } from './StartCampaign.js';

const TODAY = LocalDate.of(2026, 9, 20);
const NOW = epochMillis(TODAY.toEpochDay() * 86_400_000 + 12 * 3_600_000);
const PLANTING = LocalDate.of(2026, 8, 21);

/** The SYNTHETIC situation of every plot today: dry, invented normals. */
const syntheticDry: WeatherPort = {
  weatherFor: async () => undefined,
  weatherBetween: async (from, to) => {
    const days: DailyWeather[] = [];
    for (let cursor = from; cursor.daysUntil(to) >= 0; cursor = cursor.plusDays(1)) {
      days.push({
        date: cursor,
        maxTemperature: celsius(22),
        minTemperature: celsius(6),
        rainfall: millimeters(0),
        source: 'synthetic_normals',
        confidence: 0.1,
      });
    }
    return days;
  },
};

const noWeather: WeatherPort = {
  weatherFor: async () => undefined,
  weatherBetween: async () => [],
};

async function subject(
  options: { located?: boolean; weather?: WeatherPort; coefficients?: Coefficients } = {},
) {
  const plots = new InMemoryPlots();
  const campaigns = new InMemoryCampaigns();
  const snapshots = new InMemorySnapshots();
  const weatherObservations = new InMemoryWeatherObservations();
  const irrigations = new InMemoryIrrigations();
  const clock = fixedClock(NOW);
  const ids = countingIds();

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
    execute: adviseCampaignUseCase({
      plots,
      campaigns,
      snapshots,
      weatherObservations,
      irrigations,
      weather: options.weather ?? syntheticDry,
      coefficients: options.coefficients ?? POTATO_COEFFICIENTS,
      clock,
    }),
    answerWeather: recordWeatherObservationUseCase({ plots, weatherObservations, clock }),
    irrigate: recordIrrigationUseCase({ campaigns, irrigations, clock }),
    close: closeCampaignUseCase({ campaigns, clock }),
    campaign,
    plot,
    plots,
    snapshots,
  };
}

const kinds = (advice: { recommendations: readonly { kind: string }[] }) =>
  advice.recommendations.map((entry) => entry.kind);

describe('adviseCampaignUseCase', () => {
  it('warns about a thirsty crop, lower down and saying why, on synthetic weather', async () => {
    const { execute, campaign } = await subject();

    const advice = await execute(campaign.id);

    const water = advice.recommendations.find((entry) => entry.kind === 'irrigate_now');
    expect(water).toMatchObject({ intrinsicUrgency: 'now', urgency: 'soon', demoted: true });
    expect(water?.weakInputs).toEqual(['synthetic_weather', 'unreviewed_crop_data']);
    // Nothing photographed, nothing answered: the twin asks for both.
    expect(kinds(advice)).toEqual(expect.arrayContaining(['take_photo', 'report_weather']));
    expect(advice.harvest).toMatchObject({ available: true, method: 'stage_lengths' });
  });

  it('stops asking once the farmer photographed and answered', async () => {
    const { execute, answerWeather, snapshots, campaign, plot } = await subject();
    await answerWeather({ plotId: plot.id, rainfall: 'none', coldNight: false });
    await snapshots.save({
      id: snapshotId('s1'),
      plotId: plot.id,
      campaignId: campaign.id,
      at: NOW,
      date: TODAY,
      diagnosis: { class: 'healthy', confidence: 0.9, modelVersion: 'mock-1' },
      confidence: 0.9,
      provenance: [{ field: 'diagnosis', source: 'image_diagnosis', confidence: 0.9 }],
    });

    const advice = await execute(campaign.id);

    expect(kinds(advice)).not.toContain('take_photo');
    expect(kinds(advice)).not.toContain('report_weather');
  });

  it('stops saying the crop is thirsty after the farmer waters', async () => {
    const { execute, irrigate, campaign } = await subject();
    await irrigate({ campaignId: campaign.id });

    const advice = await execute(campaign.id);

    expect(kinds(advice)).not.toContain('irrigate_now');
  });

  it('asks for the location before anything agronomic', async () => {
    const { execute, campaign } = await subject({ located: false });

    const advice = await execute(campaign.id);

    expect(advice.recommendations[0]?.kind).toBe('add_location');
    expect(advice.harvest).toBeUndefined();
  });

  it('gives no water advice without weather, and says when crop data is missing', async () => {
    const withoutWeather = await subject({ weather: noWeather });
    expect(kinds(await withoutWeather.execute(withoutWeather.campaign.id))).toEqual([
      'take_photo',
      'report_weather',
    ]);

    const withoutSoil = await subject({
      coefficients: potatoCoefficientsWith({ soilWiltingPoint: missing('cubicMeterPerCubicMeter') }),
    });
    expect(kinds(await withoutSoil.execute(withoutSoil.campaign.id))).toContain(
      'crop_data_missing',
    );
  });

  it('has nothing to advise about a harvested campaign', async () => {
    const { execute, close, campaign } = await subject();
    await close({ campaignId: campaign.id });

    expect(await execute(campaign.id)).toMatchObject({ recommendations: [] });
  });

  it('refuses a campaign or plot that does not exist', async () => {
    const { execute, plots, campaign } = await subject();

    await expect(execute(campaignId('missing'))).rejects.toThrow(CampaignNotFoundError);
    await plots.deleteAll();
    await expect(execute(campaign.id)).rejects.toThrow(PlotNotFoundError);
  });
});
