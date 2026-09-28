import { DomainError } from './DomainError.js';

/**
 * Raised when a model needs a coefficient nobody has supplied yet.
 *
 * This error existing at all is the point. The alternative — substituting a
 * plausible default — would push an invented number into growing degree days,
 * then into the water balance, then into a recommendation the farmer acts on,
 * with nothing downstream able to tell it apart from a measurement.
 */
export class MissingCoefficientError extends DomainError {
  readonly code = 'MISSING_COEFFICIENT';

  constructor(
    readonly key: string,
    readonly declaredSource: string,
  ) {
    super(`The coefficient "${key}" has no value yet (${declaredSource})`);
  }
}
