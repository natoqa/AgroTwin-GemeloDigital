import { describe, expect, it } from 'vitest';
import { Coefficients, PROVISIONAL_CONFIDENCE_FACTOR } from '../agronomy/Coefficients.js';
import { POTATO_COEFFICIENTS } from '../agronomy/potato.js';
import { startCampaign } from '../model/Campaign.js';
import type { Campaign } from '../model/Campaign.js';
import { campaignId, plotId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import { createPlotLocation } from '../model/PlotLocation.js';
import { epochMillis } from '../model/EpochMillis.js';
import { celsius, millimeters } from '../model/Units.js';
import type { DailyWeather } from '../model/Weather.js';
import { missing, potatoCoefficientsWith, verified } from '../testing/coefficients.js';
import { runBehaviorEngine } from './BehaviorEngine.js';

/**
 * Timing is a host concern, and the domain's tsconfig has neither DOM nor Node
 * types — which is the architectural rule doing its job. Declaring the clock
 * here, module-scoped, keeps the measurement in the one test that needs it
 * without opening host globals to the domain's production code, which
 * `pnpm test:arch` still refuses.
 */
declare const performance: { now(): number };

const LOCATION = createPlotLocation({ latitude: -8.11, longitude: -78.01, altitude: 3100 });
const PLANTING = LocalDate.of(2026, 9, 1);

const campaign: Campaign = startCampaign({
  id: campaignId('c1'),
  plotId: plotId('p1'),
  plantingDate: PLANTING,
  startedAt: epochMillis(1_790_000_000_000),
  today: PLANTING,
});

const weatherDay = (offset: number, overrides: Partial<DailyWeather> = {}): DailyWeather => ({
  date: PLANTING.plusDays(offset),
  maxTemperature: celsius(18),
  minTemperature: celsius(4),
  rainfall: millimeters(0),
  source: 'climate_normals',
  confidence: 0.35,
  ...overrides,
});

const season = (days: number, overrides: Partial<DailyWeather> = {}): DailyWeather[] =>
  Array.from({ length: days }, (_, index) => weatherDay(index, overrides));

describe('runBehaviorEngine', () => {
  it('produces one state per day of weather it was given', () => {
    const result = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(10),
    });

    expect(result.days).toHaveLength(10);
    expect(result.unavailable).toEqual([]);
    expect(result.latest?.dayOfCampaign).toBe(9);
  });

  it('accumulates thermal time and never lets it fall', () => {
    const result = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(30),
    });

    // (18 + 4) / 2 = 11 °C; 11 − 7 = 4 degree-days a day.
    expect(result.latest?.accumulatedGdd).toBeCloseTo(4 * 30, 6);

    let previous = -1;
    for (const day of result.days) {
      expect(day.accumulatedGdd).toBeGreaterThanOrEqual(previous);
      previous = day.accumulatedGdd;
    }
  });

  it('walks the crop through its FAO-56 water-use periods', () => {
    const result = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(130),
    });

    expect(result.days[0]?.cropStage).toBe('initial');
    expect(result.days[30]?.cropStage).toBe('development');
    expect(result.days[60]?.cropStage).toBe('mid_season');
    expect(result.days[120]?.cropStage).toBe('late_season');
  });

  it('dries the soil out when no rain ever falls', () => {
    const result = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(60),
    });

    const first = result.days[0];
    const last = result.latest;
    expect(last?.waterBalance.depletion).toBeGreaterThan(first?.waterBalance.depletion ?? 0);
    expect(last?.waterBalance.underStress).toBe(true);
  });

  it('keeps the soil comfortable when it rains steadily', () => {
    const result = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(60, { rainfall: millimeters(8) }),
    });

    expect(result.latest?.waterBalance.underStress).toBe(false);
  });

  it('counts a reported irrigation as bringing the root zone back to field capacity', () => {
    const irrigationDay = PLANTING.plusDays(20);
    const dry = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(30),
    });
    const irrigated = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(30),
      irrigatedDates: new Set([irrigationDay.toString()]),
    });

    const day = irrigated.days[20];
    // With a refill fraction of 1 the soil starts the day full, so all that is
    // missing by nightfall is what the crop drank that same day.
    expect(day?.waterBalance.depletion).toBeCloseTo(day?.waterBalance.actualEt ?? -1, 9);
    expect(irrigated.latest?.waterBalance.depletion).toBeLessThan(
      dry.latest?.waterBalance.depletion ?? 0,
    );
    // Before the irrigation, nothing differs.
    expect(irrigated.days[19]).toEqual(dry.days[19]);
  });

  it('makes up only the configured share of the shortfall', () => {
    const half = potatoCoefficientsWith({ irrigationRefillFraction: verified(0.5, 'fraction') });
    const before = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: half,
      weather: season(21),
    }).days[19];
    const result = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: half,
      weather: season(21),
      irrigatedDates: new Set([PLANTING.plusDays(20).toString()]),
    });

    const carried = before?.waterBalance.depletion ?? 0;
    const today = result.days[20];
    expect(today?.waterBalance.depletion).toBeCloseTo(
      carried / 2 + (today?.waterBalance.actualEt ?? 0),
      9,
    );
  });

  it('costs confidence from the first irrigation on, because the refill is provisional', () => {
    const irrigated = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(30),
      irrigatedDates: new Set([PLANTING.plusDays(20).toString()]),
    });

    const before = irrigated.days[19]?.confidence ?? 0;
    const after = irrigated.days[20]?.confidence ?? 1;
    expect(after).toBeCloseTo(before * PROVISIONAL_CONFIDENCE_FACTOR, 12);
    expect(irrigated.latest?.confidence).toBeCloseTo(after, 12);
  });

  it('needs the refill coefficient only when somebody actually watered', () => {
    const unknownRefill = potatoCoefficientsWith({ irrigationRefillFraction: missing('fraction') });

    const unwatered = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: unknownRefill,
      weather: season(10),
    });
    const watered = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: unknownRefill,
      weather: season(10),
      irrigatedDates: new Set([PLANTING.plusDays(5).toString()]),
    });

    expect(unwatered.days).toHaveLength(10);
    expect(watered.days).toEqual([]);
    expect(watered.unavailable).toEqual(['irrigationRefillFraction']);
  });

  it('judges blight only on days whose leaf wetness was measured', () => {
    const result = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: [
        weatherDay(0),
        weatherDay(1, { leafWetnessHours: 20, wetPeriodMeanTemperature: celsius(14) }),
        weatherDay(2),
      ],
    });

    expect(result.days[0]?.lateBlightRisk).toBeUndefined();
    expect(result.days[1]?.lateBlightRisk?.dailySeverity).toBe(3);
    expect(result.days[2]?.lateBlightRisk).toBeUndefined();
  });

  it('leaves the phenological stage unnamed while the thresholds are missing', () => {
    const result = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(60),
    });

    expect(result.latest?.phenologicalStage).toBeUndefined();
  });

  it('carries the weather source and the coefficient quality into confidence', () => {
    const onNormals = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(5),
    });
    const onCache = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(5, { source: 'network_weather_cache', confidence: 0.7 }),
    });

    // A better source lifts the day; provisional coefficients still hold it
    // well below one, which is the point of the whole mechanism.
    expect(onCache.latest?.confidence).toBeGreaterThan(onNormals.latest?.confidence ?? 1);
    expect(onCache.latest?.confidence).toBeLessThan(0.7);
  });

  it('names its provenance for every quantity it computed', () => {
    const result = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: [weatherDay(0, { leafWetnessHours: 20, wetPeriodMeanTemperature: celsius(14) })],
    });

    expect(result.latest?.provenance.map((entry) => entry.field)).toEqual([
      'accumulatedGdd',
      'waterBalance',
      'lateBlightRisk',
    ]);
  });

  it('refuses to run, and says why, when a coefficient it needs is missing', () => {
    const incomplete = Coefficients.fromDocument({
      crop: 'potato',
      version: 'test.v1',
      region: 'Test',
      entries: {
        gddBaseTemperature: { value: 7, unit: 'degreeCelsius', source: 'Sands et al. (1979)' },
        kcInitial: { value: 0.5, unit: 'dimensionless', source: 'FAO-56' },
        kcMid: { value: 1.15, unit: 'dimensionless', source: 'FAO-56' },
        kcEnd: { value: 0.75, unit: 'dimensionless', source: 'FAO-56' },
        stageLengthInitial: { value: 25, unit: 'day', source: 'FAO-56' },
        stageLengthDevelopment: { value: 30, unit: 'day', source: 'FAO-56' },
        stageLengthMid: { value: 45, unit: 'day', source: 'FAO-56' },
        stageLengthLate: { value: 30, unit: 'day', source: 'FAO-56' },
        soilFieldCapacity: { value: null, unit: 'cubicMeterPerCubicMeter', source: 'TODO' },
        soilWiltingPoint: { value: 0.15, unit: 'cubicMeterPerCubicMeter', source: 'FAO-56' },
        rootingDepthMax: { value: 0.6, unit: 'meter', source: 'FAO-56' },
        depletionFraction: { value: 0.35, unit: 'dimensionless', source: 'FAO-56' },
      },
    });

    const result = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: incomplete,
      weather: season(10),
    });

    // No days at all, rather than a water balance on an invented soil.
    expect(result.days).toEqual([]);
    expect(result.unavailable).toEqual(['soilFieldCapacity']);
  });

  it('is deterministic: the same inputs give the same series', () => {
    const inputs = {
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather: season(90, { rainfall: millimeters(3) }),
    };

    expect(runBehaviorEngine(inputs)).toEqual(runBehaviorEngine(inputs));
  });

  /**
   * CLAUDE.md §8.3: simulating a full 120-day campaign must take milliseconds
   * in Node. The budget is deliberately generous — this guards against an
   * accidental O(n²), not against a slow laptop.
   */
  it('simulates a 120-day campaign in milliseconds', () => {
    const weather = season(120, { rainfall: millimeters(2) });
    const started = performance.now();
    const result = runBehaviorEngine({
      campaign,
      location: LOCATION,
      coefficients: POTATO_COEFFICIENTS,
      weather,
    });
    const elapsed = performance.now() - started;

    expect(result.days).toHaveLength(120);
    expect(elapsed).toBeLessThan(50);
  });
});
