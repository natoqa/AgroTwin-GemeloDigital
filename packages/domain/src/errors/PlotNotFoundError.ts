import { DomainError } from './DomainError.js';

/** Raised when an operation names a plot that is not stored. */
export class PlotNotFoundError extends DomainError {
  readonly code = 'PLOT_NOT_FOUND';

  constructor(readonly plotId: string) {
    super(`No plot is stored with id ${plotId}`);
  }
}
