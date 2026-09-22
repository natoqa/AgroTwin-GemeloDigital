import { DomainError } from './DomainError.js';

/** Raised when a coefficient document cannot be trusted enough to load. */
export class InvalidCoefficientsError extends DomainError {
  readonly code = 'INVALID_COEFFICIENTS';

  constructor(reason: string) {
    super(`The coefficient document is not usable: ${reason}`);
  }
}
