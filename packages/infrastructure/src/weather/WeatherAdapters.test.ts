import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Coefficients, LocalDate, createPlot, epochMillis, plotId } from '@agrotwin/domain';
import type {
  CoefficientDocument,
  DailyWeather,
  Plot,
  WeatherObservation,
  WeatherPort,
} from '@agrotwin/domain';
import { AgroTwinDb } from '../persistence/AgroTwinDb.js';
import { DexieWeatherObservationRepository } from '../persistence/DexieWeatherObservationRepository.js';
import { ClimateNormals, InvalidClimateNormalsError } from './ClimateNormals.js';
import type { ClimateNormalsDocument } from './ClimateNormals.js';
import { NormalsWeatherAdapter } from './NormalsWeatherAdapter.js';
import { ManualWeatherAdapter } from './ManualWeatherAdapter.js';
import { CachedNetworkWeatherAdapter } from './CachedNetworkWeatherAdapter.js';

const PLOT_ID = plotId('plot-1');
const PLOT: Plot = createPlot({
  id: PLOT_ID,
  name: 'Chacra de arriba',
  createdAt: epochMillis(1_790_000_000_000),
  location: { latitude: -8.11, longitude: -78.01 },
});
const DAY = LocalDate.of(2026, 9, 10);

const normalsDocument = (synthetic: boolean): ClimateNormalsDocument => ({
  synthetic,
  region: 'Test',
  station: 'Test',
  monthly: Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    maxTemperature: 18,
    minTemperature: 5,
    rainfallPerDay: 4,
  })),
});

const COEFFICIENTS = Coefficients.fromDocument({
  crop: 'potato',
  version: 'test.v1',
  region: 'Test',
  entries: {
    rainfallFactorLittle: { value: 0.5, unit: 'dimensionless', source: 'TODO: verificar fuente' },
    rainfallFactorHeavy: { value: 2, unit: 'dimensionless', source: 'TODO: verificar fuente' },
    coldNightTemperatureDrop: {
      value: 3,
      unit: 'degreeCelsius',
      source: 'TODO: verificar fuente',
    },
  },
} satisfies CoefficientDocument);

let db: AgroTwinDb;
let unique = 0;

beforeEach(async () => {
  unique += 1;
  db = new AgroTwinDb(`agrotwin-weather-${unique}`);
  await db.open();
});

afterEach(async () => {
  db.close();
  await AgroTwinDb.delete(`agrotwin-weather-${unique}`);
});

describe('ClimateNormals', () => {
  it('refuses a document that is not a full year', () => {
    const short = { ...normalsDocument(true), monthly: [] };
    expect(() => ClimateNormals.fromDocument(short)).toThrow(InvalidClimateNormalsError);
  });

  it('refuses a month whose maximum is below its minimum', () => {
    const document = normalsDocument(true);
    const broken = {
      ...document,
      monthly: document.monthly.map((entry, index) =>
        index === 0 ? { ...entry, maxTemperature: 0 } : entry,
      ),
    };
    expect(() => ClimateNormals.fromDocument(broken)).toThrow(InvalidClimateNormalsError);
  });

  it('refuses negative rainfall', () => {
    const document = normalsDocument(true);
    const broken = {
      ...document,
      monthly: document.monthly.map((entry, index) =>
        index === 3 ? { ...entry, rainfallPerDay: -1 } : entry,
      ),
    };
    expect(() => ClimateNormals.fromDocument(broken)).toThrow(InvalidClimateNormalsError);
  });

  it('refuses a repeated month', () => {
    const document = normalsDocument(true);
    const broken = {
      ...document,
      monthly: document.monthly.map((entry) => ({ ...entry, month: 1 })),
    };
    expect(() => ClimateNormals.fromDocument(broken)).toThrow(InvalidClimateNormalsError);
  });
});

describe('NormalsWeatherAdapter', () => {
  it('answers for any day without a network or a sensor', async () => {
    const adapter: WeatherPort = new NormalsWeatherAdapter(
      ClimateNormals.fromDocument(normalsDocument(false)),
    );

    const day = await adapter.weatherFor(DAY, PLOT);

    expect(day?.maxTemperature).toBe(18);
    expect(day?.source).toBe('climate_normals');
  });

  it('never lets a synthetic fixture pass as measured data', async () => {
    const adapter: WeatherPort = new NormalsWeatherAdapter(
      ClimateNormals.fromDocument(normalsDocument(true)),
    );

    const day = await adapter.weatherFor(DAY, PLOT);

    // The whole reason the source is a separate value (CLAUDE.md §9).
    expect(day?.source).toBe('synthetic_normals');
    expect(day?.confidence).toBeLessThan(0.2);
  });

  it('fills a whole range, oldest first, with both ends included', async () => {
    const adapter: WeatherPort = new NormalsWeatherAdapter(
      ClimateNormals.fromDocument(normalsDocument(false)),
    );

    const days = await adapter.weatherBetween(DAY, DAY.plusDays(4), PLOT);

    expect(days).toHaveLength(5);
    expect(days[0]?.date.toString()).toBe('2026-09-10');
    expect(days[4]?.date.toString()).toBe('2026-09-14');
  });
});

