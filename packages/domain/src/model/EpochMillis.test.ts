import { describe, expect, it } from 'vitest';

import { InvalidEpochMillisError } from '../errors/InvalidEpochMillisError.js';
import { epochMillis, isEpochMillis } from './EpochMillis.js';

describe('epochMillis', () => {
  it('accepts a safe integer and returns it unchanged at runtime', () => {
    expect(epochMillis(1_726_900_000_000)).toBe(1_726_900_000_000);
  });

  it('accepts the Unix epoch itself', () => {
    expect(epochMillis(0)).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %p',
    (value) => {
      expect(() => epochMillis(value)).toThrow(InvalidEpochMillisError);
    },
  );

  it('reports the offending value on the error', () => {
    try {
      epochMillis(Number.NaN);
      expect.unreachable('expected epochMillis to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEpochMillisError);
      expect((error as InvalidEpochMillisError).code).toBe('INVALID_EPOCH_MILLIS');
    }
  });
});

describe('isEpochMillis', () => {
  it('agrees with epochMillis', () => {
    expect(isEpochMillis(0)).toBe(true);
    expect(isEpochMillis(1.5)).toBe(false);
  });
});
