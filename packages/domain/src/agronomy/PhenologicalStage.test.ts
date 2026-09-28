import { describe, expect, it } from 'vitest';
import { degreeDays } from '../model/Units.js';
import { Coefficients, PROVISIONAL_CONFIDENCE_FACTOR } from './Coefficients.js';
import type { CoefficientDocument } from './Coefficients.js';
import { estimatePhenologicalStage } from './PhenologicalStage.js';
import { POTATO_COEFFICIENTS } from './potato.js';

/** A complete, hypothetical set — what the file will look like after review. */
const withThresholds = (source: string): Coefficients =>
  Coefficients.fromDocument({
    crop: 'potato',
    version: 'test.v1',
    region: 'Test',
    entries: {
      gddToEmergence: { value: 150, unit: 'degreeDay', source },
      gddToTuberInitiation: { value: 350, unit: 'degreeDay', source },
      gddToBulking: { value: 600, unit: 'degreeDay', source },
      gddToMaturity: { value: 1100, unit: 'degreeDay', source },
    },
  } satisfies CoefficientDocument);

const CITED = 'Hypothetical reviewed source';
const reviewed = withThresholds(CITED);

describe('estimatePhenologicalStage with the thresholds supplied', () => {
  it('starts at emergence before the first threshold', () => {
    expect(estimatePhenologicalStage(degreeDays(0), reviewed).stage).toBe('emergence');
    expect(estimatePhenologicalStage(degreeDays(149), reviewed).stage).toBe('emergence');
  });

  it('advances through the stages as heat accumulates', () => {
    expect(estimatePhenologicalStage(degreeDays(150), reviewed).stage).toBe(
      'vegetative_development',
    );
    expect(estimatePhenologicalStage(degreeDays(400), reviewed).stage).toBe('tuber_initiation');
    expect(estimatePhenologicalStage(degreeDays(700), reviewed).stage).toBe('bulking');
    expect(estimatePhenologicalStage(degreeDays(1200), reviewed).stage).toBe('maturity');
  });

  it('crosses exactly on the threshold, not one degree-day later', () => {
    expect(estimatePhenologicalStage(degreeDays(1100), reviewed).stage).toBe('maturity');
  });

  it('never goes backwards as heat accumulates', () => {
    const order = [
      'emergence',
      'vegetative_development',
      'tuber_initiation',
      'bulking',
      'maturity',
    ];
    let previous = -1;
    for (const total of [0, 100, 200, 349, 350, 599, 600, 1099, 1100, 2000]) {
      const stage = estimatePhenologicalStage(degreeDays(total), reviewed).stage;
      const position = order.indexOf(stage ?? '');
      expect(position).toBeGreaterThanOrEqual(previous);
      previous = position;
    }
  });

  it('carries full confidence when the thresholds are verified', () => {
    expect(estimatePhenologicalStage(degreeDays(400), reviewed).confidence).toBe(1);
  });

  it('carries reduced confidence when the thresholds are provisional', () => {
    const provisional = withThresholds('TODO: verificar fuente');

    expect(estimatePhenologicalStage(degreeDays(400), provisional).confidence).toBeCloseTo(
      PROVISIONAL_CONFIDENCE_FACTOR ** 4,
      10,
    );
  });
});

describe('estimatePhenologicalStage against the real potato file', () => {
  it('refuses to name a stage, because nobody has supplied the thresholds', () => {
    const estimate = estimatePhenologicalStage(degreeDays(800), POTATO_COEFFICIENTS);

    // This is the designed behaviour, not a gap in the tests. A stage invented
    // from plausible thresholds would drive irrigation and fungicide advice
    // the farmer cannot question (CLAUDE.md §18).
    expect(estimate.stage).toBeUndefined();
    expect(estimate.confidence).toBe(0);
  });

  it('says exactly which coefficients it is waiting for', () => {
    const estimate = estimatePhenologicalStage(degreeDays(800), POTATO_COEFFICIENTS);

    expect(estimate.missing).toEqual([
      'gddToEmergence',
      'gddToTuberInitiation',
      'gddToBulking',
      'gddToMaturity',
    ]);
  });
});
