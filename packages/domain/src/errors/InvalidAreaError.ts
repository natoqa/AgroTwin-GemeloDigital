import { DomainError } from './DomainError.js';

/** Raised when a plot area is not a usable positive measurement. */
export class InvalidAreaError extends DomainError {
  readonly code = 'INVALID_AREA';

  constructor(
    readonly value: number,
    reason: string,
  ) {
    super(`Not a valid plot area (${String(value)} ha): ${reason}`);
  }
}
