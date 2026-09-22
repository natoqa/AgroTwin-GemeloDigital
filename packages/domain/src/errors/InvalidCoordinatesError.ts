import { DomainError } from './DomainError.js';

/** Raised when a latitude, longitude or altitude falls outside the Earth. */
export class InvalidCoordinatesError extends DomainError {
  readonly code = 'INVALID_COORDINATES';

  constructor(
    readonly component: 'latitude' | 'longitude' | 'altitude',
    readonly value: number,
    reason: string,
  ) {
    super(`Not a valid ${component} (${String(value)}): ${reason}`);
  }
}
