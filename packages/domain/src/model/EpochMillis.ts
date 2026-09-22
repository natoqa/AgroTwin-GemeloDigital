import { InvalidEpochMillisError } from '../errors/InvalidEpochMillisError.js';

declare const epochMillisBrand: unique symbol;

/**
 * An instant in time, as integer milliseconds since the Unix epoch (UTC).
 *
 * The domain never uses `Date` to *obtain* an instant — time enters only
 * through `ClockPort`. The branded type keeps a raw `number` from being passed
 * where an instant is expected.
 */
export type EpochMillis = number & { readonly [epochMillisBrand]: 'EpochMillis' };

/** Narrows a raw number to `EpochMillis`, or throws `InvalidEpochMillisError`. */
export function epochMillis(value: number): EpochMillis {
  if (!Number.isSafeInteger(value)) {
    throw new InvalidEpochMillisError(value);
  }
  return value as EpochMillis;
}

/** Type guard for callers that prefer branching over catching. */
export function isEpochMillis(value: number): value is EpochMillis {
  return Number.isSafeInteger(value);
}
