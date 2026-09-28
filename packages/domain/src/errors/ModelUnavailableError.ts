import { DomainError } from './DomainError.js';

/**
 * Raised when a photograph is taken before the leaf-recognition model is on
 * the device (Phase 5, D1: it is downloaded in an explicit step, not
 * silently at install). The screen turns this into "download it first",
 * never into a made-up diagnosis.
 */
export class ModelUnavailableError extends DomainError {
  readonly code = 'MODEL_UNAVAILABLE';

  constructor(reason: string) {
    super(`The leaf-recognition model is not available: ${reason}`);
  }
}
