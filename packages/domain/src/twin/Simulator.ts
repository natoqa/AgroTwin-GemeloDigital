import type { Coefficients } from '../agronomy/Coefficients.js';
import { STAGE_LENGTH_KEYS, stageLengthsOf } from '../agronomy/CropStage.js';
import type { Campaign } from '../model/Campaign.js';
import type { LocalDate } from '../model/LocalDate.js';
import type { PlotLocation } from '../model/PlotLocation.js';
import type { DailyWeather } from '../model/Weather.js';
import { runBehaviorEngine } from './BehaviorEngine.js';
import type { TwinDayState } from './BehaviorEngine.js';

/**
 * The Simulator: the twin run forward, and run differently.
 *
 * It answers the three questions of CLAUDE.md §8.3 by running the same
 * BehaviorEngine over the campaign's past *plus* a projected future, with the
 * farmer's decision changed. Nothing here is a second model: every scenario
 * is the engine, given one more day of irrigation or one fungicide
 * application or simply more days. That is what keeps a scenario honest — it
 * cannot disagree with the board about the present, because it computes the
 * present the same way.
 *
 * **What the future is made of.** Days after today come from whatever the
 * weather port says about them, which on this device means climatological
 * normals: a typical year, not this one. Their provenance and confidence ride
 * along into every projected day, so a projection is visibly weaker than the
 * history it extends, without this module inventing a decay rate of its own.
 *
 * Pure and deterministic, like the engine it drives.
 */

export interface SimulationInput {
  readonly campaign: Campaign;
  readonly location: PlotLocation;
  readonly coefficients: Coefficients;
  /** Planting to today, oldest first. The last day is "today". */
  readonly history: readonly DailyWeather[];
  /** Tomorrow onwards, oldest first. How far it reaches bounds every scenario. */
  readonly projection: readonly DailyWeather[];
  /** Days the farmer actually watered. */
  readonly irrigatedDates: ReadonlySet<string>;
}

/** Why a scenario could not be answered. */
export type SimulationUnavailable =
  | { readonly available: false; readonly reason: 'no_weather' }
  | {
      readonly available: false;
      readonly reason: 'missing_coefficients';
      readonly missing: readonly string[];
    }
  | { readonly available: false; readonly reason: 'no_leaf_wetness' };

// --- "What if I do not water for N days?" ---------------------------------

export interface WaterProjection {
  readonly available: true;
  readonly today: TwinDayState;
  /** The projected days, tomorrow first. At most the days asked for. */
  readonly projected: readonly TwinDayState[];
  /** The state at the end of the period, or today when nothing was projected. */
  readonly end: TwinDayState;
  /** Whether the crop is already past readily available water today. */
  readonly stressedToday: boolean;
  /** The first projected day under water stress, when one falls in the period. */
  readonly stressStartsOn?: LocalDate;
  /** Days from today to `stressStartsOn`. */
  readonly daysUntilStress?: number;
  /** The same, had the farmer watered today instead. */
  readonly ifWateredToday: {
    readonly stressStartsOn?: LocalDate;
    readonly daysUntilStress?: number;
  };
  /** The weakest projected day's confidence: the answer is no stronger than that. */
  readonly confidence: number;
}

/**
 * Projects the plot `days` days ahead with no irrigation beyond what was
 * already recorded, and says when the crop starts to go thirsty.
 */
export function simulateNoIrrigation(
  input: SimulationInput,
  days: number,
): WaterProjection | SimulationUnavailable {
  const baseline = runProjection(input, days, input.irrigatedDates);
  if (!baseline.available) return baseline;

  const { today, projected } = baseline;
  const withWater = runProjection(
    input,
    days,
    new Set([...input.irrigatedDates, today.date.toString()]),
  );
  // Adding an irrigation needs one more coefficient than the baseline did.
  if (!withWater.available) return withWater;

  const stressedToday = today.waterBalance.underStress;
  const stress = stressedToday ? undefined : firstStress(today, projected);
  const wateredStress = firstStress(withWater.today, withWater.projected);
  const end = projected[projected.length - 1] ?? today;

  return {
    available: true,
    today,
    projected,
    end,
    stressedToday,
    ...(stress ?? {}),
    ifWateredToday: wateredStress ?? {},
    confidence: weakest([today, ...projected]),
  };
}

