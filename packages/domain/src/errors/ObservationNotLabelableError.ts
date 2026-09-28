import { DomainError } from './DomainError.js';

/** Raised when a diagnosis cannot become a training example. */
export class ObservationNotLabelableError extends DomainError {
  readonly code = 'OBSERVATION_NOT_LABELABLE';

  constructor(
    readonly observationId: string,
    reason: string,
  ) {
    super(`Observation ${observationId} cannot be labelled: ${reason}`);
  }
}
