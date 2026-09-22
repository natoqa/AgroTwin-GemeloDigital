import { DomainError } from './DomainError.js';

/** Raised when a raw number cannot represent a valid instant in time. */
export class InvalidEpochMillisError extends DomainError {
  readonly code = 'INVALID_EPOCH_MILLIS';

  constructor(readonly value: number) {
    super(`Not a valid epoch milliseconds value: ${String(value)}`);
  }
}
