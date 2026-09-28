import { describe, expect, it } from 'vitest';
import { POTATO_COEFFICIENTS } from './potato.js';

/**
 * Guards on the real coefficient file.
 *
 * These are not tests of arithmetic; they are tests of honesty. They are what
 * makes CLAUDE.md §8.2 and risk R-12 enforced by tooling instead of by
 * remembering: a coefficient that arrives without a source, or a `TODO` that
 * quietly stops costing confidence, turns the suite red.
 */
describe('the potato coefficient file', () => {
  it('is for the one crop this system models', () => {
    expect(POTATO_COEFFICIENTS.crop).toBe('potato');
    expect(POTATO_COEFFICIENTS.version).toBe('potato.v1');
  });

  it('gives every single entry a source', () => {
    for (const entry of POTATO_COEFFICIENTS.all()) {
      expect(entry.source.trim().length, `${entry.key} has no source`).toBeGreaterThan(0);
    }
  });

  it('gives every single entry a unit', () => {
    for (const entry of POTATO_COEFFICIENTS.all()) {
      expect(entry.unit.trim().length, `${entry.key} has no unit`).toBeGreaterThan(0);
    }
  });

  it('carries the FAO-56 values that were verified against the paper', () => {
    // FAO-56 Table 12 (potato) and Table 22 (potato).
    expect(POTATO_COEFFICIENTS.require('kcInitial')).toBe(0.5);
    expect(POTATO_COEFFICIENTS.require('kcMid')).toBe(1.15);
    expect(POTATO_COEFFICIENTS.require('kcEnd')).toBe(0.75);
    expect(POTATO_COEFFICIENTS.require('maxCropHeight')).toBe(0.6);
    expect(POTATO_COEFFICIENTS.require('rootingDepthMin')).toBe(0.4);
    expect(POTATO_COEFFICIENTS.require('rootingDepthMax')).toBe(0.6);
    expect(POTATO_COEFFICIENTS.require('depletionFraction')).toBe(0.35);
  });

  it('carries the base temperature the thermal clock runs on', () => {
    expect(POTATO_COEFFICIENTS.require('gddBaseTemperature')).toBe(7);
    expect(POTATO_COEFFICIENTS.get('gddBaseTemperature').status).toBe('verified');
  });

  it('marks every unverified entry so that it costs confidence', () => {
    for (const entry of POTATO_COEFFICIENTS.needingReview()) {
      expect(entry.source, `${entry.key} is unverified but not flagged`).toMatch(/^TODO/u);
      expect(POTATO_COEFFICIENTS.confidenceFor([entry.key])).toBeLessThan(1);
    }
  });

  it('leaves the thermal stage thresholds unknown rather than invented', () => {
    // No verified value exists for Andean cultivars. A plausible number here
    // would drive the phenological stage, and through it irrigation and
    // fungicide advice, with nothing downstream able to tell it from a
    // measurement (CLAUDE.md §18).
    for (const key of [
      'gddToEmergence',
      'gddToTuberInitiation',
      'gddToBulking',
      'gddToMaturity',
    ]) {
      expect(POTATO_COEFFICIENTS.get(key).value, `${key} should still be unknown`).toBeNull();
      expect(POTATO_COEFFICIENTS.get(key).status).toBe('missing');
    }
  });

  it('still has entries awaiting agronomic review, and says which', () => {
    // When this list empties, the team has done the review CLAUDE.md §19 asks
    // for, and this expectation is the reminder to update the documentation.
    const pending = POTATO_COEFFICIENTS.needingReview().map((entry) => entry.key);

    expect(pending).toEqual([
      'gddUpperTemperature',
      'stageLengthInitial',
      'stageLengthDevelopment',
      'stageLengthMid',
      'stageLengthLate',
      'gddToEmergence',
      'gddToTuberInitiation',
      'gddToBulking',
      'gddToMaturity',
      'soilFieldCapacity',
      'soilWiltingPoint',
      'leafWetnessHoursWhenDewObserved',
      'rainfallFactorLittle',
      'rainfallFactorHeavy',
      'irrigationRefillFraction',
      'coldNightTemperatureDrop',
    ]);
  });
});
