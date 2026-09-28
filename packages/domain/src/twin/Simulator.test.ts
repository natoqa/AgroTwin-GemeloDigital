import { describe, expect, it } from 'vitest';
import { PROVISIONAL_CONFIDENCE_FACTOR } from '../agronomy/Coefficients.js';
import { POTATO_COEFFICIENTS } from '../agronomy/potato.js';
import { startCampaign } from '../model/Campaign.js';
import { epochMillis } from '../model/EpochMillis.js';
import { campaignId, plotId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import { createPlotLocation } from '../model/PlotLocation.js';
import { celsius, millimeters } from '../model/Units.js';
import type { DailyWeather } from '../model/Weather.js';
import { missing, potatoCoefficientsWith, verified } from '../testing/coefficients.js';
import { runBehaviorEngine } from './BehaviorEngine.js';
import {
  estimateHarvestDate,
  simulateFungicideToday,
  simulateNoIrrigation,
} from './Simulator.js';
import type { SimulationInput } from './Simulator.js';

/** See BehaviorEngine.test.ts: the domain has no host types, on purpose. */
declare const performance: { now(): number };

const LOCATION = createPlotLocation({ latitude: -8.11, longitude: -78.01, altitude: 3100 });
const PLANTING = LocalDate.of(2026, 9, 1);

const campaign = startCampaign({
  id: campaignId('c1'),
  plotId: plotId('p1'),
  plantingDate: PLANTING,
  startedAt: epochMillis(1_790_000_000_000),
  today: PLANTING,
});

const day = (offset: number, overrides: Partial<DailyWeather> = {}): DailyWeather => ({
  date: PLANTING.plusDays(offset),
  maxTemperature: celsius(22),
  minTemperature: celsius(6),
  rainfall: millimeters(0),
  source: 'climate_normals',
  confidence: 0.35,
  ...overrides,
});

const days = (from: number, count: number, overrides: Partial<DailyWeather> = {}) =>
  Array.from({ length: count }, (_, index) => day(from + index, overrides));

/** Wet enough to keep the root zone full. */
const RAINY = { rainfall: millimeters(15) };

/**
 * Wallin (1962), 11.7–15.0 °C band: 19–21 wet hours score 3. Each such day
 * adds 3 to the running total, so the BLITECAST threshold of 18 falls on the
 * sixth wet day of a clean count.
 */
const BLIGHT_WEATHER = { leafWetnessHours: 20, wetPeriodMeanTemperature: celsius(14) };

const input = (overrides: Partial<SimulationInput> = {}): SimulationInput => ({
  campaign,
  location: LOCATION,
  coefficients: POTATO_COEFFICIENTS,
  history: days(0, 20, RAINY),
  projection: days(20, 40),
  irrigatedDates: new Set(),
  ...overrides,
});

describe('simulateNoIrrigation — "what happens if I do not water for N days?"', () => {
  it('finds the day a dry spell starts to stress a crop whose soil is full today', () => {
    const result = simulateNoIrrigation(input(), 30);
    if (!result.available) throw new Error('expected a projection');

    expect(result.stressedToday).toBe(false);
    expect(result.projected).toHaveLength(30);
    expect(result.stressStartsOn).toBeDefined();

    // The reported day is the first projected day past readily available
    // water, and the day before it is still comfortable.
    const index = result.projected.findIndex((state) => state.waterBalance.underStress);
    expect(result.daysUntilStress).toBe(index + 1);
    expect(result.projected[index - 1]?.waterBalance.underStress).toBe(false);
    expect(result.end.waterBalance.depletion).toBeGreaterThan(result.today.waterBalance.depletion);
  });

  it('reports no stress when the period is too short for the soil to empty', () => {
    const result = simulateNoIrrigation(input(), 2);
    if (!result.available) throw new Error('expected a projection');

    expect(result.projected).toHaveLength(2);
    expect(result.stressStartsOn).toBeUndefined();
    expect(result.daysUntilStress).toBeUndefined();
  });

  it('says so when the crop is already thirsty today', () => {
    const result = simulateNoIrrigation(input({ history: days(0, 60) }), 7);
    if (!result.available) throw new Error('expected a projection');

    expect(result.stressedToday).toBe(true);
    expect(result.stressStartsOn).toBeUndefined();
  });

  it('shows how much later the stress comes if the farmer waters today', () => {
    // Ten dry days at roughly 2 mm of ETc a day: the soil is well down but
    // not yet past the 36 mm of readily available water.
    const result = simulateNoIrrigation(input({ history: days(0, 10) }), 40);
    if (!result.available) throw new Error('expected a projection');

    expect(result.today.waterBalance.depletion).toBeGreaterThan(0);
    expect(result.daysUntilStress).toBeDefined();
    expect(result.ifWateredToday.daysUntilStress).toBeGreaterThan(result.daysUntilStress ?? 99);
  });

  it('does not change the present: today is what the engine says today is', () => {
    const scenario = input();
    const result = simulateNoIrrigation(scenario, 10);
    if (!result.available) throw new Error('expected a projection');

    const present = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: scenario.history,
    });
    expect(result.today).toEqual(present.latest);
  });

  it('is only as confident as its weakest projected day', () => {
    const projection = [...days(20, 5), day(25, { source: 'synthetic_normals', confidence: 0.1 })];
    const result = simulateNoIrrigation(input({ projection }), 6);
    if (!result.available) throw new Error('expected a projection');

    const weakest = Math.min(...result.projected.map((state) => state.confidence));
    expect(result.confidence).toBe(weakest);
    expect(result.confidence).toBeLessThan(result.today.confidence);
  });

  it('refuses without weather, and without the coefficients it needs', () => {
    expect(simulateNoIrrigation(input({ history: [] }), 7)).toEqual({
      available: false,
      reason: 'no_weather',
    });

    const noRefill = potatoCoefficientsWith({ irrigationRefillFraction: missing('fraction') });
    expect(simulateNoIrrigation(input({ coefficients: noRefill }), 7)).toEqual({
      available: false,
      reason: 'missing_coefficients',
      missing: ['irrigationRefillFraction'],
    });

    const noSoil = potatoCoefficientsWith({ soilFieldCapacity: missing('cubicMeterPerCubicMeter') });
    expect(simulateNoIrrigation(input({ coefficients: noSoil }), 7)).toMatchObject({
      reason: 'missing_coefficients',
      missing: ['soilFieldCapacity'],
    });
  });

  /** CLAUDE.md §8.3: a whole campaign in milliseconds, scenarios included. */
  it('projects a 120-day campaign in milliseconds', () => {
    const scenario = input({ history: days(0, 60, RAINY), projection: days(60, 60) });
    const started = performance.now();
    const result = simulateNoIrrigation(scenario, 60);
    const elapsed = performance.now() - started;

    expect(result.available).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });
});

