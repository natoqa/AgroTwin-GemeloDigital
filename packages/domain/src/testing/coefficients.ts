import document from '../agronomy/coefficients/potato.v1.json' with { type: 'json' };
import { Coefficients } from '../agronomy/Coefficients.js';
import type { CoefficientDocument, RawCoefficient } from '../agronomy/Coefficients.js';

const POTATO = document as CoefficientDocument;

/**
 * The potato coefficients with some entries replaced.
 *
 * Tests use it to switch on a model the real file keeps off — a phenology with
 * thresholds, a fungicide with a protection period — without the test having
 * to restate the other twenty entries, and without those test values ever
 * reaching the real file.
 */
export function potatoCoefficientsWith(
  overrides: Readonly<Record<string, RawCoefficient>>,
): Coefficients {
  return Coefficients.fromDocument({
    ...POTATO,
    version: `${POTATO.version}+test`,
    entries: { ...POTATO.entries, ...overrides },
  });
}

/** A value with a real-looking citation, so the model uses it at full confidence. */
export const verified = (value: number, unit: string): RawCoefficient => ({
  value,
  unit,
  source: 'Test fixture, standing in for a verified citation',
});

/** A value nobody knows. */
export const missing = (unit: string): RawCoefficient => ({
  value: null,
  unit,
  source: 'TODO: verificar fuente',
});
