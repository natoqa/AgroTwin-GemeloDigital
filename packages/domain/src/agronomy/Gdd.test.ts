import { describe, expect, it } from 'vitest';
import { celsius } from '../model/Units.js';
import {
  accumulateGrowingDegreeDays,
  baseTemperatureOf,
  dailyGrowingDegreeDays,
} from './Gdd.js';
import { POTATO_COEFFICIENTS } from './potato.js';

const day = (maximum: number, minimum: number) => ({
  maximum: celsius(maximum),
  minimum: celsius(minimum),
});

const POTATO_BASE = celsius(7);

describe('dailyGrowingDegreeDays', () => {
  it('is the mean of the daily extremes above the base temperature', () => {
    // (18 + 6) / 2 = 12; 12 − 7 = 5
    expect(dailyGrowingDegreeDays(day(18, 6), POTATO_BASE)).toBe(5);
  });

  it('contributes nothing on a day that never rises above the base', () => {
    // A cold day does not un-develop a plant, so this floors at zero rather
    // than subtracting from the accumulated total.
    expect(dailyGrowingDegreeDays(day(6, 0), POTATO_BASE)).toBe(0);
  });

  it('contributes nothing when the mean sits exactly on the base', () => {
    expect(dailyGrowingDegreeDays(day(9, 5), POTATO_BASE)).toBe(0);
  });

  it('counts a warm day in an Andean spring', () => {
    // (20 + 4) / 2 = 12; 12 − 7 = 5
    expect(dailyGrowingDegreeDays(day(20, 4), POTATO_BASE)).toBe(5);
  });

  it('has no upper cut-off, deliberately', () => {
    // No cap is verified for this crop and region, so a hot day counts in
    // full. Capping at an invented threshold would silently change every
    // accumulated total in the campaign.
    expect(dailyGrowingDegreeDays(day(40, 30), POTATO_BASE)).toBe(28);
  });
});

describe('accumulateGrowingDegreeDays', () => {
  it('sums a sequence of days', () => {
    expect(accumulateGrowingDegreeDays([day(18, 6), day(20, 4), day(6, 0)], POTATO_BASE)).toBe(10);
  });

  it('is zero over an empty campaign', () => {
    expect(accumulateGrowingDegreeDays([], POTATO_BASE)).toBe(0);
  });

  it('never goes backwards as days are added', () => {
    const days = [day(18, 6), day(4, 0), day(25, 9), day(2, -4)];
    let previous = 0;
    for (let index = 1; index <= days.length; index += 1) {
      const total = accumulateGrowingDegreeDays(days.slice(0, index), POTATO_BASE);
      expect(total).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
  });
});

describe('baseTemperatureOf', () => {
  it('reads the base temperature from the crop coefficients', () => {
    expect(baseTemperatureOf(POTATO_COEFFICIENTS)).toBe(7);
  });
});
