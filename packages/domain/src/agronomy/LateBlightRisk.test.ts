import { describe, expect, it } from 'vitest';
import { celsius } from '../model/Units.js';
import {
  FIRST_SPRAY_SEVERITY_TOTAL,
  accumulateBlightRisk,
  dailySeverityValue,
  lateBlightRiskFor,
} from './LateBlightRisk.js';

const period = (wetHours: number, meanTemperature: number) => ({
  wetHours,
  meanTemperature: celsius(meanTemperature),
});

/**
 * The published severity table, transcribed from Wallin (1962) and checked
 * band by band, at every boundary.
 *
 * Boundaries are where a transcription error hides: one hour out and a whole
 * severity class shifts, which over a season is the difference between
 * advising a spray and not.
 */
describe('Wallin severity values, cool band 7.2–11.6 °C', () => {
  const temperature = 10;

  it('scores nothing below sixteen wet hours', () => {
    expect(dailySeverityValue(period(15, temperature))).toBe(0);
  });

  it('follows the published thresholds', () => {
    expect(dailySeverityValue(period(16, temperature))).toBe(1);
    expect(dailySeverityValue(period(18, temperature))).toBe(1);
    expect(dailySeverityValue(period(19, temperature))).toBe(2);
    expect(dailySeverityValue(period(21, temperature))).toBe(2);
    expect(dailySeverityValue(period(22, temperature))).toBe(3);
    expect(dailySeverityValue(period(24, temperature))).toBe(3);
    expect(dailySeverityValue(period(25, temperature))).toBe(4);
  });
});

describe('Wallin severity values, middle band 11.7–15.0 °C', () => {
  const temperature = 13;

  it('follows the published thresholds', () => {
    expect(dailySeverityValue(period(12, temperature))).toBe(0);
    expect(dailySeverityValue(period(13, temperature))).toBe(1);
    expect(dailySeverityValue(period(15, temperature))).toBe(1);
    expect(dailySeverityValue(period(16, temperature))).toBe(2);
    expect(dailySeverityValue(period(19, temperature))).toBe(3);
    expect(dailySeverityValue(period(22, temperature))).toBe(4);
  });
});

describe('Wallin severity values, warm band 15.1–26.6 °C', () => {
  const temperature = 20;

  it('follows the published thresholds', () => {
    expect(dailySeverityValue(period(9, temperature))).toBe(0);
    expect(dailySeverityValue(period(10, temperature))).toBe(1);
    expect(dailySeverityValue(period(12, temperature))).toBe(1);
    expect(dailySeverityValue(period(13, temperature))).toBe(2);
    expect(dailySeverityValue(period(16, temperature))).toBe(3);
    expect(dailySeverityValue(period(19, temperature))).toBe(4);
  });

  it('needs fewer wet hours than the cool band for the same severity', () => {
    // The pathogen is faster when it is warmer, which is the shape of the
    // whole table; if this inverts, the bands have been swapped.
    expect(dailySeverityValue(period(13, 20))).toBeGreaterThan(dailySeverityValue(period(13, 10)));
  });
});

describe('Wallin severity values outside the favourable window', () => {
  it('scores nothing when it is too cold for the pathogen', () => {
    expect(dailySeverityValue(period(24, 7.1))).toBe(0);
    expect(dailySeverityValue(period(24, 0))).toBe(0);
  });

  it('scores nothing when it is too warm', () => {
    expect(dailySeverityValue(period(24, 26.7))).toBe(0);
    expect(dailySeverityValue(period(24, 35))).toBe(0);
  });

  it('scores at the very edges of the window', () => {
    expect(dailySeverityValue(period(24, 7.2))).toBe(3);
    expect(dailySeverityValue(period(24, 26.6))).toBe(4);
  });

  it('scores nothing on a dry day', () => {
    expect(dailySeverityValue(period(0, 15))).toBe(0);
  });
});

describe('accumulateBlightRisk', () => {
  it('adds the day to the running total', () => {
    const risk = accumulateBlightRisk(5, period(19, 20));

    expect(risk.dailySeverity).toBe(4);
    expect(risk.accumulatedSeverity).toBe(9);
  });

  it('advises a first spray once the accumulated total reaches the threshold', () => {
    expect(accumulateBlightRisk(FIRST_SPRAY_SEVERITY_TOTAL - 1, period(0, 15)).sprayAdvised).toBe(
      false,
    );
    expect(accumulateBlightRisk(FIRST_SPRAY_SEVERITY_TOTAL - 1, period(10, 20)).sprayAdvised).toBe(
      true,
    );
  });

  it('never goes backwards across a season', () => {
    let total = 0;
    for (const hours of [4, 20, 0, 13, 26, 8]) {
      const risk = accumulateBlightRisk(total, period(hours, 14));
      expect(risk.accumulatedSeverity).toBeGreaterThanOrEqual(total);
      total = risk.accumulatedSeverity;
    }
  });
});

describe('lateBlightRiskFor', () => {
  it('judges the day when the wet period was observed', () => {
    expect(lateBlightRiskFor(0, period(19, 20))?.dailySeverity).toBe(4);
  });

  it('refuses to judge a day whose leaf wetness nobody measured', () => {
    // The honest outcome, and today the usual one: no weather source on this
    // device reports hours of leaf wetness, and deriving them from "did it
    // rain?" would be an assumption with no source behind it. A twin that
    // says nothing beats one that invents a number a farmer sprays on.
    expect(lateBlightRiskFor(0, undefined)).toBeUndefined();
  });
});