// --- "What if I spray fungicide today?" -----------------------------------

export interface FungicideProjection {
  readonly available: true;
  /** The last day the application is modelled as protecting the crop. */
  readonly protectedThrough: LocalDate;
  /** When the blight model would advise spraying, if nobody sprays. */
  readonly withoutSpray: SprayAdvice;
  /** When it would advise spraying again, after spraying today. */
  readonly withSpray: SprayAdvice;
  readonly confidence: number;
}

export interface SprayAdvice {
  /** The first day, today or later, on which spraying is advised. */
  readonly advisedOn?: LocalDate;
  /** Days from today to `advisedOn`. Zero means "already". */
  readonly daysFromToday?: number;
}

/**
 * Compares the blight outlook with and without a fungicide application today.
 *
 * Refuses rather than guesses in the two ways this system usually cannot
 * answer: no weather source measures leaf wetness (ADR-0009), and nobody has
 * said how many days a spray protects (`fungicideProtectionDays`).
 */
export function simulateFungicideToday(
  input: SimulationInput,
  days: number,
): FungicideProjection | SimulationUnavailable {
  const without = runProjection(input, days, input.irrigatedDates);
  if (!without.available) return without;

  // A projection with no measured leaf wetness has nothing to compare: the
  // blight model is silent on every future day, sprayed or not.
  if (!without.projected.some((day) => day.lateBlightRisk !== undefined)) {
    return { available: false, reason: 'no_leaf_wetness' };
  }

  const todayKey = without.today.date.toString();
  const withSpray = runProjection(input, days, input.irrigatedDates, new Set([todayKey]));
  if (!withSpray.available) return withSpray;

  const protectedDays = withSpray.projected.filter(
    (day) => day.lateBlightRisk?.protectedByFungicide === true,
  );
  const protectedThrough =
    protectedDays[protectedDays.length - 1]?.date ?? withSpray.today.date;

  return {
    available: true,
    protectedThrough,
    withoutSpray: firstSprayAdvice(without.today, without.projected),
    withSpray: firstSprayAdvice(withSpray.today, withSpray.projected),
    confidence: weakestBlight([withSpray.today, ...withSpray.projected]),
  };
}

// --- "When will I harvest?" -----------------------------------------------

export type HarvestEstimate =
  | {
      readonly available: true;
      /**
       * `thermal_time`: the day projected degree-days reach `gddToMaturity`.
       * `stage_lengths`: planting plus FAO-56's four stage lengths, which is
       * the fallback while the thermal thresholds are unknown.
       */
      readonly method: 'thermal_time' | 'stage_lengths';
      readonly date: LocalDate;
      /** Days from today; negative when the estimate has already passed. */
      readonly daysFromToday: number;
      readonly confidence: number;
    }
  | {
      readonly available: true;
      readonly method: 'thermal_time';
      /** The projection ran out before the crop reached maturity. */
      readonly reached: false;
      readonly confidence: number;
    }
  | SimulationUnavailable;

/**
 * Estimates the harvest date.
 *
 * With the thermal thresholds known, the crop is matured on the thermal clock
 * by projecting degree-days forward. Without them — the case today — the
 * estimate falls back to FAO-56's season length, which ignores this year's
 * weather entirely and carries the confidence of four provisional
 * coefficients. It is labelled as such rather than dressed up.
 */
