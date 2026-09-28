import type { Celsius } from '../model/Units.js';

/**
 * Late blight risk by the Wallin severity-value model (ADR-0009).
 *
 * Wallin, J.R. (1962). *Summary of recent progress in predicting late blight
 * epidemics in United States and Canada.* American Potato Journal 39:306–312.
 * It is the model behind BLITECAST and the one most of the later systems
 * measure themselves against.
 *
 * The model asks two things of a day: how many hours the leaves stayed wet
 * (relative humidity at or above 90%), and the average temperature during
 * those hours. It returns a **daily severity value** from 0 to 4, and those
 * accumulate across the season.
 *
 * What is faithful here and what is not:
 *
 * - The table below is transcribed from the published one.
 * - The published rows leave a one-hour gap between "22–24 → 3" and
 *   "> 25 → 4". This implementation closes it by reading the thresholds as
 *   "at least N hours", so 25 hours scores 4. That is a decision about an
 *   ambiguity in the printed table, recorded rather than silently made.
 * - **The inputs are the weak part, not the model.** Wallin assumes hourly
 *   humidity from an instrument. This system has a farmer answering questions
 *   (CLAUDE.md §9). Where the hours are not measured, the risk is not
 *   computed — see `lateBlightRiskFor`.
 */

/** Below this, the published table gives no severity at all. */
export const MIN_FAVOURABLE_TEMPERATURE = 7.2;
/** Above this, likewise. */
export const MAX_FAVOURABLE_TEMPERATURE = 26.6;

interface SeverityBand {
  readonly maxTemperature: number;
  /** Hours needed for severity 1, 2, 3 and 4, in order. */
  readonly thresholds: readonly [number, number, number, number];
}

/** Wallin (1962), as printed: hours of RH ≥ 90% by temperature band. */
const SEVERITY_TABLE: readonly SeverityBand[] = [
  { maxTemperature: 11.6, thresholds: [16, 19, 22, 25] },
  { maxTemperature: 15.0, thresholds: [13, 16, 19, 22] },
  { maxTemperature: MAX_FAVOURABLE_TEMPERATURE, thresholds: [10, 13, 16, 19] },
];

export type SeverityValue = 0 | 1 | 2 | 3 | 4;

export interface WetPeriod {
  /** Hours at or above 90% relative humidity. */
  readonly wetHours: number;
  /** Average temperature during those hours. */
  readonly meanTemperature: Celsius;
}

/** The daily severity value for one wet period. */
export function dailySeverityValue(period: WetPeriod): SeverityValue {
  if (
    period.meanTemperature < MIN_FAVOURABLE_TEMPERATURE ||
    period.meanTemperature > MAX_FAVOURABLE_TEMPERATURE ||
    period.wetHours <= 0
  ) {
    return 0;
  }

  const band = SEVERITY_TABLE.find((candidate) => period.meanTemperature <= candidate.maxTemperature);
  if (!band) return 0;

  let severity: SeverityValue = 0;
  const severities: readonly SeverityValue[] = [1, 2, 3, 4];
  band.thresholds.forEach((threshold, index) => {
    if (period.wetHours >= threshold) {
      severity = severities[index] ?? severity;
    }
  });

  return severity;
}

/**
 * BLITECAST's first-spray rule of thumb: 18 accumulated severity values from
 * the date of crop emergence.
 *
 * Kept as a named constant rather than a magic number so that changing it is a
 * visible decision. It is an advisory threshold from the forecasting
 * literature, not a measurement.
 */
export const FIRST_SPRAY_SEVERITY_TOTAL = 18;

export interface BlightRisk {
  /** Severity contributed by the day, 0–4. */
  readonly dailySeverity: SeverityValue;
  /** Running total since the campaign started. */
  readonly accumulatedSeverity: number;
  /** Whether the accumulated total has reached the advisory threshold. */
  readonly sprayAdvised: boolean;
}

export function accumulateBlightRisk(
  previousTotal: number,
  period: WetPeriod,
): BlightRisk {
  const dailySeverity = dailySeverityValue(period);
  const accumulatedSeverity = previousTotal + dailySeverity;

  return {
    dailySeverity,
    accumulatedSeverity,
    sprayAdvised: accumulatedSeverity >= FIRST_SPRAY_SEVERITY_TOTAL,
  };
}

/**
 * The risk for a day whose leaf wetness may or may not be known.
 *
 * Returns `undefined` when the wet period was not observed. That is the
 * common case on this system today: no weather source supplies leaf wetness
 * hours, and estimating them from "did it rain yesterday?" would be a
 * modelling assumption with no source behind it — exactly what CLAUDE.md §18
 * forbids. A twin that says "I cannot judge blight risk" is more use than one
 * that invents a number the farmer would spray on.
 */
export function lateBlightRiskFor(
  previousTotal: number,
  period: WetPeriod | undefined,
): BlightRisk | undefined {
  return period === undefined ? undefined : accumulateBlightRisk(previousTotal, period);
}
