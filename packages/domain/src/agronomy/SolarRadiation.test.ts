import { describe, expect, it } from 'vitest';
import { LocalDate } from '../model/LocalDate.js';
import { asEquivalentEvaporation, degrees, toRadians } from '../model/Units.js';
import {
  extraterrestrialRadiation,
  inverseRelativeDistance,
  solarDeclination,
  sunsetHourAngle,
} from './SolarRadiation.js';

/**
 * Validation against a published worked example.
 *
 * FAO-56 (Allen et al., 1998), Chapter 3, **Example 8**: "Determination of
 * extraterrestrial radiation" for 3 September at 20°S. The paper prints every
 * intermediate value, so this checks the whole chain — day of year, latitude
 * in radians, Earth-Sun distance, declination, sunset hour angle — and not
 * merely the final number, which could come out right by cancelling errors.
 *
 * Tolerances are the paper's own rounding: intermediates are printed to three
 * decimals, Ra to one.
 */
const EXAMPLE_8 = {
  date: LocalDate.of(2026, 9, 3),
  latitude: degrees(-20),
  dayOfYear: 246,
  phiRadians: -0.35,
  inverseRelativeDistance: 0.985,
  declinationRadians: 0.12,
  sunsetHourAngleRadians: 1.527,
  raMegajoules: 32.2,
  raMillimeters: 13.1,
};

describe('FAO-56 Example 8: extraterrestrial radiation on 3 September at 20°S', () => {
  it('reaches day of year 246', () => {
    expect(EXAMPLE_8.date.dayOfYear()).toBe(EXAMPLE_8.dayOfYear);
  });

  it('converts the latitude to radians as printed', () => {
    expect(toRadians(EXAMPLE_8.latitude)).toBeCloseTo(EXAMPLE_8.phiRadians, 2);
  });

  it('reproduces the inverse relative distance Earth-Sun (Equation 23)', () => {
    expect(inverseRelativeDistance(EXAMPLE_8.dayOfYear)).toBeCloseTo(
      EXAMPLE_8.inverseRelativeDistance,
      3,
    );
  });

  it('reproduces the solar declination (Equation 24)', () => {
    expect(solarDeclination(EXAMPLE_8.dayOfYear)).toBeCloseTo(EXAMPLE_8.declinationRadians, 3);
  });

  it('reproduces the sunset hour angle (Equation 25)', () => {
    expect(
      sunsetHourAngle(toRadians(EXAMPLE_8.latitude), solarDeclination(EXAMPLE_8.dayOfYear)),
    ).toBeCloseTo(EXAMPLE_8.sunsetHourAngleRadians, 3);
  });

  it('reproduces Ra in MJ m-2 day-1 (Equation 21)', () => {
    const radiation = extraterrestrialRadiation(EXAMPLE_8.latitude, EXAMPLE_8.date);
    expect(radiation).toBeCloseTo(EXAMPLE_8.raMegajoules, 1);
  });

  it('reproduces Ra as equivalent evaporation in mm/day (Equation 20)', () => {
    const radiation = extraterrestrialRadiation(EXAMPLE_8.latitude, EXAMPLE_8.date);
    expect(asEquivalentEvaporation(radiation)).toBeCloseTo(EXAMPLE_8.raMillimeters, 1);
  });
});

describe('extraterrestrialRadiation', () => {
  it('peaks in the local summer and dips in the local winter', () => {
    // A southern-hemisphere plot: December is summer, June is winter.
    const latitude = degrees(-8.11);
    const december = extraterrestrialRadiation(latitude, LocalDate.of(2026, 12, 21));
    const june = extraterrestrialRadiation(latitude, LocalDate.of(2026, 6, 21));

    expect(december).toBeGreaterThan(june);
  });

  it('mirrors between hemispheres on the same day', () => {
    const north = extraterrestrialRadiation(degrees(20), LocalDate.of(2026, 3, 21));
    const south = extraterrestrialRadiation(degrees(-20), LocalDate.of(2026, 3, 21));

    // Near an equinox the two hemispheres receive almost the same radiation.
    expect(north).toBeCloseTo(south, 0);
  });

  it('stays finite inside the polar circles instead of returning NaN', () => {
    // The sun never sets; arccos would leave its domain without the clamp.
    const value = extraterrestrialRadiation(degrees(-80), LocalDate.of(2026, 12, 21));

    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });

  it('is never negative anywhere on Earth on any day', () => {
    for (const latitude of [-89, -45, 0, 45, 89]) {
      for (const month of [1, 4, 7, 10]) {
        const value = extraterrestrialRadiation(degrees(latitude), LocalDate.of(2026, month, 15));
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