export function estimateHarvestDate(input: SimulationInput): HarvestEstimate {
  const today = input.history[input.history.length - 1]?.date;
  if (!today) return { available: false, reason: 'no_weather' };

  if (input.coefficients.has('gddToMaturity')) {
    return byThermalTime(input, today);
  }

  const missing = STAGE_LENGTH_KEYS.filter((key) => !input.coefficients.has(key));
  if (missing.length > 0) {
    return {
      available: false,
      reason: 'missing_coefficients',
      missing: ['gddToMaturity', ...missing],
    };
  }

  const lengths = stageLengthsOf(input.coefficients);
  const season = lengths.initial + lengths.development + lengths.midSeason + lengths.lateSeason;
  const date = input.campaign.plantingDate.plusDays(season);
  return {
    available: true,
    method: 'stage_lengths',
    date,
    daysFromToday: today.daysUntil(date),
    confidence: input.coefficients.confidenceFor([...STAGE_LENGTH_KEYS]),
  };
}

function byThermalTime(input: SimulationInput, today: LocalDate): HarvestEstimate {
  const run = runProjection(input, input.projection.length, input.irrigatedDates);
  if (!run.available) return run;

  const maturity = input.coefficients.require('gddToMaturity');
  const all = [...run.history, ...run.projected];
  const matured = all.find((day) => day.accumulatedGdd >= maturity);
  const thresholdConfidence = input.coefficients.confidenceFor(['gddToMaturity']);

  if (!matured) {
    return {
      available: true,
      method: 'thermal_time',
      reached: false,
      confidence: weakest(all) * thresholdConfidence,
    };
  }
  return {
    available: true,
    method: 'thermal_time',
    date: matured.date,
    daysFromToday: today.daysUntil(matured.date),
    confidence: matured.confidence * thresholdConfidence,
  };
}

// --- Shared machinery -----------------------------------------------------

interface ProjectionRun {
  readonly available: true;
  readonly history: readonly TwinDayState[];
  readonly today: TwinDayState;
  readonly projected: readonly TwinDayState[];
}

function runProjection(
  input: SimulationInput,
  days: number,
  irrigatedDates: ReadonlySet<string>,
  fungicideDates?: ReadonlySet<string>,
): ProjectionRun | SimulationUnavailable {
  if (input.history.length === 0) return { available: false, reason: 'no_weather' };

  const ahead = input.projection.slice(0, Math.max(0, Math.floor(days)));
  const result = runBehaviorEngine({
    campaign: input.campaign,
    location: input.location,
    coefficients: input.coefficients,
    weather: [...input.history, ...ahead],
    irrigatedDates,
    ...(fungicideDates === undefined ? {} : { fungicideDates }),
  });
  if (result.unavailable.length > 0) {
    return { available: false, reason: 'missing_coefficients', missing: result.unavailable };
  }

  const history = result.days.slice(0, input.history.length);
  const today = history[history.length - 1] as TwinDayState;
  return {
    available: true,
    history,
    today,
    projected: result.days.slice(input.history.length),
  };
}

function firstStress(
  today: TwinDayState,
  projected: readonly TwinDayState[],
): { stressStartsOn: LocalDate; daysUntilStress: number } | undefined {
  const day = projected.find((candidate) => candidate.waterBalance.underStress);
  return day ? { stressStartsOn: day.date, daysUntilStress: today.date.daysUntil(day.date) } : undefined;
}

function firstSprayAdvice(today: TwinDayState, projected: readonly TwinDayState[]): SprayAdvice {
  const day = [today, ...projected].find((candidate) => candidate.lateBlightRisk?.sprayAdvised);
  return day ? { advisedOn: day.date, daysFromToday: today.date.daysUntil(day.date) } : {};
}

function weakest(days: readonly TwinDayState[]): number {
  return days.reduce((lowest, day) => Math.min(lowest, day.confidence), 1);
}

/** The blight answer rests on the blight provenance, not on the water balance. */
function weakestBlight(days: readonly TwinDayState[]): number {
  return days.reduce((lowest, day) => {
    const entry = day.provenance.find((candidate) => candidate.field === 'lateBlightRisk');
    return entry ? Math.min(lowest, entry.confidence) : lowest;
  }, 1);
}
