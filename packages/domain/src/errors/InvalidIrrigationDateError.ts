import { DomainError } from './DomainError.js';

/** Raised when an irrigation is reported for a day it cannot have happened. */
export class InvalidIrrigationDateError extends DomainError {
  readonly code = 'INVALID_IRRIGATION_DATE';

  constructor(reason: string) {
    super(`Not a valid irrigation date: ${reason}`);
  }
}