describe('ManualWeatherAdapter', () => {
  const base = new NormalsWeatherAdapter(ClimateNormals.fromDocument(normalsDocument(false)));

  const adapterWith = async (observation?: WeatherObservation) => {
    const repository = new DexieWeatherObservationRepository(db);
    if (observation) await repository.save(observation);
    return new ManualWeatherAdapter(base, repository, COEFFICIENTS);
  };

  const answer = (overrides: Partial<WeatherObservation> = {}): WeatherObservation => ({
    plotId: PLOT_ID,
    date: DAY,
    rainfall: 'none',
    coldNight: false,
    recordedAt: epochMillis(1_790_000_000_000),
    ...overrides,
  });

  it('passes the normals straight through on a day nobody answered about', async () => {
    const adapter = await adapterWith();

    const day = await adapter.weatherFor(DAY, PLOT);

    expect(day?.rainfall).toBe(4);
    expect(day?.source).toBe('climate_normals');
  });

  it('takes "it did not rain" as a fact, with no coefficient involved', async () => {
    const adapter = await adapterWith(answer({ rainfall: 'none' }));

    const day = await adapter.weatherFor(DAY, PLOT);

    expect(day?.rainfall).toBe(0);
    // Nothing provisional was used, so the farmer's own confidence stands.
    expect(day?.confidence).toBeCloseTo(0.55, 10);
    expect(day?.source).toBe('manual_weather');
  });

  it('scales the normals for "a little" and "a lot", and pays for it', async () => {
    const little = await (await adapterWith(answer({ rainfall: 'a_little' }))).weatherFor(
      DAY,
      PLOT,
    );
    expect(little?.rainfall).toBeCloseTo(2, 10);
    // 0.55 × 0.6, because a provisional factor was used.
    expect(little?.confidence).toBeCloseTo(0.33, 10);

    db.weatherObservations.clear();
    const heavy = await (await adapterWith(answer({ rainfall: 'a_lot' }))).weatherFor(
      DAY,
      PLOT,
    );
    expect(heavy?.rainfall).toBeCloseTo(8, 10);
  });

  it('drops the night temperature when the farmer reports a cold night', async () => {
    const adapter = await adapterWith(answer({ coldNight: true }));

    const day = await adapter.weatherFor(DAY, PLOT);

    expect(day?.minTemperature).toBeCloseTo(2, 10);
  });

  it('compounds the discount when an answer leans on two provisional factors', async () => {
    const adapter = await adapterWith(answer({ rainfall: 'a_lot', coldNight: true }));

    const day = await adapter.weatherFor(DAY, PLOT);

    // 0.55 × 0.6 × 0.6
    expect(day?.confidence).toBeCloseTo(0.198, 10);
  });

  it('never lets a cold night push the minimum above the maximum', async () => {
    const flat: WeatherPort = {
      weatherFor: async (date) => flatDay(date),
      weatherBetween: async () => [],
    };
    const repository = new DexieWeatherObservationRepository(db);
    await repository.save(answer({ coldNight: true }));
    const adapter = new ManualWeatherAdapter(flat, repository, COEFFICIENTS);

    const day = await adapter.weatherFor(DAY, PLOT);

    // Hargreaves takes the root of (max − min); an inversion here would be NaN.
    expect(day?.minTemperature).toBeLessThanOrEqual(day?.maxTemperature ?? 0);
  });

  it('applies answers across a whole range', async () => {
    const repository = new DexieWeatherObservationRepository(db);
    await repository.save(answer({ date: DAY.plusDays(1), rainfall: 'none' }));
    const adapter = new ManualWeatherAdapter(base, repository, COEFFICIENTS);

    const days = await adapter.weatherBetween(DAY, DAY.plusDays(2), PLOT);

    expect(days.map((day) => day.rainfall)).toEqual([4, 0, 4]);
  });
});

describe('CachedNetworkWeatherAdapter', () => {
  const base = new NormalsWeatherAdapter(ClimateNormals.fromDocument(normalsDocument(false)));

  it('falls back to the wrapped source when there is no fetcher at all', async () => {
    const adapter = new CachedNetworkWeatherAdapter(base);

    expect((await adapter.weatherFor(DAY, PLOT))?.source).toBe('climate_normals');
  });

  it('prefers a fetched day and remembers it', async () => {
    let calls = 0;
    const adapter = new CachedNetworkWeatherAdapter(base, {
      fetch: async (date) => {
        calls += 1;
        return { ...flatDay(date), source: 'network_weather_cache', confidence: 0.7 };
      },
    });

    expect((await adapter.weatherFor(DAY, PLOT))?.source).toBe('network_weather_cache');
    expect((await adapter.weatherFor(DAY, PLOT))?.source).toBe('network_weather_cache');
    // Fetched once; served from memory afterwards, which is what makes the day
    // survive the network going away.
    expect(calls).toBe(1);
  });

  it('treats a failing fetcher as an ordinary offline day', async () => {
    const adapter = new CachedNetworkWeatherAdapter(base, {
      fetch: async () => {
        throw new Error('no network');
      },
    });

    expect((await adapter.weatherFor(DAY, PLOT))?.source).toBe('climate_normals');
  });

  it('serves a cached day even after the fetcher starts failing', async () => {
    let working = true;
    const adapter = new CachedNetworkWeatherAdapter(base, {
      fetch: async (date) => {
        if (!working) throw new Error('no network');
        return { ...flatDay(date), source: 'network_weather_cache', confidence: 0.7 };
      },
    });

    await adapter.weatherFor(DAY, PLOT);
    working = false;

    expect((await adapter.weatherFor(DAY, PLOT))?.source).toBe('network_weather_cache');
  });

  it('fills a range from whatever each day can offer', async () => {
    const adapter = new CachedNetworkWeatherAdapter(base);

    expect(await adapter.weatherBetween(DAY, DAY.plusDays(2), PLOT)).toHaveLength(3);
  });
});

function flatDay(date: LocalDate): DailyWeather {
  return {
    date,
    maxTemperature: 4 as DailyWeather['maxTemperature'],
    minTemperature: 4 as DailyWeather['minTemperature'],
    rainfall: 0 as DailyWeather['rainfall'],
    source: 'climate_normals',
    confidence: 0.35,
  };
}
