import { cropCoefficientOnDay, kcValuesOf, stageLengthsOf } from '../agronomy/CropStage.js';
import type { CropStage } from '../agronomy/CropStage.js';
import type { Coefficients } from '../agronomy/Coefficients.js';
import { cropStageOnDay } from '../agronomy/CropStage.js';
import { referenceEvapotranspiration } from '../agronomy/Et0Hargreaves.js';
import { baseTemperatureOf, dailyGrowingDegreeDays } from '../agronomy/Gdd.js';
import { lateBlightRiskFor, protectedBlightRisk } from '../agronomy/LateBlightRisk.js';
import type { BlightRisk } from '../agronomy/LateBlightRisk.js';
import { estimatePhenologicalStage } from '../agronomy/PhenologicalStage.js';
import type { PhenologicalStage } from '../agronomy/PhenologicalStage.js';
import {
  advanceWaterBalance,
  cropEvapotranspiration,
  totalAvailableWater,
} from '../agronomy/WaterBalance.js';
import type { WaterBalanceResult } from '../agronomy/WaterBalance.js';
import { daysSincePlanting } from '../model/Campaign.js';
import type { Campaign } from '../model/Campaign.js';
import type { LocalDate } from '../model/LocalDate.js';
import type { PlotLocation } from '../model/PlotLocation.js';
import type { ProvenanceEntry } from '../model/Provenance.js';
import { degreeDays, millimeters } from '../model/Units.js';
import type { DegreeDays, Millimeters } from '../model/Units.js';
import type { DailyWeather } from '../model/Weather.js';

/**
 * The BehaviorEngine: the twin's simulation of its own plot.
 *
 * It walks a campaign day by day, carrying four running quantities — thermal
 * time, the crop's water-use stage, soil water depletion and blight pressure —
 * and produces one state per day. Pure and deterministic: the same weather and
 * the same coefficients always give the same series, which is what makes the
 * what-if scenarios of Phase 4 possible and what makes any of this testable.
 *
 * Nothing here decides what to tell the farmer. That is the Advisor's job.
 * This only answers "what is happening in the plot", and how sure it is.
 *
 * **On confidence.** Every day's state carries one, and it is the product of
 * two honest discounts: what the weather for that day was worth, and what the
 * coefficients the models used were worth. A day built on climatological
 * normals and provisional stage lengths comes out visibly weak, and it should.
 */

const GDD_KEYS = ['gddBaseTemperature'] as const;
/** Needed only by campaigns in which the farmer reported watering. */
const IRRIGATION_KEYS = ['irrigationRefillFraction'] as const;
/** Needed only when a fungicide application is being simulated. */
const FUNGICIDE_KEYS = ['fungicideProtectionDays'] as const;
const WATER_KEYS = [
  'kcInitial',
  'kcMid',
  'kcEnd',
  'stageLengthInitial',
  'stageLengthDevelopment',
  'stageLengthMid',
  'stageLengthLate',
  'soilFieldCapacity',
  'soilWiltingPoint',
  'rootingDepthMax',
  'depletionFraction',
] as const;

export interface BehaviorEngineInput {
  readonly campaign: Campaign;
  readonly location: PlotLocation;
  readonly coefficients: Coefficients;
  /** Oldest first. Days the sources could not supply are simply missing. */
  readonly weather: readonly DailyWeather[];
  /**
   * Days the farmer reported watering, as `YYYY-MM-DD`.
   *
   * A day, not an amount: each one makes up `irrigationRefillFraction` of the
   * shortfall the root zone carried into that day.
   */
  readonly irrigatedDates?: ReadonlySet<string>;
  /**
   * Days a fungicide is applied, as `YYYY-MM-DD`.
   *
   * Only the Simulator sets this today: it is how "what if I spray today?" is
   * asked. On the day of an application the accumulated blight severity starts
   * again from zero, and for `fungicideProtectionDays` days nothing is added.
   */
  readonly fungicideDates?: ReadonlySet<string>;
}

export interface TwinDayState {
  readonly date: LocalDate;
  readonly dayOfCampaign: number;
  readonly accumulatedGdd: DegreeDays;
  /** Absent while nobody has supplied the thermal thresholds. */
  readonly phenologicalStage?: PhenologicalStage;
  readonly cropStage: CropStage;
  readonly cropCoefficient: number;
  readonly referenceEt: Millimeters;
  readonly cropEt: Millimeters;
  readonly waterBalance: WaterBalanceResult;
  /** Absent on days whose leaf wetness nobody measured. */
  readonly lateBlightRisk?: BlightRisk;
  /** 0–1, this day's state as a whole. */
  readonly confidence: number;
  readonly provenance: readonly ProvenanceEntry[];
}

export interface BehaviorEngineResult {
  /** Oldest first, one entry per day of weather that was available. */
  readonly days: readonly TwinDayState[];
  readonly latest?: TwinDayState;
  /** Coefficients the run needed and could not get. Empty on a clean run. */
  readonly unavailable: readonly string[];
}

/**
 * Runs the engine across every day of weather it was given.
 *
 * When a coefficient the water balance needs is missing, the engine does not
 * substitute anything: it reports the gap and produces no days. CLAUDE.md §18
 * again — a water balance built on an invented field capacity would advise
 * irrigation the farmer pays for.
 */
