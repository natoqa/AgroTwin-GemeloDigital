import { degreeDays } from '../model/Units.js';
import type { Celsius, DegreeDays } from '../model/Units.js';
import type { DailyTemperatures } from './Et0Hargreaves.js';
import type { Coefficients } from './Coefficients.js';

/**
 * Thermal time: the clock a crop actually runs on.
 *
 * A potato does not develop by the calendar; it develops by accumulated heat.
 * Two campaigns planted the same week in the same valley reach tuber
 * initiation on different dates, and growing degree days are what explains the
 * difference. This is the axis every other model in the engine hangs from.
 *
 * The form used is the standard daily one:
 *
 *   `GDD = max(0, (Tmax + Tmin) / 2 − Tbase)`
 *
 * with a floor at zero, because a cold day does not un-develop a plant.
 *
 * An upper cut-off — capping Tmax at a temperature past which development
 * stops gaining — is deliberately **not** applied: no value for it is verified
 * for this crop and region, and inventing a cap would silently change every
 * accumulated total. `gddUpperTemperature` sits in the coefficient file as a
 * declared gap so that the omission is visible instead of forgotten.
 */
export const GDD_BASE_TEMPERATURE_KEY = 'gddBaseTemperature';

/** Degree-days contributed by one day. Never negative. */
export function dailyGrowingDegreeDays(
  temperatures: DailyTemperatures,
  baseTemperature: Celsius,
): DegreeDays {
  const mean = (temperatures.maximum + temperatures.minimum) / 2;
  return degreeDays(Math.max(0, mean - baseTemperature));
}

/** Running total over a sequence of days, oldest first. */
export function accumulateGrowingDegreeDays(
  days: readonly DailyTemperatures[],
  baseTemperature: Celsius,
): DegreeDays {
  let total = 0;
  for (const day of days) {
    total += dailyGrowingDegreeDays(day, baseTemperature);
  }
  return degreeDays(total);
}

/** The base temperature this crop's coefficient file declares. */
export const baseTemperatureOf = (coefficients: Coefficients): Celsius =>
  coefficients.require(GDD_BASE_TEMPERATURE_KEY) as Celsius;