describe('simulateFungicideToday — "what happens if I spray today?"', () => {
  const blightInput = (coefficients = potatoCoefficientsWith({
    fungicideProtectionDays: verified(7, 'day'),
  })) =>
    input({
      coefficients,
      history: days(0, 3, { ...RAINY, ...BLIGHT_WEATHER }),
      projection: days(3, 20, { ...RAINY, ...BLIGHT_WEATHER }),
    });

  it('refuses while nobody knows how long a spray protects', () => {
    // The real coefficient file: fungicideProtectionDays is null.
    expect(simulateFungicideToday(blightInput(POTATO_COEFFICIENTS), 14)).toEqual({
      available: false,
      reason: 'missing_coefficients',
      missing: ['fungicideProtectionDays'],
    });
  });

  it('refuses when no source measured leaf wetness, which is the case today', () => {
    expect(simulateFungicideToday(input(), 14)).toEqual({
      available: false,
      reason: 'no_leaf_wetness',
    });
  });

  it('pushes the next spray back by the protection period, counted from zero again', () => {
    const result = simulateFungicideToday(blightInput(), 20);
    if (!result.available) throw new Error('expected a projection');

    // Today (day 2) the total is 9. Unsprayed, 3 more wet days reach 18.
    expect(result.withoutSpray.daysFromToday).toBe(3);
    expect(result.withoutSpray.advisedOn?.toString()).toBe('2026-09-06');

    // Sprayed today with 7 days of protection: today and the next 6 add
    // nothing, then six wet days of 3 bring the fresh count back to 18.
    expect(result.protectedThrough.toString()).toBe('2026-09-09');
    expect(result.withSpray.daysFromToday).toBe(12);
    expect(result.withSpray.advisedOn?.toString()).toBe('2026-09-15');
  });

  it('reports no advised spray when the horizon ends first', () => {
    const result = simulateFungicideToday(blightInput(), 8);
    if (!result.available) throw new Error('expected a projection');

    expect(result.withSpray).toEqual({});
    expect(result.withoutSpray.daysFromToday).toBe(3);
  });

  it('carries the confidence of the protection period it assumed', () => {
    const provisional = potatoCoefficientsWith({
      fungicideProtectionDays: { value: 7, unit: 'day', source: 'TODO: verificar fuente' },
    });

    const trusted = simulateFungicideToday(blightInput(), 14);
    const doubtful = simulateFungicideToday(blightInput(provisional), 14);
    if (!trusted.available || !doubtful.available) throw new Error('expected projections');

    expect(trusted.confidence).toBeCloseTo(0.35, 12);
    expect(doubtful.confidence).toBeCloseTo(0.35 * PROVISIONAL_CONFIDENCE_FACTOR, 12);
  });

  it('passes on the refusals of the underlying run', () => {
    expect(simulateFungicideToday(input({ history: [] }), 14)).toEqual({
      available: false,
      reason: 'no_weather',
    });
  });
});

