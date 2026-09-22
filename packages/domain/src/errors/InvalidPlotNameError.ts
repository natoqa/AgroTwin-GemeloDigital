import { DomainError } from './DomainError.js';

/** Raised when a plot name is blank or longer than the domain allows. */
export class InvalidPlotNameError extends DomainError {
  readonly code = 'INVALID_PLOT_NAME';

  constructor(
    readonly attempted: string,
    reason: string,
  ) {
    super(`Not a valid plot name: ${reason}`);
  }
}
