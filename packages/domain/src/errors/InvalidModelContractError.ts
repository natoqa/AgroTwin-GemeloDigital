import { DomainError } from './DomainError.js';

/**
 * Raised when a model contract, or an artifact it describes, cannot be
 * trusted: wrong format, wrong classes, a hash that does not match.
 *
 * CLAUDE.md §10: the client refuses artifacts that do not match their
 * contract. A classifier running on the wrong weights would still produce
 * confident-looking diagnoses, which is the one failure worse than none.
 */
export class InvalidModelContractError extends DomainError {
  readonly code = 'INVALID_MODEL_CONTRACT';

  constructor(reason: string) {
    super(`The model cannot be trusted: ${reason}`);
  }
}