describe('estimateHarvestDate — "when will I harvest?"', () => {
  it('falls back to the FAO-56 season length while the thermal thresholds are unknown', () => {
    const result = estimateHarvestDate(input());
    if (!result.available || !('date' in result)) throw new Error('expected a date');

    // 25 + 30 + 45 + 30 = 130 days after planting.
    expect(result.method).toBe('stage_lengths');
    expect(result.date.toString()).toBe(PLANTING.plusDays(130).toString());
    // Today is day 19 of the campaign.
    expect(result.daysFromToday).toBe(111);
    // Four provisional stage lengths, and nothing else.
    expect(result.confidence).toBeCloseTo(PROVISIONAL_CONFIDENCE_FACTOR ** 4, 12);
  });

  it('uses the thermal clock once gddToMaturity is known', () => {
    // 22/6 °C over a 7 °C base is 7 degree-days a day: 1000 are reached on
    // the 143rd day, index 142 from planting.
    const coefficients = potatoCoefficientsWith({
      gddToMaturity: verified(1000, 'degreeDayCelsius'),
    });
    const result = estimateHarvestDate(
      input({ coefficients, history: days(0, 20), projection: days(20, 200) }),
    );
    if (!result.available || !('date' in result)) throw new Error('expected a date');

    expect(result.method).toBe('thermal_time');
    expect(result.date.toString()).toBe(PLANTING.plusDays(142).toString());
    expect(result.daysFromToday).toBe(123);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('says the crop was not seen to mature when the projection is too short', () => {
    const coefficients = potatoCoefficientsWith({
      gddToMaturity: verified(1000, 'degreeDayCelsius'),
    });
    const result = estimateHarvestDate(input({ coefficients, projection: days(20, 10) }));

    expect(result).toMatchObject({ available: true, method: 'thermal_time', reached: false });
  });

  it('reports an estimate in the past as a negative number of days', () => {
    const coefficients = potatoCoefficientsWith({
      gddToMaturity: verified(70, 'degreeDayCelsius'),
    });
    const result = estimateHarvestDate(input({ coefficients }));
    if (!result.available || !('date' in result)) throw new Error('expected a date');

    expect(result.daysFromToday).toBe(-10);
  });

  it('refuses without weather or without any way to estimate', () => {
    expect(estimateHarvestDate(input({ history: [] }))).toEqual({
      available: false,
      reason: 'no_weather',
    });

    const noLengths = potatoCoefficientsWith({ stageLengthLate: missing('day') });
    expect(estimateHarvestDate(input({ coefficients: noLengths }))).toEqual({
      available: false,
      reason: 'missing_coefficients',
      missing: ['gddToMaturity', 'stageLengthLate'],
    });

    const noSoil = potatoCoefficientsWith({
      gddToMaturity: verified(1000, 'degreeDayCelsius'),
      soilWiltingPoint: missing('cubicMeterPerCubicMeter'),
    });
    expect(estimateHarvestDate(input({ coefficients: noSoil }))).toMatchObject({
      reason: 'missing_coefficients',
    });
  });
});
