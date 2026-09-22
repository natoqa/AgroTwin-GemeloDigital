import { describe, expect, it } from 'vitest';
import { millimeters } from '../model/Units.js';
import {
  advanceWaterBalance,
  cropEvapotranspiration,
  readilyAvailableWater,
  totalAvailableWater,
  waterStressCoefficient,
} from './WaterBalance.js';

/**
 * Validation against a published worked example.
 *
 * FAO-56 (Allen et al., 1998), Chapter 8, **Example 36**: "Determination of
 * readily available soil water for various crops and soil types". Tomato at
 * Zr = 0.8 m and p = 0.40, on three soils. Checking all three catches a
 * transposed field capacity or a dropped factor of 1000, which a single row
 * would not.
 *
 * TAW is printed whole and RAW rounded to the nearest millimetre.
 */
const EXAMPLE_36 = {
  rootingDepth: 0.8,
  depletionFraction: 0.4,
  soils: [
    { name: 'loamy sand', fieldCapacity: 0.15, wiltingPoint: 0.06, taw: 72, raw: 29 },
    { name: 'silt', fieldCapacity: 0.32, wiltingPoint: 0.15, taw: 136, raw: 54 },
    { name: 'silty clay', fieldCapacity: 0.35, wiltingPoint: 0.23, taw: 96, raw: 38 },
  ],
};

describe('FAO-56 Example 36: available soil water for tomato on three soils', () => {
  for (const soil of EXAMPLE_36.soils) {
    it(`reproduces TAW and RAW on ${soil.name}`, () => {
      const taw = totalAvailableWater(
        soil.fieldCapacity,
        soil.wiltingPoint,
        EXAMPLE_36.rootingDepth,
      );
      const raw = readilyAvailableWater(taw, EXAMPLE_36.depletionFraction);

      expect(taw).toBeCloseTo(soil.taw, 6);
      expect(Math.round(raw)).toBe(soil.raw);
    });
  }
});

describe('waterStressCoefficient (FAO-56 Equation 84)', () => {
  const taw = millimeters(100);
  const p = 0.35;

  it('is one while the crop is drawing on readily available water', () => {
    expect(waterStressCoefficient(millimeters(0), taw, p)).toBe(1);
    expect(waterStressCoefficient(millimeters(35), taw, p)).toBe(1);
  });

  it('falls linearly once readily available water is spent', () => {
    // Dr = 67.5 is halfway between RAW (35) and TAW (100): Ks = 0.5
    expect(waterStressCoefficient(millimeters(67.5), taw, p)).toBeCloseTo(0.5, 10);
  });

  it('reaches zero when the root zone holds nothing reachable', () => {
    expect(waterStressCoefficient(millimeters(100), taw, p)).toBe(0);
  });

  it('never leaves the 0 to 1 range, whatever it is given', () => {
    expect(waterStressCoefficient(millimeters(200), taw, p)).toBe(0);
    expect(waterStressCoefficient(millimeters(-5), taw, p)).toBe(1);
    expect(waterStressCoefficient(millimeters(10), millimeters(0), p)).toBe(0);
  });
});

describe('cropEvapotranspiration (FAO-56 Equation 58)', () => {
  it('is the reference rate scaled by the crop coefficient', () => {
    expect(cropEvapotranspiration(millimeters(4), 1.15)).toBeCloseTo(4.6, 10);
  });
});

describe('advanceWaterBalance (FAO-56 Equation 85, simplified)', () => {
  const base = {
    previousDepletion: millimeters(20),
    rainfall: millimeters(0),
    irrigation: millimeters(0),
    cropEt: millimeters(5),
    totalAvailable: millimeters(100),
    depletionFraction: 0.35,
  };

  it('dries the soil by what the crop transpired', () => {
    expect(advanceWaterBalance(base).depletion).toBeCloseTo(25, 10);
  });

  it('refills the soil with rain and irrigation', () => {
    const wet = advanceWaterBalance({ ...base, rainfall: millimeters(8), irrigation: millimeters(4) });

    // 20 − 8 − 4 + 5 = 13
    expect(wet.depletion).toBeCloseTo(13, 10);
  });

  it('drains the surplus instead of letting the soil hold more than full', () => {
    const flooded = advanceWaterBalance({ ...base, rainfall: millimeters(60) });

    expect(flooded.depletion).toBe(0);
    // 20 − 60 + 5 = −35, so 35 mm went past the root zone.
    expect(flooded.deepPercolation).toBeCloseTo(35, 10);
  });

  it('approaches the total available water without ever passing it', () => {
    const parched = advanceWaterBalance({
      ...base,
      previousDepletion: millimeters(99),
      cropEt: millimeters(50),
    });

    // Ks collapses as the root zone empties, so a huge ETc demand cannot
    // actually dry the soil past what it holds: the crop wilts instead.
    expect(parched.stressCoefficient).toBeLessThan(0.02);
    expect(parched.depletion).toBeGreaterThan(99);
    expect(parched.depletion).toBeLessThanOrEqual(100);
  });

  it('transpires less than ETc once the crop is stressed', () => {
    const stressed = advanceWaterBalance({ ...base, previousDepletion: millimeters(80) });

    expect(stressed.underStress).toBe(true);
    expect(stressed.stressCoefficient).toBeLessThan(1);
    expect(stressed.actualEt).toBeLessThan(base.cropEt);
  });

  it('transpires the full ETc while it is comfortable', () => {
    const comfortable = advanceWaterBalance({ ...base, previousDepletion: millimeters(10) });

    expect(comfortable.underStress).toBe(false);
    expect(comfortable.stressCoefficient).toBe(1);
    expect(comfortable.actualEt).toBe(base.cropEt);
  });

  it('conserves water across a season: what came in, went out or is still short', () => {
    // A balance that leaks would drift, and a drift of a millimetre a day is
    // 120 mm over a campaign — the difference between irrigating and not.
    let depletion = millimeters(0);
    let percolation = 0;
    let transpired = 0;
    let supplied = 0;

    for (let day = 0; day < 120; day += 1) {
      const rainfall = millimeters(day % 7 === 0 ? 14 : 0);
      supplied += rainfall;
      const result = advanceWaterBalance({ ...base, previousDepletion: depletion, rainfall });
      depletion = result.depletion;
      percolation += result.deepPercolation;
      transpired += result.actualEt;
    }

    expect(supplied - transpired - percolation).toBeCloseTo(-depletion, 6);
  });
});