export function runBehaviorEngine(input: BehaviorEngineInput): BehaviorEngineResult {
  const { coefficients } = input;

  const irrigatedDates = input.irrigatedDates ?? new Set<string>();
  const fungicideDates = input.fungicideDates ?? new Set<string>();
  const needed = [
    ...GDD_KEYS,
    ...WATER_KEYS,
    ...(irrigatedDates.size > 0 ? IRRIGATION_KEYS : []),
    ...(fungicideDates.size > 0 ? FUNGICIDE_KEYS : []),
  ];
  const unavailable = needed.filter((key) => !coefficients.has(key));
  if (unavailable.length > 0) {
    return { days: [], unavailable };
  }

  const baseTemperature = baseTemperatureOf(coefficients);
  const lengths = stageLengthsOf(coefficients);
  const kc = kcValuesOf(coefficients);
  const depletionFraction = coefficients.require('depletionFraction');
  const totalAvailable = totalAvailableWater(
    coefficients.require('soilFieldCapacity'),
    coefficients.require('soilWiltingPoint'),
    coefficients.require('rootingDepthMax'),
  );

  const gddConfidence = coefficients.confidenceFor([...GDD_KEYS]);
  const waterConfidence = coefficients.confidenceFor([...WATER_KEYS]);
  // From the first reported irrigation on, the balance also leans on how much
  // one irrigation is assumed to make up, and it costs what that is worth.
  const irrigatedWaterConfidence =
    irrigatedDates.size > 0
      ? waterConfidence * coefficients.confidenceFor([...IRRIGATION_KEYS])
      : waterConfidence;
  const refillFraction =
    irrigatedDates.size > 0 ? coefficients.require('irrigationRefillFraction') : 0;
  const protectionDays =
    fungicideDates.size > 0 ? coefficients.require('fungicideProtectionDays') : 0;
  const fungicideConfidence =
    fungicideDates.size > 0 ? coefficients.confidenceFor([...FUNGICIDE_KEYS]) : 1;
  // Epoch day of the last protected day; -Infinity while nothing was sprayed.
  let protectedThrough = Number.NEGATIVE_INFINITY;

  // The soil starts at field capacity. It is an assumption, and it is the one
  // FAO-56 makes for a season beginning after the rains; it is declared in the
  // provenance so it does not read as a measurement.
  let depletion = millimeters(0);
  let accumulated = 0;
  let blightTotal = 0;
  let irrigatedSoFar = false;

  const days: TwinDayState[] = [];

  for (const day of input.weather) {
    const dayOfCampaign = daysSincePlanting(input.campaign, day.date);

    accumulated += dailyGrowingDegreeDays(
      { maximum: day.maxTemperature, minimum: day.minTemperature },
      baseTemperature,
    );
    const accumulatedGdd = degreeDays(accumulated);

    const cropStage = cropStageOnDay(dayOfCampaign, lengths);
    const cropCoefficient = cropCoefficientOnDay(dayOfCampaign, lengths, kc);

    const referenceEt = referenceEvapotranspiration(input.location.latitude, day.date, {
      maximum: day.maxTemperature,
      minimum: day.minTemperature,
    });
    const cropEt = cropEvapotranspiration(referenceEt, cropCoefficient);

    const irrigatedToday = irrigatedDates.has(day.date.toString());
    irrigatedSoFar ||= irrigatedToday;
    const waterBalance = advanceWaterBalance({
      previousDepletion: depletion,
      rainfall: day.rainfall,
      irrigation: millimeters(irrigatedToday ? refillFraction * depletion : 0),
      cropEt,
      totalAvailable,
      depletionFraction,
    });
    depletion = waterBalance.depletion;

    const wetPeriod =
      day.leafWetnessHours === undefined || day.wetPeriodMeanTemperature === undefined
        ? undefined
        : { wetHours: day.leafWetnessHours, meanTemperature: day.wetPeriodMeanTemperature };
    const epochDay = day.date.toEpochDay();
    if (fungicideDates.has(day.date.toString())) {
      blightTotal = 0;
      protectedThrough = epochDay + protectionDays - 1;
    }
    const lateBlightRisk =
      wetPeriod !== undefined && epochDay <= protectedThrough
        ? protectedBlightRisk(blightTotal, wetPeriod)
        : lateBlightRiskFor(blightTotal, wetPeriod);
    if (lateBlightRisk) blightTotal = lateBlightRisk.accumulatedSeverity;

    const stage = estimatePhenologicalStage(accumulatedGdd, coefficients);
    const dayWaterConfidence = irrigatedSoFar ? irrigatedWaterConfidence : waterConfidence;

    days.push({
      date: day.date,
      dayOfCampaign,
      accumulatedGdd,
      ...(stage.stage === undefined ? {} : { phenologicalStage: stage.stage }),
      cropStage,
      cropCoefficient,
      referenceEt,
      cropEt,
      waterBalance,
      ...(lateBlightRisk === undefined ? {} : { lateBlightRisk }),
      confidence: day.confidence * Math.min(gddConfidence, dayWaterConfidence),
      provenance: provenanceFor(
        day,
        gddConfidence,
        dayWaterConfidence,
        lateBlightRisk === undefined ? undefined : fungicideConfidence,
      ),
    });
  }

  return {
    days,
    ...(days.length === 0 ? {} : { latest: days[days.length - 1] as TwinDayState }),
    unavailable: [],
  };
}

function provenanceFor(
  day: DailyWeather,
  gddConfidence: number,
  waterConfidence: number,
  /** Undefined when blight was not judged; otherwise what its inputs cost. */
  blightConfidence: number | undefined,
): readonly ProvenanceEntry[] {
  const entries: ProvenanceEntry[] = [
    { field: 'accumulatedGdd', source: day.source, confidence: day.confidence * gddConfidence },
    { field: 'waterBalance', source: day.source, confidence: day.confidence * waterConfidence },
  ];
  if (blightConfidence !== undefined) {
    entries.push({
      field: 'lateBlightRisk',
      source: day.source,
      confidence: day.confidence * blightConfidence,
    });
  }
  return entries;
}
