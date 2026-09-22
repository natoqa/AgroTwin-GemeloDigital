import { DomainError } from './DomainError.js';

/**
 * Raised when a day's maximum temperature is below its minimum.
 *
 * Hargreaves-Samani takes the square root of that difference, so a swapped
 * pair does not produce a wrong number: it produces `NaN`, which would travel
 * silently through the water balance. Better to stop here.
 */
export class InvalidTemperatureRangeError extends DomainError {
  readonly code = 'INVALID_TEMPERATURE_RANGE';

  constructor(
    readonly maximum: number,
    readonly minimum: number,
  ) {
    super(`The maximum temperature (${maximum} C) is below the minimum (${minimum} C)`);
  }
}
