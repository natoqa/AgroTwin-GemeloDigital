import { InvalidTemperatureRangeError } from '../errors/InvalidTemperatureRangeError.js';
import type { LocalDate } from '../model/LocalDate.js';
import { asEquivalentEvaporation, millimeters } from '../model/Units.js';
import type { Celsius, Degrees, Millimeters } from '../model/Units.js';
import { extraterrestrialRadiation } from './SolarRadiation.js';

/**
 * Reference evapotranspiration when the weather data are missing.
 *
 * FAO-56 Equation 52:
 *
 *   `ETo = 0.0023 (Tmean + 17.8) (Tmax − Tmin)^0.5 · Ra`
 *
 * where **ETo and Ra are both in mm day⁻¹** — the conversion from megajoules
 * is part of the equation, not an afterthought, and getting it wrong inflates
 * every result by a factor of about 2.45.
 *
 * This is the method FAO-56 itself prescribes where only air temperature is
 * available, which is precisely the situation CLAUDE.md §9 describes: no
 * weather station, no humidity, no wind, no radiation sensor. It buys that
 * with a real loss of accuracy, and the caller is expected to carry that loss
 * into the snapshot's confidence rather than hide it.
 */
export const HARGREAVES_COEFFICIENT = 0.0023;
export const HARGREAVES_TEMPERATURE_OFFSET = 17.8;

export interface DailyTemperatures {
  readonly maximum: Celsius;
  readonly minimum: Celsius;
}

/** The mean FAO-56 uses here: the average of the daily extremes. */
export const meanTemperature = (temperatures: DailyTemperatures): number =>
  (temperatures.maximum + temperatures.minimum) / 2;

/** ETo from temperatures and an already-computed Ra expressed in mm day⁻¹. */
export function referenceEvapotranspirationFrom(
  temperatures: DailyTemperatures,
  radiationAsEvaporation: Millimeters,
): Millimeters {
  if (temperatures.maximum < temperatures.minimum) {
    throw new InvalidTemperatureRangeError(temperatures.maximum, temperatures.minimum);
  }

  const value =
    HARGREAVES_COEFFICIENT *
    (meanTemperature(temperatures) + HARGREAVES_TEMPERATURE_OFFSET) *
    Math.sqrt(temperatures.maximum - temperatures.minimum) *
    radiationAsEvaporation;

  // Evapotranspiration cannot be negative. It can come out so at temperatures
  // below −17.8 °C, which the sierra does not see, but the twin must not be
  // able to *add* water to the soil through a cold night.
  return millimeters(Math.max(0, value));
}

/** ETo for a plot on a day, computing Ra from latitude and the calendar. */
export function referenceEvapotranspiration(
  latitude: Degrees,
  date: LocalDate,
  temperatures: DailyTemperatures,
): Millimeters {
  const radiation = asEquivalentEvaporation(extraterrestrialRadiation(latitude, date));
  return referenceEvapotranspirationFrom(temperatures, radiation);
}
