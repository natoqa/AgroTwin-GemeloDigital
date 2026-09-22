import { DomainError } from './DomainError.js';

/** Raised when a year/month/day triple cannot be a calendar date. */
export class InvalidLocalDateError extends DomainError {
  readonly code = 'INVALID_LOCAL_DATE';

  constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
    reason: string,
  ) {
    super(`Not a valid calendar date (${year}-${month}-${day}): ${reason}`);
  }
}
