import { DomainError } from './DomainError.js';

/** Raised when the farmer's note on an observation is longer than allowed. */
export class InvalidObservationNoteError extends DomainError {
  readonly code = 'INVALID_OBSERVATION_NOTE';

  constructor(
    readonly length: number,
    readonly maxLength: number,
  ) {
    super(`The note is ${length} characters long; the limit is ${maxLength}`);
  }
}
