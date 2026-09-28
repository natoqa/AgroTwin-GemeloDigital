import { describe, expect, it } from 'vitest';
import { POTATO_COEFFICIENTS } from '../agronomy/potato.js';
import { epochMillis } from '../model/EpochMillis.js';
import { LocalDate } from '../model/LocalDate.js';
import { celsius, millimeters } from '../model/Units.js';
import type { Diagnosis } from '../model/Diagnosis.js';
import type { DailyWeather } from '../model/Weather.js';
import type { WeatherPort } from '../ports/WeatherPort.js';
import {
  InMemoryCampaigns,
  InMemoryImageStore,
  InMemoryIrrigations,
  InMemoryObservations,
  InMemoryPlots,
  InMemorySnapshots,
  countingIds,
  fixedClock,
  stubInference,
} from '../testing/doubles.js';
import { createPlotUseCase } from './CreatePlot.js';
import { recordObservationUseCase } from './RecordObservation.js';
import { startCampaignUseCase } from './StartCampaign.js';

/**
 * The agronomic fields of a snapshot, and the four ways they can be absent.
 *
 * Each absence is a different situation, and none of them may become a zero:
 * a zero depletion reads as "the soil is full", which is the opposite of "I
 * could not work it out".
 */
const NOW = epochMillis(LocalDate.of(2026, 9, 20).toEpochDay() * 86_400_000 + 12 * 3_600_000);
const PLANTING = LocalDate.of(2026, 9, 1);
const HEALTHY: Diagnosis = { class: 'healthy', confidence: 0.9, modelVersion: 'mock-1' };

const weatherDay = (date: LocalDate, wet = false): DailyWeather => ({
  date,
  maxTemperature: celsius(18),
  minTemperature: celsius(4),
  rainfall: millimeters(1),
  ...(wet ? { leafWetnessHours: 20, wetPeriodMeanTemperature: celsius(14) } : {}),
  source: 'synthetic_normals',
  confidence: 0.1,
});

const portOver = (wet: boolean): WeatherPort => ({
  weatherFor: async (date) => weatherDay(date, wet),
  weatherBetween: async (from, to) => {
    const days: DailyWeather[] = [];
    for (let cursor = from; cursor.daysUntil(to) >= 0; cursor = cursor.plusDays(1)) {
      days.push(weatherDay(cursor, wet));
    }
    return days;
  },
});

const emptyPort: WeatherPort = {
  weatherFor: async () => undefined,
  weatherBetween: async () => [],
};

async function subject(options: { located: boolean; weather?: WeatherPort }) {
  const plots = new InMemoryPlots();
  const campaigns = new InMemoryCampaigns();
  const observations = new InMemoryObservations();
  const snapshots = new InMemorySnapshots();
  const clock = fixedClock(NOW);
  const images = new InMemoryImageStore(clock);
  const ids = countingIds();

  const plot = await createPlotUseCase({ plots, clock, ids })({
    name: 'Chacra de arriba',
    ...(options.located ? { location: { latitude: -8.11, longitude: -78.01 } } : {}),
  });
  const campaign = await startCampaignUseCase({ plots, campaigns, clock, ids })({
    plotId: plot.id,
    plantingDate: PLANTING,
  });

  const execute = recordObservationUseCase({
    plots,
    campaigns,
    observations,
    snapshots,
    images,
    inference: stubInference(HEALTHY),
    clock,
    ids,
    ...(options.weather === undefined
      ? {}
      : {
          agronomy: {
            weather: options.weather,
            irrigations: new InMemoryIrrigations(),
            coefficients: POTATO_COEFFICIENTS,
          },
        }),
  });

  return { execute, campaign };
}

const photograph = { image: new ArrayBuffer(16), contentType: 'image/jpeg' };

describe('recordObservationUseCase with agronomy wired in', () => {
  it('stamps the snapshot with the state of the twin that day', async () => {
    const { execute, campaign } = await subject({ located: true, weather: portOver(false) });

    const { snapshot } = await execute({ campaignId: campaign.id, ...photograph });

    expect(snapshot.accumulatedGdd).toBeGreaterThan(0);
    expect(snapshot.waterDepletion).toBeGreaterThan(0);
    expect(snapshot.underWaterStress).toBeDefined();
    // Still unknown, and still absent rather than guessed.
    expect(snapshot.phenologicalStage).toBeUndefined();
  });

  it('adds the engine provenance beside the diagnosis provenance', async () => {
    const { execute, campaign } = await subject({ located: true, weather: portOver(false) });

    const { snapshot } = await execute({ campaignId: campaign.id, ...photograph });

    expect(snapshot.provenance.map((entry) => entry.field)).toEqual([
      'diagnosis',
      'accumulatedGdd',
      'waterBalance',
    ]);
  });

  it('carries blight severity when the leaf wetness was measured', async () => {
    const { execute, campaign } = await subject({ located: true, weather: portOver(true) });

    const { snapshot } = await execute({ campaignId: campaign.id, ...photograph });

    expect(snapshot.lateBlightSeverity).toBeGreaterThan(0);
    expect(snapshot.sprayAdvised).toBeDefined();
  });

  it('leaves the agronomy out when no weather source is wired at all', async () => {
    const { execute, campaign } = await subject({ located: true });

    const { snapshot } = await execute({ campaignId: campaign.id, ...photograph });

    expect(snapshot.accumulatedGdd).toBeUndefined();
    expect(snapshot.waterDepletion).toBeUndefined();
    expect(snapshot.provenance).toHaveLength(1);
  });

  it('leaves the agronomy out when the plot has no coordinates', async () => {
    const { execute, campaign } = await subject({ located: false, weather: portOver(false) });

    const { snapshot } = await execute({ campaignId: campaign.id, ...photograph });

    // No latitude, no radiation, no evapotranspiration — and no pretending.
    expect(snapshot.waterDepletion).toBeUndefined();
  });

  it('leaves the agronomy out when no source can supply the weather', async () => {
    const { execute, campaign } = await subject({ located: true, weather: emptyPort });

    const { snapshot } = await execute({ campaignId: campaign.id, ...photograph });

    expect(snapshot.accumulatedGdd).toBeUndefined();
  });

  it('records the diagnosis either way, because that never depended on agronomy', async () => {
    const { execute, campaign } = await subject({ located: false });

    const { snapshot, observation } = await execute({ campaignId: campaign.id, ...photograph });

    expect(snapshot.diagnosis).toEqual(HEALTHY);
    expect(observation.imageRef).toBeDefined();
  });
});
