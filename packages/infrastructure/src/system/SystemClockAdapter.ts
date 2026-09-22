import { epochMillis, type ClockPort, type EpochMillis } from '@agrotwin/domain';

/**
 * The single place in the codebase allowed to read the wall clock.
 *
 * `Date.now()` is banned inside `@agrotwin/domain` by lint; this adapter is the
 * sanctioned crossing point between ambient time and the domain.
 */
export class SystemClockAdapter implements ClockPort {
  now(): EpochMillis {
    return epochMillis(Date.now());
  }
}
