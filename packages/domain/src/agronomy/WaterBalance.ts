import { millimeters } from '../model/Units.js';
import type { Millimeters } from '../model/Units.js';

/**
 * A simplified FAO-56 soil water balance, kept in the root zone.
 *
 * The state is the **depletion** `Dr`: how many millimetres of water the root
 * zone is short of field capacity. Zero means the soil is full; `TAW` means it
 * holds nothing the crop can reach.
 *
 * Tracking the shortfall rather than the content is FAO-56's own choice and it
 * is the practical one: rain and irrigation refill it, evapotranspiration
 * empties it, and the single number answers the question the farmer actually
 * has — "do I need to irrigate?".
 *
 * Equations are FAO-56 (Allen et al., 1998), Chapter 8, numbered as published.
 */

/** FAO-56 Equation 82: total available soil water, mm. */
export function totalAvailableWater(
  fieldCapacity: number,
  wiltingPoint: number,
  rootingDepthMeters: number,
): Millimeters {
  return millimeters(1000 * (fieldCapacity - wiltingPoint) * rootingDepthMeters);
}

/** FAO-56 Equation 83: readily available water, the part taken without stress. */
export function readilyAvailableWater(
  totalAvailable: Millimeters,
  depletionFraction: number,
): Millimeters {
  return millimeters(depletionFraction * totalAvailable);
}

/**
 * FAO-56 Equation 84: the water stress coefficient `Ks`.
 *
 * One while the crop is drawing on readily available water, then falling
 * linearly to zero as the root zone empties. Multiplying `ETc` by it is what
 * makes a thirsty crop transpire less than a comfortable one.
 */
export function waterStressCoefficient(
  depletion: Millimeters,
  totalAvailable: Millimeters,
  depletionFraction: number,
): number {
  if (totalAvailable <= 0) return 0;
  const readily = readilyAvailableWater(totalAvailable, depletionFraction);
  if (depletion <= readily) return 1;

  const ks = (totalAvailable - depletion) / (totalAvailable - readily);
  return Math.min(1, Math.max(0, ks));
}

/** FAO-56 Equation 58: crop evapotranspiration under standard conditions. */
export const cropEvapotranspiration = (
  referenceEt: Millimeters,
  cropCoefficient: number,
): Millimeters => millimeters(referenceEt * cropCoefficient);

export interface WaterBalanceDay {
  /** Root zone depletion at the end of yesterday, mm. */
  readonly previousDepletion: Millimeters;
  readonly rainfall: Millimeters;
  readonly irrigation: Millimeters;
  /** ETc for today, before any water stress is applied. */
  readonly cropEt: Millimeters;
  readonly totalAvailable: Millimeters;
  readonly depletionFraction: number;
}

export interface WaterBalanceResult {
  /** Root zone depletion at the end of today, mm, within [0, TAW]. */
  readonly depletion: Millimeters;
  /** What the crop actually transpired after stress, mm. */
  readonly actualEt: Millimeters;
  /** Water lost below the root zone because the soil was already full, mm. */
  readonly deepPercolation: Millimeters;
  /** FAO-56 Ks for the day, 0–1. */
  readonly stressCoefficient: number;
  /** True once the depletion passes readily available water. */
  readonly underStress: boolean;
}

/**
 * Advances the balance by one day (FAO-56 Equation 85, simplified).
 *
 * `Dr = Dr(yesterday) − (P − RO) − I + ETc + DP`
 *
 * Runoff is not modelled: with no slope, no soil texture and no rainfall
 * intensity on this device, any runoff figure would be invented. Treating all
 * rain as infiltrating **overestimates** the water reaching the soil, which
 * means the twin will under-advise irrigation rather than over-advise it. That
 * direction is the safe one for a farmer who pays for water, and it is stated
 * here rather than buried.
 */
export function advanceWaterBalance(day: WaterBalanceDay): WaterBalanceResult {
  const stressCoefficient = waterStressCoefficient(
    day.previousDepletion,
    day.totalAvailable,
    day.depletionFraction,
  );
  const actualEt = millimeters(day.cropEt * stressCoefficient);

  const raw = day.previousDepletion - day.rainfall - day.irrigation + actualEt;

  // More water arrived than the root zone could hold: the surplus drains away
  // instead of making the depletion negative.
  const deepPercolation = millimeters(Math.max(0, -raw));
  const depletion = millimeters(Math.min(day.totalAvailable, Math.max(0, raw)));

  return {
    depletion,
    actualEt,
    deepPercolation,
    stressCoefficient,
    underStress:
      depletion > readilyAvailableWater(day.totalAvailable, day.depletionFraction),
  };
}
