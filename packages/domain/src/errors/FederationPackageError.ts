import { DomainError } from './DomainError.js';

/** Raised when a federated-learning file is malformed, unsigned or for another model. */
export class FederationPackageError extends DomainError {
  readonly code = 'FEDERATION_PACKAGE';

  constructor(reason: string) {
    super(`The federated-learning file cannot be used: ${reason}`);
  }
}
