import { describe, expect, it } from 'vitest';
import { InvalidCoefficientsError } from '../errors/InvalidCoefficientsError.js';
import { MissingCoefficientError } from '../errors/MissingCoefficientError.js';
import { Coefficients, PROVISIONAL_CONFIDENCE_FACTOR } from './Coefficients.js';
import type { CoefficientDocument } from './Coefficients.js';

const document = (entries: CoefficientDocument['entries']): CoefficientDocument => ({
  crop: 'potato',
  version: 'test.v1',
  region: 'Test',
  entries,
});

const verified = { value: 1, unit: 'dimensionless', source: 'Allen et al. (1998), Table 12' };
const provisional = { value: 2, unit: 'day', source: 'TODO: verificar fuente' };
const missing = { value: null, unit: 'degreeDay', source: 'TODO: verificar fuente' };

describe('Coefficients.fromDocument', () => {
  it('classifies each entry by how much it can be trusted', () => {
    const coefficients = Coefficients.fromDocument(document({ a: verified, b: provisional, c: missing }));

    expect(coefficients.get('a').status).toBe('verified');
    expect(coefficients.get('b').status).toBe('provisional');
    expect(coefficients.get('c').status).toBe('missing');
  });

  it('refuses an entry with no source', () => {
    // This is the rule the whole file exists for (CLAUDE.md §8.2 and §18).
    expect(() =>
      Coefficients.fromDocument(document({ a: { value: 1, unit: 'day', source: '  ' } })),
    ).toThrow(InvalidCoefficientsError);
  });

  it('refuses an entry with no unit', () => {
    expect(() =>
      Coefficients.fromDocument(document({ a: { value: 1, unit: '', source: 'Allen et al.' } })),
    ).toThrow(InvalidCoefficientsError);
  });

  it('refuses a value that is neither a number nor an explicit null', () => {
    expect(() =>
      Coefficients.fromDocument(
        document({ a: { value: Number.NaN, unit: 'day', source: 'Allen et al.' } }),
      ),
    ).toThrow(InvalidCoefficientsError);
  });

  it('refuses a document with no entries at all', () => {
    expect(() => Coefficients.fromDocument(document({}))).toThrow(InvalidCoefficientsError);
  });
});

describe('Coefficients.require', () => {
  const coefficients = Coefficients.fromDocument(document({ a: verified, c: missing }));

  it('returns the value of a coefficient that has one', () => {
    expect(coefficients.require('a')).toBe(1);
  });

  it('refuses to substitute anything for a value nobody supplied', () => {
    expect(() => coefficients.require('c')).toThrow(MissingCoefficientError);
  });

  it('refuses a key the document never declared', () => {
    expect(() => coefficients.require('nope')).toThrow(InvalidCoefficientsError);
  });
});

describe('Coefficients.confidenceFor', () => {
  const coefficients = Coefficients.fromDocument(
    document({ a: verified, b: provisional, b2: provisional, c: missing }),
  );

  it('is full confidence when every input is verified', () => {
    expect(coefficients.confidenceFor(['a'])).toBe(1);
  });

  it('is reduced by each provisional input, compounding', () => {
    expect(coefficients.confidenceFor(['b'])).toBe(PROVISIONAL_CONFIDENCE_FACTOR);
    expect(coefficients.confidenceFor(['b', 'b2'])).toBeCloseTo(
      PROVISIONAL_CONFIDENCE_FACTOR ** 2,
      10,
    );
  });

  it('is zero as soon as one input is missing, because nothing was computed', () => {
    expect(coefficients.confidenceFor(['a', 'c'])).toBe(0);
  });
});

describe('Coefficients.needingReview', () => {
  it('lists everything that is not verified, for the agronomist', () => {
    const coefficients = Coefficients.fromDocument(document({ a: verified, b: provisional, c: missing }));

    expect(coefficients.needingReview().map((entry) => entry.key)).toEqual(['b', 'c']);
  });
});
