import type { LocalDate } from '../model/LocalDate.js';
import { megajoulesPerSquareMeterPerDay, toRadians } from '../model/Units.js';
import type { Degrees, MegajoulesPerSquareMeterPerDay } from '../model/Units.js';

/**
 * Extraterrestrial radiation, from nothing but latitude and the calendar.
 *
 * This is the one input of the whole water balance that needs no instrument,
 * no sensor and no network: `Ra` is pure solar geometry. That is exactly why
 * FAO-56 offers Hargreaves-Samani for places with missing data, and why it is
 * the right backbone for a twin that has to run on a phone in a field with no
 * weather station anywhere near it.
 *
 * Equations are FAO-56 (Allen et al., 1998), Chapter 3, numbered as published.
 */

/** FAO-56 Equation 21: solar constant, MJ m⁻² min⁻¹. */
export const SOLAR_CONSTANT = 0.082;

/** FAO-56 Equation 23: inverse relative distance Earth-Sun. */
export const inverseRelativeDistance = (dayOfYear: number): number =>
  1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * dayOfYear);

/** FAO-56 Equation 24: solar declination, in radians. */
export const solarDeclination = (dayOfYear: number): number =>
  0.409 * Math.sin(((2 * Math.PI) / 365) * dayOfYear - 1.39);

/**
 * FAO-56 Equation 25: sunset hour angle, in radians.
 *
 * The argument of `arccos` leaves [-1, 1] inside the polar circles, where the
 * sun does not set or does not rise. It is clamped rather than left to produce
 * `NaN`: the plots this runs for are tropical, and a silent `NaN` travelling
 * into the water balance is the failure mode worth spending three lines on.
 */
export const sunsetHourAngle = (latitudeRadians: number, declinationRadians: number): number => {
  const cosine = -Math.tan(latitudeRadians) * Math.tan(declinationRadians);
  return Math.acos(Math.min(1, Math.max(-1, cosine)));
};

/**
 * FAO-56 Equation 21: extraterrestrial radiation for daily periods.
 *
 * `Ra = 24(60)/π · Gsc · dr · [ωs sin(φ) sin(δ) + cos(φ) cos(δ) sin(ωs)]`
 */
export function extraterrestrialRadiation(
  latitude: Degrees,
  date: LocalDate,
): MegajoulesPerSquareMeterPerDay {
  const dayOfYear = date.dayOfYear();
  const phi = toRadians(latitude);
  const dr = inverseRelativeDistance(dayOfYear);
  const declination = solarDeclination(dayOfYear);
  const omega = sunsetHourAngle(phi, declination);

  const value =
    ((24 * 60) / Math.PI) *
    SOLAR_CONSTANT *
    dr *
    (omega * Math.sin(phi) * Math.sin(declination) +
      Math.cos(phi) * Math.cos(declination) * Math.sin(omega));

  return megajoulesPerSquareMeterPerDay(value);
}
