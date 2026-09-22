import { describe, expect, it } from 'vitest';
import { InvalidTemperatureRangeError } from '../errors/InvalidTemperatureRangeError.js';
import { LocalDate } from '../model/LocalDate.js';
import { asEquivalentEvaporation, celsius, degrees, millimeters } from '../model/Units.js';
import { extraterrestrialRadiation } from './SolarRadiation.js';
import {
  meanTemperature,
  referenceEvapotranspiration,
  referenceEvapotranspirationFrom,
} from './Et0Hargreaves.js';

const temperatures = (maximum: number, minimum: number) => ({
  maximum: celsius(maximum),
  minimum: celsius(minimum),
});

/**
 * A note on what can and cannot be validated here.
 *
 * FAO-56 prints no worked example for Equation 52 — the chapter introduces the
 * Hargreaves equation for missing data and moves on. So unlike `Ra`, there is
 * no published number to check against, and these tests do two weaker but
 * honest things instead: they check the implementation against the published
 * *formula* with arithmetic done by hand, and they check the properties the
 * equation must have. That distinction is recorded in
 * `docs/agronomy/sources.md` rather than glossed over.
 */
describe('referenceEvapotranspirationFrom (FAO-56 Equation 52)', () => {
  it('matches the formula worked by hand', () => {
    // ETo = 0.0023 (Tmean + 17.8) (Tmax − Tmin)^0.5 Ra
    //     = 0.0023 × (15 + 17.8) × sqrt(10) × 10
    //     = 0.0023 × 32.8 × 3.16227766 × 10
    //     = 2.3856 mm/day
    const result = referenceEvapotranspirationFrom(temperatures(20, 10), millimeters(10));

    expect(result).toBeCloseTo(2.3856, 3);
  });

  it('takes the mean as the average of the daily extremes', () => {
    expect(meanTemperature(temperatures(20, 10))).toBe(15);
  });

  it('is zero when the day has no temperature range', () => {
    // The square root term vanishes: no diurnal range, no Hargreaves estimate.
    expect(referenceEvapotranspirationFrom(temperatures(15, 15), millimeters(10))).toBe(0);
  });

  it('grows with the mean temperature and with the range', () => {
    const base = referenceEvapotranspirationFrom(temperatures(20, 10), millimeters(10));
    const warmer = referenceEvapotranspirationFrom(temperatures(25, 15), millimeters(10));
    const wider = referenceEvapotranspirationFrom(temperatures(25, 5), millimeters(10));

    expect(warmer).toBeGreaterThan(base);
    expect(wider).toBeGreaterThan(warmer);
  });

  it('scales linearly with radiation', () => {
    const single = referenceEvapotranspirationFrom(temperatures(20, 10), millimeters(10));
    const double = referenceEvapotranspirationFrom(temperatures(20, 10), millimeters(20));

    expect(double).toBeCloseTo(single * 2, 10);
  });

  it('never returns a negative evapotranspiration', () => {
    // Below −17.8 °C the published form goes negative. The twin must not be
    // able to add water to the soil through a cold night.
    expect(referenceEvapotranspirationFrom(temperatures(-20, -30), millimeters(5))).toBe(0);
  });

  it('refuses a day whose maximum is below its minimum', () => {
    // Swapped inputs would make the square root NaN and travel silently.
    expect(() => referenceEvapotranspirationFrom(temperatures(5, 15), millimeters(10))).toThrow(
      InvalidTemperatureRangeError,
    );
  });
});

describe('referenceEvapotranspiration', () => {
  const latitude = degrees(-8.11);
  const date = LocalDate.of(2026, 9, 3);

  it('applies the megajoule-to-millimetre conversion before the equation', () => {
    // Forgetting Equation 20 inflates every result by 1/0.408 ≈ 2.45, which is
    // the single easiest mistake to make in this chain.
    const radiation = extraterrestrialRadiation(latitude, date);
    const expected = referenceEvapotranspirationFrom(
      temperatures(18, 4),
      asEquivalentEvaporation(radiation),
    );

    expect(referenceEvapotranspiration(latitude, date, temperatures(18, 4))).toBeCloseTo(
      expected,
      10,
    );
  });

  it('lands in a physically plausible range for an Andean spring day', () => {
    // Not a validation — a smoke test. Daily ETo on Earth sits in single
    // digits of millimetres; anything outside that is an implementation bug,
    // not a climate.
    const result = referenceEvapotranspiration(latitude, date, temperatures(18, 4));

    expect(result).toBeGreaterThan(1);
    expect(result).toBeLessThan(12);
  });
});
