import { describe, expect, it } from 'vitest';
import { cropCoefficientOnDay, cropStageOnDay, kcValuesOf, stageLengthsOf } from './CropStage.js';
import { POTATO_COEFFICIENTS } from './potato.js';

/** FAO-56 Table 11, potato, continental climate: 25 / 30 / 45 / 30. */
const LENGTHS = { initial: 25, development: 30, midSeason: 45, lateSeason: 30 };
/** FAO-56 Table 12, potato. */
const KC = { initial: 0.5, mid: 1.15, end: 0.75 };

describe('cropStageOnDay', () => {
  it('walks the four FAO-56 periods in order', () => {
    expect(cropStageOnDay(0, LENGTHS)).toBe('initial');
    expect(cropStageOnDay(24, LENGTHS)).toBe('initial');
    expect(cropStageOnDay(25, LENGTHS)).toBe('development');
    expect(cropStageOnDay(54, LENGTHS)).toBe('development');
    expect(cropStageOnDay(55, LENGTHS)).toBe('mid_season');
    expect(cropStageOnDay(99, LENGTHS)).toBe('mid_season');
    expect(cropStageOnDay(100, LENGTHS)).toBe('late_season');
  });

  it('keeps a crop left in the ground in the late season', () => {
    // The campaign's closing date ends the cycle, not the coefficient table.
    expect(cropStageOnDay(300, LENGTHS)).toBe('late_season');
  });
});

describe('cropCoefficientOnDay', () => {
  it('holds Kc ini flat through the initial period', () => {
    expect(cropCoefficientOnDay(0, LENGTHS, KC)).toBe(0.5);
    expect(cropCoefficientOnDay(24, LENGTHS, KC)).toBe(0.5);
  });

  it('climbs in a straight line from Kc ini to Kc mid across development', () => {
    expect(cropCoefficientOnDay(25, LENGTHS, KC)).toBeCloseTo(0.5, 10);
    // Halfway through the 30-day development period.
    expect(cropCoefficientOnDay(40, LENGTHS, KC)).toBeCloseTo((0.5 + 1.15) / 2, 10);
  });

  it('holds Kc mid flat through mid-season', () => {
    expect(cropCoefficientOnDay(55, LENGTHS, KC)).toBeCloseTo(1.15, 10);
    expect(cropCoefficientOnDay(99, LENGTHS, KC)).toBeCloseTo(1.15, 10);
  });

  it('falls in a straight line from Kc mid to Kc end across the late season', () => {
    expect(cropCoefficientOnDay(100, LENGTHS, KC)).toBeCloseTo(1.15, 10);
    expect(cropCoefficientOnDay(115, LENGTHS, KC)).toBeCloseTo((1.15 + 0.75) / 2, 10);
    expect(cropCoefficientOnDay(130, LENGTHS, KC)).toBeCloseTo(0.75, 10);
  });

  it('stays at Kc end past the end of the season', () => {
    expect(cropCoefficientOnDay(300, LENGTHS, KC)).toBeCloseTo(0.75, 10);
  });

  it('never leaves the range its three anchors span', () => {
    for (let day = 0; day <= 140; day += 1) {
      const kc = cropCoefficientOnDay(day, LENGTHS, KC);
      expect(kc).toBeGreaterThanOrEqual(0.5);
      expect(kc).toBeLessThanOrEqual(1.15);
    }
  });

  it('has no discontinuity at a period boundary', () => {
    // A jump here would make ETc lurch overnight for no agronomic reason.
    for (const boundary of [25, 55, 100]) {
      const before = cropCoefficientOnDay(boundary - 0.001, LENGTHS, KC);
      const after = cropCoefficientOnDay(boundary, LENGTHS, KC);
      expect(Math.abs(after - before)).toBeLessThan(0.01);
    }
  });
});

describe('reading the periods from the coefficient file', () => {
  it('takes the lengths and the Kc anchors the potato file declares', () => {
    expect(stageLengthsOf(POTATO_COEFFICIENTS)).toEqual(LENGTHS);
    expect(kcValuesOf(POTATO_COEFFICIENTS)).toEqual(KC);
  });
});
